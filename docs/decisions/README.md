# Architecture Decisions

| Decision | Summary |
|---|---|
| [Data responsibilities](0001-data-responsibilities.md) | PostgreSQL as system of record, Kafka as event backbone, Redis as rebuildable hot state |
| [Modular monorepo](0002-modular-monorepo.md) | One repository with separate Java and web build graphs |
| [Safe command execution](0003-safe-command-execution.md) | Durable command ledger and explicit uncertainty |
| [Thin web console](0004-thin-web-console.md) | Next.js UI without duplicated domain authority |
