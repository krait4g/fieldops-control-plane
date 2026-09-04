# AI를 활용한 Product Building

## 1. 목적

FieldOps의 AI 활용 목표는 제품에 AI 기능을 많이 넣는 것이 아닙니다.

> 고객 문제 정의부터 PRD, UX, Prototype, Frontend, Backend, Test와 학습까지의 Cycle을 빠르게 만들고, 사람이 제품 판단과 품질 기준을 통제하는 개발 방식을 검증합니다.

## 2. Lifecycle

```text
Discover
  → Define
  → Prototype
  → Validate
  → Contract
  → Build
  → Measure
  → Learn
  → Release
```

## 3. AI 활용 영역

| 단계 | AI 활용 | 사람의 책임 |
|---|---|---|
| 문제 구조화 | 사용자·문제·가설 초안 | 실제 중요도와 우선순위 결정 |
| PRD | 요구사항·비목표·지표 초안 | Product Thesis와 Scope 승인 |
| UX | Flow·Wireframe·Concept·UI 구현 보조 | 정보 계층·사용성 검수 |
| Contract | OpenAPI·AsyncAPI·Fixture 초안 | 의미·권한·호환성 확정 |
| Backend | 코드·Test·Infrastructure 구현 보조 | Architecture·Failure Handling 검수 |
| Frontend | 실제 Next.js UI 구현 보조 | Contract·Accessibility·상태 검수 |
| 검증 | Edge Case와 Test 후보 | 실행 결과와 재현 가능성 확인 |
| 학습 | 피드백 요약 | 유지·수정·중단 결정 |

## 4. Human Quality Gate

AI 결과는 빠르다는 이유로 채택하지 않습니다.

- 제품 문제와 연결되는가
- 사용자가 이해할 수 있는가
- 기존 Contract와 일치하는가
- 실패 상태를 숨기지 않는가
- Test와 Evidence가 있는가
- 장기 유지 비용이 합리적인가
- Scope를 불필요하게 넓히지 않는가

## 5. Build–Measure–Learn

각 Cycle은 하나의 가설을 검증합니다.

```text
Hypothesis
  → Smallest Prototype
  → Test
  → Measurement
  → Learning
  → PRD·UX·API·Priority 변경
```

초기 Cycle:

- Overview로 10초 안에 문제를 찾는가
- 30초 안에 Device 근거에 도달하는가
- LIVE와 FRESH를 구분하는가
- Partial Failure에서도 정상 정보를 사용하는가
- Fixture UI가 실제 Backend Contract와 큰 재작업 없이 연결되는가
- 중복·역순 Event가 Latest State를 후퇴시키지 않는가
- ACKNOWLEDGED와 SUCCEEDED를 구분하는가

## 6. 측정 지표

- Idea→PRD Lead Time
- PRD→Clickable Prototype Lead Time
- Contract Freeze→Frontend Lead Time
- Contract Freeze→Remote E2E Lead Time
- Contract Drift 수
- 대규모 재작업 수
- AI 결과 수정·거절 비율
- 사용자 피드백→검증된 개선 Lead Time
- 완료한 Build–Measure–Learn Cycle 수

공수 절감률은 실제 Time Log와 비교 기준이 있을 때만 공개합니다.

## 7. 공개 Evidence

- PRD Version과 변경 이유
- Concept와 실제 Prototype 차이
- 사용자 Task 결과
- 피드백으로 변경한 화면·API
- Contract와 Test
- 구현 Commit과 Pull Request
- 실제 Lead Time
- 실패한 가설과 제거한 기능

개발 도구별 내부 실행 지시와 개인 작업 메모는 공개하지 않습니다.

## 8. 제품 내부 AI 기능

AI-assisted Operations Recommendation은 P3입니다.

- Read-only Context
- Evidence 기반 Recommendation
- Freshness·Tenant·Capability 검증
- Human Approval

P0·P1 Product Core가 검증되기 전에는 구현 우선순위가 아닙니다.
