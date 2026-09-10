#!/usr/bin/env python3
"""Verify B04 MediaMTX Trivy execution without declaring image security PASS."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


DIGEST_REF = re.compile(r"^(.+)@(sha256:[0-9a-f]{64})$")
ALLOWED_SEVERITIES = {"HIGH", "CRITICAL"}


def canonical_digest_ref(image_ref: str) -> str:
    match = DIGEST_REF.fullmatch(image_ref)
    if not match:
        raise ValueError("expected a tag@sha256 exact image reference")
    named_ref, digest = match.groups()
    slash = named_ref.rfind("/")
    colon = named_ref.rfind(":")
    repository = named_ref[:colon] if colon > slash else named_ref
    return f"{repository}@{digest}"


def validate_report(path: Path, expected_image: str) -> int:
    expected_digest_ref = canonical_digest_ref(expected_image)
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError("report is missing") from error
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"report is unreadable or malformed JSON: {error}") from error
    if not isinstance(report, dict) or report.get("SchemaVersion") != 2:
        raise ValueError("unexpected or missing Trivy SchemaVersion")
    if report.get("ArtifactType") != "container_image":
        raise ValueError("ArtifactType must be container_image")
    if report.get("ArtifactName") != expected_image:
        raise ValueError("ArtifactName mismatch")
    metadata = report.get("Metadata")
    if not isinstance(metadata, dict):
        raise ValueError("Metadata must be a JSON object")
    observed = {value for value in metadata.get("RepoDigests", []) if isinstance(value, str)}
    if isinstance(metadata.get("Reference"), str):
        observed.add(metadata["Reference"])
    if expected_digest_ref not in observed:
        raise ValueError("metadata digest mismatch")
    results = report.get("Results")
    if not isinstance(results, list):
        raise ValueError("Results must be a JSON array")
    findings = 0
    for result in results:
        if not isinstance(result, dict):
            raise ValueError("each Results entry must be a JSON object")
        vulnerabilities = result.get("Vulnerabilities")
        if vulnerabilities is None:
            continue
        if not isinstance(vulnerabilities, list):
            raise ValueError("Vulnerabilities must be an array")
        for vulnerability in vulnerabilities:
            if not isinstance(vulnerability, dict):
                raise ValueError("each vulnerability must be an object")
            severity = vulnerability.get("Severity")
            if severity not in ALLOWED_SEVERITIES:
                raise ValueError(f"unexpected vulnerability severity: {severity!r}")
            findings += 1
    return findings


def verify(report: Path, expected_image: str) -> int:
    if not expected_image:
        raise ValueError("MEDIAMTX_IMAGE is missing")
    return validate_report(report, expected_image)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("build/reports/trivy-b04/mediamtx.json"),
    )
    parser.add_argument(
        "--require-zero",
        action="store_true",
        help="fail the public candidate gate when HIGH/CRITICAL records are present",
    )
    args = parser.parse_args()
    try:
        findings = verify(args.report, os.environ.get("MEDIAMTX_IMAGE", ""))
    except ValueError as error:
        print(f"B04 MediaMTX scan report verification failed: {error}")
        return 1

    state = "PRESENT" if findings else "NONE"
    print(
        "B04 MediaMTX scan execution PASS: "
        f"HIGH/CRITICAL findings={state} ({findings} records); "
        "image security PASS is not asserted; Public Release remains separate."
    )
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        Path(summary_path).write_text(
            "## B04 MediaMTX image scan execution\n\n"
            "- Scan execution: **PASS**\n"
            f"- HIGH/CRITICAL findings: **{state}** (`{findings}` records)\n"
            "- Image security PASS: **not asserted**\n"
            "- Public Release: **NOT_RELEASED**\n",
            encoding="utf-8",
        )
    if args.require_zero and findings:
        print("Public candidate gate failed: HIGH/CRITICAL findings must be zero.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
