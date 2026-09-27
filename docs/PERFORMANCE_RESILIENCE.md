# 성능 측정 및 복구 검증 결과

B06은 명시된 단일 로컬 머신에서 기존 Local Observe telemetry pipeline의 성능 특성을 측정합니다. 이 결과를 프로덕션 처리 용량이나 최대 TPS로 해석하지 않습니다.

기준 측정은 Synthetic 장비 6대, warmup 10초, 측정 구간 30초, 제어된 입력 부하를 사용했습니다. 선택한 두 부하 지점에서 각각 3회 반복 측정하고 중앙값을 사용했습니다. 가장 좋은 1회 결과를 선별하지 않았습니다.

## 측정 결과

- 기준 지속 처리율: 100 events/s
- 최초 성능 저하 구간 후보: 250 events/s
- 적용한 최적화: B06 profile에 한해 bounded pipeline concurrency 조정
- 100 events/s backlog 소진 시간 중앙값: 42.391초 → 5.719초
- 250 events/s History 저장 완전성 중앙값: 59.49% → 100%
- 개선 후 측정: processing error 0건, 최종 Redis 6/6 수렴, 최종 consumer lag 0

병목 진단에는 두 개의 독립적인 신호를 함께 사용했습니다. Gateway queue가 256 중 253까지 차는 동시에 Normalizer lag가 증가했지만 CPU 사용률과 Hikari pending은 낮게 유지됐습니다. 이를 근거로 `b06-perf`에서만 기존 bounded Gateway pool의 core worker를 4개로 활성화하고, Kafka partition 3개에 맞춰 Worker listener를 3개로 조정했습니다. 기본 B02/B04/B05 profile의 concurrency 설정은 변경하지 않았습니다.

## 복구 검증

65 events/s 부하에서 B06 소유 Worker를 약 5초간 중단한 뒤 재시작했습니다. 중단 시간을 포함해 16.891초 후 health가 정상화됐고, 누적 lag를 모두 소진했으며 History 4,225건을 모두 보존하고 6개 장비의 Redis 최신 상태가 최종 수렴했습니다.

별도 실험에서는 B06 소유 Redis service를 약 5초간 중단했습니다. Redis 장애 중에도 History 저장은 계속됐고, 중단 시간을 포함해 9.594초 후 health가 복구됐습니다. History 4,225건은 모두 유지됐으며 6개 장비의 Redis 최신 상태가 최종 수렴했습니다.

기계 판독 가능한 기준 근거는 [`docs/performance/b06-summary.json`](performance/b06-summary.json)에 있습니다. 차트의 값도 수동 입력이 아니라 실제 측정 JSON에서 생성합니다.
