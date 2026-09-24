# Roadmap

FieldOps는 기능 수를 늘리기보다 한 경로를 실제로 실행할 수 있는 상태까지 마무리하는 방식으로 개발하고 있습니다.

## 완료

- MQTT 기반 센서 수집과 실시간 상태 조회
- PostgreSQL History / Redis Latest State 분리
- REST snapshot / SSE
- Keycloak 로그인과 Tenant / Site / Device 권한
- RTSP / WebRTC 카메라 미리보기
- WebSocket / ONVIF PTZ 제어
- 승인형 Durable Command
- TCP/Binary telemetry adapter
- 로컬 부하 측정과 Worker / Redis 복구 테스트

## 다음 후보

### Alarm lifecycle

Telemetry 조건을 연속 관측해 Alarm을 열고, 운영자 ACK와 실제 상태 회복을 분리하는 흐름.

### HTTP Polling adapter

Push 방식이 아닌 장비의 timeout, retry, stale state를 다루는 두 번째 수집 방식.

### 복구 범위 확대

Kafka 장기 장애, Redis rebuild, 다중 인스턴스 등 현재 localhost 단일 환경보다 넓은 복구 시나리오.

## 선택 사항

AI recommendation, usage/billing, map, 고가용성은 실제 필요가 생길 때 추가합니다. 현재 포트폴리오의 핵심은 장비 연동, 이벤트 처리, 상태 정합성, 제어와 복구입니다.

[PRD](PRD.ko.md) · [현재 구현 상태](../project-status.md)
