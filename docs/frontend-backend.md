# Frontend and Backend Contract

FieldOps keeps frontend and backend in one repository so a product milestone can update UI, API, event contracts and tests together. They remain separate build graphs and separate responsibility boundaries.

## Build graphs

```text
Gradle / Java
  → apps/fieldops-server
  → apps/device-gateway
  → apps/fieldops-worker
  → apps/billing-job
  → apps/simulator
  → modules/*

pnpm / Next.js
  → apps/web-console

Shared contracts
  → contracts/openapi
  → contracts/asyncapi
  → contracts/json-schema
```

One runtime does not depend directly on another runtime. The web application does not import Java implementation classes.

## Responsibility

| Concern | Web console | Spring backend |
|---|---|---|
| layout, navigation and accessibility | owns | supports through contracts |
| browser session interaction | owns presentation | owns OIDC/session validation |
| query cache and realtime rendering | owns | owns source, version and authorization |
| business authorization | displays allowed actions | final authority |
| rule and alarm state | displays and requests | final authority |
| command transition and safety | displays/request/approve UI | final authority |
| AI recommendation | displays evidence | validates policy and approval |
| usage calculation | displays | final authority |

A hidden button is not an authorization boundary. Every protected request is checked by the server.

## Browser protocols

- REST: snapshots, search and durable mutations
- SSE: incremental device, alarm, incident and command updates
- WebSocket: realtime PTZ control sessions

The browser does not connect directly to PostgreSQL, Kafka, Redis, device protocols or raw RTSP credentials.

## Query and realtime reconciliation

```text
REST snapshot
  → render
  → connect SSE
  → apply only a higher resource version
  → reconnect with Last-Event-ID
  → reload snapshot when replay is unavailable
```

The UI exposes the data source and freshness. A PostgreSQL snapshot fallback during Redis degradation is not presented as live data.

## Contract workflow

```text
OpenAPI or realtime contract change
  → contract validation
  → backend implementation
  → generated TypeScript types
  → web adapter and UI states
  → contract and end-to-end verification
```

Generated types are derived artifacts. They are not edited as a second source of truth.

## Required UI states

Major screens distinguish:

- loading
- empty
- error
- permission denied
- partial failure
- stale
- reconnecting
- offline
- unknown command result

The project does not use hard-coded successful business data to make an unimplemented feature look complete.

## Current status

This contract is designed. The executable Next.js and Spring application baseline is part of M0 and is not yet claimed as verified.
