# Infrastructure

Local development and reproducible verification configuration.

- `compose/`: local stack entry point
- `kafka/`: topic/partition/retention declarations
- `redis/`: ACL, persistence, Lua packaging and fault profile
- `postgres/`: initialization and local tuning
- `mqtt/`: Mosquitto configuration and ACL
- `keycloak/`: realm/client bootstrap
- `observability/`: Prometheus, Grafana, Tempo and Loki

This directory does not claim production-grade availability.
