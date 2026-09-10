# ADR 0016: B05 durable command dispatch boundary

- Status: Accepted for B05
- Date: 2026-09-10

## Decision

B05 stores each valve OPEN/CLOSE request and every lifecycle transition in PostgreSQL. A worker claims only `APPROVED` rows in a short transaction using `FOR UPDATE SKIP LOCKED`, marks the claimed command `DISPATCHING`, then calls the configured Device Gateway over authenticated loopback HTTP. Kafka remains telemetry-only in this slice.

The externally visible guarantees are deliberately narrower than exactly-once delivery:

- API idempotency is scoped by tenant, requester subject, and `Idempotency-Key`; the server hashes the canonical semantic payload and rejects key reuse with a different payload.
- `FOR UPDATE SKIP LOCKED` provides exclusive concurrent claims.
- the Gateway persists a `commandId` receipt and payload hash before returning its result, so duplicate delivery converges without duplicate valve actuation.
- an acknowledged command remains `ACKNOWLEDGED` until independently observed device state proves success or failure.
- a missed deadline becomes `UNKNOWN`; `UNKNOWN` is terminal and is never automatically redispatched.

Approval is a separate authorization step. The requester cannot approve or reject their own command.

## Why not Kafka or a workflow engine

The B05 goal is the smallest inspectable durable command boundary. PostgreSQL already owns the ledger, approval state, dispatcher claims, and audit order; adding a command topic would introduce a second durability and redelivery boundary without improving this slice's proof. BPMN, multi-step approval, compensation, scheduling, and bulk command orchestration remain out of scope.

## Separation from B04

B04 PTZ commands stay ephemeral, lease-fenced WebSocket traffic and never enter this ledger. B05 has its own profile, tables, endpoints, worker, Gateway receipt, simulator, tests, and UI route.
