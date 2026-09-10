#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import b06_perf as B06  # noqa: E402


class B06BoundaryTests(unittest.TestCase):
    def test_runtime_and_compose_project_are_checkout_scoped(self) -> None:
        self.assertEqual(B06.RUNTIME.name, ".fieldops-b06")
        self.assertEqual(B06.PROJECT, f"fieldops-b06-{B06.CHECKOUT_ID}")
        self.assertNotEqual(B06.checkout_fingerprint(ROOT / "clone-a"),
                            B06.checkout_fingerprint(ROOT / "clone-b"))

    def test_candidate_concurrency_is_b06_profile_only_and_bounded(self) -> None:
        gateway = (ROOT / "apps/device-gateway/src/main/resources/application-b06-perf.yml").read_text()
        worker = (ROOT / "apps/fieldops-worker/src/main/resources/application-b06-perf.yml").read_text()
        default_gateway = (ROOT / "apps/device-gateway/src/main/resources/application-local-observe.yml").read_text()
        self.assertIn("worker-threads: 4", gateway)
        self.assertIn("listener-concurrency: 3", worker)
        self.assertNotIn("worker-threads:", default_gateway)

    def test_b02_runtime_accepts_only_the_exact_b06_project_shape(self) -> None:
        with patch.object(B06.b02, "PROJECT", "fieldops-b06-0123456789"), \
                patch.object(B06.b02, "RUNTIME", ROOT / ".fieldops-b06-test"), \
                patch.object(B06.b02, "LOGS", ROOT / ".fieldops-b06-test" / "logs"):
            # The project boundary is accepted before credential creation.
            with patch.object(Path, "mkdir", side_effect=OSError("stop-after-validation")):
                with self.assertRaisesRegex(OSError, "stop-after-validation"):
                    B06.b02.ensure_runtime()

    def test_prometheus_parser_ignores_comments_and_non_numeric_values(self) -> None:
        parsed = B06.parse_prometheus('''
# HELP sample sample
fieldops_gateway_ingest_active 2
fieldops_gateway_ingest_duration_seconds{quantile="0.95"} 0.012
bad NaN-value
''')
        self.assertEqual(parsed["fieldops_gateway_ingest_active"], 2.0)
        self.assertEqual(parsed[
            'fieldops_gateway_ingest_duration_seconds{quantile="0.95"}'], 0.012)
        self.assertNotIn("bad", parsed)

    def test_load_summary_requires_one_complete_record(self) -> None:
        summary = {"sessionId": "safe-session", "offeredEventsPerSecond": 50,
                   "attempted": 100, "published": 100, "publishErrors": 0,
                   "elapsedMs": 2000, "achievedEventsPerSecond": 50.0, "devices": 6}
        parsed = B06.parse_load_summary(B06.SUMMARY_PREFIX + json.dumps(summary))
        self.assertEqual(parsed["published"], 100)
        with self.assertRaisesRegex(B06.B06Error, "expected one"):
            B06.parse_load_summary("")

    def test_consumer_lag_parser_sums_partitions_only_for_group(self) -> None:
        output = '''
GROUP TOPIC PARTITION CURRENT-OFFSET LOG-END-OFFSET LAG CONSUMER-ID HOST CLIENT-ID
fieldops-b02-history topic 0 10 15 5 c h id
fieldops-b02-history topic 1 20 27 7 c h id
other topic 0 1 100 99 c h id
'''
        self.assertEqual(B06.parse_consumer_lag(output, "fieldops-b02-history"), 12)

    def test_histogram_quantile_uses_cumulative_bucket_counts(self) -> None:
        metrics = {"worker": {
            'stage_seconds_bucket{le="0.01"}': 90.0,
            'stage_seconds_bucket{le="0.02"}': 96.0,
            'stage_seconds_bucket{le="+Inf"}': 100.0,
            "stage_seconds_count": 100.0,
        }}
        self.assertEqual(B06.histogram_quantile(metrics, "stage_seconds", 0.95), 0.02)

    def test_sweep_can_record_a_correctness_knee_without_claiming_pass(self) -> None:
        summary = {"sessionId": "safe-session", "offeredEventsPerSecond": 50,
                   "attempted": 100, "published": 100, "publishErrors": 0,
                   "elapsedMs": 2000, "achievedEventsPerSecond": 50.0, "devices": 6}
        with patch.object(B06, "sql_scalar", side_effect=["100", "6", "0"]), \
                patch.object(B06, "redis_value", return_value="another-session"):
            result = B06.verify_session({}, summary, 0, 2, strict=False)
        self.assertFalse(result["passed"])
        self.assertEqual(result["historyCompleteness"], 1.0)

    def test_runtime_maximum_retains_peak_samples(self) -> None:
        maximum = {"gatewayQueueDepth": 4.0}
        B06.merge_runtime_maximum(maximum,
                                  {"gatewayQueueDepth": 2.0, "workerCpu": 0.25})
        B06.merge_runtime_maximum(maximum,
                                  {"gatewayQueueDepth": 8.0, "workerCpu": 0.10})
        self.assertEqual(maximum, {"gatewayQueueDepth": 8.0, "workerCpu": 0.25})

    def test_preflight_never_terminates_an_unowned_port_holder(self) -> None:
        with patch.object(B06.b02, "load_manifest", return_value={}), \
                patch.object(B06, "port_free", side_effect=lambda port: port != B06.PORTS["redis"]), \
                patch.object(B06.b02, "terminate_process") as terminate:
            with self.assertRaisesRegex(B06.B06Error, "ports are occupied"):
                B06.preflight_ports()
        terminate.assert_not_called()

    def test_reset_refuses_running_owned_processes(self) -> None:
        with patch.object(B06.b02, "load_manifest", return_value={
                "processes": {"worker": {"pid": 42, "identity": "stable"}}}), \
                patch.object(B06.b02, "process_alive", return_value=True), \
                patch.object(B06, "owned_benchmark_volumes") as volumes:
            with self.assertRaisesRegex(B06.B06Error, "run down"):
                B06.action_reset(object())
        volumes.assert_not_called()

    def test_volume_inventory_fails_closed_on_wrong_label(self) -> None:
        responses = [B06.PROJECT + "_postgres_data", "another-project"]
        with patch.object(B06.b02, "run", side_effect=responses):
            with self.assertRaisesRegex(B06.B06Error, "exact B06 ownership"):
                B06.owned_benchmark_volumes()

    def test_measurement_reset_refuses_an_unowned_gateway(self) -> None:
        manifest = {"project": B06.PROJECT, "status": "running", "processes": {
            "gateway": {"pid": 42, "identity": "wrong"},
            "worker": {"pid": 43, "identity": "owned"},
        }}
        with patch.object(B06.b02, "load_manifest", return_value=manifest), \
                patch.object(B06.b02, "process_alive", side_effect=[False]), \
                patch.object(B06, "sql_scalar") as sql:
            with self.assertRaisesRegex(B06.B06Error, "ownership of gateway"):
                B06.reset_measurement_state({})
        sql.assert_not_called()

    def test_wait_process_stopped_fails_closed_after_bounded_polling(self) -> None:
        with patch.object(B06.b02, "process_alive", return_value=True), \
                patch.object(B06.time, "monotonic", side_effect=[0.0, 0.0, 2.0, 2.0]), \
                patch.object(B06.time, "sleep"):
            with self.assertRaisesRegex(B06.B06Error, "did not stop"):
                B06.wait_process_stopped({"pid": 42}, timeout=1)

    def test_median_summary_never_cherry_picks_the_best_run(self) -> None:
        runs = []
        for achieved, drain in ((99.0, 9000), (100.0, 7000), (98.0, 8000)):
            runs.append({
                "load": {"achievedEventsPerSecond": achieved},
                "metricCounterDelta": {"gatewayAccepted": 4000},
                "correctness": {"historyCompleteness": 1.0},
                "drainTimeMs": drain,
                "maxLag": {"fieldops-b02-normalizer": 10},
                "observedMax": {"gatewayQueueDepth": 2},
                "metrics": {"historyE2EP95Seconds": 1, "projectionE2EP95Seconds": 2},
            })
        summary = B06.median_summary(runs)
        self.assertEqual(summary["achievedEps"], 99.0)
        self.assertEqual(summary["drainTimeMs"], 8000.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
