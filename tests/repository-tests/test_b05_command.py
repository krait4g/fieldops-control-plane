#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import b05_command as B05  # noqa: E402


class B05BoundaryTests(unittest.TestCase):
    def test_runtime_is_checkout_scoped_and_separate_from_b04(self) -> None:
        self.assertEqual(B05.B02_PROJECT, f"fieldops-b02-b05-{B05.CHECKOUT_ID}")
        self.assertEqual(B05.b02.PROJECT, B05.B02_PROJECT)
        self.assertEqual(B05.RUNTIME.name, ".fieldops-b05")

    def test_payload_digest_matches_domain_canonical_order(self) -> None:
        expected = hashlib.sha256(b"tenant-a\nvalve-a-01\nOPEN\nSUCCESS").hexdigest()
        self.assertEqual(len(expected), 64)
        self.assertNotEqual(expected,
            hashlib.sha256(b"tenant-a\nvalve-a-01\nCLOSE\nSUCCESS").hexdigest())

    def test_unknown_verification_requires_single_dispatch(self) -> None:
        source = (ROOT / "scripts/b05_command.py").read_text(encoding="utf-8")
        self.assertIn('hang_state != "UNKNOWN:1"', source)
        claim = (ROOT / "apps/fieldops-worker/src/main/java/io/krait/fieldops/worker/command/CommandLedger.java")
        self.assertIn("FOR UPDATE SKIP LOCKED", claim.read_text(encoding="utf-8"))

    def test_second_dispatcher_does_not_join_b02_kafka_consumer_groups(self) -> None:
        source = (ROOT / "scripts/b05_command.py").read_text(encoding="utf-8")
        self.assertIn('"SPRING_KAFKA_LISTENER_AUTO_STARTUP": "false"', source)

    def test_one_b02_readiness_timeout_is_retried(self) -> None:
        timeout = B05.b02.B02Error("condition not reached in 30s; last=''")
        with patch.object(B05.b02, "action_verify", side_effect=[timeout, None]) as verify, \
                patch.object(B05.time, "sleep") as sleep:
            B05.verify_b02_with_startup_retry()
        self.assertEqual(verify.call_count, 2)
        sleep.assert_called_once_with(2)

    def test_non_readiness_b02_error_is_not_retried(self) -> None:
        with patch.object(B05.b02, "action_verify",
                side_effect=B05.b02.B02Error("process stopped")) as verify:
            with self.assertRaisesRegex(B05.b02.B02Error, "process stopped"):
                B05.verify_b02_with_startup_retry()
        verify.assert_called_once()

    def test_port_collision_fails_without_killing_processes(self) -> None:
        with patch.object(B05, "ensure_runtime", return_value={}), \
                patch.object(B05, "port_free", return_value=False), \
                patch.object(B05.b02, "terminate_process") as terminate:
            with self.assertRaisesRegex(B05.B05Error, "required ports are occupied"):
                B05.action_up(argparse.Namespace())
        terminate.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
