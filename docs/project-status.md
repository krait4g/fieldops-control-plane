# 현재 공개 상태

마지막 업데이트: 2026-09-10. 공개 PRD 문서 버전: 0.7.0. 이 문서 버전은 실행 가능한 제품의 Release Tag가 아닙니다.

## 한눈에 보는 현재 상태

| 영역 | 실제 상태 |
|---|---|
| 제품 정의·UX·아키텍처 | Public 문서 공개 |
| v0.1 UI Preview | 구현·검증 완료, 실제 UI Capture Public 공개 완료 |
| v0.2 Local Observe Preview | `VERIFIED_SCOPE: local-observe-preview`, 실제 UI Capture Public 공개 완료 |
| v0.3 Synthetic Camera/PTZ | `VERIFIED_SCOPE: synthetic-camera-preview-ptz`, WebRTC/PTZ 실제 UI Capture 3장 공개 완료 |
| v0.4 Durable Command/Approval | `VERIFIED_SCOPE: durable-command-approval-valve`, 승인 대기·성공 Timeline 실제 UI Capture 2장 공개 완료 |
| v0.5 Measured Performance/Resilience | `VERIFIED_SCOPE: measured-local-performance-resilience`, 반복 측정 summary·복구 evidence 공개 완료 |
| 실제 Remote 인증 | Keycloak Code+PKCE + 서버 Session + Tenant/Site Scope 검증 완료 |
| MQTT/History/Redis/REST/SSE 통합 | Synthetic 데이터로 Local End-to-End 검증 완료 |
| UI | Overview, 장비 목록·상세·차트, 구성원 조회, Desktop/Mobile 구현 완료 |
| 한국어/영어 UI | 한국어 기본 + English 전환 구현·검증, 실제 Remote 화면 공개 완료 |
| Public 실행 소스 | Local Observe + Camera/PTZ + Durable Command 최소 실행 폐쇄와 Quick Start 공개 완료 |
| Public runnable validation | 동일 Public head에서 B06 low-rate smoke, Ubuntu B02/B04/B05와 actual Chromium journey `PASS` |
| 장비 제어 | Synthetic Camera PTZ와 Synthetic Valve 승인형 durable command 검증 완료. alarm·preset은 후속 범위 |
| AI·과금 | 후속 또는 선택 범위 |
| 성능·복구 근거 | 동일 로컬 호스트 반복 측정과 Worker/Redis 복구 evidence 공개. Production capacity나 최대 TPS를 주장하지 않음 |
| Public Release | NOT_RELEASED. Local Preview와 별도 Release Gate 유지 |

임의의 설계 진척률이나 문서 수로 구현 완료를 추정하지 않습니다. README 상단의 실제 캡처는 구현 완료 스크린샷이고, 별도의 Concept 이미지는 후속 제품 방향을 설명하는 자료입니다.

## 현재 검증된 Local Observe Preview

공개 Snapshot에서 다음 흐름을 실제로 실행·검증했습니다.

```text
Synthetic Sensor
  → MQTT QoS1
  → Java Device Gateway
  → Kafka Raw / Normalized
  → PostgreSQL History + Redis Latest State
  → FieldOps Server REST Snapshot / SSE
  → Next.js Console
```

검증한 범위에는 다음이 포함됩니다.

- Keycloak Authorization Code + PKCE 로그인과 서버 소유 Session
- Tenant/Site/Device Scope 권한 검사
- 6개 Synthetic Sensor의 MQTT 수집
- Kafka Raw/Normalized 분리
- PostgreSQL History와 Redis Latest State 분리
- 중복·역순 이벤트 처리
- DB Commit 이후 Kafka ACK
- MQTT bounded retry와 reconnect subscription 복구
- Redis 일시 장애 중 History 지속, PostgreSQL Snapshot + `STALE` fallback, 복구 후 수렴
- Overview / Devices / Device Detail / Members의 실제 Remote REST/SSE 연결
- Desktop/Mobile UI, Error/Stale/Reconnecting, 접근성 회귀
- OpenAPI/AsyncAPI/JSON Schema, Testcontainers, Clean-clone Drill, GitHub Actions

