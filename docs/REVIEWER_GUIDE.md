# FieldOps 검토자 가이드

## 30초 요약

FieldOps는 Java 21 / Spring Boot 4.1 기반 현장 장비 통합관제 백엔드 포트폴리오입니다. MQTT telemetry를 Kafka로 분리해 PostgreSQL History와 Redis Latest State로 수렴시키고 REST/SSE 화면에 전달합니다. 별도 경로로 WebRTC/ONVIF PTZ와 승인형 Durable Command를 구현했으며, 동일한 로컬 환경에서 반복 성능 측정과 Worker/Redis 장애 drill을 수행해 성능·복구 주장의 범위를 명확히 남겼습니다.

- [README의 검증된 핵심 구현](../README.md#verified-highlights)
- [현재 공개 상태](project-status.md)
- [실행 소스 범위](runnable-snapshot.md)

## 실시간 이벤트 처리를 본다면

Device Gateway는 MQTT QoS 1 telemetry를 raw Kafka topic에 발행하고 Worker가 정규화, History 저장, Redis projection을 담당합니다. Web은 REST snapshot 조회 후 SSE를 연결하며 generation/revision을 비교해 늦게 도착한 응답이 최신 상태를 되돌리지 않도록 합니다.

- [Gateway MQTT ingest source](../apps/device-gateway/src/main/java/io/krait/fieldops/gateway/ingest/MqttTelemetryGateway.java)
- [Worker normalizer source](../apps/fieldops-worker/src/main/java/io/krait/fieldops/worker/telemetry/RawTelemetryNormalizer.java)
- [아키텍처](architecture.md)
- [Local Observe 빠른 실행 가이드](LOCAL_OBSERVE_QUICKSTART.md)

## 프로토콜 연동을 본다면

TCP/Binary slice는 임의 크기의 stream chunk를 받아 bounded incremental framing을 수행하고 CRC/version/length/type을 fail-closed 방식으로 검증합니다. 이후 기존 MQTT 측정 경로를 리팩터링하지 않고 동일한 `RawTelemetry` Kafka contract로 수렴시킵니다. ACK는 Kafka raw message가 broker에 수락됐음을 의미하며 History commit을 보장하지 않습니다. reconnect가 발생해도 Synthetic reboot 전까지 frame의 logical session은 유지합니다.

- [TCP/Binary protocol](TCP_BINARY_PROTOCOL.md)
- [TCP/Binary 빠른 실행 가이드](TCP_BINARY_QUICKSTART.md)
- [Gateway adapter source](../apps/device-gateway/src/main/java/io/krait/fieldops/gateway/tcp/TcpBinaryTelemetryAdapter.java)
- [Framing ADR](adr/0018-b07-tcp-binary-framing.md)

## 정합성과 멱등성을 본다면

PostgreSQL은 영구 History와 command ledger의 원장이고 Redis는 재구축 가능한 latest-state read model입니다. 전역 exactly-once 대신 event/API idempotency, partition-local ordering, exclusive claim, Gateway receipt dedup, 명시적 `UNKNOWN` 상태로 중복과 불확실성을 다룹니다.

- [Telemetry domain ordering](../modules/telemetry-domain/src/main/java/io/krait/fieldops/telemetry/domain/SourceOrder.java)
- [Durable Command ADR](adr/0016-b05-durable-command-dispatch.md)
- [Command ledger source](../apps/fieldops-worker/src/main/java/io/krait/fieldops/worker/command/CommandLedger.java)
- [Command 빠른 실행 가이드](COMMAND_QUICKSTART.md)

## 장비 제어 안전성을 본다면

PTZ는 짧은 lease, generation fencing, monotonic sequence, Gateway 전송 직전 재검증, priority stop, server dead-man, device-side finite timeout을 여러 단계로 겹쳐 적용합니다. 승인형 Valve 명령은 realtime transport와 분리하고 요청자/승인자 분리, append-only timeline, 실제 상태 확인을 요구합니다.

- [Camera control lease](../modules/camera-control/src/main/java/io/krait/fieldops/camera/control/ControlLease.java)
- [Gateway PTZ controller](../apps/device-gateway/src/main/java/io/krait/fieldops/gateway/camera/CameraControlGatewayController.java)
- [Camera/PTZ 빠른 실행 가이드](CAMERA_PTZ_QUICKSTART.md)
- [Durable Command 설계](adr/0016-b05-durable-command-dispatch.md)

## 성능과 복구를 본다면

기준 성능 수치는 GitHub runner가 아니라 동일한 로컬 호스트에서 각 부하 지점을 3회 실행한 중앙값입니다. Gateway queue와 Kafka consumer lag라는 두 신호를 함께 보고 병목을 찾은 뒤 B06 profile의 bounded concurrency 한 가지만 조정했습니다. Worker/Redis 장애 후에는 History 보존과 최종 상태 수렴까지 측정했습니다.

- [성능 측정 및 복구 결과](PERFORMANCE_RESILIENCE.md)
- [Sanitized benchmark summary](performance/b06-summary.json)
- [Performance harness](../scripts/b06_perf.py)
- [성능 ADR](adr/0017-b06-performance-characterization.md)

## 로컬 실행

가장 짧은 검토 경로는 Local Observe입니다. Java 21, Node.js 24, pnpm 11.25.0, Python 3.13, Docker Compose를 준비한 뒤 `up → status → demo → verify → down`을 실행합니다. Camera/PTZ, Durable Command, TCP/Binary Adapter는 각각 별도의 Quick Start와 checkout-scoped runtime을 사용합니다.

- [Local Observe 빠른 실행 가이드](LOCAL_OBSERVE_QUICKSTART.md)
- [Camera/PTZ 빠른 실행 가이드](CAMERA_PTZ_QUICKSTART.md)
- [Durable Command 빠른 실행 가이드](COMMAND_QUICKSTART.md)
- [성능/복구 빠른 실행 가이드](PERFORMANCE_QUICKSTART.md)
- [TCP/Binary 빠른 실행 가이드](TCP_BINARY_QUICKSTART.md)

## 현재 한계

이 저장소는 Synthetic 장비와 localhost 전용 실행 환경을 위한 curated portfolio snapshot입니다. 성능 결과는 프로덕션 처리 용량이나 최대 TPS가 아니며, 전체 벤더 호환성, HA, Kafka outage, 무손실 장기 replay, 물리적 안전 인증을 주장하지 않습니다. S01 container image remediation은 계속 릴리스 차단 조건이며 Public Release/Tag/Hosting은 수행하지 않았습니다.

- [현재 공개 상태](project-status.md)
- [실행 소스 범위](runnable-snapshot.md)
- [로드맵](product/ROADMAP.ko.md)
