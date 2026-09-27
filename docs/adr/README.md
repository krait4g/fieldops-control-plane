# Architecture Decision Record(ADR)

승인된 ADR의 적용 범위와 시점을 확인합니다. ADR은 일반 설명 문서보다 우선하지만, 미래 범위의 결정이 현재 Frozen contract를 암묵적으로 바꾸지는 않습니다.

| ADR | 상태 | 결정 |
|---|---|---|
| [0001](0001-core-profile-separation.md) | 승인 | Core와 Smart Farm 분리 |
| [0002](0002-modular-monorepo.md) | 승인 | FE/BE Modular Monorepo |
| [0003](0003-data-responsibilities.md) | 승인 | PostgreSQL/Kafka/Redis 책임 |
| [0004](0004-redis-hot-state.md) | 승인 | 재구축 가능한 Redis |
| [0005](0005-command-safety.md) | 승인 | Command 원장과 불확실성 |
| [0006](0006-nextjs-console-boundary.md) | 승인 | Console/Backend 경계 |
| [0007](0007-public-history.md) | 승인 | Private/Public history 분리 |
| [0008](0008-product-first-vertical-slices.md) | 승인 | 사용자 Vertical Slice |
| [0009](0009-integration-data-control-media-planes.md) | 승인 | Integration/Data/Control/Media 분리 |
| [0010](0010-durable-command-and-realtime-control.md) | 승인 | 일반 명령/PTZ 분리 |
| [0011](0011-dashboard-read-model.md) | 승인 | Dashboard Read Model |
| [0012](0012-contract-first-ui-parallel-development.md) | 승인 | Contract-first UI 병렬 개발 |
| [0013](0013-portfolio-first-delivery.md) | 승인 | 작은 완성본, 범위별 Gate, 재개와 점진 공개 |
| [0014](0014-local-preview-container-security-gate.md) | 승인 | Private Local Preview 스캔 실행 무결성과 Public/Release finding 차단 분리 |
| [0015](0015-b04-camera-preview-ptz-boundary.md) | 승인 | Synthetic Camera Preview와 Realtime PTZ 안전 경계 |
| [0016](0016-b05-durable-command-dispatch.md) | B05 적용 승인 | Durable Command 승인·dispatch·불확실성 경계 |
| [0017](0017-b06-performance-characterization.md) | B06 적용 승인 | 단일 로컬 환경의 반복 성능·복구 특성화 |
| [0018](0018-b07-tcp-binary-framing.md) | B07 적용 승인 | bounded TCP framing, logical session, Kafka accept 이후 ACK 경계 |

새 결정은 [템플릿](0000-template.md)에 문제, 선택, trade-off, 검증, 철회 조건을 기록합니다. 중요한 권한, 데이터, 배포 의미를 대상으로 하며 사소한 구현 선택마다 ADR을 늘리지 않습니다. 구현 완료 여부는 ADR 상태가 아니라 실제 evidence로 판단합니다.
