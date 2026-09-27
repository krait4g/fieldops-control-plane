# camera-control

Protocol에 종속되지 않는 camera capability와 control-session policy를 담당합니다.

- camera profile, media profile, preview health
- PTZ capability와 preset model
- realtime control session, owner, lease, fencing
- durable camera command 경계
- dead-man stop과 stale-token policy

ONVIF와 RTSP 구현 상세는 domain model 밖에 둡니다. Realtime joystick input을 durable command 경로로 replay하지 않습니다.

현재 B04 Synthetic Camera slice에서는 realtime control session 경계, latest-wins buffering, lease generation fencing, PTZ dead-man timeout policy까지 구현했습니다. Durable command와 전체 벤더 ONVIF 호환성은 이 slice의 범위에 포함하지 않습니다.
