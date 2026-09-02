# Security Policy

## Supported versions

The project is in its initial development phase. Security fixes target the default branch until versioned releases are available.

## Reporting a vulnerability

Do not open a public issue containing credentials, private device details, exploit steps against a live system or sensitive logs. Contact the repository owner through GitHub with a minimal description and coordinate disclosure privately.

Include the affected commit, component, trust boundary, synthetic reproduction, impact, prerequisites and suggested mitigation when available.

## Scope

Important boundaries include tenant isolation, MQTT device identity, API authorization, command approval/idempotency, event schema validation, Redis key scoping, SSE subscription isolation and AI tool-policy validation.

Never use this project with production credentials or safety-critical physical devices without an independent security and operational review.
