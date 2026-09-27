# ADR-0015: Synthetic Camera Preview와 Realtime PTZ 경계

- 상태: 승인
- 날짜: 2026-09-09
- 범위: localhost 전용 Synthetic Camera Preview 및 PTZ control vertical slice

## 결정

B04는 camera 전용 read model을 통해 Synthetic Camera 한 대(`tenant-a/site-a/camera-a-01`)를 노출합니다. Video frame을 telemetry model에 넣지 않고 Frozen M1 contract도 확장하지 않습니다.

Browser 기능은 세 개의 독립된 경계로 나눕니다.

1. **Media:** host FFmpeg가 H.264 `testsrc2` stream을 RTSP로 MediaMTX에 publish합니다. Browser는 MediaMTX에서 WebRTC로 stream을 읽습니다. Kafka, telemetry projection, HLS는 video path에 포함하지 않습니다.
2. **Control session:** REST로 camera lease를 획득하고 해제합니다. Redis는 단일 owner, 5초 TTL, heartbeat renewal, 단조 증가하는 generation을 원자적으로 관리합니다. Preview 가능 여부는 lease 수명과 독립적입니다.
3. **Realtime PTZ:** 인증된 WebSocket은 `MOVE`, `STOP`, `HEARTBEAT`만 받습니다. Joystick input은 latest-wins 방식이며 durable command store에 기록하거나 Kafka로 replay하지 않습니다. `STOP`은 대기 중인 move보다 우선합니다.

## 안전 불변조건

- 조회 권한과 제어 권한을 분리합니다. Viewer는 camera를 볼 수 있지만 control session을 획득할 수 없습니다.
- WebSocket origin은 localhost web console로 제한합니다.
- Application server는 WebSocket handshake 중 인증 scope와 active lease를 다시 검증합니다.
- Device Gateway는 각 ONVIF operation 직전에 Redis owner와 generation을 조회합니다. 이전 generation에서 늦게 도착한 move/stop은 거부합니다.
- Pointer release, focus loss, page hide, page exit, socket close, lease loss가 발생하면 priority stop을 요청합니다. Server는 abandoned move에 대해 dead-man stop도 보냅니다.
- Synthetic ONVIF `ContinuousMove`에는 최대 500ms의 finite device timeout을 항상 넣고 명시적 `Stop`도 지원합니다. Simulator는 `GetStatus`로 최종 pose를 제공합니다.
- XML parsing에서 DTD와 external entity를 비활성화합니다. Camera endpoint와 localhost Gateway credential은 runtime configuration에서만 읽습니다.

## 실패 처리

- 이미 lease가 점유 중이면 `409 CONTROL_LEASE_HELD`, 만료되거나 superseded된 session은 `409 CONTROL_SESSION_STALE`, scope/permission 거부는 `403 SCOPE_DENIED`를 반환합니다.
- Gateway fencing에서 거부된 요청은 실제 device operation을 호출하지 않습니다. stale move뿐 아니라 stale stop에도 동일하게 적용해 이전 owner가 새 owner의 제어를 중단할 수 없게 합니다.
- Media 장애는 PTZ 권한을 암묵적으로 바꾸지 않고 preview health만 변경합니다. ONVIF 장애가 발생하면 control은 비활성화되지만 사용 가능한 preview는 계속 볼 수 있습니다.
- Device failure는 error로 반환하며 성공 ACK로 처리하지 않습니다.

## Media image와 Release 경계

MediaMTX image는 정확한 tag와 digest로 고정합니다. CI는 해당 image를 Trivy로 스캔해 `HIGH`/`CRITICAL` finding을 확인하고 JSON report가 설정된 digest에 대한 결과인지 검증합니다. Scan 실행 성공과 image security 또는 product release 통과는 별개의 상태로 관리합니다.

## 범위 제외

실제 camera credential, 전체 벤더 호환성, TCP/polling control, durable command workflow, preset, alarm, AI, billing, performance claim, hosting, tag, 프로덕션 배포는 이 Synthetic slice의 범위에서 제외합니다.
