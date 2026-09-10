# Performance and Resilience Quick Start

Requirements are the same as Local Observe: Java 21, Node.js/pnpm, Python, Docker,
and Docker Compose. The harness creates a checkout-scoped Compose project and stores
untracked raw results under `.fieldops-b06/`.

```powershell
python scripts/b06_perf.py up
python scripts/b06_perf.py status
python scripts/b06_perf.py smoke
```

Run a controlled sweep on the same local machine:

```powershell
python scripts/b06_perf.py sweep --rates 50 100 250 500 1000 --warmup 10 --duration 30
```

Once the sustainable and stress anchors are selected, record three runs per anchor.
The tracked B06 evidence uses 100 and 250 events/s:

```powershell
python scripts/b06_perf.py measure --rate 100 --warmup 10 --duration 30 --repeat 3 --label candidate
python scripts/b06_perf.py measure --rate 250 --warmup 10 --duration 30 --repeat 3 --label candidate
python scripts/b06_perf.py compare
```

Recovery drills use roughly 65% of the baseline sustainable rate:

```powershell
python scripts/b06_perf.py drill --scenario worker-restart --rate 65 --duration 60
python scripts/b06_perf.py drill --scenario redis-outage --rate 65 --duration 60
python scripts/b06_perf.py report
python scripts/b06_perf.py down
```

`reset` removes only volumes whose exact name prefix and Compose project label prove
B06 ownership. Run `down` first. It never targets B02, B04, or B05 resources.

Do not use CI runner timings as canonical performance evidence. CI runs only the
low-rate correctness smoke.
