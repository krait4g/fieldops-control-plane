#!/usr/bin/env python3
"""Check public documentation and repository hygiene, not application correctness."""
from __future__ import annotations

import hashlib
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SELF = Path(__file__).resolve()
IMAGES = (
    "docs/assets/product-vision-hero.webp",
    "docs/assets/capability-overview.webp",
    "docs/assets/screen-overview.webp",
)
IMPLEMENTATION_IMAGES = {
    "docs/assets/implementation/camera-ptz-control-ko.png":
        "905e0dd0e1629e7977cf709c3acffe5e13b6471d15bdcc960c838f84e0be1e12",
    "docs/assets/implementation/camera-webrtc-preview-ko.png":
        "98c59d6c00e52d2bab6151e0e992adf834924c1437ce9575940421314451d21c",
    "docs/assets/implementation/camera-ptz-mobile-ko.png":
        "ab73670dcdd43f8a3143d5cbe9bbf87dba6113b0976c68dc28618ca2212462c4",
    "docs/assets/implementation/command-pending-approval-ko.png":
        "85f43d3f960dfab3585280866018e7fa656dd377587e0b51310a743240527840",
    "docs/assets/implementation/command-succeeded-timeline-ko.png":
        "0678e0e72e0a604aa56ce00da70fd5298428c2453365857b32f8ac2f33c3d8fd",
}
REQUIRED = [
    "README.md", "LICENSE", "CONTRIBUTING.md", "SECURITY.md",
    ".editorconfig", ".gitattributes", ".gitignore", ".env.example",
    ".java-version", ".nvmrc", "package.json", "pnpm-workspace.yaml",
    "settings.gradle.kts", "build.gradle.kts", "gradle.properties", "gradlew", "gradlew.bat",
    "gradle/wrapper/gradle-wrapper.jar", "gradle/wrapper/gradle-wrapper.properties",
    "gradle/libs.versions.toml", "apps/README.md",
    "apps/fieldops-server/README.md", "apps/device-gateway/README.md",
    "apps/fieldops-worker/README.md", "apps/billing-job/README.md",
    "apps/simulator/README.md", "apps/web-console/README.md", "modules/README.md",
    "modules/device-integration/README.md", "modules/dashboard-query/README.md",
    "modules/camera-control/README.md", "docs/README.md", "docs/architecture.md",
    "docs/frontend-backend.md", "docs/roadmap.md", "docs/project-status.md",
    "docs/decisions/README.md", "docs/product/README.ko.md", "docs/product/PRD.ko.md",
    "docs/product/UX_DESIGN.ko.md", "docs/product/ROADMAP.ko.md",
    "docs/product/AI_PRODUCT_BUILDING.ko.md", "docs/product/PRD_CHANGELOG.ko.md",
    "docs/assets/README.md", "docs/runnable-snapshot.md", "docs/LOCAL_OBSERVE_QUICKSTART.md",
    "docs/CAMERA_PTZ_QUICKSTART.md", "docs/COMMAND_QUICKSTART.md",
    "docs/decisions/0015-b04-camera-preview-ptz-boundary.md",
    "docs/adr/0016-b05-durable-command-dispatch.md",
    "contracts/README.md", "infra/README.md", "scripts/b02_observe.py",
    "tests/repository-tests/test_b02_observe.py",
    "tests/repository-tests/test_b04_image_scan_report.py",
    "tests/repository-tests/test_b04_camera.py",
    "scripts/b04_camera.py", "scripts/verify_b04_image_scan_report.py", "scripts/b05_command.py",
    "tests/repository-tests/test_b05_command.py",
    "infra/compose/compose.yml", "infra/b02/compose.override.yml",
    "apps/fieldops-server/build.gradle.kts", "apps/device-gateway/build.gradle.kts",
    "apps/fieldops-worker/build.gradle.kts", "apps/simulator/build.gradle.kts",
    "apps/web-console/package.json", "modules/telemetry-domain/build.gradle.kts",
    "modules/telemetry-application/build.gradle.kts", "modules/camera-control/build.gradle.kts",
    "infra/b04/compose.yml", "infra/b04/mediamtx.yml", *IMAGES, *IMPLEMENTATION_IMAGES,
]
LEGACY_RUNTIME_PATHS = (
    "apps/fieldops-api", "apps/ingestion-gateway", "apps/telemetry-worker", "apps/automation-worker",
)
FORBIDDEN_PUBLIC_PATHS = (
    "AGENTS.md", "UI_AGENT.md", "CURRENT_STATE.md", "HANDOVER.md", "RESUME.md",
    "CODEX_START_HERE.md", "OPENCODE_START_HERE.md", "docs/codex", "docs/agents",
    "docs/ui-agent", "docs/reviews", "docs/evidence", "docs/archive",
)
EXPECTED_ENV = {
    "FIELDOPS_SERVER_PORT": "8080", "DEVICE_GATEWAY_PORT": "8081",
    "KEYCLOAK_HTTP_PORT": "8180", "FIELDOPS_WEB_PORT": "3000",
    "POSTGRES_PORT": "5432", "REDIS_PORT": "6379", "KAFKA_BROKER_PORT": "9092",
    "KAFKA_CONTROLLER_PORT": "9093", "MQTT_PORT": "1883", "MQTT_WEBSOCKET_PORT": "9001",
    "PROMETHEUS_PORT": "9090", "GRAFANA_PORT": "3001", "OTEL_GRPC_PORT": "4317",
    "OTEL_HTTP_PORT": "4318", "TEMPO_HTTP_PORT": "3200", "LOKI_HTTP_PORT": "3100",
}
TEXT_SUFFIXES = {
    ".md", ".yml", ".yaml", ".json", ".toml", ".kts", ".py", ".txt", ".java",
    ".ts", ".tsx", ".js", ".mjs", ".cjs", ".properties", ".sql", ".conf", ".acl",
    ".xml", ".sh", ".bat",
}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
IGNORED_TREE_PARTS = {
    ".git", ".gradle", ".next", ".fieldops-b02", ".fieldops-b04", ".fieldops-b05", "node_modules", "build", "out",
    "coverage", "playwright-report", "test-results", "__pycache__",
}
errors: list[str] = []

