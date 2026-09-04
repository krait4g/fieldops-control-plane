#!/usr/bin/env python3
"""Validate the public repository's Korean-first v0.6 product baseline and hygiene."""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SELF = Path(__file__).resolve()

REQUIRED = [
    "README.md",
    "LICENSE",
    "CONTRIBUTING.md",
    "SECURITY.md",
    ".editorconfig",
    ".gitattributes",
    ".gitignore",
    ".env.example",
    ".java-version",
    ".nvmrc",
    "package.json",
    "pnpm-workspace.yaml",
    "settings.gradle.kts",
    "build.gradle.kts",
    "gradle.properties",
    "gradle/libs.versions.toml",
    "apps/README.md",
    "apps/fieldops-server/README.md",
    "apps/device-gateway/README.md",
    "apps/fieldops-worker/README.md",
    "apps/billing-job/README.md",
    "apps/simulator/README.md",
    "apps/web-console/README.md",
    "modules/README.md",
    "modules/device-integration/README.md",
    "modules/dashboard-query/README.md",
    "modules/camera-control/README.md",
    "docs/README.md",
    "docs/architecture.md",
    "docs/frontend-backend.md",
    "docs/roadmap.md",
    "docs/project-status.md",
    "docs/decisions/README.md",
    "docs/product/README.ko.md",
    "docs/product/PRD.ko.md",
    "docs/product/UX_DESIGN.ko.md",
    "docs/product/ROADMAP.ko.md",
    "docs/product/AI_PRODUCT_BUILDING.ko.md",
    "docs/product/PRD_CHANGELOG.ko.md",
    "docs/assets/README.md",
    "docs/assets/product-vision-hero.webp",
    "docs/assets/capability-overview-concept.webp",
    "docs/assets/screen-concept.webp",
    "contracts/README.md",
    "infra/README.md",
]

LEGACY_RUNTIME_PATHS = [
    "apps/fieldops-api",
    "apps/ingestion-gateway",
    "apps/telemetry-worker",
    "apps/automation-worker",
]

FORBIDDEN_PUBLIC_PATHS = [
    "AGENTS.md",
    "UI_AGENT.md",
    "CURRENT_STATE.md",
    "HANDOVER.md",
    "CODEX_START_HERE.md",
    "OPENCODE_START_HERE.md",
    "docs/codex",
    "docs/agents",
    "docs/ui-agent",
    "docs/reviews",
    "docs/evidence/recovery",
]

EXPECTED_ENV = {
    "FIELDOPS_SERVER_PORT": "8080",
    "DEVICE_GATEWAY_PORT": "8081",
    "KEYCLOAK_HTTP_PORT": "8180",
    "FIELDOPS_WEB_PORT": "3000",
    "POSTGRES_PORT": "5432",
    "REDIS_PORT": "6379",
    "KAFKA_BROKER_PORT": "9092",
    "KAFKA_CONTROLLER_PORT": "9093",
    "MQTT_PORT": "1883",
    "MQTT_WEBSOCKET_PORT": "9001",
    "PROMETHEUS_PORT": "9090",
    "GRAFANA_PORT": "3001",
    "OTEL_GRPC_PORT": "4317",
    "OTEL_HTTP_PORT": "4318",
    "TEMPO_HTTP_PORT": "3200",
    "LOKI_HTTP_PORT": "3100",
}

TEXT_SUFFIXES = {".md", ".yml", ".yaml", ".json", ".toml", ".kts", ".py", ".txt"}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
errors: list[str] = []

for rel in REQUIRED:
    if not (ROOT / rel).exists():
        errors.append(f"missing required path: {rel}")

for rel in LEGACY_RUNTIME_PATHS:
    if (ROOT / rel).exists():
        errors.append(f"legacy runtime path must be removed: {rel}")

for rel in FORBIDDEN_PUBLIC_PATHS:
    if (ROOT / rel).exists():
        errors.append(f"private/internal path must not exist in public repository: {rel}")

for path in ROOT.rglob("*"):
    if not path.is_file() or ".git" in path.parts:
        continue
    rel = path.relative_to(ROOT).as_posix()
    if "%" in rel:
        errors.append(f"URL-encoded filename is not allowed: {rel}")
    if path.name.startswith(".env") and path.name != ".env.example":
        errors.append(f"environment file must not be committed: {rel}")
    if path.suffix.lower() in IMAGE_SUFFIXES and path.stat().st_size > 2 * 1024 * 1024:
        errors.append(f"public image must be optimized below 2 MiB: {rel}")
    if path.suffix.lower() not in TEXT_SUFFIXES:
        continue

    text = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix.lower() == ".md" and text.count("```") % 2:
        errors.append(f"unbalanced markdown fence: {rel}")
    if re.search(
        r"(?i)(api[_-]?key|secret|token|password)[ \t]*[:=][ \t]*['\"]?[A-Za-z0-9_\-]{20,}",
        text,
    ):
        errors.append(f"possible hard-coded credential: {rel}")
    if path.resolve() != SELF:
        if re.search(r"(?i)fieldops-control-plane-workbench", text):
            errors.append(f"private repository name leaked into public content: {rel}")
        if re.search(r"(?i)(codex|opencode|agent handoff|internal prompt)", text):
            errors.append(f"internal agent context may be present in public content: {rel}")


def parse_env(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    if not path.exists():
        return result
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip()
    return result


env = parse_env(ROOT / ".env.example")
if "FIELDOPS_API_PORT" in env:
    errors.append("legacy environment variable must be removed: FIELDOPS_API_PORT")
for name, expected_value in EXPECTED_ENV.items():
    actual_value = env.get(name)
    if actual_value is None:
        errors.append(f"missing environment variable: {name}")
    elif actual_value != expected_value:
        errors.append(
            f"environment baseline mismatch: {name}={actual_value!r}, expected {expected_value!r}"
        )

port_owners: dict[str, list[str]] = defaultdict(list)
for name, value in env.items():
    if name.endswith("_PORT") and value.isdigit():
        port_owners[value].append(name)
for port, owners in sorted(port_owners.items(), key=lambda item: int(item[0])):
    if len(owners) > 1:
        errors.append(f"duplicate host port {port}: {', '.join(sorted(owners))}")


def read_required(rel: str) -> str:
    path = ROOT / rel
    return path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""


readme = read_required("README.md")
prd = read_required("docs/product/PRD.ko.md")
prd_changelog = read_required("docs/product/PRD_CHANGELOG.ko.md")
docs_index = read_required("docs/README.md")

for image_path in (
    "docs/assets/product-vision-hero.webp",
    "docs/assets/capability-overview-concept.webp",
    "docs/assets/screen-concept.webp",
):
    if image_path not in readme:
        errors.append(f"README must display the public concept image: {image_path}")

if "콘셉트 이미지" not in readme or "구현 완료 스크린샷" not in readme:
    errors.append("README must distinguish concept visuals from implementation screenshots")

prd_version_match = re.search(r"(?m)^> 버전: `([^`]+)`", prd)
if not prd_version_match:
    errors.append("PRD must declare its canonical version")
else:
    prd_version = prd_version_match.group(1)
    if f"## {prd_version} " not in prd_changelog:
        errors.append(f"PRD changelog must contain the canonical PRD version: {prd_version}")

if "한국어를 기본" not in docs_index:
    errors.append("public documentation index must declare Korean-first documentation")

if errors:
    print("Repository baseline verification failed:")
    for error in errors:
        print(f" - {error}")
    sys.exit(1)

print("Public FieldOps v0.6 Korean product and repository baseline verified.")
