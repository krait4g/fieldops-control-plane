# ADR-0018: B07 TCP/Binary framing 및 ACK 경계

- 상태: B07 적용 승인
- 날짜: 2026-09-21

## 결정

B07은 Device Gateway에 localhost 전용 outbound JDK `Socket` adapter 한 개와 Synthetic TCP server 한 개를 추가합니다. Adapter가 wire framing을 흡수하고 기존 `RawTelemetry` 및 `fieldops.telemetry.raw.v1` contract로 수렴시킵니다. 기존 MQTT gateway, normalizer, history writer, Redis projector, B06 concurrency profile은 리팩터링하지 않습니다.

Binary v1은 big-endian `FO` magic, version/type, bounded payload length, unsigned sequence, logical `sessionStartedAt`, `observedAt`, payload, CRC32를 사용합니다. CRC는 Version부터 Payload까지 계산해 데이터 손상을 감지하지만 인증 수단은 아닙니다. Magic, version, direction, type, length, timestamp, CRC, buffer bound 검증이 실패하면 현재 연결을 종료하고 byte-scanning resynchronization 없이 decoder를 reset합니다.

TCP connection identity와 source session identity를 구분합니다. Frame의 `sessionStartedAt`이 logical boot session을 식별합니다. Reconnect에 따른 retransmission은 동일한 session과 sequence를 유지하고, reboot 시 새 session을 만들며 sequence를 다시 시작할 수 있습니다.

Gateway는 설정된 device/protocol 검증, `RawTelemetry` 생성, Kafka broker ACK까지 성공한 뒤에만 장비에 ACK를 보냅니다. 이 ACK는 Gateway → Kafka raw 수락을 의미하며 History commit이나 전역 exactly-once delivery를 의미하지 않습니다. ACK를 받지 못한 동일 frame은 재전송될 수 있으며 기존 History uniqueness와 Latest ordering이 영구 중복과 상태 후퇴를 막습니다.

## 검토 후 제외한 대안

- Netty와 multi-connection abstraction: bounded Synthetic 연결 하나에는 불필요합니다.
- Simulator와 Gateway가 동일 codec 구현 공유: 양쪽에 같은 결함이 복제되어 검증에서 놓칠 수 있습니다.
- Socket read를 곧바로 frame으로 취급하거나 Magic을 무기한 scan: fragmentation과 malformed input에서 안전하지 않습니다.
- B06에서 측정한 MQTT 경로 리팩터링: 필요 없이 기존 성능 특성화 기준을 깨뜨립니다.

## 주장 범위

설정된 localhost Synthetic adapter 한 개를 검증한 범위입니다. TLS, discovery, 전체 벤더 호환성, fleet scale, TCP command/control, 프로덕션 보안을 보장하지 않습니다.
