#!/usr/bin/env python3
"""Validate the public repository's required files and basic hygiene."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "README.md", "LICENSE", "CONTRIBUTING.md", "SECURITY.md",
    ".editorconfig", ".gitattributes", ".gitignore", ".java-version",
    ".nvmrc", "package.json", "pnpm-workspace.yaml", "settings.gradle.kts",
    "build.gradle.kts", "gradle.properties", "gradle/libs.versions.toml",
    "docs/README.md", "docs/architecture.md", "docs/roadmap.md",
    "docs/project-status.md", "contracts/README.md", "infra/README.md"
]

errors: list[str] = []
for rel in REQUIRED:
    if not (ROOT / rel).exists():
        errors.append(f"missing required path: {rel}")

for path in ROOT.rglob("*"):
    if not path.is_file() or ".git" in path.parts:
        continue
    rel = path.relative_to(ROOT).as_posix()
    if "%" in rel:
        errors.append(f"URL-encoded filename is not allowed: {rel}")
    if path.name.startswith(".env") and path.name != ".env.example":
        errors.append(f"environment file must not be committed: {rel}")
    if path.suffix.lower() in {".md", ".yml", ".yaml", ".json", ".toml", ".kts", ".py", ".txt"}:
        text = path.read_text(encoding="utf-8", errors="replace")
        if re.search(r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{20,}", text):
            errors.append(f"possible hard-coded credential: {rel}")

if errors:
    print("Repository baseline verification failed:")
    for error in errors:
        print(f" - {error}")
    sys.exit(1)

print("Public repository baseline verified.")
