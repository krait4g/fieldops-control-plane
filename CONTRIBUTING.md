# Contributing

## Development principles

- Keep PostgreSQL, Kafka and Redis responsibilities distinct.
- Treat event delivery as at-least-once and make consumers idempotent.
- Keep authorization and state transitions in the Spring backend.
- Keep tenant scope in APIs, events, persistence and Redis keys.
- Do not use a Redis lock as the sole safety mechanism for physical commands.
- Update contracts when behavior changes.

## Public repository style

This repository is the curated project view. Detailed experiment notes, batch numbers and acceptance records belong in the private workbench.

For public changes:
- write commit messages around the code change, not the internal milestone;
- use domain names for new public files, profiles, workflows and runtime messages; keep batch labels such as B08/P02 in private tracking only;
- avoid batch labels such as B05/B07 or words such as `publish`, `acceptance`, `canonical evidence` in commit and PR titles;
- keep runtime logs short and useful to someone operating the program;
- add comments only when they explain a non-obvious reason, invariant or failure boundary;
- keep test names specific to behavior rather than project-management gates.

Examples:

```text
Add TCP frame decoder
Handle duplicate command delivery
Fix SSE reconnect after session refresh
```

## Pull requests

Keep a public pull request short: explain why the change exists, what changed, and any important trade-off. Test run IDs and internal checklists stay in the workbench unless they are needed to reproduce a public issue.

## Local setup

See the Quick Start documents linked from the main README.

## Security

Follow [SECURITY.md](SECURITY.md). Do not disclose credentials, private device information or exploitable details in a public issue.
