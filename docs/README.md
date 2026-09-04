# FieldOps 공개 문서

이 디렉터리는 외부 독자가 제품의 문제, 사용자 경험, 아키텍처와 현재 상태를 빠르게 이해할 수 있도록 구성한 공개 문서입니다.

## 제품 문서

- [`product/README.ko.md`](product/README.ko.md) — 제품 문서 읽기 순서와 공개 정책
- [`product/PRD.ko.md`](product/PRD.ko.md) — 고객 문제, JTBD, 가설, 요구사항, 성공 기준
- [`product/UX_DESIGN.ko.md`](product/UX_DESIGN.ko.md) — 정보 구조, 화면, 상태, 사용자 검증
- [`product/ROADMAP.ko.md`](product/ROADMAP.ko.md) — P0~P3 우선순위와 Release Slice
- [`product/AI_PRODUCT_BUILDING.ko.md`](product/AI_PRODUCT_BUILDING.ko.md) — AI를 활용한 제품 개발 방식
- [`product/PRD_CHANGELOG.ko.md`](product/PRD_CHANGELOG.ko.md) — PRD 버전과 변경 이력

## 기술 문서

- [`architecture.md`](architecture.md) — 전체 아키텍처와 데이터 책임
- [`frontend-backend.md`](frontend-backend.md) — Frontend·Backend 경계
- [`roadmap.md`](roadmap.md) — 기술 마일스톤
- [`project-status.md`](project-status.md) — 현재 공개 상태
- [`decisions/README.md`](decisions/README.md) — 주요 Architecture Decision

## 이미지

- [`assets/README.md`](assets/README.md) — Concept Image와 실제 Screenshot 구분 기준

## 언어 원칙

- 외부 설명, PRD, UX, 상태와 로드맵은 **한국어를 기본**으로 작성
- Class, API, Event, Protocol, Library와 코드 식별자는 원문 영문 유지
- 영어가 더 정확한 용어는 한국어 설명과 함께 사용
- 해외 공개가 필요해지면 영어 요약 문서를 추가하되 한국어 정본을 대체하지 않음

## 상태 원칙

```text
DESIGNED
  → IMPLEMENTED
  → VERIFIED
  → MEASURED
  → RELEASED
```

문서와 Concept Image만으로 구현·검증 완료를 주장하지 않습니다.
