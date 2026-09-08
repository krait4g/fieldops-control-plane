# Contract Tests

`pnpm contract:lint` uses standard OpenAPI and AsyncAPI parsers plus a JSON Schema 2020-12 validator. It resolves local references without fetching schemas from the network.

`pnpm contract:test` checks synthetic positive and negative examples, proves that broken references are rejected with in-memory mutations, and validates the public M1 UI contract, locale-copy parity, realtime fixtures, and schema constraints. Negative examples are intentionally semantically invalid JSON, not malformed files.
