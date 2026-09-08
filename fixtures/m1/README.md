# M1 UI Contract Fixtures

All files in this directory are synthetic, deterministic examples for the M1 Web Console.

## Rules

- Fixture content must conform to `contracts/openapi/fieldops-m1-ui.yaml` or `contracts/json-schema/m1-sse-event.schema.json`.
- UI components do not import JSON files directly. MSW handlers load them through the mock transport layer.
- `mock` and `remote` modes use the same generated types, query hooks, view-model mappers, and presentational components.
- Production builds must not enable mock mode.
- Do not insert real company, customer, device, network, credential, or telemetry data.
- A contract change updates schemas, fixtures, UI documentation, and validation in the same `contract:` pull request.

## Fixture groups

| Directory | Purpose |
|---|---|
| `session/` | user, role, permission, tenant, and site contexts |
| `overview/` | normal, partial-failure, stale, and empty dashboard states |
| `devices/` | list, detail, live state, and stale snapshot states |
| `telemetry/` | chart series including a missing-data gap |
| `members/` | read-only membership lists |
| `errors/` | stable Problem Details mappings |
| `realtime/` | SSE events, heartbeat, reset, and stale-version guard |
