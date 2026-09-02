# Contracts

Machine-readable API and event contracts.

```text
contracts/
├─ openapi/       REST and SSE-supporting HTTP definitions
├─ asyncapi/      Kafka and MQTT channel/event definitions
└─ json-schema/   canonical event and payload schemas
```

Contract changes and affected producers/consumers are verified together. Generated clients are derived artifacts.
