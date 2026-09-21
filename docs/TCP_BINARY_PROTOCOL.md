# TCP/Binary Protocol v1

B07 connects one configured localhost synthetic soil device to the existing telemetry pipeline. The synthetic device is the TCP server; Device Gateway is the TCP client. Endpoints are configuration-only and never accepted from browser or public API input.

## Frame

All integers use network byte order.

| Offset | Size | Field |
|---:|---:|---|
| 0 | 2 | Magic `FO` (`46 4f`) |
| 2 | 1 | Version (`01`) |
| 3 | 1 | Type |
| 4 | 2 | Unsigned payload length |
| 6 | 4 | Unsigned sequence |
| 10 | 8 | Logical session start, epoch milliseconds |
| 18 | 8 | Observed time, epoch milliseconds |
| 26 | N | Payload |
| 26+N | 4 | CRC32 |

Fixed overhead is 30 bytes. CRC32 covers Version through Payload, excluding Magic and the CRC field. Maximum B07 payload is 64 bytes.

Device-to-Gateway types are `01 TELEMETRY` and `02 HEARTBEAT`; Gateway-to-device is `81 ACK`. TELEMETRY contains unsigned moisture ×10 and signed Celsius ×10. HEARTBEAT and ACK have empty payloads.

Invalid magic, CRC, length, version, type, direction, timestamp, or buffer bound fails the connection closed. There is no unbounded magic scan or resynchronization.

## Session, retransmission, and ACK

`sessionStartedAt` is the source-session identity; a TCP reconnect does not create a session. Event IDs are `b07:<deviceId>:<sessionStartedAtMillis>:<sequence>`. A reboot creates a new session start and may reset sequence.

Gateway writes ACK only after device/protocol validation and successful Kafka raw broker acknowledgment. It does not promise History commit or exactly-once processing. Disconnect-before-ACK may retransmit the same exact frame; downstream idempotency removes durable duplicates and ordering prevents Latest State regression.

CRC32 detects accidental corruption and provides no authenticity. B07 is localhost-only and has no TLS/mTLS or vendor compatibility claim.
