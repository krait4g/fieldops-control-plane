# FieldOps 아키텍처

상태: 목표 설계, 실제 통합 검증 전. 첫 원격 버전은 단일 실행 환경과 제한된 복구를 선택합니다. 이 문서의 설계 선택을 구현 보장으로 읽지 않습니다.

## 1. 핵심 책임

```text
MQTT Sensor → Device Gateway → Kafka
                              ├─ History Writer → PostgreSQL
                              └─ State Projector → Redis
Next.js Console → FieldOps Server → Snapshot / SSE
```

장비 Protocol DTO는 Adapter에서 공통 Device/Metric/State로 변환합니다. TCP/Polling/ONVIF는 이후 한 종류씩 추가합니다. 영상은 RTSP→Media 경로이며 Kafka/Telemetry에 원본을 저장하지 않습니다.

| Runtime | 책임 |
|---|---|
| fieldops-server | REST/SSE, 인증·권한, 후속 제어 API |
| device-gateway | 장비 연결/수집과 지원한 명령 Adapter |
| fieldops-worker | Normalize, History, State, 이후 Workflow |
| simulator | Synthetic 데이터와 실패 재현 |
| web-console | 같은 API 경계를 쓰는 Fixture/Remote 화면 |
| billing-job | 선택 후속, 초기 필수 실행 아님 |

논리 모듈을 모두 개별 Microservice로 배포하지 않습니다. History와 Redis Consumer의 Retry/Thread/Group을 나누되 Kafka·공유 프로세스 장애까지 독립적이라고 과장하지 않습니다.

## 2. 원장·순서·중복

PostgreSQL은 기준정보·영구 이력·업무 원장, Kafka는 내구성 이벤트, Redis는 재구축 가능한 최신 상태입니다. 재전달에도 유지되는 Event ID 또는 검증된 Session+Sequence를 사용하고, History의 Unique와 Projector CAS를 적용합니다. Retained/과거 데이터를 지금의 생존 신호로 오인하지 않습니다.

같은 Key의 순서는 동일 Topic/Partition 안에서 해석합니다. 다른 Topic의 전역 순서나 같은 Consumer Group의 다중 서버 Broadcast를 가정하지 않습니다. 초기 SSE Server는 단일 인스턴스입니다.

## 3. 인증과 Context

실제 원격 버전은 Keycloak OIDC와 서버 소유 Session을 사용합니다. 선택 Tenant를 요청에 명시하고 서버가 Membership·Site·Device를 교차 검증합니다. 공유 Session의 가변 전역 Tenant에 의존해 탭끼리 Context를 바꾸지 않습니다.

Stream 권한은 전달하는 실제 Metric 범위를 덮어야 합니다. 첫 프로파일은 필요한 Read 권한을 모두 가진 Session에만 Stream을 허용하고 연결 중 철회도 처리합니다. 화면에서 숨기는 것으로 서버 검증을 대체하지 않습니다. 정확한 파라미터·필드는 버전이 명시된 Remote 계약에 반영한 후 구현합니다.

## 4. Snapshot과 실시간 상태의 수렴

초기 Snapshot 뒤 Stream을 열 때 생길 수 있는 변경 누락을 연결 후 재조회와 버전 병합으로 확인합니다. 동기화 중 이벤트 버퍼는 제한하고, 초과·실패에는 Stale/Retry로 돌아갑니다. 보조적으로 Visible 화면의 필요한 최신 상태를 주기 재검증합니다. History 차트를 이벤트마다 재조회하지 않습니다.

REST와 SSE 모두 같은 상태 세대의 증가 Revision을 비교합니다. 늦은 REST가 최신 SSE를 덮지 않아야 합니다. Registry Version과 State Revision은 구별하고 재구축 세대는 REST로 재동기화합니다. Sparse Lifecycle은 초기에 상태 전체를 Patch하지 않고 관련 조회 무효화로 처리합니다. Filter 포함·페이지가 바뀌는 이벤트 역시 목록을 재조회합니다.

연결 성공은 데이터 최신성의 보장이 아닙니다. 완전한 무손실 Replay, 분산 Exactly-once, 무조건 1초 반영 같은 SLA는 주장하지 않습니다.

## 5. 발행과 복구

Redis 적용 직후 종료 또는 Kafka 발행 실패를 입력 Offset Commit과 함께 검증합니다. Duplicate라고 미발행 결과를 생략하거나 예외를 로그만 남기고 성공 처리하지 않습니다. 초기 상태 이벤트는 조회 갱신 힌트이며 업무 원장의 유일한 근거가 아닙니다. 업무 이벤트의 내구성은 후속 원장/Outbox 경계에서 별도로 다룹니다.

첫 Redis 복구는 유지보수 모드입니다. 마지막 DB Snapshot을 Stale로 제공하고 Projector 소유권·새 상태 세대·Replay 입력 범위·목표 Offset을 확인해 재구축합니다. 보관 범위가 부족하면 복구 불가를 명시하며 빈 상태를 정상으로 서비스하지 않습니다. Snapshot 최적화와 무중단 교체는 실제 비용이 문제가 될 때 추가합니다.

## 6. 후속 Command와 PTZ

일반 명령은 한 종류의 멱등 Set부터 구현하고 승인·원장·Outbox·중복·Deadline·결과 확인을 검증합니다. 같은 키의 다른 Payload는 충돌입니다. 승인 후 실제 Dispatch 직전에 상태와 권한을 재검증합니다. ACK와 Reported State를 구분하고 불확실한 결과는 UNKNOWN으로 남깁니다.

PTZ는 오래된 입력을 Durable Queue로 Replay하지 않습니다. Owner/Lease/Fencing/Sequence와 최종 Gateway 전송 순서를 확인하며 지연된 과거 Stop도 처리합니다. 지원 장비의 Timeout/Watchdog가 확인되지 않은 환경에 물리적 정지 보장을 주장하지 않습니다. 초기에는 단일 Gateway/Simulator 또는 검증된 장비로 제한합니다.

## 7. 확인할 증거

첫 관측 제품은 MQTT→History/State/UI, Cross-tenant 차단, Snapshot-구독 사이 단발 변경, REST/SSE 역전, 중복, Redis 장애 중 History 지속과 제한된 복구로 검증합니다. 기본 처리·오류·지연 지표를 기록합니다. 고가용성·종합 부하·모든 Vendor 테스트는 첫 완료 조건이 아닙니다.

[Frontend/Backend](frontend-backend.md) · [로드맵](product/ROADMAP.ko.md) · [현재 상태](project-status.md)
