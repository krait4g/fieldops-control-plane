# Roadmap

## State model

```text
DESIGNED → IMPLEMENTED → VERIFIED → MEASURED → RELEASED
```

A capability moves forward only when code, automated verification and evidence match the stated level.

## M0 — Repository foundation

- Java 21 / Gradle multi-project
- Spring Boot runtime skeletons
- Next.js App Router and pnpm workspace
- PostgreSQL, Kafka, Redis, Mosquitto and Keycloak local stack
- optional observability profile
- OpenAPI, AsyncAPI and JSON Schema baseline
- infrastructure smoke tests
- backend, web, contract, security and repository CI

Gate:

- clean clone builds and tests through documented commands
- local platform reports healthy
- no product feature is represented by fake data or placeholder API

## M1 — Demoable realtime product slice

- OIDC login and tenant/site membership seed
- tenant, site and device registry foundation
- MQTT sensor ingestion and canonical telemetry
- Kafka raw/canonical streams
- PostgreSQL telemetry history
- Redis latest state, freshness CAS and offline deadline
- overview, device list/detail, trend and SSE
- member read-only view
- duplicate, reorder, session reset and Redis-loss recovery tests

Gate:

- login → overview → device detail works end to end
- duplicate/out-of-order events cannot regress latest state
- Redis loss does not stop history persistence and state can be rebuilt

## M2 — Multi-protocol and camera

- Netty TCP/Binary adapter
- HTTP/CGI polling adapter
- ONVIF camera metadata, status, capability and PTZ
- browser-compatible RTSP preview path
- camera list/detail UI
- PTZ WebSocket session
- Redis lease, fencing and dead-man stop
- adapter timeout, split-frame, reconnect and partial-failure tests

Gate:

- MQTT, TCP and polling inputs converge to the same product state model
- camera preview failure does not break telemetry/alarm views
- two operators cannot control one camera simultaneously
- stale control token and missing heartbeat are rejected safely

## M3 — Alarm, incident and safe command

- duration, hysteresis, consecutive-count and cooldown rules
- alarm and incident workflow
- pump/valve durable command
- capability, expected-version, deadline and approval policy
- transactional outbox and ordered dispatch
- ACK/NACK/timeout/unknown
- incident workspace and command timeline

Gate:

- no dispatch before required approval
- duplicate API/broker delivery converges to one logical command
- uncertain non-idempotent execution is not reported as success
- alarm storm is bounded under threshold flapping

## M4 — AI-assisted operations

- read-only incident context tools
- structured recommendation and evidence references
- deterministic tenant/capability/risk/freshness validator
- human approval path
- provider timeout/failure
- prompt-injection and cross-tenant negative tests

Gate:

- M1/M2/M3 core operation works without AI
- AI cannot bypass server policy or execute a physical command directly
- recommendation is traceable to current evidence

## M5 — Usage, hardening and public evidence

- usage ledger and daily aggregate
- price/version model and invoice preview
- late adjustment and reconciliation
- platform health dashboard
- deterministic load profiles
- Redis/Kafka/PostgreSQL fault scenarios
- recovery, drain and reconciliation evidence
- runbooks and curated public release

Gate:

- usage rerun is deterministic
- Redis estimate is not used as final billing source
- performance figures include environment, scenario, commit and limitations
- public snapshot passes build, test, secret and internal-context gates

## Scope discipline

M0 completion does not imply M1. A later milestone may start only after the previous milestone's gate and status update are complete.

Future architecture shown in documentation is not an implementation claim.
