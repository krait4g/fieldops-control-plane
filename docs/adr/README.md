# Architecture Decision Records

Accepted ADR의 적용 범위와 시점을 확인한다. 일반 문서·코드보다 우선하지만 Future 결정이 현재 Frozen wire를 조용히 바꾸는 것은 아니다.

| ADR | 상태 | 결정 |
|---|---|---|
| [0001](0001-core-profile-separation.md) | Accepted | Core와 Smart Farm 분리 |
| [0002](0002-modular-monorepo.md) | Accepted | FE/BE Modular Monorepo |
| [0003](0003-data-responsibilities.md) | Accepted | PostgreSQL/Kafka/Redis 책임 |
| [0004](0004-redis-hot-state.md) | Accepted | 재구축 가능한 Redis |
| [0005](0005-command-safety.md) | Accepted | Command 원장과 불확실성 |
| [0006](0006-nextjs-console-boundary.md) | Accepted | Console/Backend 경계 |
| [0007](0007-public-history.md) | Accepted | Private/Public history 분리 |
| [0008](0008-product-first-vertical-slices.md) | Accepted | 사용자 Vertical Slice |
| [0009](0009-integration-data-control-media-planes.md) | Accepted | Integration/Data/Control/Media 분리 |
| [0010](0010-durable-command-and-realtime-control.md) | Accepted | 일반 명령/PTZ 분리 |
| [0011](0011-dashboard-read-model.md) | Accepted | Dashboard Read Model |
| [0012](0012-contract-first-ui-parallel-development.md) | Accepted | Contract-first UI 병렬 개발 |
| [0013](0013-portfolio-first-delivery.md) | Accepted | 작은 완성본, 범위별 Gate, 재개와 점진 공개 |
| [0014](0014-local-preview-container-security-gate.md) | Accepted | Private Local Preview 스캔 실행 무결성과 Public/Release finding 차단 분리 |
| [0015](0015-b04-camera-preview-ptz-boundary.md) | Accepted | Synthetic Camera Preview와 Realtime PTZ 안전 경계 |
| [0016](0016-b05-durable-command-dispatch.md) | Accepted | Durable Command 승인·dispatch·불확실성 경계 |
| [0017](0017-b06-performance-characterization.md) | Accepted for B06 | 단일 로컬 환경의 반복 성능·회복성 특성화 |
| [0018](0018-b07-tcp-binary-framing.md) | Accepted for B07 | bounded TCP framing, logical session, Kafka-accepted ACK 경계 |

새 결정은 [템플릿](0000-template.md)에 문제·선택·Trade-off·검증·철회 조건을 기록한다. 중요한 권한·데이터·배포 의미만 대상으로 하며 사소한 구현 선택마다 ADR을 늘리지 않는다. 구현 완료는 ADR 상태가 아니라 실제 Evidence로 판단한다.
