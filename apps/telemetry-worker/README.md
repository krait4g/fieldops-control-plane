# telemetry-worker

Normalizes telemetry and hosts separate PostgreSQL history and Redis state-projection consumers. Redis failure must not stop the history consumer.

Current status: directory and responsibility baseline. Executable bootstrap is M0 scope.
