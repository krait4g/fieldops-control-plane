# ADR-0017: B06 로컬 성능 측정

- 상태: B06 적용 승인
- 날짜: 2026-09-10

## 결정

B06은 명시적으로 fingerprint한 단일 로컬 머신에서 기존 Local Observe pipeline을 측정합니다. 기준 throughput과 복구 수치는 동일한 입력 부하에서 반복한 로컬 실행 결과만 사용합니다. GitHub Actions에서는 correctness 확인을 위한 low-rate smoke만 실행합니다.

기존 Micrometer registry는 `b06-perf` profile에서 localhost 전용 Prometheus-compatible Actuator endpoint로 노출합니다. Harness가 이 endpoint를 직접 scrape하며 별도의 Prometheus나 Grafana container는 추가하지 않습니다.

Load generator는 기존 Synthetic 장비 6대를 대상으로 concurrent paced QoS 1 publish를 수행하고 offered, attempted, confirmed-published, error, elapsed, achieved events/s, bytes를 기록합니다. Metric tag는 component/stage/result처럼 고정된 dimension만 사용하고 event, device, command, session, idempotency identifier는 tag로 사용하지 않습니다.

격리 runtime은 `.fieldops-b06`이고, checkout 범위의 `fieldops-b06-<fingerprint>` Compose project를 사용합니다. 정확히 해당 project identity를 가진 resource만 reset할 수 있으며 기존 B02/B04/B05 resource는 소유권 범위 밖입니다.

Baseline 측정과 multi-signal 진단 이후 B06에서는 bounded optimization을 정확히 한 가지만 적용할 수 있습니다. 이 변경은 durability, acknowledgment, ordering, correctness, 기존 제품 동작을 유지해야 합니다. Kafka ACK 또는 durability semantics를 변경해야 하는 최적화는 `B06_OPTIMIZATION_TOO_INVASIVE`로 판단합니다.

## 주장 범위

결과는 짧은 시간 동안 Synthetic 장비 6대로 단일 localhost 머신에서 수행한 benchmark를 설명합니다. 최대 throughput, 프로덕션 처리 용량, cloud/multi-node 결과, soak test, exactly-once를 의미하지 않습니다. Kafka outage, Grafana, autoscaling, HA, 신규 비즈니스 기능은 범위에서 제외합니다.
