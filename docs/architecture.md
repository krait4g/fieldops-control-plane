# FieldOps 아키텍처

상태: v0.2 Local Observe, v0.3 Camera/PTZ, v0.4 Durable Command, v0.5 성능/복구 측정을 localhost Synthetic 범위에서 통합 검증했습니다. 프로덕션, HA, 전체 벤더 호환성을 보장한다는 의미가 아닙니다.

## 1. 핵심 책임

```text
MQTT Sensor → Device Gateway → Kafka
                              ├─ History Writer → PostgreSQL
                              └─ State Projector → Redis
Next.js Console → FieldOps Server → Snapshot / SSE
```

장비 Protocol DTO는 Adapter에서 공통 Device/Metric/State로 변환합니다. TCP/Polling/ONVIF는 필요한 범위에서 종류별로 추가합니다. 영상은 RTSP → Media 경로로 전달하며 Kafka/Telemetry에 원본 영상을 저장하지 않습니다.

| Runtime | 책임 |
|---|---|
| fieldops-server | REST/SSE, 인증·권한, 후속 제어 API |
| device-gateway | 장비 연결/수집과 지원 command adapter |
| fieldops-worker | Normalize, History, State, 후속 workflow |
| simulator | Synthetic 데이터와 장애 재현 |
| web-console | 동일한 API 경계를 사용하는 Fixture/Remote 화면 |
| billing-job | 선택 후속 범위, 초기 필수 실행 아님 |

논리 모듈을 전부 개별 Microservice로 배포하지 않습니다. History와 Redis Consumer의 retry/thread/group은 나누되 Kafka나 공유 프로세스 장애까지 독립적이라고 과장하지 않습니다.

## 2. 원장, 순서, 중복

PostgreSQL은 기준정보, 영구 이력, 업무 원장을 저장하고 Kafka는 durable event 전달을 담당하며 Redis는 재구축 가능한 최신 상태를 보관합니다. 재전달에도 유지되는 Event ID 또는 검증된 Session+Sequence를 사용하고 History의 Unique constraint와 Projector CAS를 적용합니다. Retained/과거 데이터를 현재 장비의 생존 신호로 오인하지 않습니다.

같은 key의 순서는 동일 Topic/Partition 안에서 해석합니다. 서로 다른 Topic 간 전역 순서나 동일 Consumer Group의 다중 서버 broadcast를 가정하지 않습니다. 초기 SSE Server는 단일 인스턴스입니다.

## 3. 인증과 Context

실제 remote 버전은 Keycloak OIDC와 서버 소유 Session을 사용합니다. 선택한 Tenant를 요청에 명시하고 서버가 Membership, Site, Device를 교차 검증합니다. 공유 Session의 가변 전역 Tenant에 의존해 여러 탭의 context가 서로 바뀌지 않도록 합니다.

Stream 권한은 실제 전달되는 Metric 범위를 포함해야 합니다. 첫 profile에서는 필요한 read 권한을 모두 가진 Session만 stream을 열 수 있고 연결 중 권한 철회도 처리합니다. 화면에서 숨기는 것으로 서버 권한 검증을 대체하지 않습니다. 정확한 parameter와 field는 버전이 명시된 remote contract에 반영한 후 구현합니다.

## 4. Snapshot과 실시간 상태 수렴

초기 Snapshot 조회 후 Stream을 여는 사이 발생할 수 있는 변경 누락은 연결 이후 재조회와 version merge로 보정합니다. 동기화 중 event buffer에는 상한을 두고 초과 또는 실패 시 Stale/Retry 상태로 전환합니다. 보조적으로 화면에 표시 중인 최신 상태를 주기적으로 재검증합니다. History chart를 이벤트마다 다시 조회하지 않습니다.

REST와 SSE는 동일한 상태 generation의 증가하는 revision을 비교합니다. 늦게 도착한 REST 응답이 최신 SSE 상태를 덮지 않도록 합니다. Registry Version과 State Revision을 구분하고 rebuild generation이 바뀌면 REST로 재동기화합니다. Sparse lifecycle event는 초기에 전체 상태를 patch하지 않고 관련 query invalidation으로 처리합니다. Filter 포함 여부나 page가 바뀔 수 있는 event도 목록을 재조회합니다.

연결 성공 자체가 데이터 최신성을 보장하지는 않습니다. 완전한 무손실 replay, 분산 exactly-once, 무조건 1초 이내 반영 같은 SLA를 주장하지 않습니다.

## 5. 발행과 복구

Redis 적용 직후 종료되거나 Kafka publish가 실패하는 경우까지 입력 offset commit과 함께 검증합니다. Duplicate라는 이유로 아직 발행되지 않은 결과를 생략하거나 예외를 로그만 남긴 채 성공 처리하지 않습니다. 초기 상태 event는 query refresh hint이며 업무 원장의 유일한 근거가 아닙니다. 업무 event의 durability는 후속 ledger/outbox 경계에서 별도로 다룹니다.

첫 Redis 복구 방식은 유지보수 모드입니다. 마지막 DB Snapshot을 Stale 상태로 제공하고 Projector 소유권, 새 상태 generation, replay 입력 범위, 목표 offset을 확인해 rebuild합니다. 보관 범위가 부족하면 복구 불가 상태를 명시하고 빈 상태를 정상 데이터처럼 서비스하지 않습니다. Snapshot 최적화나 무중단 교체는 실제 비용이 문제가 될 때 추가합니다.

## 6. Realtime PTZ와 Durable Command

Synthetic Valve OPEN/CLOSE는 API idempotency, 요청자/승인자 분리, PostgreSQL ledger, `FOR UPDATE SKIP LOCKED` claim, Gateway dedup, deadline, 실제 상태 확인까지 검증했습니다. 같은 key에 다른 payload가 들어오면 충돌로 처리하고 ACK와 성공을 구분하며 불확실한 결과는 `UNKNOWN`으로 남겨 자동 재전송하지 않습니다.

PTZ는 오래된 입력을 Durable Queue로 replay하지 않습니다. Synthetic Camera 한 대에서 Owner/Lease/Generation/Sequence, Gateway 최종 재검증, priority stop, server dead-man, device finite timeout을 검증했습니다. 이 localhost 검증 결과를 전체 벤더 호환성이나 물리 장비의 정지 보장으로 확대하지 않습니다.

## 7. 검증 근거

MQTT → History/State/UI, cross-tenant 차단, snapshot/SSE 수렴, 중복·역순, Redis 장애 중 History 지속과 복구를 검증했습니다. Camera/PTZ와 Durable Command는 각각 G1-G10으로 실패 경계를 검증했고, B06은 단일 로컬 환경에서 반복 측정과 Worker/Redis recovery drill을 수행했습니다. 고가용성, 전체 벤더 호환성, 프로덕션 처리 용량은 검증 범위가 아닙니다.

[Frontend/Backend 경계](frontend-backend.md) · [로드맵](product/ROADMAP.ko.md) · [현재 상태](project-status.md)
