# 실행 애플리케이션

`apps/`에는 독립 실행 가능한 제품 runtime을 둡니다. 서비스 수를 늘리기 위한 분리가 아니라 workload, protocol, failure boundary를 기준으로 runtime을 나눕니다.

| 애플리케이션 | 책임 | 초기 배포 메모 |
|---|---|---|
| `fieldops-server` | REST/SSE/WebSocket, OIDC session, 제품 조회와 변경 API | Northbound(외부 API) runtime |
| `device-gateway` | MQTT/TCP/Polling/ONVIF adapter, command dispatch, camera control | Southbound(장비 연동) runtime |
| `fieldops-worker` | 정규화, PostgreSQL 이력, Redis projection, offline/workflow consumer | consumer group과 thread pool을 책임별로 분리 |
| `billing-job` | 사용량 집계, 청구 미리보기, 정산 대사 | 확장 마일스톤 |
| `simulator` | 결정적인 Synthetic 장비와 장애 시나리오 | 프로덕션 runtime classpath에 포함하지 않음 |
| `web-console` | Next.js 운영 콘솔 | 별도 pnpm build graph |

애플리케이션은 승인된 `modules/*`에 의존할 수 있지만, 한 runtime이 다른 runtime을 직접 의존해서는 안 됩니다.

Frontend와 Backend는 버전이 있는 API/이벤트 contract와 마일스톤 acceptance를 함께 관리하기 위해 같은 저장소에 둡니다. 내부 소스 코드나 비즈니스 규칙의 소유권을 공유한다는 의미는 아닙니다.

현재 상태: 디렉터리 및 설계 기준. 실행 가능한 애플리케이션 skeleton은 M0 범위이며 아직 검증 완료로 간주하지 않습니다.
