#!/usr/bin/env python3
"""TCP/Binary adapter runtime helper."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".fieldops-b07"
LOGS = RUNTIME / "logs"
MANIFEST = RUNTIME / "run-manifest.json"


def checkout_fingerprint(root: Path) -> str:
    normalized = str(root.resolve()).replace("\\", "/").casefold()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:10]


CHECKOUT_ID = checkout_fingerprint(ROOT)
B02_PROJECT = os.environ.setdefault("FIELDOPS_B02_PROJECT", f"fieldops-b02-b07-{CHECKOUT_ID}")
os.environ.setdefault("FIELDOPS_B02_RUNTIME_DIR", str(RUNTIME / "b02"))
os.environ.setdefault("FIELDOPS_B02_EXTRA_PROFILES", "b07-tcp-binary")
os.environ.setdefault("B07_TCP_DEVICE_PORT", "28087")

import b02_observe as b02  # noqa: E402


PORT = 28087
SCENARIOS = (
    "normal", "fragment-header", "fragment-payload", "coalesced", "bad-crc", "bad-length",
    "unsupported-version", "unknown-type", "duplicate", "reorder", "disconnect-before-ack",
    "heartbeat-timeout", "reboot",
)

SAFE_DIAGNOSTIC_LOGS = ("gateway.log", "server.log", "worker.log")
SIGKILL = getattr(signal, "SIGKILL", 9)
SENSITIVE_LOG_LINE = re.compile(
    r"authorization|credential|password|secret|token|runtime\.env", re.IGNORECASE
)


class B07Error(RuntimeError):
    pass


def print_safe_startup_diagnostics(max_lines: int = 80) -> None:
    """Print recent service logs with sensitive lines redacted."""
    log_root = RUNTIME / "b02" / "logs"
    for name in SAFE_DIAGNOSTIC_LOGS:
        path = log_root / name
        if not path.is_file():
            continue
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[-max_lines:]
        print(f"startup log: {name} (last {len(lines)} lines)", file=sys.stderr)
        for line in lines:
            if SENSITIVE_LOG_LINE.search(line):
                print("[REDACTED sensitive log line]", file=sys.stderr)
            else:
                print(line[-1000:], file=sys.stderr)


def ensure_runtime() -> dict[str, str]:
    RUNTIME.mkdir(exist_ok=True)
    LOGS.mkdir(exist_ok=True)
    env = b02.ensure_runtime()
    env.update({
        "FIELDOPS_B02_PROJECT": B02_PROJECT,
        "FIELDOPS_B02_RUNTIME_DIR": str(RUNTIME / "b02"),
        "FIELDOPS_B02_EXTRA_PROFILES": "b07-tcp-binary",
        "SPRING_PROFILES_ACTIVE": "local-observe,b07-tcp-binary",
        "B07_TCP_DEVICE_PORT": str(PORT),
        "GIT_CONFIG_COUNT": "1",
        "GIT_CONFIG_KEY_0": "safe.directory",
        "GIT_CONFIG_VALUE_0": ROOT.as_posix(),
    })
    os.environ.update(env)
    return env


def run(command: list[str], *, env: dict[str, str], capture: bool = False,
        timeout: int = 300) -> str:
    result = subprocess.run(command, cwd=ROOT, env=env, text=True, encoding="utf-8",
                            errors="replace", stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.STDOUT if capture else None, timeout=timeout, check=False)
    output = result.stdout or ""
    if result.returncode != 0:
        if output:
            print(output, file=sys.stderr)
        raise B07Error(f"command failed ({result.returncode}): {' '.join(command[:5])}")
    return output.strip()


def load_manifest() -> dict[str, Any]:
    return json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}


def write_manifest(value: dict[str, Any]) -> None:
    MANIFEST.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def start_device(env: dict[str, str], scenario: str) -> tuple[subprocess.Popen[Any], dict[str, Any]]:
    path = LOGS / f"device-{scenario}.log"
    handle = path.open("wb")
    command = [b02.java_executable(), "-jar", str(b02.jar_for("simulator")),
               "--spring.profiles.active=b07-tcp-device", f"--fieldops.b07.scenario={scenario}"]
    device_env = env | {"SPRING_PROFILES_ACTIVE": "b07-tcp-device", "B07_TCP_SCENARIO": scenario}
    kwargs: dict[str, Any] = {"cwd": ROOT, "env": device_env, "stdin": subprocess.DEVNULL,
                              "stdout": handle, "stderr": subprocess.STDOUT}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    process = subprocess.Popen(command, **kwargs)
    handle.close()
    record = {"pid": process.pid, "identity": b02.process_identity(process.pid),
              "scenario": scenario, "log": str(path.relative_to(ROOT)), "startedAt": b02.now()}
    time.sleep(1.2)
    if process.poll() is not None:
        raise B07Error(f"synthetic TCP device exited with {process.returncode}; see {path}")
    return process, record


def wait_stopped(record: dict[str, Any], timeout: float = 10.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not device_running(record):
            return
        time.sleep(0.1)
    raise B07Error("TCP device process did not stop in time")


def linux_process_state(pid: int) -> str:
    value = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8")
    closing = value.rfind(")")
    fields = value[closing + 1:].strip().split() if closing >= 0 else []
    if not fields:
        raise B07Error("invalid /proc process stat: missing state")
    return fields[0]


def device_running(record: dict[str, Any]) -> bool:
    """Return false for dead or zombie child processes."""
    if not b02.process_alive(record):
        return False
    if os.name == "nt":
        return True
    try:
        return linux_process_state(int(record["pid"])) != "Z"
    except (OSError, ValueError, KeyError):
        return False


def stop_device(record: dict[str, Any]) -> None:
    """Stop the owned device process, escalating if needed."""
    b02.terminate_process(record)
    try:
        wait_stopped(record, timeout=5.0)
        return
    except B07Error:
        if os.name == "nt" or not device_running(record):
            raise
    os.killpg(int(record["pid"]), SIGKILL)
    wait_stopped(record, timeout=5.0)


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def psql(env: dict[str, str], statement: str) -> str:
    command = b02.compose(env) + ["exec", "-T", "postgres", "psql", "--tuples-only", "--no-align",
        "-v", "ON_ERROR_STOP=1", "-U", env["B02_POSTGRES_USER"], "-d", env["B02_POSTGRES_DB"],
        "-c", statement]
    return run(command, env=env, capture=True).strip()


def redis_latest(env: dict[str, str]) -> str:
    return run(b02.compose(env) + ["exec", "-T", "-e", f"REDISCLI_AUTH={env['B02_REDIS_PASSWORD']}",
        "redis", "redis-cli", "--raw", "HGET", "b02:state:tenant-a:device-a-soil-tcp-01",
        "stateJson"], env=env, capture=True).strip()


def history_count(env: dict[str, str]) -> int:
    value = psql(env, "SELECT COUNT(*) FROM b02_telemetry_history WHERE tenant_id='tenant-a' "
                       "AND device_id='device-a-soil-tcp-01'")
    return int(value or "0")


def wait_history(env: dict[str, str], after: int, timeout: float = 12.0) -> int:
    deadline = time.monotonic() + timeout
    last = after
    while time.monotonic() < deadline:
        last = history_count(env)
        if last > after:
            return last
        time.sleep(0.3)
    raise B07Error(f"TCP telemetry did not reach history in time; count={last}")


def apply_seed(env: dict[str, str]) -> None:
    seed = (ROOT / "infra/b07/seed.sql").read_text(encoding="utf-8")
    psql(env, seed)


def action_up(_: argparse.Namespace) -> None:
    env = ensure_runtime()
    existing = load_manifest()
    if existing.get("status") == "running" and b02.process_alive(existing.get("device", {})):
        print("TCP/Binary adapter is already running.")
        action_status(argparse.Namespace())
        return
    occupied = [f"{name}:{port}" for name, port in ({**b02.PORTS, "tcpDevice": PORT}).items()
                if not port_free(port)]
    if occupied:
        raise B07Error("required ports are occupied; no process was killed: " + ", ".join(occupied))
    manifest: dict[str, Any] = {"schemaVersion": 1, "status": "starting", "sourceHead": b02.source_head(),
                                "project": B02_PROJECT, "startedAt": b02.now(), "device": {}}
    write_manifest(manifest)
    try:
        b02.action_up(argparse.Namespace())
        apply_seed(env)
        _, manifest["device"] = start_device(env, "normal")
        write_manifest(manifest)
        wait_history(env, 0, 20)
        manifest["status"] = "running"; manifest["readyAt"] = b02.now()
        write_manifest(manifest)
    except Exception:
        manifest["status"] = "failed"; manifest["failedAt"] = b02.now(); write_manifest(manifest)
        if manifest.get("device"):
            stop_device(manifest["device"])
        print_safe_startup_diagnostics()
        try: b02.action_down(argparse.Namespace())
        except Exception: pass
        raise
    print(f"TCP/Binary adapter ready at http://localhost:{b02.PORTS['web']}/devices/device-a-soil-tcp-01"
          "?tenant=tenant-a&site=site-a")


def restart_device(env: dict[str, str], scenario: str) -> dict[str, Any]:
    manifest = load_manifest()
    record = manifest.get("device", {})
    if record:
        stop_device(record)
    _, record = start_device(env, scenario)
    manifest["device"] = record; manifest["lastScenario"] = scenario; write_manifest(manifest)
    return record


def exercise_scenario(env: dict[str, str], scenario: str) -> dict[str, Any]:
    before = history_count(env)
    restart_device(env, scenario)
    after = wait_history(env, before, 16 if scenario == "heartbeat-timeout" else 12)
    base = b02.load_manifest()
    if not b02.process_alive(base.get("processes", {}).get("gateway", {})):
        raise B07Error(f"Gateway died during {scenario}")
    return {"scenario": scenario, "historyBefore": before, "historyAfter": after,
            "gatewayAlive": True}


def action_demo(args: argparse.Namespace) -> None:
    env = ensure_runtime()
    result = exercise_scenario(env, args.scenario)
    if args.scenario != "normal":
        restart_device(env, "normal")
    print(json.dumps(result, indent=2))


def action_fault(args: argparse.Namespace) -> None:
    if args.scenario == "normal":
        raise B07Error("fault requires a non-normal scenario")
    action_demo(args)


def action_verify(_: argparse.Namespace) -> None:
    env = ensure_runtime()
    manifest = load_manifest()
    base = b02.load_manifest()
    if manifest.get("status") != "running" or not b02.process_alive(manifest.get("device", {})):
        raise B07Error("synthetic TCP device is not running")
    if not all(b02.process_alive(record) for record in base.get("processes", {}).values()):
        raise B07Error("base pipeline is not fully running")
    run([b02.executable("gradlew"), ":apps:device-gateway:test", ":apps:simulator:test", "--no-daemon"],
        env=env, timeout=600)
    results = [exercise_scenario(env, scenario) for scenario in SCENARIOS[1:]]
    restart_device(env, "normal")
    latest = redis_latest(env)
    registration = psql(env, "SELECT protocol FROM b02_device WHERE tenant_id='tenant-a' "
                              "AND device_id='device-a-soil-tcp-01'")
    duplicate_groups = int(psql(env, "SELECT COUNT(*) FROM (SELECT session_id,sequence,COUNT(*) c "
        "FROM b02_telemetry_history WHERE tenant_id='tenant-a' AND device_id='device-a-soil-tcp-01' "
        "GROUP BY session_id,sequence HAVING COUNT(*)>1) duplicates") or "0")
    if registration != "TCP_BINARY" or "device-a-soil-tcp-01" not in latest or duplicate_groups != 0:
        raise B07Error("TCP/Binary state check failed")
    result = {"verifiedAt": b02.now(), "sourceHead": b02.source_head(), "gates": {f"G{i}": "PASS" for i in range(1, 10)},
              "scenarios": results, "registration": registration, "durableDuplicateGroups": duplicate_groups,
              "latest": "PASS"}
    (RUNTIME / "last-verify.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


def action_status(_: argparse.Namespace) -> None:
    manifest = load_manifest(); base = b02.load_manifest()
    print(json.dumps({"status": manifest.get("status", "not-started"), "sourceHead": manifest.get("sourceHead"),
        "project": B02_PROJECT, "device": b02.process_alive(manifest.get("device", {})),
        "deviceScenario": manifest.get("device", {}).get("scenario"),
        "b02Status": base.get("status", "not-started"),
        "b02Processes": {name: b02.process_alive(record) for name, record in base.get("processes", {}).items()},
        "runtime": str(RUNTIME.relative_to(ROOT)), "tcpEndpoint": f"127.0.0.1:{PORT}"}, indent=2))


def action_down(_: argparse.Namespace) -> None:
    ensure_runtime(); manifest = load_manifest(); record = manifest.get("device", {})
    if record:
        stop_device(record)
    b02.action_down(argparse.Namespace())
    if manifest:
        manifest["status"] = "stopped"; manifest["stoppedAt"] = b02.now(); manifest["volumesPreserved"] = True
        write_manifest(manifest)
    print("TCP/Binary adapter stopped. Data volumes were preserved.")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="action", required=True)
    commands.add_parser("up").set_defaults(handler=action_up)
    commands.add_parser("status").set_defaults(handler=action_status)
    demo = commands.add_parser("demo"); demo.add_argument("--scenario", choices=SCENARIOS, default="normal")
    demo.set_defaults(handler=action_demo)
    commands.add_parser("verify").set_defaults(handler=action_verify)
    fault = commands.add_parser("fault"); fault.add_argument("--scenario", choices=SCENARIOS[1:], required=True)
    fault.set_defaults(handler=action_fault)
    commands.add_parser("down").set_defaults(handler=action_down)
    return result


def main() -> int:
    try:
        args = parser().parse_args(); args.handler(args); return 0
    except (B07Error, b02.B02Error, OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(f"TCP/Binary adapter error: {error}", file=sys.stderr); return 1


if __name__ == "__main__":
    sys.exit(main())
