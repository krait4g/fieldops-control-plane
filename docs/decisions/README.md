# 주요 Architecture Decision

| 결정 | 요약 |
|---|---|
| [데이터 저장소별 책임](0001-data-responsibilities.md) | PostgreSQL은 system of record, Kafka는 event backbone, Redis는 재구축 가능한 hot state |
| [Modular Monorepo](0002-modular-monorepo.md) | Java와 Web build graph를 분리하되 하나의 저장소에서 관리 |
| [안전한 Command 실행](0003-safe-command-execution.md) | Durable command ledger와 명시적인 불확실성 처리 |
| [Thin Web Console](0004-thin-web-console.md) | Domain authority를 중복하지 않는 Next.js UI |
| [Synthetic Camera와 Realtime PTZ](0015-b04-camera-preview-ptz-boundary.md) | WebRTC media, Redis-fenced control session, finite-stop 안전 경계 |
