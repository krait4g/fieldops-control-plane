# fieldops-worker

Asynchronous event and workflow runtime.

- Raw/Canonical normalization
- PostgreSQL telemetry history
- Redis latest-state projection and rebuild
- Offline detector
- Rule/alarm workflow
- Command timeout/result processing

Consumer Group과 Executor를 책임별로 분리한다.
