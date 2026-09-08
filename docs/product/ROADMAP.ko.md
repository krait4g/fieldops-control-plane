# 작은 완성본 중심 개발 로드맵

기준: PRD 0.7.0, 2026-09-08. 아래 버전은 작은 제품 Slice의 상태이며 Public Release Tag와 구분합니다. 기능 하나의 완성을 모든 미래 기능의 검증에 종속시키지 않습니다.

## v0.1 — UI Preview

상태: **IMPLEMENTED / VERIFIED in Private Workbench · Public sync in progress**

Fixture Login → Overview → 장비 목록·상세·24h Chart → Members 조회를 실제 최종 UI에서 연결했습니다. Normal/Empty/Permission/Error/Partial/Stale/Reconnecting, 필터·URL·키보드·기본 모바일을 확인했습니다.

완료 근거는 실제 타입 생성 검사, lint/type/unit·hook, production build와 mock 차단, 핵심 Chromium 여정·실패 복구, 깨끗한 설치·개발 실행과 실제 Capture입니다. Fixture는 synthetic development-only이며 실제 Backend/OIDC/SSE가 연결됐다고 주장하지 않습니다.

Backend, 전체 기반 Infra, Proxy 사용자 3명, 모든 브라우저·화면 크기, 종합 부하 테스트는 이 Preview를 막지 않습니다. 주요 기능 실패·권한 혼동·포커스 잠금·중요 대비 문제는 수정했습니다.

## v0.2 — 실제 관측 흐름

상태: **IMPLEMENTED / VERIFIED_SCOPE: local-observe-preview · Public sync in progress**

```text
Synthetic MQTT → Kafka → PostgreSQL History / Redis Latest State
→ REST Snapshot / SSE → 운영 화면
```

실제 Keycloak OIDC와 서버 측 Tenant/Site 권한을 포함합니다. Context 전달, Snapshot-Stream 인계, 같은 상태 세대의 REST/SSE 병합을 계약과 통합 테스트로 확인했습니다. History와 Projection의 실패를 분리하고 중복·역순·Redis 장애·제한된 복구를 검증했습니다.

첫 구현은 단일 SSE Server와 제한된 복구 범위를 사용합니다. Redis 일시 장애 중에도 History를 지속하고 DB Snapshot + `STALE` fallback 후 복구 수렴을 확인했지만, Full Redis wipe/rebuild·Kafka HA·무손실 장기 Replay를 주장하지 않습니다.

현재 UI는 Overview, 장비 목록·상세·Telemetry Chart, 구성원 조회를 실제 Remote 데이터에 연결했습니다. 한국어 기본 + English 전환과 모바일 Responsive는 최종 포트폴리오 시각 검토 후 Public Capture로 추가합니다.

실행 방법·실제 화면·핵심 테스트를 함께 Public에 동기화하면 하나의 공개 포트폴리오 완성본이 됩니다. 현재는 해당 Snapshot을 단계적으로 준비 중입니다.

## v0.3 이후 — 차별화 기능을 작게 추가

TCP/Binary 프레이밍 또는 HTTP Polling 한 종류부터 추가합니다. 분할/합쳐진 패킷 또는 Timeout/중복 Poll 등 해당 Adapter의 실패 조건을 보여줍니다. 모든 Protocol을 동시에 완성할 필요는 없습니다.

Camera는 Preview와 상태부터, 일반 명령은 한 종류의 멱등 Set과 승인·결과 확인부터 추가합니다. 각각 독립적으로 공개할 수 있습니다. PTZ는 단일 Gateway와 지원 장비/Simulator의 제어권·Timeout 조건이 확인된 뒤 별도 증분으로 제공합니다. 범용 엔진이나 모든 Vendor 지원은 만들지 않습니다.

현재 다음 제품 Slice의 우선순위는 기존 Observe 기반 위에 실제 장비 연동·제어 역량을 드러내는 기능입니다. 다만 이미 검증한 v0.2 Public Snapshot 공개를 늦추지 않습니다.

## 이후 개선

실제 실행이나 피드백에서 필요가 확인될 때 관측성·성능·호환성·복구 시간을 개선합니다. AI Recommendation·Usage/Billing·Map·고가용성은 선택 사항입니다. 기존 M1/M2/M3는 내부 기능 묶음이며 각 출시를 한 번에 묶는 Gate가 아닙니다.

## Public 동기화 순서

1. 구현 현황과 검증 범위를 README/상태 문서에 우선 반영
2. 최종 한국어 Remote Screenshot과 English 전환 화면 공개
3. Clean-clone 검증을 통과한 Quick Start와 선별 실행 소스 공개
4. 후속 Protocol/Camera/Control Vertical Slice를 독립적으로 공개
5. Release Gate 검토 후 Public Tag/Release 결정

채용 검토 시점에 Repository가 실제 작업보다 뒤처져 보이지 않도록, 미완성 기능을 늘리는 대신 검증된 Slice의 공개 상태를 계속 갱신합니다.

## 작업 종료 기준

변경 영역 테스트를 먼저 실행하고 후보가 고정되면 관련 전체 Gate를 실행합니다. 코드가 바뀌면 영향받은 증거를 갱신하되 작은 문구 변경마다 전체 E2E와 모든 Capture를 반복하지 않습니다. 실패 원인 없이 재실행을 반복하거나 테스트를 약화하지 않습니다. 미실행·알려진 제한은 명시합니다.

[PRD](PRD.ko.md) · [현재 상태](../project-status.md)
