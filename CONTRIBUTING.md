# Contributing

## Development principles

- Keep PostgreSQL, Kafka and Redis responsibilities distinct.
- Treat event delivery as at-least-once and make consumers idempotent.
- Keep business authorization and state transitions in the Spring backend.
- Keep the Next.js application focused on presentation, session and API interaction.
- Include tenant scope in APIs, events, persistence and Redis keys.
- Do not use a Redis lock as the sole safety mechanism for physical commands.
- Update machine-readable contracts and architecture documents with behavior changes.

## Pull requests

A pull request should describe its design reference, tests, failure behavior and rollback impact. Avoid mixing unrelated milestones. Do not claim an implementation or measurement level that the included evidence does not support.

## Local setup

Executable setup commands will be published with the M0 foundation. Until then, the repository contains the approved directory and design baseline only.

## Security

Follow [`SECURITY.md`](SECURITY.md). Do not disclose credentials, private device information or exploitable details in a public issue.
