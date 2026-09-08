# fieldops-server

Northbound product runtime.

- REST Snapshot/Mutation
- SSE state/alarm/command updates
- PTZ WebSocket endpoint
- OIDC session, tenant/site authorization
- Dashboard, Device, Camera, Alarm, Command, Membership API

Southbound protocol client와 Kafka Consumer workflow를 직접 구현하지 않는다.
