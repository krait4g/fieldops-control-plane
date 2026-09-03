# Runtime Applications

`apps/` contains independently executable product runtimes. Runtime separation follows workload, protocol and failure boundaries rather than an attempt to maximize the number of services.

| Application | Responsibility | Initial deployment note |
|---|---|---|
| `fieldops-server` | REST/SSE/WebSocket, OIDC session, product query and mutation | Northbound runtime |
| `device-gateway` | MQTT/TCP/Polling/ONVIF adaptation, command dispatch and camera control | Southbound runtime |
| `fieldops-worker` | normalization, PostgreSQL history, Redis projection, offline and workflow consumers | consumer groups and thread pools remain isolated |
| `billing-job` | usage aggregation, preview and reconciliation | extension milestone |
| `simulator` | deterministic devices and failure scenarios | never part of production runtime classpaths |
| `web-console` | Next.js operations console | separate pnpm build graph |

Applications may depend on approved `modules/*`. One runtime must not depend directly on another runtime.

Frontend and backend are maintained in the same repository because they share versioned API/event contracts and milestone acceptance. They do not share internal source code or business-rule ownership.

Current status: directory and design baseline. Executable application skeletons are part of M0 and are not yet claimed as verified.
