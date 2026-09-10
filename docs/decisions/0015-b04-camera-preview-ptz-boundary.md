# ADR-0015: Synthetic Camera Preview and Realtime PTZ Boundary

- Status: Accepted
- Date: 2026-09-09
- Scope: localhost-only synthetic camera preview and PTZ control vertical slice

## Decision

B04 exposes one synthetic camera, `tenant-a/site-a/camera-a-01`, through a
camera-specific read model. It does not add video frames to the telemetry model
or extend the frozen M1 contract.

The browser feature is split into three independent boundaries:

1. **Media:** host FFmpeg publishes an H.264 `testsrc2` stream to MediaMTX over
   RTSP. The browser reads that stream from MediaMTX over WebRTC. Kafka,
   telemetry projection, and HLS are not part of the video path.
2. **Control session:** REST acquires and releases a camera lease. Redis atomically
   maintains one owner, a five-second TTL, heartbeat renewal, and a monotonically
   increasing generation. Preview availability is independent of lease lifetime.
3. **Realtime PTZ:** an authenticated WebSocket accepts only `MOVE`, `STOP`, and
   `HEARTBEAT`. Joystick input is latest-wins and is not written to a durable
   command store or replayed through Kafka. `STOP` has priority over queued moves.

## Safety invariants

- Read and control permissions are separate. A viewer can inspect a camera but
  cannot acquire a control session.
- WebSocket origin is restricted to the localhost web console.
- The application server revalidates the authenticated scope and active lease
  during the WebSocket handshake.
- The device gateway reads the Redis owner and generation immediately before
  each ONVIF operation. A delayed move or stop from an old generation is rejected.
- Pointer release, focus loss, page hiding, page exit, socket close, and lease
  loss all request a priority stop. The server also sends a dead-man stop after
  an abandoned move.
- Synthetic ONVIF `ContinuousMove` always carries a finite device timeout of at
  most 500 ms, and explicit `Stop` is supported. The simulator reports the
  resulting pose through `GetStatus`.
- XML parsing disables DTDs and external entities. Camera endpoints and the
  localhost gateway credential come only from runtime configuration.

## Failure semantics

- A held lease returns `409 CONTROL_LEASE_HELD`; an expired or superseded session
  returns `409 CONTROL_SESSION_STALE`; a scope or permission denial returns
  `403 SCOPE_DENIED`.
- Gateway fencing rejection never invokes the device operation. This applies to
  stale stops as well as stale moves, so an old owner cannot stop the new owner.
- A media outage changes preview health without silently changing PTZ authority.
  An ONVIF outage disables control while leaving an available preview readable.
- Device failure is returned as an error, never as an acknowledgement of success.

## Media image and release boundary

The MediaMTX image is pinned to an exact tag and digest. CI scans that exact image
with Trivy for `HIGH` and `CRITICAL` findings and verifies the JSON report belongs
to the configured digest. Successful scan execution is reported separately from
an image-security or product-release claim.

## Out of scope

Real camera credentials, broad vendor compatibility, TCP or polling control,
durable command workflows, presets, alarms, AI, billing, performance claims,
hosting, tags, and production deployment are outside this synthetic slice.
