# UX 설계와 사용자 검증 계획

> 버전: `0.6.0`  
> 상태: `DEFINED`  
> 대상: Desktop-first Operations Console  
> 현재 Prototype: Concept Image  
> 다음 Prototype: Next.js Fixture Mode

## 1. UX 목표

FieldOps UX는 다음 질문에 빠르게 답해야 합니다.

```text
현재 현장은 정상인가?
무엇이 문제인가?
어떤 근거를 확인해야 하는가?
어떤 조치가 진행 중이며 실제 결과는 무엇인가?
```

기술 정보는 문제 조사에 필요할 때만 점진적으로 노출합니다.

## 2. 성공 기준

| 목표 | 기준 |
|---|---:|
| 우선 문제 식별 | Median 10초 이하 |
| Device 근거 도달 | Median 30초 이하 |
| 주요 이동 | 2회 이하 |
| 상태 의미 이해 | 80% 이상 |
| Partial Failure 판단 | 80% 이상 |
| Critical UX Issue | 0개 |

## 3. 사용자 Mental Model

```text
Tenant
  → Site
    → Zone
      → Device
        → State / History / Alarm / Command
```

Protocol과 Infrastructure는 보조 정보입니다.

## 4. 독립적으로 표현할 상태

| 상태 축 | 상태 |
|---|---|
| Realtime | CONNECTING, LIVE, RECONNECTING, DISCONNECTED |
| Device | ONLINE, OFFLINE, DEGRADED, UNKNOWN |
| Freshness | FRESH, STALE, UNKNOWN |
| Readiness | READY, NOT_READY, UNKNOWN |
| Widget | AVAILABLE, EMPTY, STALE, UNAVAILABLE, FORBIDDEN |
| Preview | STARTING, AVAILABLE, DEGRADED, UNAVAILABLE |
| PTZ Authority | AVAILABLE, CONTROLLED_BY_ME, CONTROLLED_BY_OTHER, LEASE_EXPIRING |
| Command | WAITING_APPROVAL, DISPATCHED, ACKNOWLEDGED, SUCCEEDED, FAILED, UNKNOWN |

`SSE LIVE`와 `Device FRESH`, `Preview UNAVAILABLE`과 `Camera OFFLINE`, `ACKNOWLEDGED`와 `SUCCEEDED`를 같은 의미로 사용하지 않습니다.

## 5. Information Architecture

```text
Overview
Sites
Devices
Cameras
Alarms & Incidents
Commands
Administration
  ├─ Members & Access
  ├─ Rules & Policies
  ├─ Platform Health
  └─ Usage
```

M1에서는 `/login`, `/overview`, `/devices`, `/devices/{id}`, `/admin/members`만 활성화합니다. 구현되지 않은 Future Route는 미리 노출하지 않습니다.

## 6. 공통 Layout

```text
┌────────────────────────────────────────────────────────────────┐
│ Product · Tenant · Site · Range     Live · Last updated · User │
├──────────────┬─────────────────────────────────────────────────┤
│ Navigation   │ Breadcrumb · Page title · Primary action        │
│              ├─────────────────────────────────────────────────┤
│              │                  Page Content                   │
└──────────────┴─────────────────────────────────────────────────┘
```

- 좌측 Navigation과 12-column Grid
- KPI 최대 4개
- 화면당 주요 Chart 2~3개 이하
- Tablet에서는 KPI 2×2, Mobile에서는 조회 정보 우선

## 7. Overview

### 목표

10초 안에 현재 Site의 위험과 다음 이동을 결정합니다.

### 정보 우선순위

1. Critical·Stale·Partial Banner
2. Device Status·Freshness
3. Environment Trend
4. Device Health
5. 후속 Operational Widget

```text
┌──────────────────────────────────────────────────────────────┐
│ Site · Last 24h                    LIVE · updated 2s ago      │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Devices      │ Active Alarm │ Commands     │ Data Freshness │
├────────────────────────────────────┬─────────────────────────┤
│ Environment Trend                  │ Current Conditions      │
├────────────────────────────────────┼─────────────────────────┤
│ Active Alarms                      │ Device Health           │
├────────────────────────────────────┼─────────────────────────┤
│ Recent Commands                    │ Primary Camera          │
└────────────────────────────────────┴─────────────────────────┘
```

- Device Status와 Freshness에서 필터된 Device List로 이동
- Device Health Row에서 Detail로 이동
- Site 변경 전에 기존 실시간 연결 종료
- M1에서 Alarm·Command·Camera는 Empty·Unavailable 상태만 표현하며 가짜 성공 데이터를 만들지 않음

## 8. Device List

표시 항목:

- Name·External ID
- Device Type
- Site·Zone
- Protocol
- Connectivity
- Readiness
- Freshness
- Latest Key Metric
- Last Received
- Active Alarm Count

Filter:

- Search, Device Type, Protocol, Connectivity, Readiness, Freshness, Zone

