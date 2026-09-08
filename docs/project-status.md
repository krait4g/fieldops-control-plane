# 현재 공개 상태

마지막 업데이트: 2026-09-08. 공개 PRD 문서 버전: 0.7.0. 이 문서 버전은 실행 가능한 제품의 Release Tag가 아닙니다.

## 한눈에 보는 현재 상태

| 영역 | 실제 상태 |
|---|---|
| 제품 정의·UX·아키텍처 | Public 문서 공개 |
| v0.1 UI Preview | 구현·검증 완료, 실제 UI Capture Public 공개 완료 |
| v0.2 Local Observe Preview | `VERIFIED_SCOPE: local-observe-preview`, 실제 UI Capture Public 공개 완료 |
| 실제 Remote 인증 | Keycloak Code+PKCE + 서버 Session + Tenant/Site Scope 검증 완료 |
| MQTT/History/Redis/REST/SSE 통합 | Synthetic 데이터로 Local End-to-End 검증 완료 |
| UI | Overview, 장비 목록·상세·차트, 구성원 조회, Desktop/Mobile 구현 완료 |
| 한국어/영어 UI | 한국어 기본 + English 전환 구현·검증, 실제 Remote 화면 공개 완료 |
| Public 실행 소스 | Local Observe 최소 실행 폐쇄와 Quick Start Draft PR 후보. master 미공개 |
| Public runnable validation | Ubuntu smoke `FAIL / SOURCE_FIX_REQUIRED`; Windows fresh clone `NOT_RUN` |
| 장비 제어·Camera·AI·과금 | 후속 또는 선택 범위 |
| 성능·사용자 지표 | 미측정 또는 미검증. 성과로 표시하지 않음 |
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

## Public 동기화 상태와 다음 단계

Public Repository는 채용 검토 시점에도 현재 작업 상태가 보이도록 작은 단위로 계속 갱신합니다.

1. **현재 구현 상태 공개** — 이 문서와 README에서 Local Observe Preview의 실제 구현 범위를 공개
2. **최종 UI 캡처 공개 — 완료** — 한국어 기본 UI의 Overview / Devices / Device Detail / Members Mobile 실제 Remote Screenshot 공개
3. **Quick Start + 선별 실행 소스 공개 — BLOCKED** — 후보와 CI는 구성했지만 Ubuntu의 Web process liveness 판정 source fix와 Windows fresh-clone 수용이 남음
4. **다음 제품 Slice 공개** — TCP/Polling, Camera/Control 등은 각각 검증된 Vertical Slice 단위로 추가
5. **Public Release/Tag** — Release Gate와 알려진 제한을 분리해 검토한 뒤 수행

Public 동기화를 빠르게 하기 위해 미완성 기능 수를 늘리기보다, 이미 검증된 Slice의 코드·실행 방법·Evidence를 우선 공개합니다.

## v0.1 / v0.2 상태

### v0.1 — UI Preview

상태: **IMPLEMENTED / VERIFIED · 실제 UI Capture Public 공개 완료**

Fixture Login → Overview → 장비 목록·상세·24h Chart → Members 조회와 Normal/Empty/Permission/Error/Partial/Stale/Reconnecting, 필터·URL·키보드·모바일을 검증했습니다.

UI Preview를 Backend 통합 완료로 부르지 않습니다. 이 범위의 검증은 실제 Remote 제품과 별도로 보존합니다.

### v0.2 — Local Observe Preview

상태: **IMPLEMENTED / VERIFIED_SCOPE: local-observe-preview · 실제 UI Capture Public 공개 완료**

실제 Keycloak OIDC와 서버 Session, Synthetic MQTT → Kafka → PostgreSQL/Redis → REST/SSE → 운영 화면을 연결했습니다. 권한 격리, 상태 후퇴 방지, 중복·역순, Redis 장애 fallback 등 첫 제품 Slice의 핵심 실패 경계를 검증했습니다.

공개 후보의 실행 소스와 Quick Start는 localhost-only Synthetic Portfolio Preview 범위입니다. 아직 master에 병합하지 않았으며 전체 제품이나 Production Release를 의미하지 않습니다.

## Release와 구별

현재 Local Preview는 제품 동작과 포트폴리오 검증을 위한 내부 실행 범위입니다. Public/Release 후보는 별도 Gate를 둡니다.

- Synthetic / localhost-only
- 실제 고객 정보·Credential 비공개
- 컨테이너 이미지 취약점 finding은 Release 검토에서 별도 처리
- 측정하지 않은 성능 수치는 공개하지 않음
- Public Tag/Release/Hosting은 수행하지 않음(`NOT_RUN`)

## 공개 근거

이 Snapshot 후보의 공개 baseline과 Java/Web/계약 build는 통과했습니다. Ubuntu Local Observe smoke는 Linux에서 Next.js process title이 바뀐 뒤 Web process 소유권을 확인하지 못해 `FAIL / SOURCE_FIX_REQUIRED`이며, Windows fresh-clone Browser 여정은 `NOT_RUN`입니다. Build 검사를 실행 제품 검증으로 과장하지 않습니다. Container image vulnerability review는 여전히 Release blocker입니다.

[README](../README.md) · [Quick Start](LOCAL_OBSERVE_QUICKSTART.md) · [실행 소스 범위](runnable-snapshot.md) · [로드맵](product/ROADMAP.ko.md)
