# ADR-0017: B06 Local Performance Characterization

- Status: Accepted for B06
- Date: 2026-09-10

## Decision

B06 measures the existing Local Observe pipeline on one explicitly fingerprinted local machine. Canonical throughput and recovery numbers come only from repeated local runs under identical offered load; GitHub Actions runs correctness-only low-rate smoke.

The existing Micrometer registries are exposed through localhost-only Prometheus-compatible Actuator endpoints under the `b06-perf` profile. The harness scrapes those endpoints directly. No Prometheus or Grafana container is added.

The load generator uses the six existing synthetic devices with concurrent, paced QoS1 publication and reports offered, attempted, confirmed-published, error, elapsed, achieved events/s, and bytes. Metrics use only fixed component/stage/result dimensions and never event, device, command, session, or idempotency identifiers as tags.

The isolated runtime is `.fieldops-b06` with a checkout-scoped `fieldops-b06-<fingerprint>` Compose project. Only resources carrying that exact project identity may be reset. Existing B02/B04/B05 resources are outside the ownership boundary.

After baseline and multi-signal diagnosis, B06 may accept exactly one bounded optimization. It must preserve durability, acknowledgment, ordering, correctness, and existing product behavior. An optimization requiring Kafka acknowledgment or durability semantic changes is `B06_OPTIMIZATION_TOO_INVASIVE`.

## Claim boundary

Results characterize a short, six-device, single-machine localhost benchmark. They are not maximum throughput, production capacity, a cloud/multi-node result, a soak test, or an exactly-once claim. Kafka outage, Grafana, autoscaling, HA, and new business features are out of scope.
