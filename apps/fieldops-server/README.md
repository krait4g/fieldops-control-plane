# fieldops-server

Northbound product runtime.

- REST snapshot, search and mutation APIs
- SSE device, alarm, incident and command updates
- PTZ WebSocket session endpoint
- OIDC browser session and tenant/site authorization
- Dashboard, device, camera, alarm, command and membership queries

It does not own MQTT/TCP/ONVIF clients or direct device command transport. Product business rules remain in approved domain/application modules rather than controllers or the web console.

Current status: boundary only. Executable bootstrap is M0 scope.
