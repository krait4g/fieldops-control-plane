# 안전한 Command 실행

- 상태: 승인
- 날짜: 2026-09-02

물리 장비 command는 단순 HTTP mutation이 아니라 durable state machine으로 모델링합니다. Idempotency key, DB unique constraint, 승인, deadline, expected state version, 동일 장비 내 ordering, 장비가 지원하는 경우 device-side deduplication을 함께 사용합니다. 멱등하지 않은 명령의 실행 결과가 불확실하면 무작정 retry하지 않고 `UNKNOWN` 상태로 남깁니다.
