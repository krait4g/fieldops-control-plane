# simulator

Synthetic MQTT, TCP/Binary, HTTP Polling, ONVIF/RTSP Device와 Fault Scenario를 제공한다. Duplicate, Reorder, Split Frame, Timeout, ACK Loss, Offline, Redis Recovery Demo를 재현한다.

`scripts/b02_observe.py demo --device all --scenario portfolio`는 포트폴리오 캡처 전용의 deterministic synthetic history를 발행한다. 이 모드는 DB/Redis나 Frontend fixture에 직접 쓰지 않으며, 일반 random demo와 동일한 MQTT → Gateway → Kafka → Worker → PostgreSQL/Redis 경로를 통과한다. Production 데이터 생성 의미가 아니다.
