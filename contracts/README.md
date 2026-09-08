# Contracts

Machine-readable API and event contracts are managed here.

```text
contracts/
├─ openapi/       REST and SSE-supporting HTTP definitions
├─ asyncapi/      Kafka and MQTT channel/event definitions
└─ json-schema/   canonical envelope and payload schemas
```

A contract change and affected producer/consumer implementation must be verified in the same pull request. Generated clients are derived artifacts, not a second source of truth.

`contract-inventory.json` maps the M0 foundation review to the M1 sources and the B02 development telemetry schemas. The additive `event-envelope-v1.schema.json` remains explicitly `DRAFT / NOT_CONSUMED_BY_RUNTIME`; it does not define a new endpoint, topic, event type, or delivery guarantee. B02 runtime messages use the concrete `b02-telemetry-raw.schema.json` and `b02-telemetry-normalized.schema.json` contracts.

Run the standard parsers, reference checks, schema compilation, and inventory checks with `pnpm contract:lint`. Run positive/negative examples and the existing Frozen M1 validators with `pnpm contract:test`.
