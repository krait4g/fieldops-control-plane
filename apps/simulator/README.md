# simulator

Synthetic MQTT, TCP/Binary, HTTP Polling, ONVIF/RTSP 장비와 장애 시나리오를 제공합니다. Duplicate, Reorder, Split Frame, Timeout, ACK Loss, Offline, Redis Recovery Demo를 재현할 수 있습니다.

`scripts/b02_observe.py demo --device all --scenario portfolio`는 포트폴리오 캡처용 deterministic Synthetic history를 발행합니다. 이 모드는 DB/Redis나 Frontend fixture에 직접 쓰지 않으며, 일반 random demo와 동일한 MQTT → Gateway → Kafka → Worker → PostgreSQL/Redis 경로를 통과합니다. 프로덕션 데이터 생성 용도가 아닙니다.
