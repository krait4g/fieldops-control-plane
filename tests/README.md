# 경계 통합 테스트

- `contract-tests/`: OpenAPI, AsyncAPI, JSON Schema 호환성 검증
- `e2e-tests/`: device → console, command → device workflow 검증
- `performance-tests/`: deterministic load profile 검증
- `fault-tests/`: restart, latency, duplication, reordering, recovery 시나리오 검증

모든 generated scenario는 version, seed, commit SHA를 기록합니다.
