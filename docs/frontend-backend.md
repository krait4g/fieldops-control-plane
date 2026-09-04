# Frontend·Backend 경계

## 1. 기본 원칙

Frontend와 Backend는 하나의 Product Repository에서 관리하되 Build Graph와 권위를 분리합니다.

```text
Java / Gradle
  = Backend Runtime과 Module

Next.js / pnpm
  = Web Console

OpenAPI / AsyncAPI / JSON Schema
  = 공통 Contract
```

## 2. Frontend 책임

- App Router와 Navigation
- Tenant·Site Context 표현
- Dashboard와 Chart
- Device·Camera·Alarm·Command 화면
- Query Cache
- Form과 사용자 확인
- Loading·Empty·Permission·Partial·Stale·Reconnecting 상태
- SSE·WebSocket Client
- 접근성
- OpenAPI Generated Type

## 3. Backend 책임

- 인증된 Session과 사용자 Scope
- Tenant·Site·Resource Authorization
- Device Registry와 상태
- Rule·Alarm·Incident State
- Command 상태 전이
- Approval·Safety Validation
- Idempotency
- Event와 Projection
- Audit
- Stable Error Code

## 4. Browser 경계

Browser는 다음에 직접 접근하지 않습니다.

- PostgreSQL
- Kafka
- Redis
- MQTT Broker
- ONVIF·RTSP Credential
- Device 사설망 주소

Browser-facing 요청:

```text
/api/v1/**
/oauth2/**
```

Remote 인증은 Server-owned HttpOnly Session을 사용합니다. Access Token과 Refresh Token을 Browser Storage에 보관하지 않습니다.

## 5. Contract-first 병렬 개발

```text
PRD·UX
  → OpenAPI·AsyncAPI·Fixture
       ├─ Frontend: Fixture Transport로 실제 UI 개발
       └─ Backend: 같은 Contract로 API 구현
  → Remote Integration
```

Fixture는 버릴 Mock Application이 아니라 실제 Product UI의 개발·Test Transport입니다.

```text
Fixture Mode
Page → Query Hook → API Adapter → Fixture Transport

Remote Mode
Page → 동일 Query Hook → 동일 API Adapter → Spring Boot
```

Remote 실패를 Fixture 성공으로 자동 전환하지 않습니다.

## 6. Query Cache

Tenant Query Key에는 `tenantId`, Site Query Key에는 `tenantId + siteId`를 포함합니다.

```text
["overview", tenantId, siteId, range]
["devices", tenantId, siteId, filters, cursor]
["device", tenantId, deviceId]
["device-state", tenantId, deviceId]
["device-series", tenantId, deviceId, range, metrics]
["members", tenantId, filters, cursor]
```

## 7. Realtime

Snapshot은 REST, Incremental Update는 SSE를 사용합니다.

```text
incoming.version <= cached.version
  → 무시

snapshot-required
  → Incremental 적용 중지
  → REST 재조회
  → 성공 후 Resume
```

SSE 연결 상태와 Device Data Freshness를 별도로 관리합니다.

PTZ 제어는 WebSocket을 사용하며 Session·Lease·Fencing·Sequence는 Backend가 검증합니다.

## 8. Error와 Permission

Frontend는 HTTP Status와 Stable `errorCode`를 기준으로 동작합니다.

- 401: 로그인
- 403: Permission State
- 404: Not Found 또는 Scope 보호
- 409: State·Version·Ownership Conflict
- 422: Capability·Readiness·Safety Validation
- 429: Rate Limit
- 503: Dependency Unavailable

Error를 빈 성공 데이터로 변환하지 않습니다.

## 9. 완료 조건

- OpenAPI Type을 수동으로 중복 정의하지 않음
- Fixture와 Remote가 동일 View Model·Component 사용
- Cross-tenant Cache 혼합 없음
- Production Fixture Fallback 없음
- 중요 상태의 Unit·Component·E2E Test
