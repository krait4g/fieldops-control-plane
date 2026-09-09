#!/usr/bin/env python3
"""Regression tests for Local Observe process ownership and port selection."""

from __future__ import annotations

import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("b02_observe", ROOT / "scripts/b02_observe.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("could not load scripts/b02_observe.py")
B02 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(B02)


class ProcessIdentityTests(unittest.TestCase):
    @unittest.skipUnless(os.name == "nt", "Windows CreationDate identity check")
    def test_current_windows_process_has_creation_identity(self) -> None:
        self.assertTrue(B02.process_identity(os.getpid()).startswith("windows-created:"))

    def test_process_title_mutation_does_not_break_identity(self) -> None:
        record = {
            "pid": 123,
            "identity": "linux-startticks:456",
            "token": "next/dist/bin/next",
        }
        with mock.patch.object(B02, "process_command", return_value="next-server (v16.3.4)"):
            if hasattr(B02, "process_identity"):
                with mock.patch.object(B02, "process_identity", return_value=record["identity"]):
                    self.assertTrue(B02.process_alive(record))
            else:
                self.assertTrue(B02.process_alive(record))

    def test_same_pid_and_identity_is_alive(self) -> None:
        record = {"pid": 42, "identity": "linux-startticks:100", "token": "old-title"}
        with mock.patch.object(B02, "process_identity", return_value=record["identity"]):
            self.assertTrue(B02.process_alive(record))

    def test_same_pid_with_different_identity_is_not_alive(self) -> None:
        record = {"pid": 42, "identity": "linux-startticks:100", "token": "old-title"}
        with mock.patch.object(B02, "process_identity", return_value="linux-startticks:200"):
            self.assertFalse(B02.process_alive(record))

    def test_missing_pid_is_not_alive(self) -> None:
        record = {"pid": 42, "identity": "linux-startticks:100", "token": "old-title"}
        with mock.patch.object(B02, "process_identity", side_effect=FileNotFoundError):
            self.assertFalse(B02.process_alive(record))

    def test_identity_read_error_is_not_alive(self) -> None:
        record = {"pid": 42, "identity": "linux-startticks:100", "token": "old-title"}
        with mock.patch.object(B02, "process_identity", side_effect=B02.B02Error("unreadable")):
            self.assertFalse(B02.process_alive(record))

    def test_identity_mismatch_termination_does_not_kill(self) -> None:
        record = {"pid": 42, "identity": "linux-startticks:100", "token": "old-title"}
        with (
            mock.patch.object(B02, "process_identity", return_value="linux-startticks:200"),
            mock.patch.object(B02, "run") as run_mock,
            mock.patch.object(B02.os, "killpg", create=True) as killpg_mock,
        ):
            B02.terminate_process(record)
        run_mock.assert_not_called()
        killpg_mock.assert_not_called()

    def test_linux_stat_parser_handles_spaces_and_parentheses_in_comm(self) -> None:
        stat = "123 (next server (worker)) S " + " ".join(str(field) for field in range(4, 30))
        self.assertEqual(B02.parse_linux_start_ticks(stat), "22")

    def test_legacy_token_only_record_fails_closed(self) -> None:
        with mock.patch.object(B02, "process_identity", return_value="linux-startticks:100"):
            self.assertFalse(B02.process_alive({"pid": 42, "token": "old-title"}))


class KeycloakPortTests(unittest.TestCase):
    def test_default_keycloak_port(self) -> None:
        self.assertEqual(B02.resolve_keycloak_port(None), 28080)

    def test_explicit_keycloak_port(self) -> None:
        self.assertEqual(B02.resolve_keycloak_port("28083"), 28083)

    def test_invalid_keycloak_ports(self) -> None:
        for value in ("", "not-a-port", "0", "65536", "-1"):
            with self.subTest(value=value), self.assertRaises(B02.B02Error):
                B02.resolve_keycloak_port(value)

    def test_keycloak_override_propagates_to_runtime_and_compose(self) -> None:
        original_port = B02.PORTS["keycloak"]
        try:
            with tempfile.TemporaryDirectory() as directory:
                runtime = Path(directory)
                with (
                    mock.patch.object(B02, "RUNTIME", runtime),
                    mock.patch.object(B02, "LOGS", runtime / "logs"),
                    mock.patch.object(B02, "MANIFEST", runtime / "run-manifest.json"),
                    mock.patch.dict(B02.os.environ, {"B02_KEYCLOAK_PORT": "28083"}),
                ):
                    env = B02.ensure_runtime()
                    runtime_env = (runtime / "runtime.env").read_text(encoding="utf-8")
            self.assertEqual(B02.PORTS["keycloak"], 28083)
            self.assertEqual(env["KEYCLOAK_HTTP_PORT"], "28083")
            self.assertEqual(env["B02_KEYCLOAK_PORT"], "28083")
            self.assertIn("KEYCLOAK_HTTP_PORT=28083\n", runtime_env)
            self.assertIn("B02_KEYCLOAK_PORT=28083\n", runtime_env)
        finally:
            B02.PORTS["keycloak"] = original_port


class RuntimeIsolationTests(unittest.TestCase):
    def test_default_runtime_remains_unchanged(self) -> None:
        self.assertEqual(B02.resolve_runtime(None), ROOT / ".fieldops-b02")

    def test_nested_task_runtime_is_allowed(self) -> None:
        self.assertEqual(B02.resolve_runtime(".fieldops-b04/b02"), ROOT / ".fieldops-b04" / "b02")

    def test_runtime_outside_repository_is_rejected(self) -> None:
        with self.assertRaises(RuntimeError):
            B02.resolve_runtime(str(ROOT.parent / "outside-b02"))

    def test_one_shot_simulator_does_not_inherit_vertical_slice_profile(self) -> None:
        with (
            mock.patch.object(B02, "java_executable", return_value="java"),
            mock.patch.object(B02, "jar_for", return_value=Path("simulator.jar")),
            mock.patch.object(B02, "run", return_value="ok") as run_mock,
        ):
            B02.simulator({"SPRING_PROFILES_ACTIVE": "local-observe,b04-camera"}, ["--count=1"])
        self.assertEqual(run_mock.call_args.kwargs["env"]["SPRING_PROFILES_ACTIVE"], "local-observe")


if __name__ == "__main__":
    unittest.main(verbosity=2)
