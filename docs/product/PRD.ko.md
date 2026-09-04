# PRD — FieldOps Control Plane

> 버전: `0.6.0`  
> 상태: `DEFINED`  
> 마지막 업데이트: 2026-09-04  
> 첫 Reference Profile: Smart Farm  
> Portfolio Core: P0 + P1  
> 선택 확장: AI Recommendation·Usage/Billing

## 1. 제품 요약

FieldOps Control Plane은 MQTT·TCP/Binary·HTTP Polling·ONVIF 등 서로 다른 방식으로 연결되는 센서·펌프·밸브·카메라를 하나의 운영 모델로 통합하는 현장 운영 플랫폼입니다.

운영자는 장비 Protocol을 직접 이해하지 않아도 다음 흐름을 하나의 Web Console에서 수행할 수 있어야 합니다.

```text
Connect
  → Observe
  → Understand
  → Decide
  → Approve
  → Control
  → Verify
```

## 2. 배경과 기회

현장 시스템은 장비별 연결 방식과 실패 조건이 다릅니다.

| 장비·연결 | 대표 문제 |
|---|---|
| MQTT Sensor | QoS, Duplicate, Retained Message, Reconnect |
| TCP/Binary Device | Split Frame, Combined Frame, Length, CRC, Idle |
| HTTP Polling Device | Timeout, Jitter, Backoff, Circuit Breaker |
| ONVIF Camera | Capability 차이, PTZ 상태, RTSP Preview |

이 차이가 Product Layer까지 직접 노출되면 Protocol별 Dashboard, Rule, API와 제어 로직이 중복되고 신규 장비 추가 비용이 커집니다.

## 3. 해결할 문제

### 핵심 문제

운영자는 장비·Protocol별 화면을 오가며 현재 상태, 이력, Alarm, Camera와 Command 결과를 다시 조합해야 하므로 문제 발견과 조치가 느려집니다.

### 세부 문제

1. 중복·지연·역순 Event로 Latest State 신뢰가 낮아질 수 있음
2. `LIVE`, `ONLINE`, `FRESH`, `READY`가 같은 상태로 오인될 수 있음
3. 일부 Widget·Redis·SSE·Preview 장애가 정상 정보까지 가릴 수 있음
4. Command 요청·승인·전송·ACK·실제 반영을 하나의 성공으로 오인할 수 있음
5. 신규 Protocol Adapter가 Core Product를 변경시키는 구조가 되기 쉬움

## 4. 대상 사용자

### Site Operator

- Site의 현재 위험을 식별
- 문제 Device의 현재 상태와 추세 확인
- 필요한 조치 요청
- 조치 결과 확인

### Command Approver

- Evidence, Readiness, Deadline, Version 확인
- Command 승인·거절
- 불확실 상태 확인

### Tenant Admin

- Member, Role, Site Scope 확인
- 접근 범위와 권한 관리

### Integration Developer

- 신규 Protocol·Vendor Adapter 추가
- Connection Health와 변환 오류 확인

## 5. Jobs To Be Done

| ID | 사용자 | 상황 | 해야 할 일 | 기대 결과 |
|---|---|---|---|---|
| JTBD-01 | Operator | 업무 시작 | 현재 가장 위험한 Site·Device 식별 | 10초 안에 우선 대상 발견 |
| JTBD-02 | Operator | 이상 발견 | Latest State와 24시간 Trend 확인 | 30초 안에 Evidence 도달 |
| JTBD-03 | Operator | 부분 장애 | 신뢰 가능한 정보와 실패 정보 구분 | 전체 정상·장애 오판 방지 |
| JTBD-04 | Operator | 조치 필요 | 근거·기대 상태를 포함해 Command 요청 | 추적 가능한 요청 생성 |
| JTBD-05 | Approver | 승인 요청 | Evidence·안전조건 검토 | 승인 전 Dispatch 없음 |
| JTBD-06 | Operator | 결과 불명확 | ACK·Reported State·Unknown 확인 | 불확실을 성공으로 오해하지 않음 |
| JTBD-07 | Admin | 접근 검토 | Role·Site Scope 확인 | 권한 과다·누락 식별 |
| JTBD-08 | Developer | 신규 장비 | Protocol Payload를 Canonical Model로 변환 | Core UI·Rule 재사용 |

