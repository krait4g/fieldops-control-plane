import importlib.util
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import call, patch


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("b07_tcp_binary", ROOT / "scripts/b07_tcp_binary.py")
if spec is None or spec.loader is None:
    raise RuntimeError("could not load B07 orchestrator")
B07 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B07)


class B07OrchestratorTests(unittest.TestCase):
    def test_checkout_project_and_runtime_are_scoped(self):
        self.assertRegex(B07.B02_PROJECT, r"^fieldops-b02-b07-[0-9a-f]{10}$")
        self.assertEqual(B07.RUNTIME, ROOT / ".fieldops-b07")
        self.assertEqual(B07.PORT, 28087)

    def test_fault_matrix_is_bounded_and_complete(self):
        self.assertEqual(len(B07.SCENARIOS), 13)
        self.assertIn("fragment-header", B07.SCENARIOS)
        self.assertIn("disconnect-before-ack", B07.SCENARIOS)
        self.assertIn("heartbeat-timeout", B07.SCENARIOS)

    def test_script_has_no_global_or_unowned_cleanup(self):
        source = (ROOT / "scripts/b07_tcp_binary.py").read_text(encoding="utf-8")
        self.assertNotIn("docker system prune", source)
        self.assertNotIn("docker volume prune", source)
        self.assertNotIn("pkill", source)
        self.assertNotIn("taskkill /IM", source)

    def test_startup_diagnostics_are_bounded_and_redact_sensitive_lines(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime = Path(temp_dir)
            logs = runtime / "b02" / "logs"
            logs.mkdir(parents=True)
            (logs / "gateway.log").write_text(
                "safe-one\npassword=do-not-print\nsafe-two\n", encoding="utf-8"
            )
            output = io.StringIO()
            with patch.object(B07, "RUNTIME", runtime), redirect_stderr(output):
                B07.print_safe_startup_diagnostics(max_lines=2)
            rendered = output.getvalue()
            self.assertNotIn("do-not-print", rendered)
            self.assertIn("[REDACTED sensitive log line]", rendered)
            self.assertIn("safe-two", rendered)
            self.assertNotIn("safe-one", rendered)

    def test_device_stop_returns_after_confirmed_graceful_exit(self):
        record = {"pid": 42, "identity": "stable"}
        with patch.object(B07.b02, "terminate_process") as terminate, \
                patch.object(B07, "wait_stopped") as wait, \
                patch.object(B07.os, "killpg", create=True) as killpg:
            B07.stop_device(record)
        terminate.assert_called_once_with(record)
        wait.assert_called_once_with(record, timeout=5.0)
        killpg.assert_not_called()

    def test_linux_zombie_is_stopped_after_stable_identity_check(self):
        record = {"pid": 42, "identity": "stable"}
        with patch.object(B07.os, "name", "posix"), \
                patch.object(B07.b02, "process_alive", return_value=True) as alive, \
                patch.object(B07, "linux_process_state", return_value="Z"):
            self.assertFalse(B07.device_running(record))
        alive.assert_called_once_with(record)

    def test_linux_running_state_remains_alive(self):
        record = {"pid": 42, "identity": "stable"}
        with patch.object(B07.os, "name", "posix"), \
                patch.object(B07.b02, "process_alive", return_value=True), \
                patch.object(B07, "linux_process_state", return_value="S"):
            self.assertTrue(B07.device_running(record))

    def test_device_stop_escalates_only_after_identity_guarded_timeout(self):
        record = {"pid": 42, "identity": "stable"}
        with patch.object(B07.os, "name", "posix"), \
                patch.object(B07.b02, "terminate_process") as terminate, \
                patch.object(B07, "device_running", return_value=True) as alive, \
                patch.object(B07, "wait_stopped", side_effect=[B07.B07Error("timeout"), None]) as wait, \
                patch.object(B07.os, "killpg", create=True) as killpg:
            B07.stop_device(record)
        terminate.assert_called_once_with(record)
        alive.assert_called_once_with(record)
        killpg.assert_called_once_with(42, B07.SIGKILL)
        self.assertEqual(wait.call_args_list, [call(record, timeout=5.0), call(record, timeout=5.0)])


if __name__ == "__main__":
    unittest.main()
