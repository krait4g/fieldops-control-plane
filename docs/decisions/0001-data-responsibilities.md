# 데이터 저장소별 책임

- 상태: 승인
- 날짜: 2026-09-02

PostgreSQL은 영구 보존이 필요한 registry, history, workflow ledger를 저장합니다. Kafka는 durable event 전달, replay, 동일 key 내 ordering을 담당합니다. Redis는 재구축 가능한 최신 상태, deadline, 상한이 있는 coordination data만 저장합니다.

History 저장과 Redis projection은 서로 다른 consumer group을 사용해 Redis 장애가 telemetry history 저장을 막지 않도록 합니다. Redis 데이터 유실 시 PostgreSQL snapshot과 Kafka replay를 사용해 복구합니다.
