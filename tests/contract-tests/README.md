# Contract 테스트

`pnpm contract:lint`는 표준 OpenAPI/AsyncAPI parser와 JSON Schema 2020-12 validator를 사용합니다. Network에서 schema를 내려받지 않고 local reference를 resolve합니다.

`pnpm contract:test`는 Synthetic 정상/오류 예제를 검사하고, in-memory mutation으로 깨진 reference가 실제로 거부되는지 확인합니다. 또한 public M1 UI contract, locale copy key parity, realtime fixture, schema constraint를 검증합니다. Negative example은 문법적으로 깨진 JSON이 아니라 의미상 유효하지 않도록 의도적으로 구성한 JSON입니다.
