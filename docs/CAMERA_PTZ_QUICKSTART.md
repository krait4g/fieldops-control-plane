# Camera Preview & PTZ Quick Start

이 안내는 Synthetic H.264 영상과 Synthetic ONVIF 장비만 사용하는
localhost 전용 포트폴리오 Preview를 실행합니다. 실제 카메라, 고객 데이터,
Production 배포 절차가 아닙니다.

## 사전 준비

- Docker Engine 또는 Docker Desktop과 Docker Compose v2
- JDK 21
- Node.js 24와 pnpm 11.25.0
- Python 3
- H.264 `libx264` encoder가 포함된 FFmpeg
- WebRTC를 지원하는 최신 Chromium 계열 브라우저

Docker Desktop을 사용하는 경우 먼저 실행 상태인지 확인하세요. B04는 기존
Local Observe port에 더해 `28084`, `28189/udp`, `28554`, `28889`, `29997`을
localhost에 사용합니다. 필요한 port가 사용 중이면 orchestration은 다른
process를 종료하지 않고 중단합니다.

기본 Keycloak port `28080`만 충돌한다면 그 process를 종료하지 말고, 같은
PowerShell 또는 shell에서 빈 loopback port를 선택해 `up`부터 `down`까지
`B02_KEYCLOAK_PORT`를 유지하세요.

Windows PowerShell 예시:

```powershell
$env:B02_KEYCLOAK_PORT='28083'
```

Ubuntu / Linux 예시:

```bash
export B02_KEYCLOAK_PORT=28083
```

FFmpeg encoder는 다음 명령으로 확인할 수 있습니다.

```text
ffmpeg -hide_banner -encoders
```

출력에 `libx264`가 있어야 합니다.

## Windows PowerShell

```powershell
git clone https://github.com/krait4g/fieldops-control-plane.git
cd fieldops-control-plane

pnpm --version
py -3 scripts/b04_camera.py up
py -3 scripts/b04_camera.py status
py -3 scripts/b04_camera.py verify
py -3 scripts/b04_camera.py down
```

## Ubuntu / Linux

Ubuntu CI에서도 같은 수명주기를 실행합니다. FFmpeg의 `libx264` 지원과 Docker
Compose v2가 준비된 Linux에서는 다음 명령을 사용합니다.

```bash
git clone https://github.com/krait4g/fieldops-control-plane.git
cd fieldops-control-plane

pnpm --version
python3 scripts/b04_camera.py up
python3 scripts/b04_camera.py status
python3 scripts/b04_camera.py verify
python3 scripts/b04_camera.py down
```

`up`은 source head와 task-owned process identity를 기록하고, Local Observe의
PostgreSQL·Redis·Kafka·Mosquitto·Keycloak, Java service, production Web,
MediaMTX, Synthetic ONVIF simulator, FFmpeg publisher를 시작합니다. MediaMTX는
exact digest로 고정되며 모든 host publish는 `127.0.0.1`입니다. Compose project
이름에는 checkout 경로 fingerprint가 들어가므로 다른 clone의 container,
network, named volume을 재사용하지 않습니다.

`verify`는 실제 Chromium WebRTC 재생과 REST/WebSocket/ONVIF 경로를 포함한
G1-G10을 검사합니다. 주요 경계는 scope와 control permission, Redis
lease/generation fencing, monotonic sequence, latest-wins dispatch, priority
stop, server dead-man, device-side finite timeout, media/control failure isolation,
기존 Local Observe 회귀입니다.

## 실제 브라우저 확인

비밀번호는 저장소에 포함되지 않습니다. `up`이 현재 clone 아래에 만든
`.fieldops-b04/b02/demo-credentials.json`에서 Synthetic 사용자와 비밀번호를
확인합니다.

Windows PowerShell:

```powershell
Get-Content .fieldops-b04/b02/demo-credentials.json
```

Ubuntu / Linux:

```bash
cat .fieldops-b04/b02/demo-credentials.json
```

브라우저에서 <http://localhost:3000/login>을 열고 `b02-admin-a`로 로그인한 뒤
다음을 확인합니다.

1. `카메라`에서 `Greenhouse Camera 01` 상세로 이동합니다.
2. Synthetic test pattern이 WebRTC로 재생되는지 확인합니다.
3. `제어권 획득` 후 연결 상태가 표시되는지 확인합니다.
4. 방향 또는 zoom control을 잠시 누르고 pose 값이 변하는지 확인합니다.
5. 입력을 놓았을 때 이동 상태가 정지하는지 확인합니다.
6. `제어권 해제` 후 control이 비활성화되는지 확인합니다.

## 종료와 로컬 산출물

반드시 현재 clone에서 `down`을 실행하세요. 이 명령은 manifest로 소유권을
확인한 B04/B02 process와 두 Compose project의 container/network만
종료합니다. 다른 process나 Docker project를 조작하지 않으며 B02 named
volume은 보존합니다.

`.fieldops-b04/`에는 이 clone의 생성 credential, log, manifest, verify 결과,
runtime screenshot이 저장됩니다. 전체 디렉터리는 Git에서 제외되며 공개
CI artifact로 업로드하지 않습니다.

설계 배경은 [ADR-0015](decisions/0015-b04-camera-preview-ptz-boundary.md),
기존 sensor 경로는 [Local Observe Quick Start](LOCAL_OBSERVE_QUICKSTART.md)를
참고하세요.
