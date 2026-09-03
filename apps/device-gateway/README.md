# device-gateway

Southbound device and camera integration runtime.

- MQTT 5 sensor sessions
- Netty TCP/Binary protocol adapters
- HTTP/CGI polling adapters
- ONVIF camera metadata, status and PTZ control
- durable command dispatch and device ACK/NACK normalization
- realtime PTZ adapter and connection health

Protocol DTOs remain behind adapters and converge to canonical platform contracts. This runtime does not own product workflows, dashboards, durable histories or final authorization decisions.

RTSP media delivery is a separate media plane and is not transported through Kafka.

Current status: boundary only. Executable bootstrap is M0 scope; protocol behavior begins in M1/M2.
