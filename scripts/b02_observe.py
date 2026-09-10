#!/usr/bin/env python3
"""Task-owned B02 localhost orchestrator; never deletes volumes or global services."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def resolve_runtime(raw: str | None) -> Path:
    candidate = Path(raw) if raw else Path(".fieldops-b02")
    resolved = (candidate if candidate.is_absolute() else ROOT / candidate).resolve()
    try:
        relative = resolved.relative_to(ROOT.resolve())
    except ValueError as error:
        raise RuntimeError("FIELDOPS_B02_RUNTIME_DIR must stay inside the repository") from error
    if relative == Path("."):
        raise RuntimeError("FIELDOPS_B02_RUNTIME_DIR cannot be the repository root")
    return resolved


RUNTIME = resolve_runtime(os.environ.get("FIELDOPS_B02_RUNTIME_DIR"))
LOGS = RUNTIME / "logs"
MANIFEST = RUNTIME / "run-manifest.json"
PROJECT = os.environ.get("FIELDOPS_B02_PROJECT", "fieldops-b02")
COMPOSE_FILES = [ROOT / "infra/compose/compose.yml", ROOT / "infra/b02/compose.override.yml"]
DEFAULT_KEYCLOAK_PORT = 28080
PORTS = {
    "web": 3000,
    "gateway": 28081,
    "server": 28082,
    "keycloak": DEFAULT_KEYCLOAK_PORT,
    "mqtt": 21883,
    "postgres": 25432,
    "redis": 26379,
    "kafka": 29092,
    "kafkaController": 29093,
}
TOPICS = (
    "fieldops.telemetry.raw.v1",
    "fieldops.telemetry.normalized.v1",
    "fieldops.device.state-updated.v1",
)


class B02Error(RuntimeError):
    pass


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def resolve_keycloak_port(raw: str | None) -> int:
    if raw is None:
        return DEFAULT_KEYCLOAK_PORT
    try:
        port = int(raw)
    except ValueError as error:
        raise B02Error("B02_KEYCLOAK_PORT must be an integer from 1 to 65535") from error
    if not 1 <= port <= 65535:
        raise B02Error("B02_KEYCLOAK_PORT must be an integer from 1 to 65535")
    return port


def executable(name: str) -> str:
    if os.name == "nt":
        candidate = ROOT / f"{name}.bat"
        if candidate.exists():
            return str(candidate)
        if name == "pnpm":
            return "pnpm.cmd"
    return str(ROOT / name) if (ROOT / name).exists() else name


def java_executable() -> str:
    configured = os.environ.get("JAVA_HOME")
    suffix = "java.exe" if os.name == "nt" else "java"
    if configured and (Path(configured) / "bin" / suffix).exists():
        return str(Path(configured) / "bin" / suffix)
    result = subprocess.run(["java", "-XshowSettings:properties", "-version"], cwd=ROOT,
                            text=True, encoding="utf-8", errors="replace",
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    match = re.search(r"^\s*java\.home\s*=\s*(.+)$", result.stdout, re.MULTILINE)
    if match:
        resolved = Path(match.group(1).strip()) / "bin" / suffix
        if resolved.exists():
            return str(resolved)
    return "java"


def run(command: list[str], *, env: dict[str, str] | None = None,
        timeout: int = 300, capture: bool = False) -> str:
    result = subprocess.run(
        command,
        cwd=ROOT,
        env=env,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
        timeout=timeout,
        check=False,
    )
    output = result.stdout or ""
    if result.returncode != 0:
        if capture and output:
            print(output, file=sys.stderr)
        raise B02Error(f"command failed ({result.returncode}): {' '.join(command[:4])}")
    return output.strip()


def ensure_runtime() -> dict[str, str]:
    if not re.fullmatch(r"fieldops-b02(?:-[a-z0-9][a-z0-9-]{0,31})?", PROJECT):
        raise B02Error(
            "FIELDOPS_B02_PROJECT must be fieldops-b02 or a fieldops-b02-<lowercase-suffix> name"
        )
    PORTS["keycloak"] = resolve_keycloak_port(os.environ.get("B02_KEYCLOAK_PORT"))
    extra_profiles = os.environ.get("FIELDOPS_B02_EXTRA_PROFILES", "").strip()
    if extra_profiles and not re.fullmatch(r"[a-z0-9-]+(?:,[a-z0-9-]+)*", extra_profiles):
        raise B02Error("FIELDOPS_B02_EXTRA_PROFILES must be comma-separated lowercase profile names")
    RUNTIME.mkdir(exist_ok=True)
    LOGS.mkdir(exist_ok=True)

    def load_or_create(filename: str) -> str:
        path = RUNTIME / filename
        if not path.exists():
            path.write_text(secrets.token_urlsafe(32), encoding="utf-8")
        return path.read_text(encoding="utf-8").strip()

    values = {
        "postgres": load_or_create("postgres-password"),
        "redis": load_or_create("redis-password"),
        "keycloakAdmin": load_or_create("keycloak-admin-password"),
        "keycloakClient": load_or_create("keycloak-client-secret"),
        "keycloakUser": load_or_create("keycloak-user-password"),
        "mqttGateway": load_or_create("mqtt-gateway-password"),
        "mqttTenantA": load_or_create("mqtt-tenant-a-password"),
        "mqttTenantB": load_or_create("mqtt-tenant-b-password"),
    }
    template = (ROOT / "infra/b02/fieldops-b02-realm.template.json").read_text(encoding="utf-8")
    realm = template.replace("__B02_CLIENT_SECRET__", values["keycloakClient"])
    realm = realm.replace("__B02_USER_PASSWORD__", values["keycloakUser"])
    (RUNTIME / "fieldops-b02-realm.json").write_text(realm, encoding="utf-8")
    credentials = {
        "users": ["b02-admin-a", "b02-multi"],
        "password": values["keycloakUser"],
        "note": "Synthetic localhost-only credentials generated for this checkout.",
    }
    (RUNTIME / "demo-credentials.json").write_text(
        json.dumps(credentials, indent=2) + "\n", encoding="utf-8"
    )

    env_values = {
        "COMPOSE_PROJECT_NAME": PROJECT,
        "B02_RUNTIME_DIR": RUNTIME.as_posix(),
        "POSTGRES_DB": "fieldops_b02",
        "POSTGRES_USER": "fieldops_b02",
        "POSTGRES_PASSWORD": values["postgres"],
        "POSTGRES_PORT": str(PORTS["postgres"]),
        "REDIS_PASSWORD": values["redis"],
        "REDIS_PORT": str(PORTS["redis"]),
        "KAFKA_BROKER_PORT": str(PORTS["kafka"]),
        "KAFKA_CONTROLLER_PORT": str(PORTS["kafkaController"]),
        "MQTT_PORT": str(PORTS["mqtt"]),
        "KEYCLOAK_HTTP_PORT": str(PORTS["keycloak"]),
        "KEYCLOAK_ADMIN": "b02-admin",
        "KEYCLOAK_ADMIN_PASSWORD": values["keycloakAdmin"],
        "B02_POSTGRES_DB": "fieldops_b02",
        "B02_POSTGRES_USER": "fieldops_b02",
        "B02_POSTGRES_PASSWORD": values["postgres"],
        "B02_POSTGRES_PORT": str(PORTS["postgres"]),
        "B02_REDIS_PASSWORD": values["redis"],
        "B02_REDIS_PORT": str(PORTS["redis"]),
        "B02_KAFKA_PORT": str(PORTS["kafka"]),
        "B02_MQTT_PORT": str(PORTS["mqtt"]),
        "B02_MQTT_GATEWAY_USER": "b02-gateway",
        "B02_MQTT_GATEWAY_PASSWORD": values["mqttGateway"],
        "B02_MQTT_TENANT_A_USER": "b02-tenant-a",
        "B02_MQTT_TENANT_A_PASSWORD": values["mqttTenantA"],
        "B02_MQTT_TENANT_B_USER": "b02-tenant-b",
        "B02_MQTT_TENANT_B_PASSWORD": values["mqttTenantB"],
        "B02_KEYCLOAK_PORT": str(PORTS["keycloak"]),
        "B02_KEYCLOAK_CLIENT_SECRET": values["keycloakClient"],
        "B02_SERVER_PORT": str(PORTS["server"]),
        "B02_GATEWAY_PORT": str(PORTS["gateway"]),
        "SPRING_PROFILES_ACTIVE": "local-observe" + (f",{extra_profiles}" if extra_profiles else ""),
        "NEXT_PUBLIC_FIELDOPS_DATA_MODE": "remote",
        "FIELDOPS_API_ORIGIN": f"http://127.0.0.1:{PORTS['server']}",
        "NODE_ENV": "production",
    }
    (RUNTIME / "runtime.env").write_text(
        "".join(f"{key}={value}\n" for key, value in env_values.items()), encoding="utf-8"
    )
    merged = os.environ.copy()
    merged.update(env_values)
    return merged


def compose(env: dict[str, str]) -> list[str]:
    command = ["docker", "compose", "-p", PROJECT, "--env-file", str(RUNTIME / "runtime.env")]
    for path in COMPOSE_FILES:
        command.extend(["-f", str(path)])
    return command


def validate_compose(env: dict[str, str]) -> None:
    config = json.loads(run(compose(env) + ["config", "--format", "json"], env=env, capture=True))
    services = config.get("services", {})
    expected = {"postgres", "redis", "kafka", "mosquitto", "keycloak"}
    if set(services) != expected:
        raise B02Error(f"B02 must contain exactly the five existing services; got {sorted(services)}")
    for service, definition in services.items():
        for port in definition.get("ports", []):
            if port.get("host_ip") != "127.0.0.1":
                raise B02Error(f"{service} has a non-loopback publish: {port}")


def source_head() -> str:
    return run(["git", "rev-parse", "HEAD"], capture=True)


def build_artifacts(env: dict[str, str]) -> None:
    run([
        executable("gradlew"),
        ":apps:fieldops-server:bootJar",
        ":apps:device-gateway:bootJar",
        ":apps:fieldops-worker:bootJar",
        ":apps:simulator:bootJar",
        "--no-daemon",
    ], env=env, timeout=600)
    if not (ROOT / "node_modules").exists():
        run([executable("pnpm"), "install", "--frozen-lockfile"], env=env, timeout=600)
    run([executable("pnpm"), "--filter", "@fieldops/web-console", "build"], env=env, timeout=600)


def jar_for(app: str) -> Path:
    candidates = sorted((ROOT / f"apps/{app}/build/libs").glob("*.jar"))
    candidates = [path for path in candidates if not path.name.endswith("-plain.jar")]
    if len(candidates) != 1:
        raise B02Error(f"expected one executable jar for {app}, got {[p.name for p in candidates]}")
    return candidates[0]


def wait_http(url: str, process: subprocess.Popen[Any] | None = None, timeout: int = 90) -> None:
    deadline = time.monotonic() + timeout
    last = "no response"
    while time.monotonic() < deadline:
        if process is not None and process.poll() is not None:
            raise B02Error(f"process exited with {process.returncode} while waiting for {url}")
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if 200 <= response.status < 400:
                    return
                last = f"HTTP {response.status}"
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            last = str(error)
        time.sleep(0.5)
    raise B02Error(f"timed out waiting for {url}: {last}")


def start_process(name: str, command: list[str], token: str,
                  env: dict[str, str], cwd: Path = ROOT) -> tuple[subprocess.Popen[Any], dict[str, Any]]:
    log_path = LOGS / f"{name}.log"
    log_handle = log_path.open("wb")
    kwargs: dict[str, Any] = {"cwd": cwd, "env": env, "stdin": subprocess.DEVNULL,
                              "stdout": log_handle, "stderr": subprocess.STDOUT}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    process = subprocess.Popen(command, **kwargs)
    log_handle.close()
    try:
        identity = process_identity(process.pid)
    except Exception:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        raise
    return process, {"pid": process.pid, "identity": identity, "token": token,
                     "log": str(log_path.relative_to(ROOT)), "startedAt": now()}


def process_command(pid: int) -> str:
    if os.name == "nt":
        script = f"(Get-CimInstance Win32_Process -Filter \"ProcessId={pid}\").CommandLine"
        return run(["powershell", "-NoProfile", "-Command", script], capture=True, timeout=15)
    path = Path(f"/proc/{pid}/cmdline")
    return path.read_bytes().replace(b"\0", b" ").decode("utf-8", "replace") if path.exists() else ""


def parse_linux_start_ticks(stat: str) -> str:
    closing_parenthesis = stat.rfind(")")
    if closing_parenthesis < 0:
        raise B02Error("invalid /proc process stat: missing command terminator")
    fields = stat[closing_parenthesis + 1:].strip().split()
    if len(fields) <= 19 or not fields[19].isdigit():
        raise B02Error("invalid /proc process stat: missing start-time ticks")
    return fields[19]


def process_identity(pid: int) -> str:
    if os.name == "nt":
        script = (
            f'$process = Get-CimInstance Win32_Process -Filter "ProcessId={pid}"; '
            "if ($null -ne $process) { "
            "$process.CreationDate.ToUniversalTime().ToString('o') }"
        )
        created_at = run(
            ["powershell", "-NoProfile", "-Command", script], capture=True, timeout=15
        )
        if not created_at:
            raise B02Error(f"process {pid} does not exist or has no CreationDate")
        return f"windows-created:{created_at}"
    stat_path = Path(f"/proc/{pid}/stat")
    start_ticks = parse_linux_start_ticks(stat_path.read_text(encoding="utf-8"))
    return f"linux-startticks:{start_ticks}"


def process_alive(record: dict[str, Any]) -> bool:
    try:
        recorded_identity = record.get("identity")
        if not isinstance(recorded_identity, str) or not recorded_identity:
            return False
        return process_identity(int(record["pid"])) == recorded_identity
    except (B02Error, OSError, ValueError, KeyError):
        return False


def terminate_process(record: dict[str, Any]) -> None:
    if not process_alive(record):
        return
    pid = int(record["pid"])
    if os.name == "nt":
        run(["taskkill", "/PID", str(pid), "/T", "/F"], timeout=30, capture=True)
    else:
        os.killpg(pid, 15)


def write_manifest(data: dict[str, Any]) -> None:
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def parse_json_items(output: str) -> list[dict[str, Any]]:
    if not output.strip():
        return []
    try:
        parsed = json.loads(output)
        return parsed if isinstance(parsed, list) else [parsed]
    except json.JSONDecodeError:
        return [json.loads(line) for line in output.splitlines() if line.strip()]


def load_manifest() -> dict[str, Any]:
    if not MANIFEST.exists():
        return {}
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def create_topics(env: dict[str, str]) -> None:
    base = compose(env)
    for topic in TOPICS:
        run(base + ["exec", "-T", "kafka", "/opt/kafka/bin/kafka-topics.sh",
                    "--bootstrap-server", "localhost:19092", "--create", "--if-not-exists",
                    "--topic", topic, "--partitions", "3", "--replication-factor", "1"], env=env)


def action_up(_: argparse.Namespace) -> None:
    env = ensure_runtime()
    existing = load_manifest()
    if existing.get("status") == "running" and existing.get("schemaVersion") != 2:
        raise B02Error(
            "legacy running manifest cannot prove process ownership; stop its processes manually "
            "before starting a fresh B02 run"
        )
    if existing.get("status") == "running" and all(
            process_alive(record) for record in existing.get("processes", {}).values()):
        print("B02 is already running; no duplicate processes were started.")
        action_status(argparse.Namespace())
        return
    validate_compose(env)
    run(compose(env) + ["up", "-d", "--wait", "--wait-timeout", "180"], env=env, timeout=240)
    create_topics(env)
    build_artifacts(env)

    manifest: dict[str, Any] = {
        "schemaVersion": 2,
        "project": PROJECT,
        "sourceHead": source_head(),
        "startedAt": now(),
        "status": "starting",
        "ports": PORTS,
        "processes": {},
        "composeFiles": [str(path.relative_to(ROOT)) for path in COMPOSE_FILES],
    }
    processes: dict[str, subprocess.Popen[Any]] = {}
    try:
        server, manifest["processes"]["server"] = start_process(
            "server", [java_executable(), "-jar", str(jar_for("fieldops-server"))],
            str(jar_for("fieldops-server")), env)
        processes["server"] = server
        write_manifest(manifest)
        wait_http(f"http://127.0.0.1:{PORTS['server']}/actuator/health", server)

        gateway, manifest["processes"]["gateway"] = start_process(
            "gateway", [java_executable(), "-jar", str(jar_for("device-gateway"))],
            str(jar_for("device-gateway")), env)
        processes["gateway"] = gateway
        write_manifest(manifest)
        wait_http(f"http://127.0.0.1:{PORTS['gateway']}/actuator/health", gateway)

        worker, manifest["processes"]["worker"] = start_process(
            "worker", [java_executable(), "-jar", str(jar_for("fieldops-worker"))],
            str(jar_for("fieldops-worker")), env)
        processes["worker"] = worker
        write_manifest(manifest)
        time.sleep(3)
        if worker.poll() is not None:
            raise B02Error(f"worker exited with {worker.returncode}")

        web, manifest["processes"]["web"] = start_process(
            "web", ["node", str(ROOT / "apps/web-console/node_modules/next/dist/bin/next"), "start",
                    "--hostname", "127.0.0.1", "--port", str(PORTS["web"])], "next/dist/bin/next",
            env | {"PORT": str(PORTS["web"])}, ROOT / "apps/web-console")
        processes["web"] = web
        write_manifest(manifest)
        wait_http(f"http://127.0.0.1:{PORTS['web']}/login", web)
        manifest["status"] = "running"
        manifest["readyAt"] = now()
        manifest["containers"] = parse_json_items(
            run(compose(env) + ["ps", "--format", "json"], env=env, capture=True)
        )
        write_manifest(manifest)
    except Exception:
        manifest["status"] = "failed"
        manifest["failedAt"] = now()
        write_manifest(manifest)
        for name in reversed(list(manifest["processes"])):
            terminate_process(manifest["processes"][name])
        raise
    print(f"B02 ready at http://localhost:{PORTS['web']} (credentials: {RUNTIME / 'demo-credentials.json'})")


def simulator(env: dict[str, str], extra: list[str]) -> str:
    command = [java_executable(), "-jar", str(jar_for("simulator")), *extra]
    # The one-shot telemetry producer must stay on its own non-web profile even
    # when a vertical slice adds profiles to the long-running B02 services.
    return run(command, env=env | {"SPRING_PROFILES_ACTIVE": "local-observe"},
               timeout=180, capture=True)


def action_demo(args: argparse.Namespace) -> None:
    env = ensure_runtime()
    manifest = load_manifest()
    if manifest.get("status") != "running":
        raise B02Error("B02 is not marked running; run `python scripts/b02_observe.py up` first")
    extra = [f"--device={args.device}", f"--count={args.count}", f"--seed={args.seed}",
             f"--interval-ms={args.interval_ms}", f"--scenario={args.scenario}"]
    if args.duplicate:
        extra.append("--duplicate=true")
    if args.reorder:
        extra.append("--reorder=true")
    output = simulator(env, extra)
    print(output)


def poll(check, timeout: int = 30) -> str:
    deadline = time.monotonic() + timeout
    last = ""
    while time.monotonic() < deadline:
        try:
            last = check()
            if last:
                return last
        except B02Error:
            pass
        time.sleep(0.5)
    raise B02Error(f"condition not reached in {timeout}s; last={last!r}")


def action_verify(_: argparse.Namespace) -> None:
    env = ensure_runtime()
    manifest = load_manifest()
    if manifest.get("status") != "running" or not all(
            process_alive(record) for record in manifest.get("processes", {}).values()):
        raise B02Error("all B02 processes must be running before verify")
    output = simulator(env, ["--device=device-a-soil-01", "--count=1", "--seed=20260908", "--interval-ms=0"])
    match = re.search(r"B02_SIMULATOR eventId=([^ ]+)", output)
    if not match:
        raise B02Error("simulator did not report its synthetic eventId")
    event_id = match.group(1)
    if not re.fullmatch(r"[A-Za-z0-9:_-]+", event_id):
        raise B02Error("simulator eventId had an unexpected format")
    base = compose(env)

    def history() -> str:
        sql = f"SELECT event_id FROM b02_telemetry_history WHERE tenant_id='tenant-a' AND event_id='{event_id}'"
        return run(base + ["exec", "-T", "postgres", "psql", "-U", "fieldops_b02", "-d",
                           "fieldops_b02", "-Atc", sql], env=env, capture=True)

    def latest() -> str:
        return run(base + ["exec", "-T", "-e", f"REDISCLI_AUTH={env['B02_REDIS_PASSWORD']}",
                           "redis", "redis-cli", "--raw", "HGET",
                           "b02:state:tenant-a:device-a-soil-01", "stateJson"], env=env, capture=True)

    history_value = poll(history)
    latest_value = poll(latest)
    if event_id not in history_value or event_id not in latest_value:
        raise B02Error("the same simulator eventId did not reach both History and Latest State")
    result = {"verifiedAt": now(), "eventId": event_id, "history": "PASS", "redisLatest": "PASS"}
    (RUNTIME / "last-verify.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


def action_status(_: argparse.Namespace) -> None:
    env = ensure_runtime()
    manifest = load_manifest()
    processes = {name: process_alive(record) for name, record in manifest.get("processes", {}).items()}
    try:
        containers = parse_json_items(
            run(compose(env) + ["ps", "--format", "json"], env=env, capture=True)
        )
    except (B02Error, json.JSONDecodeError):
        containers = []
    print(json.dumps({
        "project": PROJECT,
        "manifestStatus": manifest.get("status", "not-started"),
        "sourceHead": manifest.get("sourceHead"),
        "processes": processes,
        "containers": [{"service": item.get("Service"), "state": item.get("State"),
                        "health": item.get("Health")} for item in containers],
        "ports": PORTS,
    }, indent=2))


def action_down(_: argparse.Namespace) -> None:
    env = ensure_runtime()
    manifest = load_manifest()
    for name in reversed(list(manifest.get("processes", {}))):
        terminate_process(manifest["processes"][name])
    run(compose(env) + ["down", "--timeout", "10"], env=env, timeout=90)
    if manifest:
        manifest["status"] = "stopped"
        manifest["stoppedAt"] = now()
        manifest["volumesPreserved"] = True
        write_manifest(manifest)
    print("Owned B02 processes and project containers stopped; named volumes were preserved.")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    sub = result.add_subparsers(dest="action", required=True)
    sub.add_parser("up").set_defaults(handler=action_up)
    sub.add_parser("status").set_defaults(handler=action_status)
    demo = sub.add_parser("demo")
    demo.add_argument("--device", default="all")
    demo.add_argument("--count", type=int, default=1)
    demo.add_argument("--seed", type=int, default=42)
    demo.add_argument("--interval-ms", type=int, default=0)
    demo.add_argument("--scenario", choices=("random", "portfolio"), default="random",
                      help="Synthetic demo mode; portfolio emits deterministic screenshot history")
    demo.add_argument("--duplicate", action="store_true")
    demo.add_argument("--reorder", action="store_true")
    demo.set_defaults(handler=action_demo)
    sub.add_parser("verify").set_defaults(handler=action_verify)
    sub.add_parser("down").set_defaults(handler=action_down)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        args.handler(args)
        return 0
    except (B02Error, subprocess.TimeoutExpired, OSError, json.JSONDecodeError) as error:
        print(f"B02 ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
