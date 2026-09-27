# TCP/Binary Protocol v1

B07은 localhost에 설정된 Synthetic soil device 한 대를 기존 telemetry pipeline에 연결합니다. Synthetic 장비가 TCP server이고 Device Gateway가 TCP client입니다. Endpoint는 runtime configuration으로만 설정하며 browser 또는 public API 입력으로 받지 않습니다.

## Frame 구조

모든 정수는 network byte order(big-endian)를 사용합니다.

| Offset | Size | 필드 |
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

고정 overhead는 30 byte입니다. CRC32는 Magic과 CRC field를 제외하고 Version부터 Payload까지 계산합니다. B07의 최대 payload 크기는 64 byte입니다.

Device → Gateway type은 `01 TELEMETRY`와 `02 HEARTBEAT`이고, Gateway → Device type은 `81 ACK`입니다. TELEMETRY payload에는 unsigned moisture ×10과 signed Celsius ×10을 담습니다. HEARTBEAT와 ACK는 payload가 없습니다.

Magic, CRC, length, version, type, direction, timestamp, buffer bound 검증에 실패하면 fail-closed 방식으로 현재 연결을 종료합니다. 무제한 Magic scan이나 resynchronization은 수행하지 않습니다.

## Session, 재전송, ACK

`sessionStartedAt`을 source session identity로 사용하며 TCP reconnect 자체는 새로운 session을 만들지 않습니다. Event ID는 `b07:<deviceId>:<sessionStartedAtMillis>:<sequence>` 형식입니다. 장비 reboot 시 새로운 session start를 만들고 sequence는 다시 시작할 수 있습니다.

Gateway는 설정된 device/protocol 검증과 Kafka raw broker ACK까지 성공한 뒤에만 장비에 ACK를 씁니다. 이 ACK는 History commit이나 exactly-once 처리를 보장하지 않습니다. ACK 전에 연결이 끊기면 장비가 동일한 frame을 재전송할 수 있고, downstream idempotency가 영구 중복을 제거하며 ordering 규칙이 Latest State의 후퇴를 막습니다.

CRC32는 우발적인 데이터 손상을 탐지하기 위한 것이며 인증 기능이 아닙니다. B07은 localhost 전용이고 TLS/mTLS 또는 벤더 호환성을 주장하지 않습니다.
