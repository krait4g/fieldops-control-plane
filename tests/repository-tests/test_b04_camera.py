#!/usr/bin/env python3

from __future__ import annotations

import os
import sys
import unittest
from argparse import Namespace
from pathlib import Path
from unittest.mock import Mock, call, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import b04_camera as B04  # noqa: E402


class KeycloakPortPreflightTests(unittest.TestCase):
    def test_explicit_b02_keycloak_port_is_checked_before_startup(self) -> None:
        original = B04.b02.PORTS["keycloak"]
        checked: list[int] = []
        try:
            with patch.dict(os.environ, {"B02_KEYCLOAK_PORT": "28083"}), patch.object(
                B04, "port_free", side_effect=lambda port, *_: checked.append(port) or True
            ):
                B04.preflight_ports()
            self.assertIn(28083, checked)
            self.assertNotIn(28080, checked)
        finally:
            B04.b02.PORTS["keycloak"] = original

    def test_invalid_b02_keycloak_port_fails_before_startup(self) -> None:
        with patch.dict(os.environ, {"B02_KEYCLOAK_PORT": "not-a-port"}):
            with self.assertRaisesRegex(B04.b02.B02Error, "must be an integer"):
                B04.preflight_ports()


class CheckoutIsolationTests(unittest.TestCase):
    def test_compose_projects_are_scoped_to_this_checkout(self) -> None:
        self.assertEqual(B04.B02_PROJECT, f"fieldops-b02-b04-{B04.CHECKOUT_ID}")
        self.assertEqual(B04.MEDIA_PROJECT, f"fieldops-b04-media-{B04.CHECKOUT_ID}")
        self.assertEqual(B04.b02.PROJECT, B04.B02_PROJECT)

    def test_different_checkout_paths_have_different_fingerprints(self) -> None:
        self.assertNotEqual(
            B04.checkout_fingerprint(ROOT / "clone-a"),
            B04.checkout_fingerprint(ROOT / "clone-b"),
        )


class ObserveReadinessTests(unittest.TestCase):
    def test_one_startup_timeout_is_retried(self) -> None:
        startup_timeout = B04.b02.B02Error("condition not reached in 30s; last=''")
        with patch.object(
            B04.b02, "action_verify", side_effect=[startup_timeout, None]
        ) as verify, patch.object(B04.time, "sleep") as sleep:
            B04.verify_b02_with_startup_retry()
        self.assertEqual(verify.call_count, 2)
        sleep.assert_called_once_with(2)

    def test_non_readiness_error_is_not_retried(self) -> None:
        with patch.object(
            B04.b02, "action_verify", side_effect=B04.b02.B02Error("process stopped")
        ) as verify:
            with self.assertRaisesRegex(B04.b02.B02Error, "process stopped"):
                B04.verify_b02_with_startup_retry()
        verify.assert_called_once()


class FaultShutdownTests(unittest.TestCase):
    def test_wait_process_stopped_handles_delayed_exit(self) -> None:
        record = {"pid": 42, "identity": "stable"}
        with patch.object(B04.b02, "process_alive", side_effect=[True, True, False]) as alive, \
                patch.object(B04.time, "sleep") as sleep:
            B04.wait_process_stopped(record)
        self.assertEqual(alive.call_count, 3)
        self.assertEqual(sleep.call_args_list, [call(0.1), call(0.1)])

    def test_wait_process_stopped_handles_immediate_exit(self) -> None:
        record = {"pid": 42, "identity": "stable"}
        with patch.object(B04.b02, "process_alive", return_value=False) as alive, \
                patch.object(B04.time, "sleep") as sleep:
            B04.wait_process_stopped(record)
        alive.assert_called_once_with(record)
        sleep.assert_not_called()

    def test_wait_process_stopped_times_out_closed(self) -> None:
        record = {"pid": 42, "identity": "stable"}
        with patch.object(B04.b02, "process_alive", return_value=True), \
                patch.object(B04.time, "monotonic", side_effect=[10.0, 10.5]), \
                patch.object(B04.time, "sleep") as sleep:
            with self.assertRaisesRegex(B04.B04Error, "did not stop within 0.5s"):
                B04.wait_process_stopped(record, timeout=0.5)
        sleep.assert_not_called()

    def test_fault_down_confirms_stop_before_manifest_removal(self) -> None:
        record = {"pid": 42, "identity": "stable"}
        manifest = {"status": "running", "processes": {"onvif": record}}
        events: list[str] = []

        def terminate(candidate: dict[str, object]) -> None:
            self.assertIs(candidate, record)
            events.append("terminate")

        def confirm(candidate: dict[str, object]) -> None:
            self.assertIs(candidate, record)
            self.assertIn("onvif", manifest["processes"])
            events.append("confirmed-stop")

        def write(candidate: dict[str, object]) -> None:
            self.assertIs(candidate, manifest)
            self.assertNotIn("onvif", manifest["processes"])
            events.append("manifest-write")

        with patch.object(B04, "ensure_runtime", return_value={}), \
                patch.object(B04, "load_manifest", return_value=manifest), \
                patch.object(B04.b02, "terminate_process", side_effect=terminate), \
                patch.object(B04, "wait_process_stopped", side_effect=confirm), \
                patch.object(B04, "write_manifest", side_effect=write):
            B04.action_fault(Namespace(component="onvif", state="down"))

        self.assertEqual(events, ["terminate", "confirmed-stop", "manifest-write"])

    def test_fault_timeout_keeps_manifest_record(self) -> None:
        record = {"pid": 42, "identity": "stable"}
        manifest = {"status": "running", "processes": {"onvif": record}}
        write = Mock()
        with patch.object(B04, "ensure_runtime", return_value={}), \
                patch.object(B04, "load_manifest", return_value=manifest), \
                patch.object(B04.b02, "terminate_process"), \
                patch.object(B04, "wait_process_stopped", side_effect=B04.B04Error("timeout")), \
                patch.object(B04, "write_manifest", write):
            with self.assertRaisesRegex(B04.B04Error, "timeout"):
                B04.action_fault(Namespace(component="onvif", state="down"))
        self.assertIs(manifest["processes"]["onvif"], record)
        write.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
