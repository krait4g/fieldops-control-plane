# TCP/Binary Adapter Quick Start

Prerequisites match Local Observe: Java 21, Docker Compose, Node 24, pnpm 11, Python 3, and Chromium installed by Playwright.

```bash
python3 scripts/b07_tcp_binary.py up
python3 scripts/b07_tcp_binary.py status
python3 scripts/b07_tcp_binary.py demo --scenario fragment-header
python3 scripts/b07_tcp_binary.py fault --scenario bad-crc
python3 scripts/b07_tcp_binary.py verify
python3 scripts/b07_tcp_binary.py down
```

On Windows, use `py -3`. Runtime data stays under `.fieldops-b07`; Compose uses a checkout-derived project name. `down` stops only recorded B07/B02-owned processes and that project, preserving named volumes.

Open `http://localhost:3000`, sign in with `.fieldops-b07/b02/demo-credentials.json`, then filter Devices by TCP Binary and open **A Soil Sensor TCP 01**. The existing Device Detail displays live moisture and temperature.

This runnable is one localhost synthetic endpoint. It does not provide TLS, arbitrary endpoint configuration, vendor compatibility, fleet scaling, or TCP commands.