규칙:

- Filter를 URL Query에 반영
- Filter 변경 시 Cursor 초기화
- 전체 Empty와 Filter Empty 구분
- Keyboard로 Row 접근 가능
- Registry 수정 시각을 Last Received로 대체하지 않음

## 9. Device Detail

```text
Header
  Name · Protocol · Connectivity · Readiness · Freshness

Latest Metrics
  Value · Unit · Quality · Observed At

Telemetry Trend
  1h · 6h · 24h · 7d · Gap

Connection Summary
  Last Received · Reconnect · Reason

State Metadata
  Source · Version · Updated At
```

Registry, Latest State, History, Connection Health는 독립 Query와 오류 상태를 가집니다.

Chart 원칙:

- Gap을 선으로 연결하지 않음
- 단위가 다른 Metric을 무리하게 같은 축에 표시하지 않음
- Quality와 Timestamp 표시
- 대용량은 Backend에서 Bucket 처리
- 계약에 없는 Delta를 계산하지 않음

## 10. Members & Access

M1은 Name, Email, Role, Site Scope, Status, Last Login을 Read-only로 제공합니다. 조회 권한이 없으면 메뉴를 숨기며 접근 거절을 Empty List로 바꾸지 않습니다.

## 11. Camera와 제어 UX

- Camera Connectivity, Preview Health, Control Session을 분리
- 제어권 획득 전 PTZ 비활성
- 현재 제어자와 Lease 만료 표시
- Preview 장애와 Camera Offline을 구분
- Heartbeat 실패 시 제어 비활성
- 입력 종료·화면 비활성화 시 Stop
- 재연결 후 이전 이동 입력을 자동 재전송하지 않음

## 12. Alarm·Incident·Command UX

```text
Alarm
  → Device·Trend·Camera 근거
  → Incident Workspace
  → Command Request
  → Approval
  → Dispatch
  → ACK·Reported State
```

| 상태 | 사용자 의미 |
|---|---|
| WAITING_APPROVAL | 아직 실행되지 않음 |
| DISPATCHED | 장비로 전송됨 |
| ACKNOWLEDGED | 장비가 수신 확인 |
| SUCCEEDED | 실제 상태로 성공 확인 |
| FAILED | 실패 확인 |
| TIMED_OUT | 시간 내 결과 없음 |
| UNKNOWN | 실행 여부 불확실 |

`ACKNOWLEDGED`를 최종 성공으로 표시하지 않습니다.

## 13. Realtime UX

```text
IDLE → CONNECTING → LIVE → RECONNECTING → STALE → DISCONNECTED
                                      └→ SNAPSHOT_REQUIRED
```

- 연결 완료 전 LIVE 금지
- Heartbeat는 연결 상태만 갱신
- 낮거나 같은 Version Event 무시
- 다른 Scope의 Event 무시
- Snapshot 재동기화 실패 시 마지막 데이터를 Stale로 유지
- Site 변경·Logout 시 기존 연결 종료

## 14. Loading·Empty·Error·Partial

- Loading은 Layout을 유지하는 Skeleton
- Empty는 원래 데이터 없음, Filter 결과 없음, 후속 기능을 구분
- 오류는 Stable Error Code를 기준으로 Retry·권한·Not Found를 구분
- 한 Widget 오류로 전체 Page를 비우지 않음
- Stale를 0이나 정상값으로 바꾸지 않음

## 15. Prototype과 사용자 검증

| 단계 | 산출물 | 검증 |
|---|---|---|
| Concept | 설명 이미지 | 제품 이해 |
| Clickable Fixture | Next.js·Fixture | Navigation·상태·Task |
| Remote Vertical Slice | 실제 REST·SSE | Contract·실시간 가치 |
| Multi-Protocol | TCP·Polling·Camera | 차별화 |
| Safe Operations | Alarm·Command | 안전한 조치 |

1차 검증은 관제·시설·운영 Dashboard 경험자 2명과 비도메인 사용자 1명의 Proxy User Test로 진행합니다.

주요 과업:

1. 가장 먼저 확인할 문제 찾기
2. 특정 Sensor 상태와 추세 판단
3. 정상 정보와 실패 정보 구분
4. LIVE·STALE·OFFLINE·UNKNOWN 설명
5. Camera 제어권 충돌 대응
6. Command의 실제 성공 여부 판단

결과는 다음 순환으로 Git에 남깁니다.

```text
Observation
  → Root Cause Hypothesis
  → Smallest UX·API Change
  → Prototype Revision
  → Retest
  → Accept / Revert / Defer
```

## 16. Prototype Release Gate

- P0 Route 클릭 가능
- Normal·Empty·Permission·Error·Partial·Stale·Reconnecting
- Production Mock 비활성화
- Proxy User 3명 검증
- Critical Issue 0
- 주요 변경을 PRD·UX·Git에 기록
