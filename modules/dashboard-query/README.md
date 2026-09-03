# dashboard-query

Read models for the operations console.

- tenant/site overview
- device and zone status summaries
- active alarm and recent command projections
- time-series query composition
- partial-failure and source/freshness metadata

This module composes query results for UI purposes but does not mutate domain aggregates or bypass authorization. PostgreSQL history and Redis latest state remain distinct sources and their freshness/source must be exposed to callers.

Current status: design boundary only.
