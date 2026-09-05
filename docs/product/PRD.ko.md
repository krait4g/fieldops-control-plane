# PRD — FieldOps Control Plane

> 버전: `0.7.0`  
> 상태: `DEFINED / IN DEVELOPMENT`  
> 마지막 업데이트: 2026-09-05  
> 첫 Profile: Smart Farm  
> 첫 완성 목표: 실제 관측 흐름, 이후 작은 장비·제어 증분

## 1. 제품과 문제

FieldOps는 서로 다른 센서·장비의 데이터를 공통 모델로 수집하고 상태·이력·조치 결과를 운영 화면에서 확인하기 위한 개인 백엔드 포트폴리오입니다. Protocol별 화면과 업무 로직을 반복해서 만드는 결합, 중복·역순 상태 후퇴, 연결과 최신성의 혼동, 부분 장애가 전체 화면을 가리는 문제, 명령 전달과 수행의 혼동을 다룹니다.

첫 관측 흐름을 실제로 작동하게 만든 뒤 필요한 기능을 추가합니다. 전체 기능·문서·자동화 체계를 먼저 완성하는 것은 목표가 아닙니다.

## 2. 사용자와 핵심 과업

| 사용자 | 과업 |
|---|---|
| Site Operator | 상태 이상 식별, 장비 상세·추세 확인, 신뢰 가능한 정보와 실패 정보 구분 |
| Tenant Admin | 허용 Tenant/Site와 Members 조회, 접근 범위 확인 |
| Command Approver — 후속 | 근거·안전조건을 확인하고 명령 승인 또는 거절 |
| Integration Developer | 새 장비를 Adapter로 연결하고 기존 모델·화면 재사용 |

초기 여정: Login → Tenant/Site → Overview → Device List/Detail → Latest State/Trend → Members 조회. Camera·Alarm·승인·Command·결과 확인은 후속 여정입니다.

## 3. 가설과 학습

문제 식별 Median 10초, 근거 도달 30초, 상태·부분 장애 의미 이해 80%는 사용자 검증용 가설이며 실측값이나 첫 출시의 강제 수치가 아닙니다. 화면을 먼저 만들고 가능한 사용자 피드백을 받아 개선합니다. Proxy 사용자 3명을 확보해야만 UI Preview를 공개할 수 있는 조건은 두지 않습니다.

기술적으로는 Scope 격리, 상태 후퇴 방지, 부분 실패 분리, 재처리 수렴을 핵심 가설로 검증합니다. Contract 변경을 금지해 재작업 0을 만드는 대신 변경을 명시하고 묵시적 불일치를 막습니다. AI 사용량이나 문서 작성 속도는 제품 완료 KPI가 아닙니다.

## 4. 우선순위와 출시 단위

| 우선순위 | 범위 | 공개 계획 |
|---|---|---|
| P0a | Fixture 기반 최종 UI와 핵심 상호작용·실패 상태 | v0.1 UI Preview |
| P0b | MQTT, Kafka, PostgreSQL History, Redis State, REST/SSE, 실제 OIDC/Scope | v0.2 Observe |
| P1 | TCP 또는 Polling 한 종류, Camera Preview, 한 종류의 안전 명령 | 각각 작은 후속 버전 |
| P2 | 추가 관측성·성능·호환성·운영 편의 | 실제 필요·측정에 따라 확장 |
| P3 | AI Recommendation, Usage/Billing, Map, 추가 Protocol | 선택 사항 |

버전은 아직 출시되지 않은 계획입니다. 첫 포트폴리오 결과는 P0b의 작동 흐름과 Engineering Decision으로 판단합니다. P1 전체와 모든 프로토콜이 첫 작품의 필수는 아닙니다. 기존의 P0+P1 일괄 공개 조건을 대체합니다.

Remote OIDC는 실제 원격 제품 P0b의 필수입니다. 자체 인증을 새로 만들거나 production 인증을 우회하는 것으로 시간을 줄이지 않습니다. 기본 처리·오류·지연 지표는 P0b에서 확인하고, 완전한 관측성 플랫폼은 P2로 남깁니다.

## 5. 핵심 요구사항

### Context와 권한

