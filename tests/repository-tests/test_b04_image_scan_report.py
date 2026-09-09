#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from verify_b04_image_scan_report import verify  # noqa: E402


IMAGE = "bluenviron/mediamtx:1.21.0@sha256:" + "1" * 64


def report_for(image: str) -> dict[str, object]:
    named_ref, digest = image.rsplit("@", 1)
    repository = named_ref[: named_ref.rfind(":")]
    return {
        "SchemaVersion": 2,
        "ArtifactName": image,
        "ArtifactType": "container_image",
        "Metadata": {
            "Reference": f"{repository}@{digest}",
            "RepoDigests": [f"{repository}@{digest}"],
        },
        "Results": [{"Target": repository, "Vulnerabilities": [
            {"VulnerabilityID": "CVE-test-1", "Severity": "CRITICAL"}
        ]}],
    }


class B04ImageScanReportTest(unittest.TestCase):
    def test_accepts_exact_report_and_preserves_findings(self) -> None:
        with tempfile.TemporaryDirectory() as raw_directory:
            path = Path(raw_directory) / "mediamtx.json"
            path.write_text(json.dumps(report_for(IMAGE)), encoding="utf-8")
            self.assertEqual(verify(path, IMAGE), 1)

    def test_rejects_wrong_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as raw_directory:
            path = Path(raw_directory) / "mediamtx.json"
            path.write_text(json.dumps(report_for(IMAGE.replace("1.21.0", "1.20.0"))), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "ArtifactName mismatch"):
                verify(path, IMAGE)

    def test_rejects_missing_expected_image(self) -> None:
        with self.assertRaisesRegex(ValueError, "MEDIAMTX_IMAGE is missing"):
            verify(Path("missing.json"), "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
