# Durable Command Quick Start

This local-only B05 slice demonstrates one synthetic valve command with real Keycloak sessions, approval separation, a PostgreSQL durable ledger, two competing `FOR UPDATE SKIP LOCKED` dispatchers, Gateway delivery deduplication, and a synthetic device outcome.

## Requirements

- Java 21, Node 24, pnpm 11
- Docker with Compose
- Chromium installed for Playwright (`pnpm --filter @fieldops/web-console exec playwright install chromium`)
- localhost ports 3000, 21883, 25432, 26379, 28080–28082, 28085, and 29092–29093 free

## Run

```powershell
pnpm install --frozen-lockfile
py -3 scripts/b05_command.py up
py -3 scripts/b05_command.py status
py -3 scripts/b05_command.py demo
py -3 scripts/b05_command.py verify
py -3 scripts/b05_command.py down
```

On Linux use `python3` instead of `py -3`. Open `http://localhost:3000/commands?tenant=tenant-a&site=site-a`. Generated localhost credentials are stored under ignored `.fieldops-b05/b02/demo-credentials.json`; do not commit or print the password.

Use `b05-operator-a` to request OPEN/CLOSE and `b05-approver-a` to approve or reject. `SUCCESS` acknowledges first and later confirms state; `REJECT` becomes FAILED after dispatch; `HANG` reaches UNKNOWN at the deadline and is not automatically retried.

## Safety boundary

- B04 PTZ is separate and never enters this ledger.
- Kafka is telemetry-only; B05 dispatch is PostgreSQL claim plus authenticated loopback HTTP.
- Idempotency is API convergence, not exactly-once execution.
- `ACKNOWLEDGED` is not success. Only observed valve state can produce `SUCCEEDED`.
- `UNKNOWN` is terminal and requires an explicit later operator decision outside this slice.
- `down` stops only identity-matched B05/B02 processes and the checkout-scoped Compose project. Named volumes and evidence remain.

This is a runnable synthetic portfolio slice, not production release, HA, device certification, or a waiver of S01.