for rel in REQUIRED:
    if not (ROOT / rel).exists():
        errors.append(f"missing required path: {rel}")
for rel in (*LEGACY_RUNTIME_PATHS, *FORBIDDEN_PUBLIC_PATHS):
    if (ROOT / rel).exists():
        errors.append(f"forbidden public/legacy path: {rel}")

for path in ROOT.rglob("*"):
    if not path.is_file() or any(part in IGNORED_TREE_PARTS for part in path.parts):
        continue
    rel = path.relative_to(ROOT).as_posix()
    if "%" in rel:
        errors.append(f"URL-encoded filename is not allowed: {rel}")
    if path.name.startswith(".env") and path.name != ".env.example":
        errors.append(f"environment file must not be committed: {rel}")
    if path.suffix.lower() in IMAGE_SUFFIXES and path.stat().st_size > 2 * 1024 * 1024:
        errors.append(f"public image exceeds 2 MiB: {rel}")
    if path.suffix.lower() not in TEXT_SUFFIXES:
        continue
    text = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix.lower() == ".md" and text.count("```") % 2:
        errors.append(f"unbalanced markdown fence: {rel}")
    if re.search(r"(?i)(api[_-]?key|secret|token|password)[ \t]*[:=][ \t]*['\"]?[A-Za-z0-9_\-]{20,}", text):
        errors.append(f"possible hard-coded credential: {rel}")
    if path.resolve() != SELF:
        if re.search(r"(?i)fieldops-control-plane-workbench", text):
            errors.append(f"private repository name leaked: {rel}")
        if re.search(
            r"(?i)(codex|opencode|agent handoff|internal prompt|docs/(?:ui-agent|agents|evidence)|(?:UI_)?AGENTS?\.md)",
            text,
        ):
            errors.append(f"internal agent context: {rel}")
        if re.search(r"(?i)(?:[A-Z]:[\\/]+Users[\\/]+|/home/[^/]+/)", text):
            errors.append(f"personal absolute path: {rel}")

tracked = subprocess.run(
    ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True,
).stdout.decode("utf-8").split("\0")
for rel in tracked:
    if not rel:
        continue
    parts = Path(rel).parts
    if any(part in IGNORED_TREE_PARTS for part in parts):
        errors.append(f"generated/runtime path must not be tracked: {rel}")


def read(rel: str) -> str:
    path = ROOT / rel
    return path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""


env: dict[str, str] = {}
for raw in read(".env.example").splitlines():
    line = raw.strip()
    if line and not line.startswith("#") and "=" in line:
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
if "FIELDOPS_API_PORT" in env:
    errors.append("legacy environment variable: FIELDOPS_API_PORT")
