# M1 Web Console UI Contract

이 디렉터리는 OpenAPI와 AsyncAPI를 보완하는 기계 판독 가능한 UI contract를 관리합니다.

| 파일 | 역할 |
|---|---|
| `m1-contract-manifest.json` | contract version, status, root, 변경 정책 |
| `m1-routes.json` | route 활성화, navigation group, permission, query parameter, operation, realtime event |
| `m1-permissions.json` | permission catalog와 demo role mapping |
| `m1-error-catalog.json` | 안정적인 backend error → UI action mapping |
| `m1-copy.en.json` | M1 영문 interface copy 정본 |
| `m1-copy.ko.json` | M1 한글 interface copy 정본. 영문과 key가 정확히 일치 |
| `m1-query-catalog.json` | TanStack Query key, cache lifetime, realtime update 정책 |
| `m1-widget-catalog.json` | Overview widget layout, source, state, click 동작, 마일스톤 제한 |
| `m1-fixture-index.json` | 모든 Synthetic fixture와 대상 schema |

## 권한 경계

이 파일들은 Frontend 동작을 정의하지만 Backend 권한을 부여하지 않습니다. 인증된 `GET /api/v1/session` 응답이 runtime 권한의 정본입니다.

## 변경 규칙

Frozen contract 변경은 다음 형식을 사용합니다.

```text
branch: contract/m1-ui-<purpose>
commit: contract: <purpose>
```

Schema/catalog, 관련 fixture, 문서, compatibility note, 검증 결과는 같은 Pull Request에서 함께 변경합니다.

실행:

```bash
python scripts/validate_m1_ui_contract.py
```
