# B06 — Measured Performance & Resilience Evidence

- Baseline source: `de742d5a3288e5d08868509a2542ad8ed1252100`
- Accepted candidate source: `cd22729aa69d4b658d3a2d92b74ee667cbc73174`
- Environment: `Windows 11`, `AMD64`, 22 logical CPUs, ~32 GiB RAM
- Claim boundary: one stated local machine; this is not production capacity or maximum TPS.

## Before / After

Three runs per anchor were measured; medians are canonical. Baseline `R_sustainable` was 100 EPS and the first tested knee candidate was 250 EPS.

- 100 EPS drain reduction: 86.51%
- 250 EPS accepted-event increase: 68.1%
- 250 EPS History completeness: 59.49% → 100.00%
- Candidate correctness: History 100%, final Redis 6/6, processing errors 0, final lag 0.

## Bottleneck and one optimization

Gateway queue saturation and Normalizer lag were both present while CPU utilization and Hikari pending remained low. The one accepted optimization activates the existing bounded Gateway parallelism (2 → 4 core workers) and aligns B06-only Worker listeners to the three Kafka partitions (1 → 3). Default B02/B04/B05 profiles are unchanged.

## Recovery drills

- Worker restart: healthy in 16891 ms including the five-second stop, lag drained in 48187 ms, History missing 0, Redis 6/6.
- Redis outage: healthy in 9594 ms including the five-second stop, History continued, History missing 0, Redis converged 6/6.

## Gate state

G1-G10 PASS. The canonical acceptance run completed fresh B02 Local Observe,
B04 Camera/PTZ G1-G10, and B05 Durable Command G1-G10 regressions. Public CI runs
only correctness and regression gates; it does not manufacture benchmark numbers.

