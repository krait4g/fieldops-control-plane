# Project Status

Last updated: 2026-09-03

## Current phase

**v0.5 repository and architecture baseline**

The public repository contains the curated monorepo directory contract, product architecture, milestone roadmap, application/module boundaries, build-version baseline and repository verification workflow.

Executable backend and frontend applications, local infrastructure and product capabilities have **not yet been verified**. Future-state diagrams and README sections are design intent, not implementation claims.

## Repository baseline

| Item | State |
|---|---|
| Product and architecture design | DESIGNED |
| FE/BE monorepo boundary | IMPLEMENTED |
| Runtime/module directory boundary | IMPLEMENTED |
| Repository hygiene workflow | IMPLEMENTED; execution status tracked in GitHub Actions |
| Gradle wrapper and clean build | NOT YET VERIFIED |
| Spring Boot runtime skeletons | NOT YET VERIFIED |
| Next.js application skeleton | NOT YET VERIFIED |
| Local PostgreSQL/Kafka/Redis/MQTT/Keycloak | NOT YET VERIFIED |
| Infrastructure smoke tests | NOT YET VERIFIED |
| Public M0 release | NOT RELEASED |

## Capability status

| Capability | Designed | Implemented | Verified | Measured | Released |
|---|:---:|:---:|:---:|:---:|:---:|
| Repository/build foundation | ✓ | partial |  |  |  |
| Frontend/backend contract | ✓ |  |  |  |  |
| Tenant/Site/Device registry | ✓ |  |  |  |  |
| Telemetry ingestion/history | ✓ |  |  |  |  |
| Redis latest state/offline | ✓ |  |  |  |  |
| TCP/Polling/ONVIF integration | ✓ |  |  |  |  |
| Camera preview/PTZ session | ✓ |  |  |  |  |
| Rule/alarm/incident | ✓ |  |  |  |  |
| Safe command workflow | ✓ |  |  |  |  |
| AI-assisted recommendation | ✓ |  |  |  |  |
| Usage/billing preview | ✓ |  |  |  |  |
| Performance/fault evidence | ✓ |  |  |  |  |

## Current runtime names

- `fieldops-server`
- `device-gateway`
- `fieldops-worker`
- `simulator`
- `billing-job`
- `web-console`

Earlier runtime names such as `fieldops-api`, `ingestion-gateway`, `telemetry-worker` and `automation-worker` are superseded by the v0.5 boundary.

## Next release gate

M0 will add and verify:

1. Gradle 9.7.1 wrapper and Java 21 builds
2. Spring Boot runtime skeletons
3. Next.js App Router skeleton
4. local PostgreSQL, Kafka, Redis, MQTT and Keycloak
5. machine-readable contract validation
6. Testcontainers infrastructure smoke
7. backend/web/contract/security CI
8. clean-clone quick start

Status will advance only after the documented commands pass from a clean checkout. Product features begin in M1 and are not part of the current public implementation claim.

## Known scope limits

- This is a portfolio project, not a certified safety-control product.
- Kubernetes and multi-region operation are not current implementation claims.
- AI and usage/billing are later milestones.
- No production device credentials, customer data or operational logs are used.