## 6. 제품 가설

| ID | 가설 | 검증 방법 | 성공 기준 |
|---|---|---|---|
| H-01 | Overview로 우선 문제를 찾을 수 있음 | Task Test | 성공률 80% 이상, Median 10초 이하 |
| H-02 | Device Evidence에 빠르게 도달함 | Navigation Test | Median 30초 이하, 주요 이동 2회 이하 |
| H-03 | Freshness 분리가 상태 오판을 줄임 | 상태 분류 Test | 정확도 80% 이상 |
| H-04 | Partial Failure 표현이 전체 장애 오판을 줄임 | Scenario Test | 성공률 80% 이상 |
| H-05 | Contract-first UI가 통합 재작업을 줄임 | Fixture→Remote | Breaking Contract Drift 0 |
| H-06 | Redis CAS가 중복·역순 상태 후퇴를 방지함 | Fault Test | State Regression 0 |
| H-07 | Command와 PTZ 경로 분리가 제어 위험을 줄임 | ACK·Lease Test | 금지 실행 0 |
| H-08 | AI 활용이 PRD→Prototype Lead Time을 줄임 | Cycle Log | 실제 시간과 수정 이력 기록 |

H-01~H-04는 실제 사용자 검증 전 가설이며 결과가 아닙니다.

## 7. 제품 원칙

1. 현장 판단을 기술 지표보다 먼저 보여줌
2. 연결 상태와 데이터 최신성을 분리함
3. `PARTIAL`, `STALE`, `RECONNECTING`, `UNKNOWN`을 숨기지 않음
4. History와 Latest State의 저장 목적을 분리함
5. 지속 명령과 순간 제어를 분리함
6. Backend가 최종 권한과 상태 전이를 소유함
7. 구현되지 않은 기능을 가짜 성공 데이터로 표현하지 않음
8. 완료 주장은 Test와 Evidence 이후에만 수행함

## 8. 범위와 우선순위

### P0 — 제품 Core

- PRD·JTBD·Hypothesis
- Clickable Prototype
- Proxy User 3명 이상 검증
- Tenant·Site Context
- Overview
- Device List·Detail
- 24시간 Telemetry Chart
- Members Read-only
- MQTT→Kafka→PostgreSQL
- Redis Latest State·Freshness·Offline Deadline
- REST Snapshot + SSE
- Error·Permission·Partial·Stale·Reconnecting
- Build–Measure–Learn Log
- 실제 Screenshot·Demo

### P1 — 기술 차별화

- Netty TCP/Binary
- HTTP Polling
- ONVIF Camera Status
- RTSP Preview
- WebSocket PTZ
- Redis Lease·Fencing·Dead-man Stop
- Rule·Alarm·Incident
- 승인 기반 Durable Command
- Transactional Outbox
- ACK·NACK·TIMED_OUT·UNKNOWN
- Fault Test

### P2 — 품질

- Remote OIDC
- Member Mutation
- OpenTelemetry·Prometheus·Grafana
- Capacity Test
- Runbook
- 실제 Camera 1종 호환 확인
- 2차 사용자 검증
- Public Release Evidence

### P3 — 후순위

- AI-assisted Operations Recommendation
- Usage Metering
- Billing Preview
- Map
- 추가 Protocol

## 9. 비목표

- AI의 무인 자율 제어
- 모든 ONVIF Vendor 완전 호환
- Raw Video의 Kafka 저장
- 장기 영상 보관 VMS
- 상용 Billing·세금·회계
- 초기 Kubernetes·Multi-region
- 모든 관리자 CRUD
- 실제 고객 운영·대규모 Production 주장
- 기술 개수를 늘리기 위한 기능

## 10. 핵심 사용자 여정

```text
1. 로그인
2. Tenant·Site 선택
3. Overview에서 위험과 Freshness 확인
4. Device Detail 이동
5. Latest State 확인
6. 24시간 Trend·Gap 확인
7. Alarm·Camera·Incident Evidence 확인
8. Command 요청
9. 승인
10. Dispatch·ACK·Reported State 확인
11. Recovery와 Audit 확인
```

- M1: 1~6과 Members Read-only
- M2: Camera·PTZ
- M3: Alarm·Incident·Safe Command

## 11. 주요 요구사항

### Session·Scope

