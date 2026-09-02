# Safe Command Execution

- Status: Accepted
- Date: 2026-09-02

Physical command execution is modeled as a durable state machine rather than a simple HTTP mutation. The design combines an idempotency key, database uniqueness, approval, deadline, expected state version, same-device ordering and device-side deduplication where supported. Uncertain non-idempotent execution is represented as `UNKNOWN` instead of being retried blindly.
