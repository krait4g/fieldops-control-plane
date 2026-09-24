# 현재 구현 상태

FieldOps는 localhost의 Synthetic 장비를 대상으로 동작하는 포트폴리오 프로젝트입니다. 아래 항목은 현재 `master`에서 직접 실행할 수 있는 범위입니다.

## 구현된 기능

| 영역 | 현재 구현 |
|---|---|
| 센서 수집 | MQTT QoS 1, TCP/Binary |
| 이벤트 처리 | Kafka raw / normalized topic 분리 |
| 상태 저장 | PostgreSQL History, Redis Latest State |
| 조회 | REST snapshot, SSE |
| 카메라 | RTSP → MediaMTX → WebRTC |
| PTZ | WebSocket, Redis lease / generation fencing, ONVIF |
| 일반 명령 | 승인, idempotency, PostgreSQL command ledger, 상태 확인 |
| 인증/권한 | Keycloak OIDC, Tenant / Site / Device scope |
| UI | Overview, 장비 목록/상세, 차트, 구성원, Camera, Command |
| 언어 | 한국어 기본, English 전환 |
| 성능/복구 | 로컬 반복 측정, Worker/Redis 중단 복구 |

TCP/Binary 장비도 MQTT 장비와 같은 telemetry 모델과 Kafka 이후 처리 경로를 사용합니다.

## 실행 방법

- [Local Observe](LOCAL_OBSERVE_QUICKSTART.md)
- [Camera / PTZ](CAMERA_PTZ_QUICKSTART.md)
- [Durable Command](COMMAND_QUICKSTART.md)
- [TCP / Binary](TCP_BINARY_QUICKSTART.md)
- [Performance](PERFORMANCE_QUICKSTART.md)

## 아직 포함하지 않은 것

- HTTP Polling / Modbus 등 추가 장비 프로토콜
- Alarm / Rule lifecycle
- 다중 인스턴스 HA
- Kafka 장기 장애 / 장기 replay
- 실제 Vendor 장비 전체 호환성
- Production 배포와 Public Release

성능 수치는 [동일 로컬 환경에서 측정한 결과](PERFORMANCE_RESILIENCE.md)만 공개합니다.

[README](../README.md) · [Architecture](architecture.md) · [Reviewer Guide](REVIEWER_GUIDE.md)
