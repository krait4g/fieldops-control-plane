# M1 UI Contract Fixture

이 디렉터리의 모든 파일은 M1 Web Console 검증을 위한 Synthetic(합성) deterministic 예제입니다.

## 규칙

- Fixture 데이터는 `contracts/openapi/fieldops-m1-ui.yaml` 또는 `contracts/json-schema/m1-sse-event.schema.json`을 만족해야 합니다.
- UI component가 JSON 파일을 직접 import하지 않습니다. MSW handler가 mock transport layer를 통해 fixture를 읽습니다.
- `mock`과 `remote` mode는 동일한 generated type, query hook, view-model mapper, presentational component를 사용합니다.
- Production build에서는 mock mode를 활성화하지 않습니다.
- 실제 회사, 고객, 장비, 네트워크, credential, telemetry 데이터를 넣지 않습니다.
- Contract가 바뀌면 schema, fixture, UI 문서, validation을 같은 `contract:` Pull Request에서 함께 갱신합니다.

## Fixture 구성

| 디렉터리 | 용도 |
|---|---|
| `session/` | 사용자, role, permission, tenant, site context |
| `overview/` | 정상, partial failure, stale, empty dashboard 상태 |
| `devices/` | 목록, 상세, live state, stale snapshot 상태 |
| `telemetry/` | missing-data gap을 포함한 chart series |
| `members/` | 읽기 전용 membership 목록 |
| `errors/` | 안정적인 Problem Details mapping |
| `realtime/` | SSE event, heartbeat, reset, stale-version guard |
