# 제품 문서 안내

이 디렉터리는 FieldOps Control Plane의 공개용 제품 문서를 관리합니다.

## 읽기 순서

1. [`PRD.ko.md`](PRD.ko.md) — 무엇을, 누구를 위해, 왜 만드는가
2. [`UX_DESIGN.ko.md`](UX_DESIGN.ko.md) — 사용자가 어떻게 이해하고 행동하는가
3. [`ROADMAP.ko.md`](ROADMAP.ko.md) — 무엇을 먼저 구현하고 무엇을 미루는가
4. [`AI_PRODUCT_BUILDING.ko.md`](AI_PRODUCT_BUILDING.ko.md) — AI를 제품 개발에 어떻게 활용하는가
5. [`PRD_CHANGELOG.ko.md`](PRD_CHANGELOG.ko.md) — 어떤 제품 결정이 변경됐는가

## 정본

- 현재 유효한 PRD: `PRD.ko.md`
- 현재 유효한 UX: `UX_DESIGN.ko.md`
- 현재 우선순위: `ROADMAP.ko.md`
- 과거 전체 내용: Git Commit과 Pull Request
- 버전별 핵심 변화: `PRD_CHANGELOG.ko.md`

## 변경 원칙

PRD 파일을 버전마다 복제하지 않습니다.

```text
PRD.ko.md
  = 최신 정본

Git
  = 전체 변경 이력

PRD_CHANGELOG.ko.md
  = 버전별 핵심 결정
```

PRD 변경 Pull Request에는 다음을 기록합니다.

- 변경하려는 사용자 문제
- 근거 또는 관찰
- 변경 전·후
- UX·API·데이터·일정 영향
- 검증 방법
- 수용한 대가 또는 Rollback

## 공개 범위

공개:

- 제품 문제·가설·우선순위
- UX 원칙과 검증 방법
- Architecture Decision
- API Contract
- 실제 Test와 Measurement
- Trade-off

비공개:

- 개발 도구별 내부 실행 지시
- 개인 작업 메모
- 실제 Credential·사설망·운영 데이터
- 검증되지 않은 성능 수치
