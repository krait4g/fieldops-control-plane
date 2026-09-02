# Roadmap

## State model

```text
DESIGNED → IMPLEMENTED → VERIFIED → MEASURED → RELEASED
```

A capability moves forward only when code, automated verification and evidence match the stated level.

## M0 — Foundation

- Java 21 Gradle multi-project
- Next.js App Router workspace
- PostgreSQL, Kafka, Redis, MQTT and Keycloak local stack
- health, build, contract and Testcontainers baseline
- CI and security checks

Gate: a clean clone builds and tests through documented commands.

## M1 — Realtime telemetry

- Tenant/Site/Device registry foundation
- MQTT ingestion and canonical event contract
- Kafka raw/canonical streams
- PostgreSQL history
- Redis latest state, Lua freshness CAS and offline deadline
- REST/SSE and device console

Gate: duplicate and out-of-order data cannot regress current state; Redis loss is recoverable without history loss.

## M2 — Alarm and safe command

- duration/hysteresis/cooldown rules
- alarm and incident workflow
- capability and approval policy
- durable command state machine
- ACK/NACK/timeout/unknown handling

Gate: duplicate requests and broker delivery converge to one command; uncertain execution is not misreported as success.

## M3 — AI-assisted operations

- read-only incident context
- structured recommendation and evidence
- policy validation
- human approval
- provider failure and prompt-injection controls

Gate: core operation works without AI and AI cannot bypass server policy.

## M4 — Usage and billing preview

- usage ledger
- price version
- Spring Batch aggregate
- late adjustment and reconciliation
- usage console

Gate: rerun is deterministic and Redis preview data is not a billing source of truth.

## M5 — Resilience and evidence

- deterministic load profiles
- Redis/Kafka/PostgreSQL fault scenarios
- recovery and reconciliation evidence
- public architecture and runbooks

Gate: published figures contain environment, scenario, commit and reproducible commands.
