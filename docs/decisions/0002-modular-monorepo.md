# Modular Monorepo

- Status: Accepted
- Date: 2026-09-02

Backend, frontend, contracts, simulator and end-to-end tests live in one repository so a contract change can be verified in one commit. Java modules use Gradle multi-project; the Next.js console uses a pnpm workspace. Runtime and domain boundaries remain explicit under `apps/` and `modules/`.
