# fieldops-worker

비동기 이벤트와 workflow를 처리하는 runtime입니다.

- Raw/Canonical 정규화
- PostgreSQL telemetry 이력
- Redis 최신 상태 projection 및 rebuild
- Offline detector
- Rule/alarm workflow
- Command timeout/result 처리

Consumer Group과 Executor를 책임별로 분리합니다.
