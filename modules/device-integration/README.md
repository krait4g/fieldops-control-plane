# device-integration

Protocol-neutral contracts for device connectivity and canonicalization.

- protocol profile and adapter capability
- connection session and health
- connection-test result
- canonical source identity
- telemetry and command adapter ports

MQTT, TCP, HTTP polling and ONVIF client types do not cross this module boundary. Concrete protocol clients belong to infrastructure or `device-gateway`.

Current status: design boundary only.
