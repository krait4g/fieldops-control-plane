# 현재 공개 상태

> 마지막 업데이트: 2026-09-04  
> 공개 문서 기준 버전: Product Design `v0.6`, PRD `0.6.0`

## 상태 요약

| 영역 | 상태 | 설명 |
|---|---|---|
| 제품 문제·사용자·가치 | 공개 | 한국어 PRD로 정리 |
| UX와 사용자 검증 계획 | 공개 | 클릭 가능한 Prototype과 실제 검증은 후속 |
| Architecture | 공개 | 목표 구조와 책임 경계 |
| M1 REST·Realtime 계약 | 설계 완료 | 구현·검증 코드 공개 전 |
| 실행 가능한 통합 제품 | 미공개 | 검증된 마일스톤 단위로 순차 공개 |
| 실제 Screenshot·성능 수치 | 미공개 | Concept Image와 구분 |
| AI Recommendation·Billing | 후순위 | Portfolio Core 완료를 막지 않음 |

## 공개 진척도

```text
제품 정의·PRD
[██████████] 100%

UX 설계
[████████░░] 80% — Interactive Prototype·사용자 검증 전

M1 API·Realtime 계약
[██████████] 100% — 구현 검증 전 설계 계약

실행 가능한 공개 제품
[░░░░░░░░░░] 0% — 검증된 코드 Snapshot 공개 전

P1 장비·Camera·Safe Command
[░░░░░░░░░░] 0% 구현 — 상세 설계 단계

AI Recommendation·Billing
[░░░░░░░░░░] Deferred
```

## 현재 공개되는 것

- 한국어 README
- 제품 비전과 기능 Concept Image
- PRD, UX, 우선순위, Product Building 방식
- Architecture와 Frontend·Backend 경계
- 공개용 Monorepo 구조
- 향후 구현 Roadmap

## 아직 완료로 주장하지 않는 것

- Next.js 실제 Dashboard
- MQTT→Kafka→PostgreSQL/Redis 실제 통합
- SSE Remote Integration
- TCP·Polling·ONVIF·RTSP·PTZ
- Alarm·Incident·Safe Command
- Load·Fault·Recovery Measurement
- 실제 사용자 검증
- AI Recommendation
- Usage·Billing

## 공개 정책

코드는 다음 단계를 통과한 뒤 공개합니다.

```text
설계
  → 구현
  → 자동 Test
  → 재현 Evidence
  → 외부 정보·Secret 검수
  → 독립 Public Commit
```

Concept Image는 제품 방향을 설명하는 자료이며 실제 구현 화면과 혼동하지 않도록 명시합니다.
