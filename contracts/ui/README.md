# M1 Web Console UI Contracts

This directory contains machine-readable UI contracts that complement OpenAPI and AsyncAPI.

| File | Authority |
|---|---|
| `m1-contract-manifest.json` | contract version, status, roots, and change policy |
| `m1-routes.json` | route activation, navigation group, permissions, query parameters, operations, realtime events |
| `m1-permissions.json` | permission catalog and demo role mappings |
| `m1-error-catalog.json` | stable backend error → UI action mapping |
| `m1-copy.en.json` | canonical English M1 interface copy |
| `m1-copy.ko.json` | canonical Korean M1 interface copy; exact key parity with English |
| `m1-query-catalog.json` | TanStack Query keys, cache lifetimes, and realtime update policy |
| `m1-widget-catalog.json` | Overview widget layout, source, states, click behavior, and milestone restrictions |
| `m1-fixture-index.json` | every synthetic fixture and its target schema |

## Authority boundary

These files define frontend behavior but do not grant backend authorization. The authenticated `GET /api/v1/session` response remains the runtime permission authority.

## Change rule

Frozen contract changes use:

```text
branch: contract/m1-ui-<purpose>
commit: contract: <purpose>
```

The schema/catalog, related fixtures, documentation, compatibility note, and validation result change in the same pull request.

Run:

```bash
python scripts/validate_m1_ui_contract.py
```
