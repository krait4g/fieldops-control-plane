# 성능 및 복구 검증 빠른 실행 가이드

사전 준비는 Local Observe와 동일합니다. Java 21, Node.js/pnpm, Python, Docker, Docker Compose가 필요합니다. Harness는 현재 checkout 범위의 Compose project를 만들고 Git에 추적하지 않는 raw 결과를 `.fieldops-b06/` 아래에 저장합니다.

```powershell
python scripts/b06_perf.py up
python scripts/b06_perf.py status
python scripts/b06_perf.py smoke
```

동일한 로컬 머신에서 제어된 부하 sweep을 실행합니다.

```powershell
python scripts/b06_perf.py sweep --rates 50 100 250 500 1000 --warmup 10 --duration 30
```

지속 처리 가능한 기준 부하와 stress 구간을 선택한 뒤 각 지점에서 3회씩 측정합니다. 저장소에 포함된 B06 근거는 100 events/s와 250 events/s를 사용합니다.

```powershell
python scripts/b06_perf.py measure --rate 100 --warmup 10 --duration 30 --repeat 3 --label candidate
python scripts/b06_perf.py measure --rate 250 --warmup 10 --duration 30 --repeat 3 --label candidate
python scripts/b06_perf.py compare
```

복구 drill은 baseline 지속 처리율의 약 65% 부하에서 실행합니다.

```powershell
python scripts/b06_perf.py drill --scenario worker-restart --rate 65 --duration 60
python scripts/b06_perf.py drill --scenario redis-outage --rate 65 --duration 60
python scripts/b06_perf.py report
python scripts/b06_perf.py down
```

`reset`은 정확한 volume 이름 prefix와 Compose project label로 B06 소유권이 확인된 volume만 삭제합니다. 먼저 `down`을 실행해야 하며 B02, B04, B05 resource는 대상으로 삼지 않습니다.

CI runner의 실행 시간을 공식 성능 근거로 사용하지 않습니다. CI에서는 낮은 부하의 correctness smoke test만 실행합니다.
