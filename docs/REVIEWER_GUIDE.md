# Reviewer Guide

코드를 빠르게 보고 싶다면 아래 순서로 보는 것을 권합니다.

## 실시간 데이터 처리

MQTT와 TCP/Binary 입력은 Device Gateway에서 공통 telemetry 모델로 바뀐 뒤 Kafka로 들어갑니다. Worker는 이력을 PostgreSQL에 저장하고 최신 상태를 Redis에 반영합니다.

- [MQTT ingest](../apps/device-gateway/src/main/java/io/krait/fieldops/gateway/ingest/MqttTelemetryGateway.java)
- [TCP/Binary adapter](../apps/device-gateway/src/main/java/io/krait/fieldops/gateway/tcp/TcpBinaryTelemetryAdapter.java)
- [Normalizer](../apps/fieldops-worker/src/main/java/io/krait/fieldops/worker/telemetry/RawTelemetryNormalizer.java)
- [Architecture](architecture.md)

## 정합성과 상태 관리

중복 전달을 전제로 두고 source ordering, DB 제약, API idempotency와 Gateway dedup으로 상태를 맞춥니다. Redis는 최신 조회용이고 영구 이력과 command ledger는 PostgreSQL에 둡니다.

- [Source ordering](../modules/telemetry-domain/src/main/java/io/krait/fieldops/telemetry/domain/SourceOrder.java)
- [Command ledger](../apps/fieldops-worker/src/main/java/io/krait/fieldops/worker/command/CommandLedger.java)
- [Durable Command ADR](adr/0016-b05-durable-command-dispatch.md)

## 장비 제어

PTZ는 늦은 입력을 버리는 realtime 제어이고, 밸브 명령은 승인과 결과 확인이 필요한 durable command입니다. 두 경로를 분리해 구현했습니다.

- [Camera control](../apps/device-gateway/src/main/java/io/krait/fieldops/gateway/camera/CameraControlGatewayController.java)
- [Camera / PTZ Quick Start](CAMERA_PTZ_QUICKSTART.md)
- [Durable Command Quick Start](COMMAND_QUICKSTART.md)

## 성능과 복구

같은 로컬 환경에서 반복 측정해 Gateway queue와 Kafka consumer lag를 병목으로 좁혔고, concurrency를 조정한 뒤 같은 조건으로 다시 측정했습니다. Worker와 Redis를 각각 중단한 복구 시나리오도 포함합니다.

- [Performance / Recovery](PERFORMANCE_RESILIENCE.md)
- [Benchmark summary](performance/b06-summary.json)
- [Performance harness](../scripts/b06_perf.py)

## 직접 실행

가장 짧은 경로는 Local Observe입니다.

- [Local Observe Quick Start](LOCAL_OBSERVE_QUICKSTART.md)
- [TCP / Binary Quick Start](TCP_BINARY_QUICKSTART.md)
- [현재 구현 범위](project-status.md)

이 저장소는 Synthetic 장비와 localhost 실행 환경을 기준으로 합니다. 실제 Vendor 전체 호환, HA, Production 용량을 의미하지 않습니다.
