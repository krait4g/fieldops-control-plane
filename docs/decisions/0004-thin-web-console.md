# Thin Web Console

- 상태: 승인
- 날짜: 2026-09-02

Next.js console은 화면 표현, browser session, query cache, SSE interaction을 담당합니다. Tenant authorization, rule, command transition, AI policy, usage 계산은 Spring Boot API에 둡니다. 이를 통해 비즈니스 모델의 정본은 하나로 유지하면서도 운영 화면은 빠르게 반응하도록 구성합니다.
