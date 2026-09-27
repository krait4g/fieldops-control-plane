# ADR 0016: B05 Durable Command dispatch 경계

- 상태: B05 적용 승인
- 날짜: 2026-09-10

## 결정

B05는 각 Valve OPEN/CLOSE 요청과 모든 lifecycle transition을 PostgreSQL에 저장합니다. Worker는 짧은 transaction 안에서 `FOR UPDATE SKIP LOCKED`로 `APPROVED` row만 claim하고, 해당 command를 `DISPATCHING`으로 변경한 뒤 인증된 loopback HTTP로 설정된 Device Gateway를 호출합니다. 이 slice에서 Kafka는 telemetry 전용으로 유지합니다.

외부에 제공하는 보장은 의도적으로 exactly-once delivery보다 좁게 정의합니다.

- API idempotency scope는 tenant, requester subject, `Idempotency-Key` 조합입니다. Server는 canonical semantic payload를 hash하고 동일 key를 다른 payload로 재사용하면 거부합니다.
- `FOR UPDATE SKIP LOCKED`로 동시에 실행되는 dispatcher 간 exclusive claim을 보장합니다.
- Gateway는 결과를 반환하기 전에 `commandId` receipt와 payload hash를 영속화합니다. 같은 명령이 중복 전달돼도 Valve가 중복 동작하지 않도록 수렴시킵니다.
- ACK를 받은 command도 실제 장비 상태가 성공 또는 실패를 증명하기 전까지 `ACKNOWLEDGED`로 유지합니다.
- Deadline을 넘기면 `UNKNOWN`으로 전환합니다. `UNKNOWN`은 terminal 상태이며 자동 redispatch하지 않습니다.

승인은 별도의 권한 단계입니다. 요청자는 자신의 명령을 직접 승인하거나 반려할 수 없습니다.

## Kafka 또는 workflow engine을 사용하지 않은 이유

B05의 목표는 가장 작고 검토 가능한 Durable Command 경계를 만드는 것입니다. PostgreSQL이 이미 ledger, 승인 상태, dispatcher claim, audit order를 소유하고 있으므로 command topic을 추가하면 이 slice의 검증 범위를 강화하지 않은 채 두 번째 durability/redelivery 경계만 생깁니다. BPMN, 다단계 승인, compensation, scheduling, bulk command orchestration은 범위에서 제외합니다.

## B04와의 분리

B04 PTZ command는 ephemeral하고 lease-fenced된 WebSocket traffic으로 유지하며 이 ledger에 넣지 않습니다. B05는 자체 profile, table, endpoint, worker, Gateway receipt, simulator, test, UI route를 가집니다.
