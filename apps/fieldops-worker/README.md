# fieldops-worker

Event processing and workflow runtime.

- raw-to-canonical telemetry normalization
- PostgreSQL history persistence
- Redis latest-state projection and rebuild
- device offline detection
- rule, alarm and incident workflow
- command timeout and result handling

History persistence and Redis state projection use independent consumer groups, thread pools and failure policies. Redis degradation must not turn into telemetry-history loss.

This runtime does not expose product HTTP APIs and does not contain device protocol clients.

Current status: boundary only. Executable bootstrap is M0 scope; telemetry behavior begins in M1 and workflow behavior in M3.