이 결과는 localhost-only Synthetic Portfolio Preview의 검증 범위입니다. Production, 외부 고객 데이터, HA, 무손실 장기 Replay, 모든 Vendor 호환을 주장하지 않습니다.

## 현재 검증된 Synthetic Camera/PTZ Slice

한 대의 Synthetic Camera에서 다음 흐름을 실행·검증했습니다.

```text
FFmpeg H.264 → RTSP → MediaMTX → WebRTC Preview
Browser → REST Lease → Redis Generation Fencing → WebSocket PTZ
       → Device Gateway Final Revalidation → Synthetic ONVIF
```

G1-G10은 scope/permission, 단일-owner lease, generation fencing, monotonic
sequence, latest-wins dispatch, priority stop, server dead-man, device-side finite
timeout, media/control 장애 격리, 기존 Local Observe 회귀를 포함합니다. 실제
Vendor Camera나 Production 안전 인증을 의미하지 않습니다.

## 현재 검증된 Durable Command/Approval Slice

Synthetic Valve 한 대에서 다음 흐름을 실행·검증했습니다.

```text
Request → PENDING_APPROVAL → Approve → APPROVED
        → PostgreSQL FOR UPDATE SKIP LOCKED claim → DISPATCHING
        → Gateway commandId dedup → ACKNOWLEDGED
        → actual valve state proof → SUCCEEDED / FAILED / UNKNOWN
        → append-only transition timeline
```

G1-G10은 tenant/device scope, API idempotency, self-approval 차단, reject 미전송,
concurrent claim 배타성, duplicate delivery dedup, ACK와 성공의 시간적 분리,
REJECT 실패, HANG deadline의 UNKNOWN/no-auto-retry, B02/B04 회귀를 포함합니다.
Kafka는 telemetry 전용으로 유지하며 command transport로 사용하지 않습니다.

## Public 동기화 상태와 다음 단계

Public Repository는 채용 검토 시점에도 현재 작업 상태가 보이도록 작은 단위로 계속 갱신합니다.

1. **현재 구현 상태 공개** — 이 문서와 README에서 Local Observe Preview의 실제 구현 범위를 공개
2. **최종 UI 캡처 공개 — 완료** — 한국어 기본 UI의 Overview / Devices / Device Detail / Members Mobile 실제 Remote Screenshot 공개
3. **Quick Start + 선별 실행 소스 공개 — 완료** — stable process identity fix와 Ubuntu/Windows 동일-head 수용을 거쳐 master에 반영
4. **Synthetic Camera/PTZ 공개 — 완료** — 실행 소스, Quick Start, CI, 실제 화면 3장을 같은 Public head에 반영
5. **Durable Command/Approval 공개 — 완료** — 실행 소스, Quick Start, CI, 실제 화면 2장을 같은 Public head에 반영
6. **Measured Performance/Resilience 공개 — 완료** — 동일 로컬 환경의 반복 측정 summary, 단일 최적화 before/after, Worker/Redis 복구 evidence를 공개
7. **다음 제품 Slice 공개** — TCP/Polling, Alarm 등은 각각 검증된 Vertical Slice 단위로 추가
8. **Public Release/Tag** — Release Gate와 알려진 제한을 분리해 검토한 뒤 수행

Public 동기화를 빠르게 하기 위해 미완성 기능 수를 늘리기보다, 이미 검증된 Slice의 코드·실행 방법·Evidence를 우선 공개합니다.

## v0.1 / v0.2 상태

### v0.1 — UI Preview

상태: **IMPLEMENTED / VERIFIED · 실제 UI Capture Public 공개 완료**

Fixture Login → Overview → 장비 목록·상세·24h Chart → Members 조회와 Normal/Empty/Permission/Error/Partial/Stale/Reconnecting, 필터·URL·키보드·모바일을 검증했습니다.

UI Preview를 Backend 통합 완료로 부르지 않습니다. 이 범위의 검증은 실제 Remote 제품과 별도로 보존합니다.

### v0.2 — Local Observe Preview

상태: **IMPLEMENTED / VERIFIED_SCOPE: local-observe-preview · 실제 UI Capture Public 공개 완료**