서버가 인증된 Session·Membership·Tenant/Site·Resource 권한을 최종 검증합니다. Tenant 선택은 실제 요청에 전달해야 하며 캐시 키만 바꾸는 것으로 대신하지 않습니다. A/B 동시 탭과 다른 권한을 검증합니다. Stream의 연결 권한뿐 아니라 실제 Payload 권한과 연결 중 철회도 다룹니다. 새 Remote 의미는 버전이 명시된 계약 변경으로 먼저 반영합니다.

### 화면과 조회

Overview의 Device Status/Freshness/Trend/Health, 검색·상태 필터와 Cursor 목록, Device Registry/State/Series, Members read-only를 제공합니다. 미래 Alarm/Command/Camera는 가짜 성공값을 만들지 않습니다. 필터 도구는 재조회 중 유지하며 URL·Back/Forward·키보드 Focus를 함께 처리합니다.

### 상태와 Realtime

Snapshot·표시 가능한 이전 데이터·SSE open을 구분합니다. 같은 상태 세대의 REST/SSE를 공통 버전 규칙으로 병합합니다. 첫 원격 프로파일은 단일 SSE Server와 연결 후 재조회, 필요한 상태의 제한된 주기 정합 조회로 수렴을 검증합니다. 완전 Replay·분산 Broadcast·실시간 SLA를 주장하지 않습니다. Sparse Lifecycle은 첫 버전에서 무효화 신호로 다룹니다.

Snapshot 실패 시 허용된 이전 데이터를 Stale로 유지하고 재시도합니다. 401/403과 권한 철회는 이전 데이터 노출보다 우선합니다. Placeholder를 재동기화 성공으로 간주하지 않습니다.

### 이력과 복구

PostgreSQL은 영구 원장, Kafka는 내구성 이벤트, Redis는 재구축 가능한 최신 상태입니다. History와 Projector 실패 경계를 분리합니다. 첫 복구는 명시적 유지보수 모드이며 입력 보관 범위와 재구축 세대를 검증합니다. 복구 근거가 부족하면 Blocked로 표시하며 빈 상태를 정상으로 초기화하지 않습니다.

### 후속 제어

Camera Preview와 Connectivity, PTZ 권한을 분리합니다. 실제 제어를 제공할 때 최종 Gateway·지원 장비의 Timeout/Fencing 한계를 검증합니다. 일반 Command는 한 종류의 멱등 Set부터 시작하고, 같은 키의 다른 요청·승인 후 상태 변화·Cancel/Dispatch·늦은 ACK를 명확히 처리합니다. 모르면 UNKNOWN이며 Blind Retry하지 않습니다.

## 6. 범위별 검증

| 변경/출시 | 필수 |
|---|---|
| 문서 | 링크·상태·기밀·Concept 표시와 문서 CI |
| UI Preview | 실제 API 생성 검사, lint/type/unit·hook, production build와 mock 차단, 주요 Chromium 여정·복구·Scope·키보드, 대표 desktop/mobile |
| 원격 관측 | 실제 OIDC/Scope, MQTT→History/State/UI, 중복·역순, Redis 장애 중 History, 제한된 복구 |
| 제어 | 권한·승인·중복·Deadline·결과 불확실성·장비 제어권 경계 |

미세 간격·문구 취향·전체 브라우저/Viewport 행렬·종합 부하는 첫 Preview의 조건이 아닙니다. 기존 실패 테스트를 삭제하거나 임의로 통과시키지 않습니다. 기본 지원 범위를 밝히고 이후 넓힙니다. 결과에는 실제 코드와 환경을 연결합니다.

## 7. 비목표와 한계

안전 인증 제품, 고객 Production 운영, 무인 자율 제어, 모든 Vendor 호환, 장기 영상 VMS, 상용 Billing·세금, 초기 Kubernetes·Multi-region·무중단 복구, 범용 Workflow Engine, 모든 관리자 CRUD는 비목표입니다. 사용자/성능 가설과 설계 선택을 검증 완료 성과로 쓰지 않습니다.

## 8. 공개

문서 공개, 개발용 Fixture UI Preview, 실제 원격 제품을 구분합니다. UI Preview는 synthetic data와 제한을 명시하고 production mock 차단을 유지합니다. 실행 가능한 소스·재현 안내·해당 검증·실제 Capture를 버전별로 공개하며, 아직 미공개인 내용을 실행 완료로 표시하지 않습니다.

[로드맵](ROADMAP.ko.md) · [UX](UX_DESIGN.ko.md) · [변경 이력](PRD_CHANGELOG.ko.md) · [현재 공개 상태](../project-status.md)
