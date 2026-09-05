# 작은 완성본 중심 개발 로드맵

기준: PRD 0.7.0, 2026-09-05. 아래 버전은 계획이며 현재 배포된 제품 Tag가 아닙니다. 기능 하나의 완성을 모든 미래 기능의 검증에 종속시키지 않습니다.

## v0.1 — UI Preview

Fixture Login → Overview → 장비 목록·상세·24h Chart → Members 조회를 실제 최종 UI에서 연결합니다. Normal/Empty/Permission/Error/Partial/Stale/Reconnecting, 필터·URL·키보드·기본 모바일을 확인합니다.

완료 근거는 실제 타입 생성 검사, lint/type/unit·hook, production build와 mock 차단, 핵심 Chromium 여정·실패 복구, 깨끗한 설치·개발 실행과 실제 Capture입니다. Fixture는 synthetic development-only이며 실제 Backend/OIDC/SSE가 연결됐다고 주장하지 않습니다.

Backend, 전체 기반 Infra, Proxy 사용자 3명, 모든 브라우저·화면 크기, 종합 부하 테스트는 이 Preview를 막지 않습니다. 주요 기능 실패·권한 혼동·포커스 잠금·중요 대비 문제는 수정합니다.

## v0.2 — 실제 관측 흐름

```text
Synthetic MQTT → Kafka → PostgreSQL History / Redis Latest State
→ REST Snapshot / SSE → 운영 화면
```

실제 Keycloak OIDC와 서버 측 Tenant/Site 권한을 포함합니다. Context 전달, Snapshot-Stream 인계, 같은 상태 세대의 REST/SSE 병합을 계약과 통합 테스트로 확인합니다. History와 Projection의 실패를 분리하고 중복·역순·Redis 장애·제한된 복구를 검증합니다.

처음에는 단일 SSE Server와 Projector 소유권, 명시적인 유지보수 재구축, 필요한 상태의 주기 정합 조회를 허용합니다. 처리·오류·지연의 기본 지표를 수집하고, 미측정 성능은 쓰지 않습니다. 실행 방법·실제 화면·핵심 테스트를 함께 공개하면 하나의 포트폴리오 완성본입니다.

## v0.3 이후 — 차별화 기능을 작게 추가

TCP/Binary 프레이밍 또는 HTTP Polling 한 종류부터 추가합니다. 분할/합쳐진 패킷 또는 Timeout/중복 Poll 등 해당 Adapter의 실패 조건을 보여줍니다. 모든 Protocol을 동시에 완성할 필요는 없습니다.

Camera는 Preview와 상태부터, 일반 명령은 한 종류의 멱등 Set과 승인·결과 확인부터 추가합니다. 각각 독립적으로 공개할 수 있습니다. PTZ는 단일 Gateway와 지원 장비/Simulator의 제어권·Timeout 조건이 확인된 뒤 별도 증분으로 제공합니다. 범용 엔진이나 모든 Vendor 지원은 만들지 않습니다.

## 이후 개선

실제 실행이나 피드백에서 필요가 확인될 때 관측성·성능·호환성·복구 시간을 개선합니다. AI Recommendation·Usage/Billing·Map·고가용성은 선택 사항입니다. 기존 M1/M2/M3는 내부 기능 묶음이며 각 출시를 한 번에 묶는 Gate가 아닙니다.

## 작업 종료 기준

변경 영역 테스트를 먼저 실행하고 후보가 고정되면 관련 전체 Gate를 실행합니다. 코드가 바뀌면 영향받은 증거를 갱신하되 작은 문구 변경마다 전체 E2E와 모든 Capture를 반복하지 않습니다. 실패 원인 없이 재실행을 반복하거나 테스트를 약화하지 않습니다. 미실행·알려진 제한은 명시합니다.

[PRD](PRD.ko.md) · [현재 상태](../project-status.md)
