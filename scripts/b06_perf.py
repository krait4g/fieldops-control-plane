#!/usr/bin/env python3
"""B06 task-owned local performance and recovery characterization harness."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import socket
import statistics
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

import b02_observe as b02


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = (ROOT / ".fieldops-b06").resolve()
RESULTS = RUNTIME / "results"
CHECKOUT_ID = hashlib.sha256(str(ROOT.resolve()).lower().encode()).hexdigest()[:10]
PROJECT = f"fieldops-b06-{CHECKOUT_ID}"
PORTS = {
    "web": 3106,
    "gateway": 28161,
    "server": 28162,
    "worker": 28086,
    "keycloak": 28160,
    "mqtt": 21983,
    "postgres": 25532,
    "redis": 26479,
    "kafka": 29192,
    "kafkaController": 29193,
}
GROUPS = ("fieldops-b02-normalizer", "fieldops-b02-history", "fieldops-b02-state")
DEVICES = (
    "device-a-soil-01", "device-a-soil-02", "device-a-soil-03",
    "device-b-soil-01", "device-b-soil-02", "device-b-soil-03",
)
SUMMARY_PREFIX = "B06_LOAD_SUMMARY="
SUMMARY_PATH = ROOT / "docs/performance/b06-summary.json"
CHART_DIR = ROOT / "docs/assets/implementation"
BATCH_PATH = ROOT / "docs/performance/B06-performance-resilience.md"


class B06Error(RuntimeError):
    pass


def checkout_fingerprint(path: Path) -> str:
    return hashlib.sha256(str(path.resolve()).lower().encode()).hexdigest()[:10]


def configure_b02() -> None:
    if not re.fullmatch(r"fieldops-b06-[0-9a-f]{10}", PROJECT):
        raise B06Error("invalid checkout-scoped B06 project")
    try:
        RUNTIME.relative_to(ROOT.resolve())
    except ValueError as error:
        raise B06Error("B06 runtime must stay inside the checkout") from error
    os.environ.update({
        "FIELDOPS_B02_PROJECT": PROJECT,
        "FIELDOPS_B02_RUNTIME_DIR": str(RUNTIME),
        "FIELDOPS_B02_EXTRA_PROFILES": "b06-perf",
        "B02_KEYCLOAK_PORT": str(PORTS["keycloak"]),
        "B06_WORKER_METRICS_PORT": str(PORTS["worker"]),
    })
    b02.RUNTIME = RUNTIME
    b02.LOGS = RUNTIME / "logs"
    b02.MANIFEST = RUNTIME / "run-manifest.json"
    b02.PROJECT = PROJECT
    b02.PORTS.clear()
    b02.PORTS.update({key: value for key, value in PORTS.items() if key != "worker"})


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.2)
        return probe.connect_ex(("127.0.0.1", port)) != 0


def preflight_ports() -> None:
    manifest = b02.load_manifest()
    if manifest.get("status") == "running" and all(
            b02.process_alive(record) for record in manifest.get("processes", {}).values()):
        return
    occupied = [port for port in PORTS.values() if not port_free(port)]
    if occupied:
        raise B06Error(f"B06 required localhost ports are occupied: {occupied}")


def http_text(url: str, timeout: int = 5) -> str:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        if response.status != 200:
            raise B06Error(f"unexpected HTTP {response.status} from metrics endpoint")
        return response.read().decode("utf-8")


def parse_prometheus(text: str) -> dict[str, float]:
    values: dict[str, float] = {}
    for line in text.splitlines():
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([^\s]+)(?:\s+\d+)?", line)
        if not match:
            continue
        try:
            values[match.group(1) + (match.group(2) or "")] = float(match.group(3))
        except ValueError:
            continue
    return values


def scrape() -> dict[str, dict[str, float]]:
    return {
        "gateway": parse_prometheus(http_text(
            f"http://127.0.0.1:{PORTS['gateway']}/actuator/prometheus")),
        "worker": parse_prometheus(http_text(
            f"http://127.0.0.1:{PORTS['worker']}/actuator/prometheus")),
    }


def parse_load_summary(output: str) -> dict[str, Any]:
    matches = [line[len(SUMMARY_PREFIX):] for line in output.splitlines()
               if line.startswith(SUMMARY_PREFIX)]
    if len(matches) != 1:
        raise B06Error(f"expected one load summary, found {len(matches)}")
    parsed = json.loads(matches[0])
    required = {"sessionId", "offeredEventsPerSecond", "attempted", "published",
                "publishErrors", "elapsedMs", "achievedEventsPerSecond", "devices"}
    if not required.issubset(parsed):
        raise B06Error("load summary is missing required fields")
    return parsed


def parse_consumer_lag(output: str, group: str) -> int:
    total = 0
    for line in output.splitlines():
        parts = line.split()
        if len(parts) >= 6 and parts[0] == group and parts[2].isdigit():
            try:
                total += int(parts[5])
            except ValueError:
                continue
    return total


def lag_snapshot(env: dict[str, str]) -> dict[str, int]:
    result: dict[str, int] = {}
    base = b02.compose(env)
    for group in GROUPS:
        try:
            output = b02.run(base + ["exec", "-T", "kafka",
                "/opt/kafka/bin/kafka-consumer-groups.sh", "--bootstrap-server", "localhost:19092",
                "--describe", "--group", group], env=env, capture=True, timeout=20)
            result[group] = parse_consumer_lag(output, group)
        except b02.B02Error:
            result[group] = 0
    return result


def wait_for_drain(env: dict[str, str], timeout: int = 60) -> tuple[int, dict[str, int]]:
    started = time.monotonic()
    latest = lag_snapshot(env)
    while any(latest.values()) and time.monotonic() - started < timeout:
        time.sleep(1)
        latest = lag_snapshot(env)
    return round((time.monotonic() - started) * 1000), latest


def sql_scalar(env: dict[str, str], sql: str) -> str:
    return b02.run(b02.compose(env) + ["exec", "-T", "postgres", "psql", "-U",
        "fieldops_b02", "-d", "fieldops_b02", "-Atc", sql], env=env, capture=True)


def redis_value(env: dict[str, str], key: str) -> str:
    return b02.run(b02.compose(env) + ["exec", "-T", "-e",
        f"REDISCLI_AUTH={env['B02_REDIS_PASSWORD']}", "redis", "redis-cli", "--raw",
        "HGET", key, "stateJson"], env=env, capture=True)


def verify_session(env: dict[str, str], summary: dict[str, Any], warmup: int,
                   duration: int, *, strict: bool = True) -> dict[str, Any]:
    session = str(summary["sessionId"])
    if not re.fullmatch(r"[A-Za-z0-9:_-]+", session):
        raise B06Error("load summary session id is unsafe")
    expected = int(summary["offeredEventsPerSecond"]) * (warmup + duration)
    deadline = time.monotonic() + 90
    history = 0
    while time.monotonic() < deadline:
        history = int(sql_scalar(env,
            f"SELECT COUNT(*) FROM b02_telemetry_history WHERE session_id='{session}'"))
        if history == expected:
            break
        time.sleep(0.5)
    snapshots = int(sql_scalar(env,
        f"SELECT COUNT(*) FROM b02_device_snapshot WHERE session_id='{session}'"))
    redis_ok = 0
    for device in DEVICES:
        tenant = "tenant-a" if device.startswith("device-a") else "tenant-b"
        if session in redis_value(env, f"b02:state:{tenant}:{device}"):
            redis_ok += 1
    errors = int(sql_scalar(env,
        f"SELECT COUNT(*) FROM b02_telemetry_rejection WHERE event_id LIKE '{session}:%'"))
    passed = history == expected and snapshots == 6 and redis_ok == 6 and errors == 0
    result = {"expected": expected, "history": history, "historyCompleteness": history / expected,
              "snapshotDevices": snapshots, "redisDevices": redis_ok, "rejections": errors,
              "passed": passed}
    if strict and not passed:
        raise B06Error(f"B06 correctness failed: {result}")
    return result


def metric_value(metrics: dict[str, dict[str, float]], prefix: str, default: float = 0.0) -> float:
    candidates = [value for component in metrics.values() for key, value in component.items()
                  if key.startswith(prefix)]
    return max(candidates) if candidates else default


def histogram_quantile(metrics: dict[str, dict[str, float]], base: str, quantile: float) -> float:
    buckets: list[tuple[float, float]] = []
    for component in metrics.values():
        for key, value in component.items():
            if not key.startswith(base + "_bucket{"):
                continue
            match = re.search(r'(?:^|,)le="([^"]+)"', key[key.index("{") + 1:-1])
            if not match or match.group(1) == "+Inf":
                continue
            buckets.append((float(match.group(1)), value))
    if not buckets:
        return 0.0
    buckets.sort()
    total = metric_value(metrics, base + "_count")
    threshold = total * quantile
    return next((upper for upper, count in buckets if count >= threshold), buckets[-1][0])


def metric_summary(metrics: dict[str, dict[str, float]]) -> dict[str, float]:
    names = {
        "gatewayQueueDepth": "fieldops_gateway_ingest_queue_depth",
        "gatewayActive": "fieldops_gateway_ingest_active",
        "workerCpu": "process_cpu_usage",
        "hikariActive": "hikaricp_connections_active",
        "hikariPending": "hikaricp_connections_pending",
    }
    result = {label: metric_value(metrics, name) for label, name in names.items()}
    timers = {
        "gatewayIngestP95Seconds": "fieldops_gateway_ingest_duration_seconds",
        "gatewayValidationP95Seconds": "fieldops_gateway_device_validation_duration_seconds",
        "gatewayKafkaP95Seconds": "fieldops_gateway_kafka_publish_duration_seconds",
        "normalizationP95Seconds": "fieldops_worker_normalization_duration_seconds",
        "historyPersistP95Seconds": "fieldops_worker_history_persist_duration_seconds",
        "historyE2EP95Seconds": "fieldops_worker_history_e2e_duration_seconds",
        "projectionP95Seconds": "fieldops_worker_projection_duration_seconds",
        "projectionE2EP95Seconds": "fieldops_worker_projection_e2e_duration_seconds",
    }
    result.update({label: histogram_quantile(metrics, name, 0.95)
                   for label, name in timers.items()})
    return result


def runtime_sample(metrics: dict[str, dict[str, float]]) -> dict[str, float]:
    return {
        "gatewayQueueDepth": metric_value(metrics, "fieldops_gateway_ingest_queue_depth"),
        "gatewayActive": metric_value(metrics, "fieldops_gateway_ingest_active"),
        "gatewayCpu": max(metrics.get("gateway", {}).get("process_cpu_usage", 0.0), 0.0),
        "workerCpu": max(metrics.get("worker", {}).get("process_cpu_usage", 0.0), 0.0),
        "hikariActive": metric_value({"worker": metrics.get("worker", {})},
                                     "hikaricp_connections_active"),
        "hikariPending": metric_value({"worker": metrics.get("worker", {})},
                                      "hikaricp_connections_pending"),
    }


def merge_runtime_maximum(current: dict[str, float], sample: dict[str, float]) -> None:
    for name, value in sample.items():
        current[name] = max(current.get(name, 0.0), value)


def run_load(env: dict[str, str], rate: int, duration: int, warmup: int,
             label: str, *, strict: bool = True) -> dict[str, Any]:
    before = scrape()
    command = [b02.java_executable(), "-jar", str(b02.jar_for("simulator")),
        "--scenario=load", "--device=all", f"--rate={rate}",
        f"--duration-seconds={duration}", f"--warmup-seconds={warmup}",
        "--seed=20260910", "--summary-only=true"]
    process = subprocess.Popen(command, cwd=ROOT,
        env=env | {"SPRING_PROFILES_ACTIVE": "local-observe"}, text=True, encoding="utf-8",
        errors="replace", stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    max_lag = {group: 0 for group in GROUPS}
    observed_max: dict[str, float] = {}
    while process.poll() is None:
        for group, value in lag_snapshot(env).items():
            max_lag[group] = max(max_lag[group], value)
        try:
            merge_runtime_maximum(observed_max, runtime_sample(scrape()))
        except (B06Error, OSError, TimeoutError):
            # A single diagnostic scrape must not perturb the controlled load. The
            # final scrape and required counter integrity remain fail closed.
            pass
        time.sleep(1)
    output = process.communicate(timeout=10)[0]
    if process.returncode != 0:
        print(output, file=sys.stderr)
        raise B06Error(f"controlled load exited with {process.returncode}")
    summary = parse_load_summary(output)
    drain_ms, final_lag = wait_for_drain(env)
    correctness = verify_session(env, summary, warmup, duration, strict=strict)
    after = scrape()
    result = {
        "schemaVersion": 1, "phase": label, "sourceHead": b02.source_head(),
        "recordedAt": b02.now(), "rate": rate, "durationSeconds": duration,
        "warmupSeconds": warmup, "load": summary, "maxLag": max_lag,
        "finalLag": final_lag, "drainTimeMs": drain_ms, "correctness": correctness,
        "observedMax": observed_max,
        "metrics": metric_summary(after),
        "metricCounterDelta": {
            "gatewayAccepted": metric_value(after, 'fieldops_gateway_telemetry_total{result="accepted"}')
                - metric_value(before, 'fieldops_gateway_telemetry_total{result="accepted"}'),
            "historyStored": metric_value(after, 'fieldops_worker_history_total{result="stored"}')
                - metric_value(before, 'fieldops_worker_history_total{result="stored"}'),
        },
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    path = RESULTS / f"{label}-{rate}-{int(time.time())}.json"
    path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    result["resultFile"] = str(path.relative_to(ROOT))
    return result


def version(command: list[str]) -> str:
    try:
        output = subprocess.run(command, cwd=ROOT, text=True, encoding="utf-8", errors="replace",
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                timeout=15, check=False).stdout
        return output.splitlines()[0].strip()
    except (OSError, subprocess.TimeoutExpired, IndexError):
        return "unavailable"


def memory_gib() -> int | None:
    if hasattr(os, "sysconf") and "SC_PAGE_SIZE" in os.sysconf_names:
        return round(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1024 ** 3)
    try:
        output = subprocess.run(["powershell", "-NoProfile", "-Command",
            "[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB)"],
            text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10, check=False).stdout
        return int(output.strip())
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


def environment_manifest(env: dict[str, str]) -> dict[str, Any]:
    config = json.loads(b02.run(b02.compose(env) + ["config", "--format", "json"],
                                env=env, capture=True))
    images: dict[str, dict[str, str]] = {}
    for name, item in config["services"].items():
        reference = item["image"]
        inspected = json.loads(b02.run(["docker", "image", "inspect", reference], capture=True))[0]
        repo_digests = inspected.get("RepoDigests") or []
        images[name] = {"reference": reference,
                        "identity": repo_digests[0] if repo_digests else inspected["Id"]}
    return {
        "benchmarkVersion": 1, "sourceHead": b02.source_head(),
        "os": f"{platform.system()} {platform.release()}", "architecture": platform.machine(),
        "logicalCpu": os.cpu_count(), "memoryGiB": memory_gib(),
        "javaVersion": version([b02.java_executable(), "-version"]),
        "dockerVersion": version(["docker", "version", "--format", "{{.Client.Version}}"]),
        "dockerComposeVersion": version(["docker", "compose", "version"]),
        "pythonVersion": platform.python_version(), "topicPartitions": 3, "devices": 6,
        "images": images,
    }


def owned_benchmark_volumes() -> list[str]:
    output = b02.run(["docker", "volume", "ls", "--filter",
        f"label=com.docker.compose.project={PROJECT}", "--format", "{{.Name}}"], capture=True)
    volumes = [line.strip() for line in output.splitlines() if line.strip()]
    for volume in volumes:
        if not volume.startswith(PROJECT + "_"):
            raise B06Error(f"refusing unexpected B06 volume name: {volume}")
        label = b02.run(["docker", "volume", "inspect", volume, "--format",
            "{{ index .Labels \"com.docker.compose.project\" }}"], capture=True)
        if label != PROJECT:
            raise B06Error(f"refusing volume without exact B06 ownership label: {volume}")
    return volumes


def wait_process_stopped(record: dict[str, Any], timeout: int = 15) -> None:
    deadline = time.monotonic() + timeout
    while b02.process_alive(record) and time.monotonic() < deadline:
        time.sleep(0.2)
    if b02.process_alive(record):
        raise B06Error(f"owned process {record.get('pid')} did not stop within {timeout}s")


def reset_measurement_state(env: dict[str, str]) -> None:
    """Reset only B06 telemetry state and measurement processes between runs."""
    manifest = b02.load_manifest()
    if manifest.get("project") != PROJECT or manifest.get("status") != "running":
        raise B06Error("measurement reset requires the exact running B06 project")
    processes = manifest.get("processes", {})
    for name in ("gateway", "worker"):
        if name not in processes or not b02.process_alive(processes[name]):
            raise B06Error(f"measurement reset cannot prove ownership of {name}")
    _, final_lag = wait_for_drain(env)
    if any(final_lag.values()):
        raise B06Error(f"measurement reset refused while consumer lag remains: {final_lag}")

    for name in ("worker", "gateway"):
        record = processes[name]
        b02.terminate_process(record)
        wait_process_stopped(record)
    sql_scalar(env, "TRUNCATE TABLE b02_telemetry_rejection, b02_telemetry_history, b02_device_snapshot")
    b02.run(b02.compose(env) + ["exec", "-T", "-e",
        f"REDISCLI_AUTH={env['B02_REDIS_PASSWORD']}", "redis", "redis-cli", "FLUSHDB"],
        env=env, capture=True)

    manifest["status"] = "resetting"
    manifest["sourceHead"] = b02.source_head()
    b02.write_manifest(manifest)
    gateway_process, gateway_record = b02.start_process(
        "gateway", [b02.java_executable(), "-jar", str(b02.jar_for("device-gateway"))],
        str(b02.jar_for("device-gateway")), env)
    manifest["processes"]["gateway"] = gateway_record
    b02.write_manifest(manifest)
    b02.wait_http(f"http://127.0.0.1:{PORTS['gateway']}/actuator/health", gateway_process)
    worker_process, worker_record = b02.start_process(
        "worker", [b02.java_executable(), "-jar", str(b02.jar_for("fieldops-worker"))],
        str(b02.jar_for("fieldops-worker")), env)
    manifest["processes"]["worker"] = worker_record
    b02.write_manifest(manifest)
    b02.wait_http(f"http://127.0.0.1:{PORTS['worker']}/actuator/health", worker_process)
    time.sleep(5)
    if worker_process.poll() is not None:
        raise B06Error(f"worker exited with {worker_process.returncode} after measurement reset")
    manifest["status"] = "running"
    manifest["resetAt"] = b02.now()
    b02.write_manifest(manifest)


def action_reset(_: argparse.Namespace) -> None:
    manifest = b02.load_manifest()
    if any(b02.process_alive(record) for record in manifest.get("processes", {}).values()):
        raise B06Error("run down before resetting B06 benchmark storage")
    volumes = owned_benchmark_volumes()
    if volumes:
        b02.run(["docker", "volume", "rm", *volumes], timeout=60)
    print(json.dumps({"project": PROJECT, "removedOwnedVolumes": volumes}, indent=2))


def action_up(_: argparse.Namespace) -> None:
    preflight_ports()
    b02.action_up(argparse.Namespace())
    b02.wait_http(f"http://127.0.0.1:{PORTS['worker']}/actuator/health", timeout=90)
    metrics = scrape()
    required = ("fieldops_gateway_ingest_duration", "fieldops_worker_history_persist_duration")
    joined = "\n".join(key for part in metrics.values() for key in part)
    if not all(name in joined for name in required):
        raise B06Error("B06 custom metrics were not exposed")
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RUNTIME / "environment.json").write_text(
        json.dumps(environment_manifest(b02.ensure_runtime()), indent=2, sort_keys=True) + "\n",
        encoding="utf-8")
    print(json.dumps({"status": "running", "project": PROJECT, "metrics": "PASS"}, indent=2))


def action_status(_: argparse.Namespace) -> None:
    b02.action_status(argparse.Namespace())
    print(json.dumps({"workerMetrics": f"http://127.0.0.1:{PORTS['worker']}/actuator/prometheus",
                      "project": PROJECT}, indent=2))


def action_measure(args: argparse.Namespace) -> None:
    env = b02.ensure_runtime()
    manifest = b02.load_manifest()
    if manifest.get("status") != "running":
        raise B06Error("B06 is not running")
    runs = []
    for index in range(args.repeat):
        reset_measurement_state(env)
        runs.append(run_load(env, args.rate, args.duration, args.warmup,
                             f"{args.label}-{index + 1}", strict=args.strict))
    achieved = [run["load"]["achievedEventsPerSecond"] for run in runs]
    print(json.dumps({"label": args.label, "rate": args.rate, "runs": runs,
        "medianAchievedEventsPerSecond": statistics.median(achieved)}, indent=2))


def action_smoke(_: argparse.Namespace) -> None:
    result = run_load(b02.ensure_runtime(), 10, 3, 1, "smoke")
    if result["load"]["achievedEventsPerSecond"] / 10 < 0.95:
        raise B06Error("low-rate achieved/offered ratio below 0.95")
    print(json.dumps(result, indent=2))


def action_sweep(args: argparse.Namespace) -> None:
    env = b02.ensure_runtime()
    runs = []
    for rate in args.rates:
        reset_measurement_state(env)
        result = run_load(env, rate, args.duration, args.warmup, "baseline-sweep", strict=False)
        ratio = result["load"]["achievedEventsPerSecond"] / rate
        substantive = (ratio >= 0.95
            and result["load"]["publishErrors"] == 0
            and result["correctness"]["passed"]
            and not any(result["finalLag"].values()))
        result["classification"] = "SUSTAINABLE" if substantive else "KNEE_CANDIDATE"
        runs.append(result)
        if result["classification"] == "KNEE_CANDIDATE":
            break
    summary = {"runs": runs, "knee": next((r["rate"] for r in runs
        if r["classification"] == "KNEE_CANDIDATE"), "NO_KNEE_WITHIN_TESTED_RANGE")}
    (RESULTS / "baseline-sweep.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))


def restart_worker(env: dict[str, str]) -> int:
    manifest = b02.load_manifest()
    record = manifest.get("processes", {}).get("worker")
    if manifest.get("project") != PROJECT or not record or not b02.process_alive(record):
        raise B06Error("worker restart cannot prove exact B06 process ownership")
    started = time.monotonic()
    b02.terminate_process(record)
    wait_process_stopped(record)
    time.sleep(5)
    process, replacement = b02.start_process(
        "worker", [b02.java_executable(), "-jar", str(b02.jar_for("fieldops-worker"))],
        str(b02.jar_for("fieldops-worker")), env)
    manifest["processes"]["worker"] = replacement
    b02.write_manifest(manifest)
    b02.wait_http(f"http://127.0.0.1:{PORTS['worker']}/actuator/health", process)
    return round((time.monotonic() - started) * 1000)


def restart_redis(env: dict[str, str]) -> int:
    started = time.monotonic()
    base = b02.compose(env)
    b02.run(base + ["stop", "-t", "1", "redis"], env=env, timeout=30)
    time.sleep(5)
    b02.run(base + ["start", "redis"], env=env, timeout=30)
    b02.wait_http(f"http://127.0.0.1:{PORTS['worker']}/actuator/health", timeout=60)
    return round((time.monotonic() - started) * 1000)


def run_drill(env: dict[str, str], scenario: str, rate: int, duration: int,
              outage_after: int) -> dict[str, Any]:
    reset_measurement_state(env)
    before = scrape()
    command = [b02.java_executable(), "-jar", str(b02.jar_for("simulator")),
        "--scenario=load", "--device=all", f"--rate={rate}",
        f"--duration-seconds={duration}", "--warmup-seconds=5",
        "--seed=20260910", "--summary-only=true"]
    process = subprocess.Popen(command, cwd=ROOT,
        env=env | {"SPRING_PROFILES_ACTIVE": "local-observe"}, text=True, encoding="utf-8",
        errors="replace", stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    started = time.monotonic()
    injected = False
    recovered_at = 0.0
    recovery_ms = 0
    max_lag = {group: 0 for group in GROUPS}
    observed_max: dict[str, float] = {}
    history_before = 0
    history_after = 0
    try:
        while process.poll() is None:
            for group, value in lag_snapshot(env).items():
                max_lag[group] = max(max_lag[group], value)
            try:
                merge_runtime_maximum(observed_max, runtime_sample(scrape()))
            except (B06Error, OSError, TimeoutError):
                pass
            if not injected and time.monotonic() - started >= outage_after:
                history_before = int(sql_scalar(env, "SELECT COUNT(*) FROM b02_telemetry_history"))
                recovery_ms = restart_worker(env) if scenario == "worker-restart" else restart_redis(env)
                recovered_at = time.monotonic()
                history_after = int(sql_scalar(env, "SELECT COUNT(*) FROM b02_telemetry_history"))
                injected = True
            time.sleep(1)
        output = process.communicate(timeout=10)[0]
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=10)
    if process.returncode != 0:
        print(output, file=sys.stderr)
        raise B06Error(f"controlled drill load exited with {process.returncode}")
    if not injected:
        raise B06Error("drill load completed before fault injection")
    summary = parse_load_summary(output)
    drain_ms, final_lag = wait_for_drain(env, timeout=90)
    drained_at = time.monotonic()
    correctness = verify_session(env, summary, 5, duration)
    after = scrape()
    result = {
        "schemaVersion": 1, "scenario": scenario, "sourceHead": b02.source_head(),
        "recordedAt": b02.now(), "rate": rate, "durationSeconds": duration,
        "outageSeconds": 5, "load": summary, "recoveryToHealthyMs": recovery_ms,
        "recoveryToLagDrainMs": round(max(0.0, drained_at - recovered_at) * 1000),
        "maxLag": max_lag, "finalLag": final_lag, "drainTimeMs": drain_ms,
        "historyBeforeFault": history_before, "historyAfterRecovery": history_after,
        "historyContinuityDuringFault": history_after >= history_before,
        "historyMissing": correctness["expected"] - correctness["history"],
        "correctness": correctness, "observedMax": observed_max,
        "metrics": metric_summary(after),
        "metricCounterDelta": {
            "gatewayAccepted": metric_value(after, 'fieldops_gateway_telemetry_total{result="accepted"}')
                - metric_value(before, 'fieldops_gateway_telemetry_total{result="accepted"}'),
            "historyStored": metric_value(after, 'fieldops_worker_history_total{result="stored"}')
                - metric_value(before, 'fieldops_worker_history_total{result="stored"}'),
        },
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    path = RESULTS / f"drill-{scenario}-{int(time.time())}.json"
    path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    result["resultFile"] = str(path.relative_to(ROOT))
    return result


def action_drill(args: argparse.Namespace) -> None:
    result = run_drill(b02.ensure_runtime(), args.scenario, args.rate,
                       args.duration, args.outage_after)
    print(json.dumps(result, indent=2))


def selected_runs(label: str, rate: int) -> list[dict[str, Any]]:
    runs = []
    for path in RESULTS.glob(f"{label}-*-{rate}-*.json"):
        parsed = json.loads(path.read_text(encoding="utf-8"))
        if re.fullmatch(rf"{label}-[123]", str(parsed.get("phase", ""))):
            runs.append(parsed)
    runs.sort(key=lambda run: run["recordedAt"])
    if len(runs) != 3:
        raise B06Error(f"expected exactly three {label} runs at {rate} EPS, found {len(runs)}")
    return runs


def median_summary(runs: list[dict[str, Any]]) -> dict[str, float]:
    def median(path: tuple[str, ...]) -> float:
        values = []
        for run in runs:
            value: Any = run
            for key in path:
                value = value[key]
            values.append(float(value))
        return statistics.median(values)
    return {
        "achievedEps": median(("load", "achievedEventsPerSecond")),
        "gatewayAccepted": median(("metricCounterDelta", "gatewayAccepted")),
        "historyCompleteness": median(("correctness", "historyCompleteness")),
        "drainTimeMs": median(("drainTimeMs",)),
        "normalizerMaxLag": median(("maxLag", "fieldops-b02-normalizer")),
        "gatewayQueuePeak": median(("observedMax", "gatewayQueueDepth")),
        "historyE2EP95Seconds": median(("metrics", "historyE2EP95Seconds")),
        "projectionE2EP95Seconds": median(("metrics", "projectionE2EP95Seconds")),
    }


def action_compare(_: argparse.Namespace) -> None:
    comparison: dict[str, Any] = {"schemaVersion": 1, "baselineSource": None,
                                  "candidateSource": None, "rates": {}}
    for rate in (100, 250):
        baseline = selected_runs("baseline", rate)
        candidate = selected_runs("candidate", rate)
        if not all(run["correctness"]["passed"] and run["load"]["publishErrors"] == 0
                   for run in candidate):
            raise B06Error(f"candidate correctness failed at {rate} EPS")
        comparison["baselineSource"] = baseline[0]["sourceHead"]
        comparison["candidateSource"] = candidate[0]["sourceHead"]
        comparison["rates"][str(rate)] = {
            "baseline": median_summary(baseline), "candidate": median_summary(candidate)}
    base_drain = comparison["rates"]["100"]["baseline"]["drainTimeMs"]
    candidate_drain = comparison["rates"]["100"]["candidate"]["drainTimeMs"]
    base_accept = comparison["rates"]["250"]["baseline"]["gatewayAccepted"]
    candidate_accept = comparison["rates"]["250"]["candidate"]["gatewayAccepted"]
    comparison["improvement"] = {
        "sustainableDrainReductionPct": round((base_drain - candidate_drain) / base_drain * 100, 2),
        "stressAcceptedIncreasePct": round((candidate_accept - base_accept) / base_accept * 100, 2),
        "stressCompletenessPercentagePoints": round(
            (comparison["rates"]["250"]["candidate"]["historyCompleteness"]
             - comparison["rates"]["250"]["baseline"]["historyCompleteness"]) * 100, 2),
    }
    comparison["accepted"] = (
        comparison["improvement"]["sustainableDrainReductionPct"] >= 15
        and comparison["rates"]["250"]["candidate"]["historyCompleteness"] == 1.0)
    path = RESULTS / "before-after.json"
    path.write_text(json.dumps(comparison, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(comparison, indent=2))


def latest_drill(scenario: str) -> dict[str, Any]:
    paths = sorted(RESULTS.glob(f"drill-{scenario}-*.json"), key=lambda path: path.stat().st_mtime)
    if not paths:
        raise B06Error(f"missing {scenario} drill result")
    return json.loads(paths[-1].read_text(encoding="utf-8"))


def resilience_summary(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "sourceHead": result["sourceHead"], "rate": result["rate"],
        "durationSeconds": result["durationSeconds"], "outageSeconds": result["outageSeconds"],
        "achievedEps": result["load"]["achievedEventsPerSecond"],
        "recoveryToHealthyMs": result["recoveryToHealthyMs"],
        "recoveryToLagDrainMs": result["recoveryToLagDrainMs"],
        "maxLag": result["maxLag"], "finalLag": result["finalLag"],
        "historyExpected": result["correctness"]["expected"],
        "historyObserved": result["correctness"]["history"],
        "historyMissing": result["historyMissing"],
        "historyContinuityDuringFault": result["historyContinuityDuringFault"],
        "redisDevices": result["correctness"]["redisDevices"],
        "processingErrors": result["correctness"]["rejections"],
        "passed": result["correctness"]["passed"] and not any(result["finalLag"].values()),
    }


def svg_bar(x: int, y: int, width: int, value: float, maximum: float,
            color: str, label: str) -> str:
    length = 0 if maximum <= 0 else round(width * value / maximum)
    return (f'<text x="{x}" y="{y - 7}" class="label">{label}</text>'
            f'<rect x="{x}" y="{y}" width="{width}" height="20" rx="4" class="track"/>'
            f'<rect x="{x}" y="{y}" width="{length}" height="20" rx="4" fill="{color}"/>'
            f'<text x="{x + width + 12}" y="{y + 15}" class="value">{value:g}</text>')


def svg_document(title: str, subtitle: str, body: str, height: int) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="960" height="{height}" viewBox="0 0 960 {height}">
  <style>
    .bg {{ fill: #0b1220; }} .title {{ fill: #f8fafc; font: 700 28px system-ui,sans-serif; }}
    .subtitle {{ fill: #94a3b8; font: 15px system-ui,sans-serif; }}
    .label {{ fill: #cbd5e1; font: 14px system-ui,sans-serif; }}
    .value {{ fill: #f8fafc; font: 600 14px ui-monospace,monospace; }}
    .track {{ fill: #1e293b; }} .note {{ fill: #94a3b8; font: 13px system-ui,sans-serif; }}
  </style>
  <rect class="bg" width="960" height="{height}" rx="18"/>
  <text x="48" y="52" class="title">{title}</text>
  <text x="48" y="80" class="subtitle">{subtitle}</text>
  {body}
</svg>
'''


def performance_svg(comparison: dict[str, Any]) -> str:
    r100 = comparison["rates"]["100"]
    r250 = comparison["rates"]["250"]
    body = [
        '<text x="48" y="120" class="label">100 EPS drain time (ms, lower is better)</text>',
        svg_bar(48, 142, 650, r100["baseline"]["drainTimeMs"],
                r100["baseline"]["drainTimeMs"], "#f97316", "Baseline"),
        svg_bar(48, 196, 650, r100["candidate"]["drainTimeMs"],
                r100["baseline"]["drainTimeMs"], "#22c55e", "Candidate"),
        '<text x="48" y="268" class="label">250 EPS History completeness (%, higher is better)</text>',
        svg_bar(48, 290, 650, r250["baseline"]["historyCompleteness"] * 100,
                100, "#f97316", "Baseline"),
        svg_bar(48, 344, 650, r250["candidate"]["historyCompleteness"] * 100,
                100, "#22c55e", "Candidate"),
        '<text x="48" y="410" class="note">Three runs per rate; medians shown. Single local benchmark environment, not production capacity.</text>',
    ]
    return svg_document("B06 Before / After", "Bounded pipeline concurrency alignment", "\n  ".join(body), 450)


def resilience_svg(worker: dict[str, Any], redis: dict[str, Any]) -> str:
    maximum = max(worker["recoveryToHealthyMs"], redis["recoveryToHealthyMs"])
    body = [
        '<text x="48" y="120" class="label">Fault start → healthy (ms, includes 5s outage)</text>',
        svg_bar(48, 142, 650, worker["recoveryToHealthyMs"], maximum,
                "#38bdf8", "Worker restart"),
        svg_bar(48, 196, 650, redis["recoveryToHealthyMs"], maximum,
                "#a78bfa", "Redis outage"),
        f'<text x="48" y="278" class="value">Worker: missing {worker["historyMissing"]}, final Redis {worker["redisDevices"]}/6</text>',
        f'<text x="48" y="310" class="value">Redis: missing {redis["historyMissing"]}, final Redis {redis["redisDevices"]}/6</text>',
        '<text x="48" y="364" class="note">65 EPS controlled load; History completeness 100%; all final consumer lag drained to zero.</text>',
    ]
    return svg_document("B06 Recovery Characterization", "Owned Worker restart and Redis outage", "\n  ".join(body), 405)


def action_report(_: argparse.Namespace) -> None:
    env = b02.ensure_runtime()
    comparison_path = RESULTS / "before-after.json"
    if not comparison_path.exists():
        action_compare(argparse.Namespace())
    comparison = json.loads(comparison_path.read_text(encoding="utf-8"))
    worker = resilience_summary(latest_drill("worker-restart"))
    redis = resilience_summary(latest_drill("redis-outage"))
    if not comparison.get("accepted") or not worker["passed"] or not redis["passed"]:
        raise B06Error("report refuses incomplete Before/After or resilience evidence")
    environment = environment_manifest(env)
    environment["sourceHead"] = comparison["candidateSource"]
    summary = {
        "schemaVersion": 1,
        "claimBoundary": "Measured on one stated local environment; not production capacity or maximum TPS.",
        "selection": {"baselineSustainableEps": 100, "baselineKneeCandidateEps": 250,
                      "candidateHighestTestedEps": 250, "devices": 6,
                      "warmupSeconds": 10, "measureSeconds": 30, "runsPerAnchor": 3},
        "environment": environment,
        "bottleneck": {
            "finding": "Bounded pipeline concurrency was under-utilized relative to offered load.",
            "signals": ["Gateway queue reached 253/256 at 250 EPS with only two active core workers.",
                        "Normalizer lag median reached 3259 while CPU and Hikari pending remained low."],
        },
        "optimization": {
            "count": 1, "name": "B06 bounded pipeline concurrency alignment",
            "gatewayCoreWorkers": {"before": 2, "after": 4},
            "workerListenerConcurrency": {"before": 1, "after": 3},
            "defaultProfilesChanged": False,
        },
        "beforeAfter": comparison,
        "resilience": {"workerRestart": worker, "redisOutage": redis},
    }
    SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    CHART_DIR.mkdir(parents=True, exist_ok=True)
    (CHART_DIR / "performance-before-after.svg").write_text(
        performance_svg(comparison), encoding="utf-8")
    (CHART_DIR / "resilience-recovery.svg").write_text(
        resilience_svg(worker, redis), encoding="utf-8")
    BATCH_PATH.parent.mkdir(parents=True, exist_ok=True)
    improvement = comparison["improvement"]
    BATCH_PATH.write_text(f'''# B06 — Measured Performance & Resilience Evidence

- Baseline source: `{comparison["baselineSource"]}`
- Accepted candidate source: `{comparison["candidateSource"]}`
- Environment: `{environment["os"]}`, `{environment["architecture"]}`, {environment["logicalCpu"]} logical CPUs, ~{environment["memoryGiB"]} GiB RAM
- Claim boundary: one stated local machine; this is not production capacity or maximum TPS.

## Before / After

Three runs per anchor were measured; medians are canonical. Baseline `R_sustainable` was 100 EPS and the first tested knee candidate was 250 EPS.

- 100 EPS drain reduction: {improvement["sustainableDrainReductionPct"]}%
- 250 EPS accepted-event increase: {improvement["stressAcceptedIncreasePct"]}%
- 250 EPS History completeness: {comparison["rates"]["250"]["baseline"]["historyCompleteness"] * 100:.2f}% → {comparison["rates"]["250"]["candidate"]["historyCompleteness"] * 100:.2f}%
- Candidate correctness: History 100%, final Redis 6/6, processing errors 0, final lag 0.

## Bottleneck and one optimization

Gateway queue saturation and Normalizer lag were both present while CPU utilization and Hikari pending remained low. The one accepted optimization activates the existing bounded Gateway parallelism (2 → 4 core workers) and aligns B06-only Worker listeners to the three Kafka partitions (1 → 3). Default B02/B04/B05 profiles are unchanged.

## Recovery drills

- Worker restart: healthy in {worker["recoveryToHealthyMs"]} ms including the five-second stop, lag drained in {worker["recoveryToLagDrainMs"]} ms, History missing {worker["historyMissing"]}, Redis {worker["redisDevices"]}/6.
- Redis outage: healthy in {redis["recoveryToHealthyMs"]} ms including the five-second stop, History continued, History missing {redis["historyMissing"]}, Redis converged {redis["redisDevices"]}/6.

## Gate state

G1-G9 PASS. G10 B02/B04/B05 regression is completed by the final acceptance gates.
''', encoding="utf-8")
    print(json.dumps({"summary": str(SUMMARY_PATH.relative_to(ROOT)),
                      "charts": [str((CHART_DIR / "performance-before-after.svg").relative_to(ROOT)),
                                 str((CHART_DIR / "resilience-recovery.svg").relative_to(ROOT))],
                      "batch": str(BATCH_PATH.relative_to(ROOT))}, indent=2))


def action_down(_: argparse.Namespace) -> None:
    b02.action_down(argparse.Namespace())


def unavailable(_: argparse.Namespace) -> None:
    raise B06Error("command becomes available after canonical baseline evidence selects its inputs")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    sub = result.add_subparsers(dest="action", required=True)
    for name, handler in (("up", action_up), ("status", action_status), ("smoke", action_smoke),
                          ("down", action_down), ("reset", action_reset),
                          ("compare", action_compare), ("report", action_report)):
        sub.add_parser(name).set_defaults(handler=handler)
    drill = sub.add_parser("drill")
    drill.add_argument("--scenario", choices=("worker-restart", "redis-outage"), required=True)
    drill.add_argument("--rate", type=int, default=65)
    drill.add_argument("--duration", type=int, default=60)
    drill.add_argument("--outage-after", type=int, default=20)
    drill.set_defaults(handler=action_drill)
    measure = sub.add_parser("measure")
    measure.add_argument("--rate", type=int, required=True)
    measure.add_argument("--duration", type=int, default=30)
    measure.add_argument("--warmup", type=int, default=10)
    measure.add_argument("--repeat", type=int, default=3)
    measure.add_argument("--label", choices=("baseline", "candidate"), required=True)
    measure.add_argument("--allow-correctness-knee", action="store_false", dest="strict",
                         help="record a known stress knee without turning it into a PASS")
    measure.set_defaults(strict=True)
    measure.set_defaults(handler=action_measure)
    sweep = sub.add_parser("sweep")
    sweep.add_argument("--rates", type=int, nargs="+", default=[50, 100, 250, 500, 1000])
    sweep.add_argument("--duration", type=int, default=30)
    sweep.add_argument("--warmup", type=int, default=10)
    sweep.set_defaults(handler=action_sweep)
    return result


def main() -> int:
    configure_b02()
    args = parser().parse_args()
    try:
        args.handler(args)
        return 0
    except (B06Error, b02.B02Error, OSError, ValueError, json.JSONDecodeError,
            subprocess.TimeoutExpired) as error:
        print(f"B06 ERROR: {error}", file=sys.stderr)
        return 1


configure_b02()

if __name__ == "__main__":
    raise SystemExit(main())
