# TCP/Binary Adapter 빠른 실행 가이드

사전 준비는 Local Observe와 동일합니다. Java 21, Docker Compose, Node.js 24, pnpm 11, Python 3, Playwright로 설치한 Chromium이 필요합니다.

```bash
python3 scripts/b07_tcp_binary.py up
python3 scripts/b07_tcp_binary.py status
python3 scripts/b07_tcp_binary.py demo --scenario fragment-header
python3 scripts/b07_tcp_binary.py fault --scenario bad-crc
python3 scripts/b07_tcp_binary.py verify
python3 scripts/b07_tcp_binary.py down
```

Windows에서는 `py -3`를 사용합니다. Runtime 데이터는 `.fieldops-b07` 아래에 저장되며 Compose는 checkout 경로에서 파생한 project name을 사용합니다. `down`은 기록된 B07/B02 소유 프로세스와 해당 project만 종료하고 named volume은 보존합니다.

<http://localhost:3000>을 열고 `.fieldops-b07/b02/demo-credentials.json`의 계정으로 로그인한 뒤 Devices에서 TCP Binary로 필터링하고 **A Soil Sensor TCP 01**을 엽니다. 기존 Device Detail 화면에서 moisture와 temperature의 실시간 값을 확인할 수 있습니다.

이 runnable은 localhost에 설정한 Synthetic endpoint 한 개만 지원합니다. TLS, 임의 endpoint 설정, 전체 벤더 호환성, fleet scale, TCP command 기능을 제공한다고 주장하지 않습니다.
