# camera-control

Protocol-neutral camera capability and control-session policy.

- camera profile, media profile and preview health
- PTZ capability and preset model
- realtime control session, owner, lease and fencing
- durable camera command boundary
- dead-man stop and stale-token policy

ONVIF and RTSP implementation details remain outside the domain model. Realtime joystick input is not replayed through the durable command path.

Current status: design boundary only.
