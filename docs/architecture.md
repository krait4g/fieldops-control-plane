# FieldOps Control Plane 아키텍처

## 1. 설계 목표

FieldOps는 다음 문제를 동시에 해결하도록 설계합니다.

- 서로 다른 Protocol과 Vendor 장비를 공통 Product Model로 통합
- 실시간 Latest State와 영구 History의 책임 분리
- 중복·지연·역순 Event에서도 상태 수렴
- 일부 구성 장애의 영향 격리
- 승인·멱등성·불확실성을 포함한 안전한 제어
- Dashboard·Camera·Command를 하나의 운영 Journey로 연결

## 2. 전체 구조

```mermaid
flowchart LR
    USER[Operator / Approver / Admin] --> WEB[Next.js Web Console]
    WEB -->|REST · SSE · WebSocket| API[FieldOps Server]

    MQTT[MQTT Sensor] --> GW[Device Gateway]
    TCP[TCP/Binary Device] --> GW
    POLL[HTTP Polling Device] --> GW
    CAM[ONVIF Camera] --> GW
    CAM -->|RTSP| MEDIA[Media Plane]
    MEDIA --> WEB

    GW --> K[(Kafka)]
    K --> WORKER[FieldOps Worker]

    WORKER --> PG[(PostgreSQL)]
    WORKER --> RD[(Redis)]

    API --> PG
    API --> RD
    API --> K
    K --> GW
```

## 3. Plane 구분

### Southbound Integration Plane

장비별 연결과 실패 처리를 담당합니다.

- MQTT: QoS, Session, Duplicate, Retained Message, Reconnect
- TCP/Binary: Framing, Split/Combined Packet, Length, CRC, Idle
- HTTP Polling: Jitter, Timeout, Backoff, Circuit Breaker
- ONVIF: Capability, Status, PTZ, Preset
- RTSP: Preview Source와 Stream Health

Protocol Payload를 Core Domain에 직접 전달하지 않고 Canonical Event와 State로 변환합니다.

### Canonical Device Plane

공통 개념:

- Tenant, Site, Zone
- Device Identity
- Device Type
- Capability
- Observation
- Reported State
- Connectivity
- Readiness
- Freshness
- State Version

새 Protocol을 추가하더라도 Dashboard와 Rule은 이 공통 모델을 사용합니다.

### Event and Data Plane

```text
PostgreSQL
  = Registry, History, Alarm·Incident·Command·Audit 원장

Kafka
  = 내구성 Event 전달, Replay, 동일 Key 순서, Consumer 격리

Redis
  = Latest State, Freshness CAS, Offline Deadline,
    Alarm Cooldown, PTZ Lease·Fencing
```

### Operations Control Plane

- Rule
- Alarm
- Incident
- Command Request
- Approval
- Dispatch
- ACK·Reported State
- Audit

### Northbound Product Plane

- REST: Snapshot과 Query
- SSE: 단방향 Incremental Update
- WebSocket: PTZ Control Session
- Next.js: Dashboard, Chart, Device, Camera, Incident, Command UX

## 4. Runtime 경계

| Runtime | 책임 |
|---|---|
| `fieldops-server` | REST, SSE, WebSocket, OIDC Session, Product Query·Mutation |
| `device-gateway` | MQTT, TCP, Polling, ONVIF, Command·Camera Adapter |
| `fieldops-worker` | Normalize, History, Redis Projection, Offline, Workflow |
| `simulator` | Synthetic Device와 Failure Scenario |
| `web-console` | Next.js Operations Console |
| `billing-job` | 후순위 Usage Aggregate·Reconciliation |

Runtime 분리는 책임과 Failure Boundary를 표현합니다. 모든 논리 모듈을 첫 단계부터 개별 Microservice로 배포한다는 의미는 아닙니다.

## 5. Telemetry 흐름

```text
Device Event
  → Protocol Validation
  → Raw Event
  → Canonical Normalization
  → Kafka
      ├─ PostgreSQL History Consumer
      ├─ Redis State Projection Consumer
      └─ Rule Evaluation Consumer
```

동일 Device의 Ordering이 필요한 Topic은 `tenantId + deviceId`를 Partition Key로 사용합니다.

## 6. 중복·역순 처리

```text
History
  → PostgreSQL Unique Constraint
  → 동일 Event 재처리 수렴

Latest State
  → Redis Lua CAS
  → sessionId / sequence / occurredAt / version 비교
  → 낮거나 같은 상태 갱신 거부
```

전체 시스템의 Exactly-once를 주장하지 않습니다. `At-least-once + Idempotent Convergence`를 사용합니다.

## 7. Redis 복구

Redis는 영구 원장이 아닙니다.

```text
Redis Loss
  → PostgreSQL History·Command·Alarm 지속
  → UI는 Database Snapshot과 Stale 표시
  → Snapshot Seed
  → Kafka Replay
  → Latest State 재구축
```

새 PTZ 제어권 획득은 Redis Lease를 사용할 수 없을 때 차단합니다.

## 8. Command 경로

### Durable Command

Pump, Valve, Preset처럼 감사와 재처리가 필요한 명령:

```text
REST Request
  → Idempotency-Key
  → PostgreSQL Command Ledger
  → Approval·Safety Validation
  → Transactional Outbox
  → Kafka
  → Device Gateway
  → ACK
  → Reported State
```

`ACKNOWLEDGED`는 장비가 명령을 수신했다는 의미이며 `SUCCEEDED`와 동일하지 않습니다. 비멱등 Command의 결과가 불확실하면 `UNKNOWN`으로 남깁니다.

### Realtime PTZ

```text
WebSocket
  → Control Owner
  → Redis Lease·Fencing Token
  → Sequence Validation
  → Latest Input Coalescing
  → ONVIF ContinuousMove
  → Heartbeat / Dead-man Stop
```

PTZ Joystick의 과거 입력을 Kafka Lag 이후 재생하지 않습니다.

## 9. Camera Media 경계

```text
ONVIF
  = Device Information, Capability, Status, PTZ

RTSP
  = 원본 Media Source

Media Gateway
  = Browser-compatible Preview

Kafka
  = Camera 상태 Event만 처리
```

원본 영상은 Kafka나 PostgreSQL에 저장하지 않습니다.

## 10. Frontend·Backend 권위

Frontend:

- 정보 구조와 화면 표현
- Query Cache
- Loading·Empty·Permission·Partial·Stale·Reconnecting
- 사용자 입력과 확인
- OpenAPI 기반 Type

Backend:

- Tenant·Site Authorization
- Device·Command State Machine
- Rule와 Safety Policy
- Idempotency
- Command Result
- Audit

Frontend는 Backend의 Safety Rule을 복제하지 않습니다.

## 11. Observability

핵심 Signal:

- Telemetry Accepted·Rejected
- Kafka Consumer Lag
- History Persist Latency
- Redis Projection Lag
- Stale Sequence Rejection
- Redis Rebuild Progress
- SSE Connection·Reconnect
- Command State·ACK Latency
- Camera Preview Health
- PTZ Lease Expiration

## 12. 범위 제한

- 실제 안전 인증 제품이 아님
- Multi-region·Kubernetes는 초기 범위가 아님
- 모든 Camera Vendor 호환을 보장하지 않음
- AI가 Command를 직접 실행하지 않음
