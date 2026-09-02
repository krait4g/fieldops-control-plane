# Data Responsibilities

- Status: Accepted
- Date: 2026-09-02

PostgreSQL stores durable registry, history and workflow ledgers. Kafka provides durable event delivery, replay and same-key ordering. Redis stores rebuildable latest state, deadlines and bounded coordination data.

History persistence and Redis projection use separate consumer groups so a Redis failure does not stop telemetry history. Redis loss is recovered from PostgreSQL snapshots and Kafka replay.
