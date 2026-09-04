# 개발 로드맵

## 우선순위 원칙

```text
P0
  동작하는 제품과 AI를 활용한 Product Building Cycle 증명

P1
  이기종 장비·실시간 상태·안전 제어 전문성 차별화

P2
  운영 품질과 공개 신뢰성 강화

P3
  AI Recommendation·Billing 등 선택 확장
```

## Phase 0 — Product Definition

- 고객 문제와 Target User
- PRD와 JTBD
- Product Hypothesis와 Success Metric
- UX Flow와 Concept
- M1 OpenAPI·SSE·Fixture

완료 기준:

```text
제품의 사용자와 핵심 가치를 2분 안에 설명 가능
UI와 Backend가 같은 Contract로 병렬 개발 가능
```

## Phase 1 — Interactive Prototype

- Next.js App Router
- Login Fixture
- Overview
- Device List·Detail
- 24시간 Chart
- Members Read-only
- Normal·Empty·Permission·Partial·Stale·Reconnecting
- Proxy User 3명 Task Test

완료 기준:

```text
문제 식별 10초 이내
Device 근거 도달 30초 이내
Critical UX Issue 0
```

## Phase 2 — Realtime Observation

- Local Infrastructure
- MQTT Sensor
- Kafka Raw·Normalized Event
- PostgreSQL Telemetry History
- Redis Latest State·Freshness CAS·Offline Deadline
- REST Snapshot
- SSE Incremental Update
- Remote Playwright E2E

완료 기준:

```text
MQTT → Kafka → PostgreSQL/Redis → REST/SSE → UI
중복·역순 State Regression 0
Redis Loss 후 State 재구축
```

## Phase 3 — Multi-Protocol and Camera

- Netty TCP/Binary
- HTTP Polling
- ONVIF Camera Status
- RTSP Preview
- Camera UI
- WebSocket PTZ
- Redis Lease·Fencing
- Dead-man Stop

완료 기준:

```text
MQTT·TCP·Polling이 동일 Canonical Model로 수렴
Preview·Connectivity·Control 상태 분리
과거 PTZ 입력과 이전 제어 Session 거부
```

## Phase 4 — Safe Operations

- Rule·Duration·Hysteresis·Cooldown
- Alarm
- Incident
- Command Request
- Approval
- Transactional Outbox
- ACK·NACK·TIMED_OUT·UNKNOWN
- Audit Timeline

완료 기준:

```text
승인 전 Dispatch 없음
동일 Idempotency-Key 수렴
ACK 불확실을 성공으로 오판하지 않음
```

## Phase 5 — Evidence and Public Release

- 사용자 2차 검증
- OpenTelemetry·Prometheus·Grafana
- Load·Fault Test
- Clean Clone
- 실제 Screenshot·Demo
- Public README와 재현 방법
- 알려진 제한

## Deferred

- AI-assisted Operations Recommendation
- Usage Metering
- Billing Preview
- Map
- 추가 Protocol

Deferred 항목은 P0·P1 완료를 지연시키지 않습니다.

## PRD와 로드맵 갱신

사용자 검증이나 구현 학습으로 우선순위가 변경되면 같은 PR에서 다음을 함께 수정합니다.

- `PRD.ko.md`
- `UX_DESIGN.ko.md` 또는 본 문서
- `PRD_CHANGELOG.ko.md`
- 영향을 받는 API Contract와 Test

문서 변경만으로 기능 완료 상태를 올리지 않습니다.