- Session은 허용 Tenant·Site·Permission을 반환
- 권한 밖 URL Context에서는 성공 화면을 렌더하지 않음
- Tenant·Site가 포함된 Query Key 사용

### Overview

- Device Status, Freshness, Environment, Health 표시
- Widget별 `AVAILABLE`, `EMPTY`, `STALE`, `UNAVAILABLE`, `FORBIDDEN`
- 한 Widget 실패로 전체 Page 실패 금지
- 후속 기능의 가짜 Alarm·Command·Camera 데이터 금지

### Device·Telemetry

- 검색과 Protocol·Connectivity·Readiness·Freshness Filter
- Registry와 Latest State 독립 조회
- 1h·6h·24h·7d Trend
- Gap과 Quality 표시
- 낮거나 같은 Version Event 적용 금지
- MQTT·TCP·Polling의 Canonical Metric 수렴

### Realtime

- Snapshot은 REST, Incremental은 SSE
- `snapshot-required` 수신 시 재동기화
- 재동기화 실패 시 마지막 Data를 Stale로 유지
- Heartbeat가 Device Data를 갱신하지 않음

### Camera·PTZ

- Connectivity, Preview, Control Session 독립 표현
- Browser에는 단기 Preview URL만 제공
- Owner, Lease, Fencing, Sequence 검증
- Heartbeat 만료·입력 중단 시 Dead-man Stop

### Alarm·Command

- Rule의 Threshold·Duration·Hysteresis·Cooldown
- Alarm·Incident·Timeline
- Idempotency-Key·Expected State Version
- 승인 전 Dispatch 금지
- ACK 불확실 상태를 `UNKNOWN`으로 처리

## 12. 비기능 요구사항

### 신뢰성

- At-least-once + Idempotent Convergence
- Redis Loss가 History·Command·Alarm 원장을 삭제하지 않음
- History와 Projection Consumer 분리
- Blind Retry 금지 대상 명시

### 보안

- OIDC 기반 Server-owned Session
- Browser Token Storage 금지
- Tenant·Site Authorization은 Backend 최종 판정
- Camera·RTSP Credential Browser 노출 금지

### 성능 목표

아래는 실측값이 아니라 초기 Target입니다.

- Overview API p95 < 500ms
- Latest State API p95 < 200ms
- SSE Event→UI p95 < 1초
- 24시간 Chart 응답 < 1초

### 접근성

- Keyboard Navigation
- Focus Visible
- 색상과 Text·Icon 병행
- Chart Summary Table
- WCAG AA 수준 Contrast 목표

## 13. 데이터 책임

```text
PostgreSQL
  = Registry, History, Alarm·Incident·Command·Audit Ledger

Kafka
  = Durable Event Delivery, Replay, Same-key Ordering

Redis
  = Rebuildable Latest State, Deadline, Cooldown, Lease/Fencing
```

## 14. 제품 지표

### 사용자 검증

- 문제 식별 성공률·시간
- Device Evidence 도달 시간
- 상태 의미 이해 정확도
- Partial Failure 판단 정확도
- Command 불확실 상태 이해 정확도

### 기술 지표

- Accepted·Persisted·Projected EPS
- Projection Lag
- Latest State API p95
- SSE UI Latency
- Duplicate Suppression
- Stale Sequence Rejection
- Redis Rebuild Duration
- Command ACK Latency

### AI 활용 Product Building 지표

- Idea→PRD Lead Time
- PRD→Clickable Prototype Lead Time
- Contract Freeze→UI 구현 Lead Time
- Contract Drift 수
- 대규모 재작업 수
- 사용자 피드백→검증된 개선 Lead Time

## 15. Release Gate

### Interactive Prototype

- P0 Route 클릭 가능
- 주요 상태 구현
- Proxy User 3명
- Critical UX Issue 0

### Remote M1

- MQTT→Kafka→PostgreSQL/Redis→REST/SSE→UI
- 중복·역순·Redis Loss Test
- Contract Drift 0
- Remote E2E

### Portfolio Core

- P0 전체 VERIFIED
- P1 Hero Flow VERIFIED
- 실제 Screenshot·Demo
- Public Clean Clone
- Build–Measure–Learn Evidence

AI Recommendation과 Billing은 Portfolio Core Gate가 아닙니다.