실제 Keycloak OIDC와 서버 Session, Synthetic MQTT → Kafka → PostgreSQL/Redis → REST/SSE → 운영 화면을 연결했습니다. 권한 격리, 상태 후퇴 방지, 중복·역순, Redis 장애 fallback 등 첫 제품 Slice의 핵심 실패 경계를 검증했습니다.

공개한 실행 소스와 Quick Start는 localhost-only Synthetic Portfolio Preview 범위입니다. 전체 제품이나 Production Release를 의미하지 않습니다.

### v0.3 — Synthetic Camera Preview + Realtime PTZ

상태: **IMPLEMENTED / VERIFIED_SCOPE: synthetic-camera-preview-ptz · 실제 UI Capture Public 공개 완료**

Synthetic H.264 RTSP → MediaMTX → WebRTC 영상과 Redis lease/generation fencing,
WebSocket PTZ, Gateway 최종 재검증, Synthetic ONVIF `ContinuousMove`/`Stop`,
dead-man과 유한 device timeout을 검증했습니다. 실행 방법은 Camera/PTZ Quick
Start에 공개했습니다.

### v0.4 — Durable Command / Idempotency / Approval

상태: **IMPLEMENTED / VERIFIED_SCOPE: durable-command-approval-valve · 실제 UI Capture Public 공개 완료**

Synthetic Valve OPEN/CLOSE 요청, 요청자와 승인자의 분리, PostgreSQL durable ledger,
`FOR UPDATE SKIP LOCKED` claim, Gateway `commandId` receipt dedup, ACK 이후 실제 상태
확인, FAILED/UNKNOWN 경계를 검증했습니다. UNKNOWN은 자동 재전송하지 않습니다.

### v0.5 — Measured Performance & Resilience

상태: **IMPLEMENTED / VERIFIED_SCOPE: measured-local-performance-resilience · Evidence Public 공개 완료**

6개 Synthetic device를 paced concurrent load로 실행하고 같은 로컬 환경에서 각 anchor를
3회 측정해 median을 정본으로 삼았습니다. Gateway queue saturation과 Normalizer lag를 함께
확인한 뒤 B06 profile의 bounded concurrency만 조정했습니다. 100 EPS drain median은
42.391초에서 5.719초로 줄었고, 250 EPS History completeness는 59.49%에서 100%로
올랐습니다. Worker와 Redis를 각각 약 5초 중단한 별도 drill에서도 History 누락 0,
최종 lag 0, Redis 6/6 수렴을 확인했습니다. 이는 Production capacity나 최대 TPS가 아닙니다.

## Release와 구별

현재 Local Preview는 제품 동작과 포트폴리오 검증을 위한 내부 실행 범위입니다. Public/Release 후보는 별도 Gate를 둡니다.

- Synthetic / localhost-only
- 실제 고객 정보·Credential 비공개
- 컨테이너 이미지 취약점 finding은 Release 검토에서 별도 처리
- 측정하지 않은 성능 수치는 공개하지 않음
- Public Tag/Release/Hosting은 수행하지 않음(`NOT_RUN`)

## 공개 근거

같은 Public source head에서 공개 baseline, Java/Web/계약 build, Ubuntu Local Observe와 Camera 및 Durable Command `up/status/verify/down`, 실제 Chromium의 operator request → approver approval → ACKNOWLEDGED → SUCCEEDED → Timeline을 통과했습니다. MediaMTX exact-digest Trivy scan은 실행과 report identity를 별도로 검증하며, 이를 제품 Release나 전체 image security PASS로 확대하지 않습니다.

[README](../README.md) · [Local Observe Quick Start](LOCAL_OBSERVE_QUICKSTART.md) · [Camera/PTZ Quick Start](CAMERA_PTZ_QUICKSTART.md) · [Durable Command Quick Start](COMMAND_QUICKSTART.md) · [Performance Quick Start](PERFORMANCE_QUICKSTART.md) · [측정 결과](PERFORMANCE_RESILIENCE.md) · [실행 소스 범위](runnable-snapshot.md) · [로드맵](product/ROADMAP.ko.md)
