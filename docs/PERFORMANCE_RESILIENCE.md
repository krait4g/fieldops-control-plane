# Measured Performance and Resilience

B06 characterizes the existing Local Observe telemetry pipeline on one stated local
machine. It does not claim production capacity or maximum TPS.

The canonical run used six synthetic devices, a 10-second warmup, a 30-second
measurement window, controlled offered rates, and three repetitions at both selected
anchors. Medians are reported; no best-run selection is used.

## Result

- Baseline sustainable rate: 100 events/s.
- First baseline knee candidate: 250 events/s.
- One accepted optimization: B06-only bounded pipeline concurrency alignment.
- 100 events/s median drain time: 42.391 s → 5.719 s.
- 250 events/s median History completeness: 59.49% → 100%.
- Candidate runs: processing errors 0, final Redis 6/6, final consumer lag 0.

The diagnosis combined two independent signals: Gateway queue saturation at 253/256
and Normalizer lag while CPU utilization and Hikari pending remained low. The accepted
change activates the existing bounded Gateway pool at four core workers and uses three
Worker listeners for three Kafka partitions only under `b06-perf`. Default B02/B04/B05
profiles retain their original concurrency.

## Recovery

At 65 events/s, the owned Worker was stopped for about five seconds and restarted.
It became healthy in 16.891 seconds including the stop, drained lag, preserved all
4,225 History rows, and converged Redis for all six devices.

In a separate run, the B06-owned Redis service was stopped for about five seconds.
History continued, health recovered in 9.594 seconds including the stop, all 4,225
History rows remained present, and Redis converged for all six devices.

Canonical machine-readable evidence is in
[`docs/performance/b06-summary.json`](performance/b06-summary.json).
The charts are generated from the measured JSON rather than manually entered values.