for name, value in EXPECTED_ENV.items():
    if env.get(name) != value:
        errors.append(f"environment baseline mismatch: {name}")
ports: dict[str, list[str]] = defaultdict(list)
for name, value in env.items():
    if name.endswith("_PORT") and value.isdigit():
        ports[value].append(name)
for value, owners in ports.items():
    if len(owners) > 1:
        errors.append(f"duplicate host port {value}: {owners}")

readme = read("README.md")
for rel in IMAGES:
    if rel not in readme:
        errors.append(f"README must reference current concept image: {rel}")
    path = ROOT / rel
    if path.exists():
        with path.open("rb") as stream:
            header = stream.read(12)
        if not (header[:4] == b"RIFF" and header[8:12] == b"WEBP"):
            errors.append(f"concept asset is not a WebP container: {rel}")
for rel, expected_sha256 in IMPLEMENTATION_IMAGES.items():
    if rel not in readme:
        errors.append(f"README must reference B04 implementation image: {rel}")
    path = ROOT / rel
    if path.exists():
        if path.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
            errors.append(f"implementation asset is not a PNG: {rel}")
        actual_sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual_sha256 != expected_sha256:
            errors.append(f"implementation asset hash mismatch: {rel}")
if "콘셉트 이미지" not in readme or "구현 완료 스크린샷" not in readme:
    errors.append("README must distinguish concept and implementation screenshots")
version = re.search(r"(?m)^> 버전: `([^`]+)`", read("docs/product/PRD.ko.md"))
if not version:
    errors.append("PRD must declare a version")
elif f"## {version.group(1)} " not in read("docs/product/PRD_CHANGELOG.ko.md"):
    errors.append("PRD changelog must contain the declared version")
if "한국어를 기본" not in read("docs/README.md"):
    errors.append("documentation index must declare Korean-first documentation")
if "docs/LOCAL_OBSERVE_QUICKSTART.md" not in readme:
    errors.append("README must link the Local Observe Quick Start")
if "docs/CAMERA_PTZ_QUICKSTART.md" not in readme:
    errors.append("README must link the Camera/PTZ Quick Start")
if "docs/COMMAND_QUICKSTART.md" not in readme:
    errors.append("README must link the Durable Command Quick Start")

for rel in (
    "infra/compose/compose.yml", "infra/compose/mqtt.compose.yml",
    "infra/compose/kafka.compose.yml", "infra/compose/keycloak.compose.yml",
):
    for line in read(rel).splitlines():
        stripped = line.strip().strip("'\"")
        if stripped.startswith("- "):
            stripped = stripped[2:].strip().strip("'\"")
        if re.match(r"^(?:\$\{[^}]+\}|\d+):\d+(?:/\w+)?$", stripped):
            errors.append(f"non-loopback host port publish: {rel}: {line.strip()}")
if '"--hostname", "127.0.0.1"' not in read("scripts/b02_observe.py"):
    errors.append("web-console start must bind to 127.0.0.1")

# Check local file destinations in the maintained public entry documents.
# This is deliberately not a network crawler, Markdown renderer, or app test.
DOCS = (
    "README.md", "docs/project-status.md", "docs/architecture.md", "docs/frontend-backend.md",
    "docs/roadmap.md", "docs/product/PRD.ko.md", "docs/product/ROADMAP.ko.md",
    "docs/product/UX_DESIGN.ko.md", "docs/product/PRD_CHANGELOG.ko.md",
)
for rel in DOCS:
    text = re.sub(r"```.*?```", "", read(rel), flags=re.S)
    targets = re.findall(r"\]\(([^\s)]+)(?:\s+[^)]*)?\)", text)
    targets += re.findall(r'(?:src|href)="([^"]+)"', text)
    for target in targets:
        parts = urlsplit(target)
        if parts.scheme or parts.netloc or not parts.path:
            continue
        dest = ((ROOT / rel).parent / unquote(parts.path)).resolve()
        if not dest.is_relative_to(ROOT) or not dest.exists():
            errors.append(f"broken local link: {rel} -> {target}")

if errors:
    print("Public repository/documentation verification failed:")
    for error in errors:
        print(f" - {error}")
    sys.exit(1)
print("Public FieldOps documentation, current image references and baseline verified.")
