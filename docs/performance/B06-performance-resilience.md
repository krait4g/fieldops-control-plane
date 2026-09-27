# B06 — 성능 측정 및 복구 근거

- Baseline source: `de742d5a3288e5d08868509a2542ad8ed1252100`
- 개선 candidate source: `cd22729aa69d4b658d3a2d92b74ee667cbc73174`
- 환경: `Windows 11`, `AMD64`, logical CPU 22개, RAM 약 32 GiB
- 주장 범위: 명시된 단일 로컬 머신. 프로덕션 처리 용량이나 최대 TPS가 아닙니다.

## 개선 전후

선택한 각 부하 지점에서 3회씩 측정하고 중앙값을 기준값으로 사용했습니다. Baseline의 `R_sustainable`은 100 EPS였고, 처음 확인된 성능 저하 후보 지점은 250 EPS였습니다.

- 100 EPS backlog 소진 시간 감소: 86.51%
- 250 EPS accepted event 증가: 68.1%
- 250 EPS History 저장 완전성: 59.49% → 100.00%
- 개선 후 correctness: History 100%, 최종 Redis 6/6, processing error 0건, 최종 lag 0

## 병목과 단일 최적화

CPU 사용률과 Hikari pending이 낮은 상태에서 Gateway queue 포화와 Normalizer lag가 동시에 나타났습니다. 적용한 최적화는 기존 bounded Gateway parallelism의 core worker를 2 → 4로 늘리고, B06에 한해서 Worker listener 수를 Kafka partition 3개에 맞춰 1 → 3으로 조정한 것입니다. 기본 B02/B04/B05 profile은 변경하지 않았습니다.

## 복구 Drill

- Worker restart: 약 5초 중단 시간을 포함해 16,891ms 후 health 정상화, 48,187ms 후 lag 소진, History 누락 0건, Redis 6/6 수렴
- Redis outage: 약 5초 중단 시간을 포함해 9,594ms 후 health 정상화, 장애 중에도 History 저장 지속, History 누락 0건, Redis 6/6 수렴

## Gate 상태

G1-G10을 모두 통과했습니다. 기준 acceptance run에서 최신 B02 Local Observe, B04 Camera/PTZ G1-G10, B05 Durable Command G1-G10 regression도 함께 확인했습니다. Public CI는 correctness와 regression gate만 실행하며 benchmark 수치를 만들어내는 용도로 사용하지 않습니다.
