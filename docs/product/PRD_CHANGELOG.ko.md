# PRD 변경 이력

## 관리 원칙

현재 유효한 PRD는 [`PRD.ko.md`](PRD.ko.md) 하나입니다. 과거 내용은 Git Commit과 Pull Request에서 확인합니다.

### 버전 규칙

| 변경 | 버전 |
|---|---|
| 문구·명확화·오탈자·비기능 설명 | Patch |
| 사용자·Scope·Journey·Metric·Priority 변경 | Minor |
| Product Thesis·Core Release Goal 변경 | Major |

### PRD 변경 Pull Request 필수 내용

- 변경하려는 사용자 문제
- 근거 또는 관찰
- 변경 전·후
- UX·API·Architecture·일정 영향
- 검증 방법
- 수용한 대가 또는 Rollback

## 0.6.0 — 2026-09-04

### Added

- 한국어 PRD 정본
- Site Operator, Command Approver, Tenant Admin, Integration Developer
- JTBD와 제품 가설
- P0·P1·P2·P3 우선순위
- 사용자·기술·AI 활용 Product Building 지표
- Interactive Prototype·Remote M1·Portfolio Core Release Gate

### Changed

- AI를 활용한 제품 개발 과정을 P0으로 정의
- 제품 내부 AI Recommendation과 Billing은 P3로 이동
- 전체 상세 설계를 끝낸 뒤 일괄 구현하는 방식에서 Vertical Slice별 Prototype·검증·Contract·Build 방식으로 변경
- Concept Image를 구현 완료 화면과 명확히 구분
- 외부 제품·PRD·UX 문서의 기본 언어를 한국어로 전환

## 다음 변경 후보

- 1차 Prototype 사용자 검증 결과
- Overview 정보 계층과 상태 문구
- M2 Camera·PTZ Contract Review
- M3 Alarm·Command 상태와 승인 정책
