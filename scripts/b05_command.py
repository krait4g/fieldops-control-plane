#!/usr/bin/env python3
"""Task-owned B05 durable command/approval orchestrator with checkout isolation."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".fieldops-b05"
LOGS = RUNTIME / "logs"
MANIFEST = RUNTIME / "run-manifest.json"


def checkout_fingerprint(root: Path) -> str:
    normalized = str(root.resolve()).replace("\\", "/").casefold()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:10]


CHECKOUT_ID = checkout_fingerprint(ROOT)
B02_PROJECT = os.environ.setdefault("FIELDOPS_B02_PROJECT", f"fieldops-b02-b05-{CHECKOUT_ID}")
os.environ.setdefault("FIELDOPS_B02_RUNTIME_DIR", str(RUNTIME / "b02"))
os.environ.setdefault("FIELDOPS_B02_EXTRA_PROFILES", "b05-command")
os.environ.setdefault("B05_VALVE_PORT", "28085")

import b02_observe as b02  # noqa: E402


PORTS = {"valve": 28085}


class B05Error(RuntimeError):
    pass


def ensure_runtime() -> dict[str, str]:
    RUNTIME.mkdir(exist_ok=True)
    LOGS.mkdir(exist_ok=True)
    env = b02.ensure_runtime()
    env.update({
        "FIELDOPS_B02_PROJECT": B02_PROJECT,
        "FIELDOPS_B02_RUNTIME_DIR": str(RUNTIME / "b02"),
        "FIELDOPS_B02_EXTRA_PROFILES": "b05-command",
        "SPRING_PROFILES_ACTIVE": "local-observe,b05-command",
        "B05_VALVE_PORT": str(PORTS["valve"]),
        "GIT_CONFIG_COUNT": "1",
        "GIT_CONFIG_KEY_0": "safe.directory",
        "GIT_CONFIG_VALUE_0": ROOT.as_posix(),
    })
    os.environ.update(env)
    return env


def load_manifest() -> dict[str, Any]:
    return json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}


def write_manifest(value: dict[str, Any]) -> None:
    MANIFEST.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def run(command: list[str], *, env: dict[str, str], capture: bool = False,
        timeout: int = 300) -> str:
    result = subprocess.run(command, cwd=ROOT, env=env, text=True, encoding="utf-8",
                            errors="replace", stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.STDOUT if capture else None, timeout=timeout, check=False)
    output = result.stdout or ""
    if result.returncode != 0:
        if output:
            print(output, file=sys.stderr)
        raise B05Error(f"command failed ({result.returncode}): {' '.join(command[:5])}")
    return output.strip()


def start_process(name: str, command: list[str], env: dict[str, str]) -> tuple[subprocess.Popen[Any], dict[str, Any]]:
    path = LOGS / f"{name}.log"
    handle = path.open("wb")
    kwargs: dict[str, Any] = {"cwd": ROOT, "env": env, "stdin": subprocess.DEVNULL,
                              "stdout": handle, "stderr": subprocess.STDOUT}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    process = subprocess.Popen(command, **kwargs)
    handle.close()
    return process, {"pid": process.pid, "identity": b02.process_identity(process.pid),
                     "log": str(path.relative_to(ROOT)), "startedAt": b02.now()}


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def action_up(_: argparse.Namespace) -> None:
    env = ensure_runtime()
    existing = load_manifest()
    if existing.get("status") == "running" and all(
            b02.process_alive(item) for item in existing.get("processes", {}).values()):
        print("B05 is already running; no duplicate processes were started.")
        action_status(argparse.Namespace())
        return
    requested = {**b02.PORTS, **PORTS}
    occupied = [f"{name}:{port}" for name, port in requested.items() if not port_free(port)]
    if occupied:
        raise B05Error("required ports are occupied; no process was killed: " + ", ".join(occupied))
    manifest: dict[str, Any] = {"schemaVersion": 1, "status": "starting",
        "sourceHead": b02.source_head(), "startedAt": b02.now(), "ports": PORTS, "processes": {}}
    write_manifest(manifest)
    try:
        b02.action_up(argparse.Namespace())
        simulator, manifest["processes"]["valve"] = start_process("valve", [b02.java_executable(),
            "-jar", str(b02.jar_for("simulator")), "--spring.profiles.active=b05-command"],
            env | {"SPRING_PROFILES_ACTIVE": "b05-command"})
        write_manifest(manifest)
        b02.wait_http(f"http://127.0.0.1:{PORTS['valve']}/actuator/health", simulator)
        worker2, manifest["processes"]["worker2"] = start_process("worker2", [b02.java_executable(),
            "-jar", str(b02.jar_for("fieldops-worker"))],
            env | {"SPRING_PROFILES_ACTIVE": "local-observe,b05-command",
                   "FIELDOPS_B05_WORKER_ID": "b05-worker-2",
                   "SPRING_KAFKA_LISTENER_AUTO_STARTUP": "false"})
        write_manifest(manifest)
        time.sleep(2)
        if worker2.poll() is not None:
            raise B05Error(f"second dispatcher exited with {worker2.returncode}")
        manifest["status"] = "running"
        manifest["readyAt"] = b02.now()
        write_manifest(manifest)
    except Exception:
        manifest["status"] = "failed"
        manifest["failedAt"] = b02.now()
        write_manifest(manifest)
        for record in reversed(list(manifest.get("processes", {}).values())):
            b02.terminate_process(record)
        try:
            b02.action_down(argparse.Namespace())
        except Exception:
            pass
        raise
    print(f"B05 ready at http://localhost:{b02.PORTS['web']}/commands?tenant=tenant-a&site=site-a")


def action_status(_: argparse.Namespace) -> None:
    manifest = load_manifest()
    base = b02.load_manifest()
    print(json.dumps({"status": manifest.get("status", "not-started"),
        "sourceHead": manifest.get("sourceHead"),
        "processes": {name: b02.process_alive(record)
                      for name, record in manifest.get("processes", {}).items()},
        "b02Status": base.get("status", "not-started"),
        "b02Processes": {name: b02.process_alive(record)
                         for name, record in base.get("processes", {}).items()}}, indent=2))


def psql(env: dict[str, str], statement: str) -> str:
    command = b02.compose(env) + ["exec", "-T", "postgres", "psql", "--tuples-only", "--no-align",
        "-U", env["B02_POSTGRES_USER"], "-d", env["B02_POSTGRES_DB"], "-c", statement]
    return run(command, env=env, capture=True).strip()


def insert_approved(env: dict[str, str], command_id: uuid.UUID, scenario: str,
                    command_type: str = "OPEN") -> None:
    payload = f"tenant-a\nvalve-a-01\n{command_type}\n{scenario}"
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    now = b02.now()
    statement = f"""
        INSERT INTO b05_command(command_id,tenant_id,site_id,device_id,command_type,scenario,status,
          requested_by_subject,decided_by_subject,idempotency_key,payload_hash,deadline_at,created_at,
          updated_at,version) VALUES ('{command_id}','tenant-a','site-a','valve-a-01','{command_type}',
          '{scenario}','APPROVED','verify-operator','verify-approver','verify-{command_id}','{digest}',
          CURRENT_TIMESTAMP + INTERVAL '4 seconds','{now}','{now}',2);
        INSERT INTO b05_command_transition(command_id,sequence_no,from_status,to_status,actor_subject,
          reason_code,occurred_at) VALUES ('{command_id}',1,NULL,'PENDING_APPROVAL','verify-operator',
          'REQUESTED','{now}'),('{command_id}',2,'PENDING_APPROVAL','APPROVED','verify-approver',
          'APPROVED','{now}');
    """
    psql(env, statement)


def wait_status(env: dict[str, str], command_id: uuid.UUID, expected: str, timeout: int = 12) -> None:
    deadline = time.monotonic() + timeout
    last = ""
    while time.monotonic() < deadline:
        last = psql(env, f"SELECT status FROM b05_command WHERE command_id='{command_id}'")
        if last == expected:
            return
        time.sleep(0.2)
    raise B05Error(f"command {command_id} did not reach {expected}; last={last}")


def request_json(url: str, token: str, body: dict[str, Any] | None = None) -> tuple[int, dict[str, Any]]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, method="POST" if data else "GET", headers={
        "Accept": "application/json", "Content-Type": "application/json",
        "X-FieldOps-Internal-Token": token})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def run_browser(env: dict[str, str]) -> None:
    credentials = json.loads((RUNTIME / "b02/demo-credentials.json").read_text(encoding="utf-8"))
    browser_env = env | {"B05_BROWSER_OPERATOR": "b05-operator-a",
        "B05_BROWSER_APPROVER": "b05-approver-a", "B02_BROWSER_PASSWORD": credentials["password"]}
    run([b02.executable("pnpm"), "--filter", "@fieldops/web-console", "exec", "playwright",
         "test", "--config", "playwright.b05.config.ts"], env=browser_env, timeout=300)


def action_demo(_: argparse.Namespace) -> None:
    env = ensure_runtime()
    require_running()
    run_browser(env)
    print("B05 operator → approver → ACKNOWLEDGED → SUCCEEDED browser demo PASS")


def require_running() -> None:
    manifest = load_manifest()
    base = b02.load_manifest()
    if (manifest.get("status") != "running"
            or not all(b02.process_alive(record) for record in manifest.get("processes", {}).values())
            or base.get("status") != "running"
            or not all(b02.process_alive(record) for record in base.get("processes", {}).values())):
        raise B05Error("run scripts/b05_command.py up before this action")


def action_verify(_: argparse.Namespace) -> None:
    env = ensure_runtime()
    require_running()
    results: dict[str, str] = {}
    run_browser(env)
    if psql(env, """
            SELECT COUNT(*) FROM b05_command c JOIN b05_gateway_delivery d USING(command_id)
            WHERE c.status='REJECTED'
            """) != "0":
        raise B05Error("approver-rejected command reached the Gateway")
    results.update({f"G{number}": "PASS" for number in range(1, 5)})

    # G5: two live workers contend for six independently approved rows.
    concurrent = [uuid.uuid4() for _ in range(6)]
    for command_id in concurrent:
        insert_approved(env, command_id, "SUCCESS")
    for command_id in concurrent:
        wait_status(env, command_id, "SUCCEEDED")
    duplicate_claims = psql(env, """
        SELECT COUNT(*) FROM (SELECT command_id FROM b05_command_transition
        WHERE to_status='DISPATCHING' GROUP BY command_id HAVING COUNT(*) <> 1) unsafe
    """)
    if duplicate_claims != "0":
        raise B05Error("concurrent dispatcher created duplicate/missing claim transitions")
    results["G5"] = "PASS"

    # G6: a repeated Gateway delivery returns one persisted receipt and one actuation.
    duplicate_id = uuid.uuid4()
    digest = hashlib.sha256(b"tenant-a\nvalve-a-01\nOPEN\nSUCCESS").hexdigest()
    body = {"tenantId": "tenant-a", "deviceId": "valve-a-01", "type": "OPEN",
            "scenario": "SUCCESS", "payloadHash": digest}
    url = f"http://127.0.0.1:{b02.PORTS['gateway']}/internal/v1/commands/{duplicate_id}"
    first_code, first = request_json(url, env["B05_INTERNAL_TOKEN"], body)
    second_code, second = request_json(url, env["B05_INTERNAL_TOKEN"], body)
    receipt_count = psql(env, f"SELECT COUNT(*) FROM b05_gateway_delivery WHERE command_id='{duplicate_id}'")
    if first_code != 200 or second_code != 200 or receipt_count != "1" \
            or first.get("actuationCount") != second.get("actuationCount"):
        raise B05Error("Gateway commandId deduplication failed")
    results["G6"] = "PASS"

    # G7 is proven by the browser's observed ACKNOWLEDGED then later SUCCEEDED timeline.
    results["G7"] = "PASS"

    rejected_id = uuid.uuid4()
    insert_approved(env, rejected_id, "REJECT")
    wait_status(env, rejected_id, "FAILED")
    results["G8"] = "PASS"

    hanging_id = uuid.uuid4()
    insert_approved(env, hanging_id, "HANG")
    wait_status(env, hanging_id, "UNKNOWN")
    time.sleep(1)
    hang_state = psql(env, f"""
        SELECT status || ':' || (SELECT COUNT(*) FROM b05_command_transition t
        WHERE t.command_id=c.command_id AND t.to_status='DISPATCHING')
        FROM b05_command c WHERE command_id='{hanging_id}'
    """)
    if hang_state != "UNKNOWN:1":
        raise B05Error("UNKNOWN command was redispatched or changed state")
    results["G9"] = "PASS"

    verify_b02_with_startup_retry()
    b04_regression_env = env | {
        "FIELDOPS_B02_PROJECT": f"fieldops-b02-b04-{CHECKOUT_ID}",
        "FIELDOPS_B02_RUNTIME_DIR": str(ROOT / ".fieldops-b04/b02"),
        "FIELDOPS_B02_EXTRA_PROFILES": "b04-camera",
    }
    run([sys.executable, "tests/repository-tests/test_b04_camera.py"],
        env=b04_regression_env, timeout=120)
    results["G10"] = "PASS"

    evidence = {"verifiedAt": b02.now(), "results": results, "count": "10/10",
        "transport": "POSTGRES_FOR_UPDATE_SKIP_LOCKED", "exactlyOnceClaimed": False,
        "computerUse": "NOT_REQUIRED", "publicRelease": "NOT_RELEASED"}
    (RUNTIME / "last-verify.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence, indent=2))


def verify_b02_with_startup_retry() -> None:
    for attempt in range(2):
        try:
            b02.action_verify(argparse.Namespace())
            return
        except b02.B02Error as error:
            if attempt or "condition not reached" not in str(error):
                raise
            time.sleep(2)


def action_down(_: argparse.Namespace) -> None:
    ensure_runtime()
    manifest = load_manifest()
    for record in reversed(list(manifest.get("processes", {}).values())):
        b02.terminate_process(record)
    b02.action_down(argparse.Namespace())
    if manifest:
        manifest["status"] = "stopped"
        manifest["stoppedAt"] = b02.now()
        manifest["b02VolumesPreserved"] = True
        write_manifest(manifest)
    print("Owned B05/B02 processes and containers stopped; named volumes were preserved.")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    actions = result.add_subparsers(dest="action", required=True)
    for name, handler in (("up", action_up), ("status", action_status), ("demo", action_demo),
                          ("verify", action_verify), ("down", action_down)):
        actions.add_parser(name).set_defaults(handler=handler)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        args.handler(args)
        return 0
    except (B05Error, b02.B02Error, subprocess.TimeoutExpired, OSError,
            json.JSONDecodeError) as error:
        print(f"B05 ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
