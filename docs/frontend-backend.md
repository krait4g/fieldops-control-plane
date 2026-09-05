# Frontend·Backend 경계

설계 상태이며 실제 Remote 통합 완료를 의미하지 않습니다. 공개 예시는 활성 OpenAPI의 대체 명세가 아닙니다.

## 책임

Java/Gradle과 Next.js/pnpm은 같은 Repository에서 독립 Build Graph로 관리합니다. Backend는 인증·Tenant/Site·Device 권한, 상태·Command·Audit를 소유하고 Frontend는 화면·입력·조회 Cache·오류 표현을 담당합니다. OpenAPI 생성 타입을 수동 복제하지 않습니다.

Browser는 PostgreSQL/Kafka/Redis/MQTT/장비 자격증명에 직접 접근하지 않습니다. REST/SSE는 same-origin API 경계, 실제 OIDC는 서버 소유 HttpOnly Session을 사용합니다. Access/Refresh Token을 Browser Storage에 두지 않습니다. 인증 Entry/Callback/Logout의 정확한 경로는 원격 계약에서 함께 고정합니다.

## Fixture에서 Remote로

같은 Page → Query Hook → API Adapter → Mapper/View를 쓰고 Transport만 바꿉니다. Remote 실패를 Fixture 성공으로 대체하지 않으며 production mock 차단을 유지합니다. 개발용 UI Preview 공개는 실제 Backend 제품 공개와 다릅니다.

## Context와 Cache

Tenant/Site는 Query Key뿐 아니라 실제 요청에도 전달·검증되어야 합니다. A/B 탭은 서로의 전역 Session Context를 바꾸지 않습니다. Query Key의 구체적 배열은 활성 query catalog가 정본이며 설명 문서에 별도 배열을 복제하지 않습니다.

같은 Scope의 이전 데이터는 표시 보조로 유지할 수 있지만 Placeholder를 Snapshot 성공으로 보지 않습니다. Scope 전환·401/403·권한 철회에는 이전 데이터가 노출되지 않아야 합니다. HTTP 오류는 `status`와 안정적인 `code`로 처리하고 `detail` 문자열을 파싱하지 않습니다.

## Realtime

연결 전후 Snapshot 인계, 제한된 버퍼, 동일 세대의 REST/SSE 버전 병합을 검증합니다. Native EventSource open만으로 최신 데이터 확보를 선언하지 않습니다. 초기 Lifecycle은 무효화 신호로 처리합니다. 실패 복구는 Stale/Retry이며 빈 성공으로 바꾸지 않습니다.

SSE의 실제 Payload를 읽을 권한과 열린 연결의 철회를 Backend가 검증합니다. 필터가 있는 목록은 이벤트에 따라 포함·페이지·total이 바뀌므로 안전한 범위를 넘는 Row Patch는 재조회로 대신합니다.

## 검증 범위

UI Preview: 주요 Chromium 여정, Snapshot/실패/Scope/권한, Filter/Keyboard/Drawer, 타입·빌드·실제 API 생성 검사. 원격 제품: 같은 UI의 실제 인증·MQTT·REST/SSE 통합을 추가합니다. 전체 브라우저 행렬과 심화 부하는 후속이며 기존 핵심 실패를 삭제하거나 숨기지 않습니다.

[PRD](product/PRD.ko.md) · [아키텍처](architecture.md)
