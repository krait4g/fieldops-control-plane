# Runtime Applications

`apps/` contains independently executable product runtimes. Runtime separation follows workload and failure boundaries rather than an attempt to maximize the number of services.

| Application | Responsibility |
|---|---|
| `fieldops-api` | Registry/query, REST/SSE, alarm/incident, command/approval API |
| `ingestion-gateway` | MQTT/HTTP device authentication, validation and raw-event publication |
| `telemetry-worker` | Normalization, PostgreSQL history and Redis state projection |
| `automation-worker` | Offline, rule, alarm, incident and command workflow |
| `billing-job` | Usage aggregation, invoice preview and reconciliation |
| `simulator` | Deterministic device and failure scenarios |
| `web-console` | Next.js operations console |

Applications may depend on approved `modules/*`; one runtime must not depend directly on another runtime.
