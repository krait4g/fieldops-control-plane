# fieldops-server

Northbound 제품 API runtime입니다.

- REST Snapshot/Mutation
- SSE 상태/알람/명령 업데이트
- PTZ WebSocket endpoint
- OIDC session, tenant/site 권한 검증
- Dashboard, Device, Camera, Alarm, Command, Membership API

Southbound protocol client와 Kafka Consumer workflow를 직접 구현하지 않습니다.
