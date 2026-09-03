# Java Modules

`modules/` contains reusable domain, application and infrastructure boundaries.

```text
Domain ← Application ← Infrastructure ← Runtime
```

Domain code cannot depend on Spring Web, Kafka, Redis, JPA, SQL mappers or device clients. Application modules define use cases and ports; infrastructure modules implement those ports. Runtime applications provide wiring.

## Module groups

| Group | Modules |
|---|---|
| Foundation | `common-kernel`, `tenancy`, `registry` |
| Integration | `device-integration`, `camera-control` |
| Telemetry | `telemetry-domain`, `telemetry-application`, `telemetry-infrastructure`, `state-projection` |
| Product query | `dashboard-query` |
| Operations | `rule-engine`, `alarm-incident`, `command-domain`, `command-application` |
| Extensions | `ai-operations`, `usage-billing` |
| Cross-cutting | `audit`, `observability` |

A module name describes responsibility, not an automatic deployment unit. Runtime boundaries are documented under `apps/`.
