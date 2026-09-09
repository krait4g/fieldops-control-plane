#!/usr/bin/env python3
"""Task-owned B04 camera preview/PTZ orchestrator with isolated runtime and safe cleanup."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
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
RUNTIME = ROOT / ".fieldops-b04"
LOGS = RUNTIME / "logs"
MANIFEST = RUNTIME / "run-manifest.json"


def checkout_fingerprint(root: Path) -> str:
    normalized = str(root.resolve()).replace("\\", "/").casefold()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:10]


CHECKOUT_ID = checkout_fingerprint(ROOT)
B02_PROJECT = os.environ.setdefault("FIELDOPS_B02_PROJECT", f"fieldops-b02-b04-{CHECKOUT_ID}")
MEDIA_PROJECT = f"fieldops-b04-media-{CHECKOUT_ID}"
MEDIA_COMPOSE = ROOT / "infra/b04/compose.yml"
PORTS = {
    "onvif": 28084,
    "rtsp": 28554,
    "webrtc": 28889,
    "mediamtxApi": 29997,
    "webrtcUdp": 28189,
}

os.environ.setdefault("FIELDOPS_B02_RUNTIME_DIR", str(RUNTIME / "b02"))
os.environ.setdefault("FIELDOPS_B02_EXTRA_PROFILES", "b04-camera")

import b02_observe as b02  # noqa: E402  (environment must be fixed before import)


class B04Error(RuntimeError):
    pass


def ensure_runtime() -> dict[str, str]:
    RUNTIME.mkdir(exist_ok=True)
    LOGS.mkdir(exist_ok=True)
    token_path = RUNTIME / "internal-token"
    if not token_path.exists():
        token_path.write_text(secrets.token_urlsafe(48), encoding="utf-8")
    token = token_path.read_text(encoding="utf-8").strip()
    env = os.environ.copy()
    env.update({
        "FIELDOPS_B02_PROJECT": B02_PROJECT,
        "FIELDOPS_B02_RUNTIME_DIR": str(RUNTIME / "b02"),
        "FIELDOPS_B02_EXTRA_PROFILES": "b04-camera",
        "B04_INTERNAL_TOKEN": token,
        "B04_ONVIF_PORT": str(PORTS["onvif"]),
        "B04_RTSP_PORT": str(PORTS["rtsp"]),
        "B04_WEBRTC_PORT": str(PORTS["webrtc"]),
        "B04_MEDIAMTX_API_PORT": str(PORTS["mediamtxApi"]),
        "B04_WEBRTC_UDP_PORT": str(PORTS["webrtcUdp"]),
        "GIT_CONFIG_COUNT": "1",
        "GIT_CONFIG_KEY_0": "safe.directory",
        "GIT_CONFIG_VALUE_0": ROOT.as_posix(),
    })
    os.environ.update({key: env[key] for key in (
        "FIELDOPS_B02_PROJECT", "FIELDOPS_B02_RUNTIME_DIR", "FIELDOPS_B02_EXTRA_PROFILES",
        "B04_INTERNAL_TOKEN", "B04_ONVIF_PORT", "B04_RTSP_PORT", "B04_WEBRTC_PORT",
        "B04_MEDIAMTX_API_PORT", "B04_WEBRTC_UDP_PORT", "GIT_CONFIG_COUNT",
        "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0",
    )})
    return env


def media_env(env: dict[str, str]) -> dict[str, str]:
    return env | {"COMPOSE_PROJECT_NAME": MEDIA_PROJECT}


def media_command() -> list[str]:
    return ["docker", "compose", "-p", MEDIA_PROJECT, "-f", str(MEDIA_COMPOSE)]


def run(command: list[str], *, env: dict[str, str], capture: bool = False,
        timeout: int = 300) -> str:
    result = subprocess.run(command, cwd=ROOT, env=env, text=True, encoding="utf-8",
                            errors="replace", stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.STDOUT if capture else None, check=False,
                            timeout=timeout)
    output = result.stdout or ""
    if result.returncode != 0:
        if output: print(output, file=sys.stderr)
        raise B04Error(f"command failed ({result.returncode}): {' '.join(command[:5])}")
    return output.strip()


def load_manifest() -> dict[str, Any]:
    if not MANIFEST.exists(): return {}
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def write_manifest(manifest: dict[str, Any]) -> None:
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def start_process(name: str, command: list[str], env: dict[str, str]) -> tuple[subprocess.Popen[Any], dict[str, Any]]:
    log_path = LOGS / f"{name}.log"
    handle = log_path.open("wb")
    kwargs: dict[str, Any] = {"cwd": ROOT, "env": env, "stdin": subprocess.DEVNULL,
                              "stdout": handle, "stderr": subprocess.STDOUT}
    if os.name == "nt": kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else: kwargs["start_new_session"] = True
    process = subprocess.Popen(command, **kwargs)
    handle.close()
    try:
        identity = b02.process_identity(process.pid)
    except Exception:
        process.terminate()
        raise
    return process, {"pid": process.pid, "identity": identity,
                     "log": str(log_path.relative_to(ROOT)), "startedAt": b02.now()}


def validate_media_compose(env: dict[str, str]) -> None:
    config = json.loads(run(media_command() + ["config", "--format", "json"],
                            env=media_env(env), capture=True))
    if set(config.get("services", {})) != {"mediamtx"}:
        raise B04Error("B04 media compose must contain exactly mediamtx")
    service = config["services"]["mediamtx"]
    expected = "bluenviron/mediamtx:1.21.0@sha256:19fddade8d6110a3d718ac0045681fbeba344ae563a066205fe5929a87f7582f"
    if service.get("image") != expected:
        raise B04Error("MediaMTX image is not the approved exact digest")
    for port in service.get("ports", []):
        if port.get("host_ip") != "127.0.0.1":
            raise B04Error(f"MediaMTX has a non-loopback publish: {port}")


def port_free(port: int, socket_type: int = socket.SOCK_STREAM) -> bool:
    family = socket.AF_INET
    with socket.socket(family, socket_type) as probe:
        try:
            probe.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def preflight_ports() -> None:
    b02.PORTS["keycloak"] = b02.resolve_keycloak_port(os.environ.get("B02_KEYCLOAK_PORT"))
    requested = {**b02.PORTS, **PORTS}
    occupied = [f"{name}:{port}" for name, port in requested.items()
                if name not in {"webrtcUdp"} and not port_free(port)]
    if not port_free(PORTS["webrtcUdp"], socket.SOCK_DGRAM):
        occupied.append(f"webrtcUdp:{PORTS['webrtcUdp']}")
    if occupied:
        raise B04Error("required ports are already occupied; no process was killed: " + ", ".join(occupied))


def wait_json(url: str, predicate, timeout: int = 90) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    last = "no response"
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                value = json.load(response)
            if predicate(value): return value
            last = json.dumps(value)[:300]
        except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as error:
            last = str(error)
        time.sleep(0.4)
    raise B04Error(f"timed out waiting for {url}: {last}")


def start_onvif(manifest: dict[str, Any], env: dict[str, str]) -> None:
    current = manifest.setdefault("processes", {}).get("onvif")
    if current and b02.process_alive(current): return
    process, record = start_process("onvif", [b02.java_executable(), "-jar",
        str(b02.jar_for("simulator")), "--spring.profiles.active=b04-camera"],
        env | {"SPRING_PROFILES_ACTIVE": "b04-camera"})
    manifest["processes"]["onvif"] = record
    write_manifest(manifest)
    b02.wait_http(f"http://127.0.0.1:{PORTS['onvif']}/actuator/health", process)


def start_ffmpeg(manifest: dict[str, Any], env: dict[str, str]) -> None:
    current = manifest.setdefault("processes", {}).get("ffmpeg")
    if current and b02.process_alive(current): return
    command = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-re", "-f", "lavfi",
        "-i", "testsrc2=size=1280x720:rate=15", "-c:v", "libx264", "-preset", "ultrafast",
        "-tune", "zerolatency", "-profile:v", "baseline", "-pix_fmt", "yuv420p", "-g", "30",
        "-f", "rtsp", "-rtsp_transport", "tcp",
        f"rtsp://127.0.0.1:{PORTS['rtsp']}/camera-a-01"]
    process, record = start_process("ffmpeg", command, env)
    manifest["processes"]["ffmpeg"] = record
    write_manifest(manifest)
    wait_json(f"http://127.0.0.1:{PORTS['mediamtxApi']}/v3/paths/get/camera-a-01",
              lambda value: value.get("ready") is True, timeout=30)
    if process.poll() is not None: raise B04Error("FFmpeg exited before MediaMTX became ready")


def media_running(env: dict[str, str]) -> bool:
    try:
        output = run(media_command() + ["ps", "--status", "running", "--format", "json"],
                     env=media_env(env), capture=True)
        return bool(output.strip())
    except B04Error:
        return False


def action_up(_: argparse.Namespace) -> None:
    env = ensure_runtime()
    existing = load_manifest()
    owned = existing.get("processes", {})
    if (existing.get("status") == "running" and media_running(env)
            and set(owned) == {"onvif", "ffmpeg"}
            and all(b02.process_alive(record) for record in owned.values())):
        print("B04 is already running; no duplicate processes were started.")
        action_status(argparse.Namespace())
        return
    preflight_ports()
    validate_media_compose(env)
    manifest: dict[str, Any] = {"schemaVersion": 1, "status": "starting",
        "sourceHead": b02.source_head(), "startedAt": b02.now(), "ports": PORTS,
        "mediaProject": MEDIA_PROJECT, "processes": {}}
    write_manifest(manifest)
    try:
        b02.action_up(argparse.Namespace())
        run(media_command() + ["up", "-d"], env=media_env(env), timeout=180)
        wait_json(f"http://127.0.0.1:{PORTS['mediamtxApi']}/v3/config/global/get",
                  lambda value: value.get("hls") is False and value.get("webrtc") is True)
        start_onvif(manifest, env)
        start_ffmpeg(manifest, env)
        manifest["status"] = "running"
        manifest["readyAt"] = b02.now()
        write_manifest(manifest)
    except Exception:
        manifest["status"] = "failed"
        manifest["failedAt"] = b02.now()
        write_manifest(manifest)
        for record in reversed(list(manifest.get("processes", {}).values())):
            b02.terminate_process(record)
        try: run(media_command() + ["down", "--timeout", "10"], env=media_env(env), timeout=90)
        except Exception: pass
        try: b02.action_down(argparse.Namespace())
        except Exception: pass
        raise
    print(f"B04 ready at http://localhost:{b02.PORTS['web']}/cameras?tenant=tenant-a&site=site-a")


def action_status(_: argparse.Namespace) -> None:
    env = ensure_runtime()
    manifest = load_manifest()
    b02_manifest = b02.load_manifest()
    print(json.dumps({"status": manifest.get("status", "not-started"),
        "sourceHead": manifest.get("sourceHead"), "ports": PORTS,
        "processes": {name: b02.process_alive(record)
                      for name, record in manifest.get("processes", {}).items()},
        "mediaRunning": media_running(env),
        "b02Status": b02_manifest.get("status", "not-started"),
        "b02Processes": {name: b02.process_alive(record)
                         for name, record in b02_manifest.get("processes", {}).items()}}, indent=2))


def action_fault(args: argparse.Namespace) -> None:
    env = ensure_runtime()
    manifest = load_manifest()
    if manifest.get("status") != "running": raise B04Error("B04 must be running")
    record = manifest.get("processes", {}).get(args.component)
    if args.state == "down":
        if record: b02.terminate_process(record)
        manifest["processes"].pop(args.component, None)
        write_manifest(manifest)
    elif args.component == "ffmpeg": start_ffmpeg(manifest, env)
    else: start_onvif(manifest, env)
    print(f"{args.component} {args.state}")


def request_json(url: str, *, token: str | None = None,
                 body: dict[str, Any] | None = None) -> tuple[int, dict[str, Any]]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, method="POST" if data else "GET",
        headers={"Accept": "application/json", "Content-Type": "application/json",
                 **({"X-FieldOps-Internal-Token": token} if token else {})})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        try: payload = json.load(error)
        except Exception: payload = {}
        return error.code, payload


def redis(env: dict[str, str], *arguments: str) -> str:
    b02_env = b02.ensure_runtime()
    return run(b02.compose(b02_env) + ["exec", "-T", "-e",
               f"REDISCLI_AUTH={b02_env['B02_REDIS_PASSWORD']}",
               "redis", "redis-cli", "--raw", *arguments],
               env=b02_env | env, capture=True)


def action_verify(_: argparse.Namespace) -> None:
    env = ensure_runtime()
    manifest = load_manifest()
    owned = manifest.get("processes", {})
    b02_owned = b02.load_manifest().get("processes", {})
    if (manifest.get("status") != "running" or not media_running(env)
            or set(owned) != {"onvif", "ffmpeg"}
            or not all(b02.process_alive(record) for record in owned.values())
            or set(b02_owned) != {"server", "gateway", "worker", "web"}
            or not all(b02.process_alive(record) for record in b02_owned.values())):
        command = "py -3" if os.name == "nt" else "python3"
        raise B04Error(f"run `{command} scripts/b04_camera.py up` before verify")
    results: dict[str, str] = {}
    credentials = json.loads((RUNTIME / "b02/demo-credentials.json").read_text(encoding="utf-8"))
    browser_env = env | {"B02_BROWSER_USERNAME": "b02-admin-a",
        "B02_BROWSER_PASSWORD": credentials["password"], "B04_BROWSER_VIEWER": "b02-multi"}
    run([b02.executable("pnpm"), "--filter", "@fieldops/web-console", "exec", "playwright",
         "test", "--config", "playwright.b04.config.ts"], env=browser_env, timeout=240)
    results.update({f"G{index}": "PASS" for index in range(1, 8)})

    token = env["B04_INTERNAL_TOKEN"]
    lease_key = "b04:camera:camera-a-01:lease"
    redis(env, "SET", lease_key, "verify-owner|verify-session|700", "PX", "5000")
    valid_move = {"type": "MOVE", "ownerId": "verify-owner", "sessionId": "verify-session",
        "generation": 700, "sequence": 1, "pan": 0.7, "tilt": 0.0, "zoom": 0.0,
        "timeoutMs": 500, "reason": None}
    code, move = request_json(f"http://127.0.0.1:{b02.PORTS['gateway']}/internal/v1/cameras/camera-a-01/ptz",
                              token=token, body=valid_move)
    if code != 200 or not move.get("accepted"): raise B04Error("valid gateway MOVE failed")
    time.sleep(0.7)
    code, finite = request_json(f"http://127.0.0.1:{b02.PORTS['gateway']}/internal/v1/cameras/camera-a-01/status",
                                token=token)
    if code != 200 or finite.get("pose", {}).get("moving") is not False:
        raise B04Error("device finite timeout did not converge to IDLE")

    action_fault(argparse.Namespace(component="ffmpeg", state="down"))
    try:
        wait_json(f"http://127.0.0.1:{PORTS['mediamtxApi']}/v3/paths/get/camera-a-01",
                  lambda value: value.get("ready") is False, timeout=15)
        code, control_alive = request_json(
            f"http://127.0.0.1:{b02.PORTS['gateway']}/internal/v1/cameras/camera-a-01/status", token=token)
        if code != 200 or not control_alive.get("connected"):
            raise B04Error("preview outage leaked into PTZ")
    finally:
        action_fault(argparse.Namespace(component="ffmpeg", state="up"))
    results["G8"] = "PASS"

    action_fault(argparse.Namespace(component="onvif", state="down"))
    try:
        media = wait_json(f"http://127.0.0.1:{PORTS['mediamtxApi']}/v3/paths/get/camera-a-01",
                          lambda value: value.get("ready") is True)
        code, _ = request_json(
            f"http://127.0.0.1:{b02.PORTS['gateway']}/internal/v1/cameras/camera-a-01/status",
            token=token)
        if not media.get("ready") or code < 500:
            raise B04Error("ONVIF outage was not isolated from preview")
    finally:
        action_fault(argparse.Namespace(component="onvif", state="up"))
    results["G9"] = "PASS"

    b02.action_verify(argparse.Namespace())
    results["G10"] = "PASS"
    result = {"verifiedAt": b02.now(), "results": results, "count": "10/10",
              "media": "RTSP_H264_TO_WEBRTC", "publicRelease": "NOT_RELEASED"}
    (RUNTIME / "last-verify.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


def action_down(_: argparse.Namespace) -> None:
    env = ensure_runtime()
    manifest = load_manifest()
    for record in reversed(list(manifest.get("processes", {}).values())):
        b02.terminate_process(record)
    run(media_command() + ["down", "--timeout", "10"], env=media_env(env), timeout=90)
    b02.action_down(argparse.Namespace())
    if manifest:
        manifest["status"] = "stopped"
        manifest["stoppedAt"] = b02.now()
        manifest["b02VolumesPreserved"] = True
        write_manifest(manifest)
    print("Owned B04/B02 processes and containers stopped; B02 named volumes were preserved.")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    sub = result.add_subparsers(dest="action", required=True)
    sub.add_parser("up").set_defaults(handler=action_up)
    sub.add_parser("status").set_defaults(handler=action_status)
    sub.add_parser("verify").set_defaults(handler=action_verify)
    sub.add_parser("down").set_defaults(handler=action_down)
    fault = sub.add_parser("fault")
    fault.add_argument("--component", choices=("ffmpeg", "onvif"), required=True)
    fault.add_argument("--state", choices=("down", "up"), required=True)
    fault.set_defaults(handler=action_fault)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        args.handler(args)
        return 0
    except (B04Error, b02.B02Error, subprocess.TimeoutExpired, OSError,
            json.JSONDecodeError) as error:
        print(f"B04 ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
