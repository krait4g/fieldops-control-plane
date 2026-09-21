# FieldOps Reviewer Guide

## 30-second summary

FieldOps는 Java 21 / Spring Boot 4.1 기반 현장 장비 통합관제 백엔드 포트폴리오입니다. MQTT telemetry를 Kafka로 분리해 PostgreSQL History와 Redis Latest State로 수렴시키고 REST/SSE 화면에 전달합니다. 별도 경로로 WebRTC/ONVIF PTZ와 승인형 Durable Command를 구현했으며, 같은 로컬 환경의 반복 측정과 Worker/Redis 장애 drill로 성능·복구 주장의 경계를 남겼습니다.

- [README의 Verified Highlights](../README.md#verified-highlights)
- [현재 공개 상태](project-status.md)
- [실행 소스 범위](runnable-snapshot.md)

## If you care about realtime event processing

Device Gateway는 MQTT QoS 1 telemetry를 raw Kafka topic에 발행하고 Worker가 정규화, History 저장, Redis projection을 담당합니다. Web은 REST snapshot 뒤 SSE를 연결하며 generation/revision으로 늦은 응답이 최신 상태를 되돌리지 않게 합니다.

- [Gateway MQTT ingest source](../apps/device-gateway/src/main/java/io/krait/fieldops/gateway/ingest/MqttTelemetryGateway.java)
- [Worker normalizer source](../apps/fieldops-worker/src/main/java/io/krait/fieldops/worker/telemetry/RawTelemetryNormalizer.java)
- [Architecture](architecture.md)
- [Local Observe Quick Start](LOCAL_OBSERVE_QUICKSTART.md)

## If you care about consistency and idempotency

PostgreSQL은 영구 History와 command ledger의 원장이고 Redis는 재구축 가능한 latest-state read model입니다. Global exactly-once 대신 event/API idempotency, partition-local order, exclusive claim, Gateway receipt dedup, 명시적 `UNKNOWN`으로 중복과 불확실성을 다룹니다.

- [Telemetry domain ordering](../modules/telemetry-domain/src/main/java/io/krait/fieldops/telemetry/domain/SourceOrder.java)
- [Durable Command ADR](adr/0016-b05-durable-command-dispatch.md)
- [Command ledger source](../apps/fieldops-worker/src/main/java/io/krait/fieldops/worker/command/CommandLedger.java)
- [Command Quick Start](COMMAND_QUICKSTART.md)

## If you care about device control safety

PTZ는 짧은 lease, generation fencing, monotonic sequence, Gateway 전송 직전 재검증, priority stop, server dead-man, device-side finite timeout을 겹칩니다. 승인형 Valve 명령은 이 realtime transport와 분리해 요청자/승인자 분리, append-only timeline, 실제 상태 확인을 요구합니다.

- [Camera control lease](../modules/camera-control/src/main/java/io/krait/fieldops/camera/control/ControlLease.java)
- [Gateway PTZ controller](../apps/device-gateway/src/main/java/io/krait/fieldops/gateway/camera/CameraControlGatewayController.java)
- [Camera/PTZ Quick Start](CAMERA_PTZ_QUICKSTART.md)
- [Durable Command design](adr/0016-b05-durable-command-dispatch.md)

## If you care about performance and recovery

Canonical 숫자는 GitHub runner가 아니라 같은 로컬 호스트에서 각 anchor를 3회 실행한 median입니다. Gateway queue와 Kafka consumer lag라는 두 신호로 병목을 찾고 B06 profile의 bounded concurrency 하나만 조정했으며, Worker/Redis outage 뒤 History 보존과 최종 상태 수렴을 측정했습니다.

- [Measured Performance & Recovery](PERFORMANCE_RESILIENCE.md)
- [Sanitized benchmark summary](performance/b06-summary.json)
- [Performance harness](../scripts/b06_perf.py)
- [Performance ADR](adr/0017-b06-performance-characterization.md)

## Run locally

가장 짧은 검토 경로는 Local Observe입니다. Java 21, Node.js 24, pnpm 11.25.0, Python 3.13, Docker Compose를 준비한 뒤 `up → status → demo → verify → down`을 실행합니다. Camera/PTZ와 Durable Command는 각각 자신의 Quick Start와 checkout-scoped runtime을 사용합니다.

- [Local Observe Quick Start](LOCAL_OBSERVE_QUICKSTART.md)
- [Camera/PTZ Quick Start](CAMERA_PTZ_QUICKSTART.md)
- [Durable Command Quick Start](COMMAND_QUICKSTART.md)
- [Performance Quick Start](PERFORMANCE_QUICKSTART.md)

## Known limits

이 저장소는 Synthetic 장비와 localhost-only 실행 환경을 위한 curated portfolio snapshot입니다. 성능 결과는 Production capacity나 최대 TPS가 아니며, 실제 Vendor 전체 호환, HA, Kafka outage, 무손실 장기 replay, 물리적 안전 인증을 주장하지 않습니다. S01 container-image remediation은 계속 Release blocker이고 Public Release/Tag/Hosting은 수행하지 않았습니다.

- [Project Status](project-status.md)
- [Runnable Source Scope](runnable-snapshot.md)
- [Roadmap](product/ROADMAP.ko.md)
