# FieldOps Control Plane Architecture

## System intent

FieldOps Control Plane normalizes heterogeneous device signals into a common event model, maintains current state independently from history, turns policy violations into alarms and incidents, and executes approved commands through an auditable state machine.

## Logical flow

```text
Device / Simulator
  → MQTT or HTTP Ingestion
  → Kafka Raw Telemetry
  → Canonical Normalization
  ├→ PostgreSQL Telemetry History
  ├→ Redis Latest State and Offline Deadline
  └→ Usage Event

Latest State
  → Rule Evaluation
  → Alarm / Incident
  → Operator or AI Recommendation
  → Policy Validation and Approval
  → Command Ledger
  → Kafka Ordered Dispatch
  → Device ACK / NACK / Timeout
```

## Core and reference profile

FieldOps Core owns common concepts:

- Tenant, Site, Zone
- Device, Capability, Connectivity and Readiness
- Telemetry, Latest State and History
- Rule, Alarm and Incident
- Command, Approval and Attempt
- Usage and Audit

The Smart Farm profile supplies metric and command definitions such as soil moisture, temperature, irrigation pump and valve control. Profile-specific fields do not leak into Core contracts.

## Runtime boundaries

| Runtime | Responsibility |
|---|---|
| `fieldops-api` | Registry/query, SSE, alarm/incident and command/approval HTTP boundary |
| `ingestion-gateway` | Device authentication, MQTT/HTTP protocol adaptation and input validation |
| `telemetry-worker` | Normalization, history persistence, Redis projection and snapshots |
| `automation-worker` | Offline detection, rule/alarm/incident and command timeout workflow |
| `billing-job` | Usage aggregation, preview and reconciliation |
| `simulator` | Deterministic device, duplicate, reordering and failure scenarios |
| `web-console` | Next.js operations interface |

These are code and failure boundaries. They do not imply that every component must be independently deployed from the first milestone.

## Data boundaries

### PostgreSQL

PostgreSQL is the durable system of record for registry data, histories and workflow ledgers. Unique constraints and transactions provide final business idempotency.

### Kafka

Kafka carries durable events, separates consumer failure domains, supports replay and preserves ordering within an aggregate key such as a device.

### Redis

Redis serves a rebuildable, low-latency projection:

- latest state stored in hashes
- atomic freshness comparison through Lua
- offline deadlines in sorted sets
- bounded rule, cooldown and result state

A Redis loss must not erase registry, telemetry history, command or usage records. State is recovered from PostgreSQL snapshots and Kafka replay.

## Consistency model

- Delivery is treated as at-least-once.
- Consumers are idempotent.
- Current state rejects stale session/sequence updates.
- History and state projection use independent Kafka consumer groups.
- API mutations use database transactions and a transactional outbox.
- UI data may be eventually consistent and exposes stale/partial states.

## Command safety

The HTTP request, durable command record, broker delivery and physical device execution are separate events. The system uses:

- `Idempotency-Key`
- durable command and attempt records
- approval and capability policy
- expected state version and deadline
- same-device ordering
- device-side deduplication/fencing where supported
- explicit `UNKNOWN` state for uncertain non-idempotent execution

## AI boundary

AI receives approved read-only context and returns a structured recommendation with evidence references. A server-side policy validator checks tenant, capability, risk and freshness. Commands still use the normal approval and command workflow.

## Web boundary

Next.js owns presentation, browser session, query cache and SSE interaction. Spring Boot remains authoritative for tenant access, rules, command transitions, AI policy and usage calculation.

## Observability

OpenTelemetry context links MQTT/HTTP, Kafka, persistence, Redis, rule and command spans. Metrics avoid unbounded device/event identifiers as labels. Key views cover ingest rate, consumer lag, projection lag, stale rejection, offline delay, alarm suppression, command states and reconciliation.
