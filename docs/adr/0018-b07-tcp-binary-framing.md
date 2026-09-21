# ADR-0018: B07 TCP/Binary Framing and Acknowledgment Boundary

- Status: Accepted for B07
- Date: 2026-09-21

## Decision

B07 adds one localhost-only outbound JDK `Socket` adapter in Device Gateway and one synthetic TCP server. The adapter absorbs wire framing and converges on the existing `RawTelemetry` and `fieldops.telemetry.raw.v1` contract. The existing MQTT gateway, normalizer, history writer, Redis projector, and B06 concurrency profile are not refactored.

Binary v1 uses big-endian `FO` magic, version/type, bounded payload length, unsigned sequence, logical `sessionStartedAt`, `observedAt`, payload, and CRC32. CRC covers Version through Payload and detects corruption; it is not authentication. Invalid magic, version, direction, type, length, timestamp, CRC, or buffer bounds closes the current connection and resets the decoder without byte-scanning resynchronization.

TCP connection identity is not source-session identity. The frame's `sessionStartedAt` identifies a logical boot session. Reconnect retransmission retains the session and sequence; reboot creates a new session and may reset sequence.

The Gateway emits ACK only after configured device/protocol validation, `RawTelemetry` creation, and successful Kafka broker acknowledgment. This ACK means Gateway-to-Kafka raw acceptance, not History commit or global exactly-once delivery. An unacknowledged exact frame may be retransmitted; existing History uniqueness and Latest ordering prevent durable duplicate or state regression.

## Alternatives rejected

- Netty and multi-connection abstraction: unnecessary for one bounded synthetic connection.
- Sharing one codec implementation between simulator and Gateway: could hide a mirrored defect.
- Treating socket reads as frames or scanning indefinitely for magic: unsafe under fragmentation and malformed input.
- Refactoring the B06 measured MQTT path: invalidates existing characterization without necessity.

## Claim boundary

This is one configured localhost synthetic adapter with no TLS, discovery, vendor compatibility, fleet scale, TCP command/control, or production security claim.
