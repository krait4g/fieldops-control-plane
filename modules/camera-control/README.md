# camera-control

Protocol-neutral camera capability and control-session policy.

- camera profile, media profile and preview health
- PTZ capability and preset model
- realtime control session, owner, lease and fencing
- durable camera command boundary
- dead-man stop and stale-token policy

ONVIF and RTSP implementation details remain outside the domain model. Realtime joystick input is not replayed through the durable command path.

Current status: the B04 synthetic camera slice implements the realtime control
session boundary, latest-wins buffering, lease generation fencing, and PTZ
dead-man timeout policy. Durable commands and vendor-wide ONVIF compatibility
remain outside this slice.
