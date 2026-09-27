# Modular Monorepo

- 상태: 승인
- 날짜: 2026-09-02

Backend, Frontend, contract, simulator, E2E test를 하나의 저장소에서 관리해 contract 변경을 한 commit 범위에서 검증할 수 있게 합니다. Java module은 Gradle multi-project로, Next.js console은 pnpm workspace로 관리합니다. Runtime과 domain 경계는 `apps/`와 `modules/` 아래에서 명시적으로 유지합니다.
