# Local Observe 빠른 실행 가이드

이 문서는 Synthetic 장비만 사용하는 localhost 전용 포트폴리오 Preview 실행 방법을 설명합니다. 프로덕션 배포나 실제 장비·고객 데이터 연결 절차가 아닙니다.

## 사전 준비

프로젝트 기준 버전은 Java 21(`.java-version`), Node.js 24(`.nvmrc`), pnpm 11.25.0(`package.json`)입니다. 다음 도구가 필요합니다.

- Git
- Docker Engine 또는 Docker Desktop, Compose v2
- JDK 21
- Node.js 24, pnpm 11.25.0(Corepack 또는 독립 설치)
- Python 3.13

Windows 검증 환경은 Git 2.45.1, Docker Engine 29.7.2, Docker Compose 5.5.0, Node.js 24.12.0, pnpm 11.25.0, Python 3.13.0을 사용합니다. Ubuntu CI는 GitHub-hosted runner의 JDK 21, Node.js 24, pnpm 11.25.0, Python 3.13과 runner에서 제공하는 Docker Compose를 사용합니다. 두 환경의 검증 결과는 [현재 공개 상태](project-status.md)에 기록합니다. macOS는 직접 검증하지 않았습니다(`NOT_RUN`).

Docker Desktop이 실행 중인지 먼저 확인합니다. 기본 포트 `3000`, `21883`, `25432`, `26379`, `28080`~`28082`, `29092`, `29093`도 비어 있어야 합니다. Keycloak은 기본적으로 `28080`을 사용합니다.

## Windows PowerShell

```powershell
git clone https://github.com/krait4g/fieldops-control-plane.git
cd fieldops-control-plane

pnpm --version

py -3 scripts/b02_observe.py up
py -3 scripts/b02_observe.py status
py -3 scripts/b02_observe.py demo --device all --scenario portfolio
py -3 scripts/b02_observe.py verify
```

`28080`을 다른 프로세스가 사용 중이라면 해당 프로세스를 종료하지 말고, 같은 PowerShell에서 사용 가능한 loopback 포트를 지정해 모든 lifecycle 명령에 유지합니다. 값은 `1`~`65535` 범위의 정수여야 합니다.

```powershell
$env:B02_KEYCLOAK_PORT='28083'
py -3 scripts/b02_observe.py up
py -3 scripts/b02_observe.py status
py -3 scripts/b02_observe.py demo --device all --scenario portfolio
py -3 scripts/b02_observe.py verify
py -3 scripts/b02_observe.py down
```

`up`은 Compose 구성이 localhost 전용인지 확인하고 PostgreSQL, Redis, Kafka, Mosquitto, Keycloak container를 시작합니다. 이후 Java 실행 파일과 production Web을 build하고 Server, Gateway, Worker, Web 프로세스를 시작합니다. 첫 실행은 Gradle과 pnpm dependency를 내려받으므로 시간이 걸릴 수 있습니다.

## Ubuntu / Linux

```bash
git clone https://github.com/krait4g/fieldops-control-plane.git
cd fieldops-control-plane

pnpm --version

python3 scripts/b02_observe.py up
python3 scripts/b02_observe.py status
python3 scripts/b02_observe.py demo --device all --scenario portfolio
python3 scripts/b02_observe.py verify
```

Linux에서도 Keycloak host port가 충돌하면 같은 shell에서 `export B02_KEYCLOAK_PORT=28083`처럼 명시한 뒤 `up`부터 `down`까지 동일하게 유지합니다.

## 브라우저 확인

비밀번호는 저장소에 고정하지 않습니다. `up`이 현재 clone에 생성한 파일에서 Synthetic 사용자와 비밀번호를 확인합니다.

Windows PowerShell:

```powershell
Get-Content .fieldops-b02/demo-credentials.json
```

Ubuntu / Linux:

```bash
cat .fieldops-b02/demo-credentials.json
```

브라우저에서 <http://localhost:3000/login>을 열고 표시된 사용자 중 하나로 로그인합니다. 다음을 확인합니다.

1. `Overview`에서 세 Synthetic soil sensor의 최신 값과 추세가 보이는지 확인합니다.
2. `Devices`에서 장비 하나를 선택해 `Device Detail`의 최신 상태와 이력 chart를 확인합니다.
3. 필요하면 `Members`에서 현재 Synthetic tenant의 읽기 전용 목록을 확인합니다.

`portfolio` 시나리오는 세 Synthetic soil sensor의 deterministic telemetry를 MQTT QoS 1 → Kafka → History/Latest → REST/SSE 경로로 전달합니다. UI는 한국어가 기본이며 영어로 전환할 수 있습니다.

## 종료

Windows PowerShell:

```powershell
py -3 scripts/b02_observe.py down
```

Ubuntu / Linux:

```bash
python3 scripts/b02_observe.py down
```

`down`은 이 clone의 manifest로 확인한 프로세스와 `fieldops-b02` Compose project의 container/network만 종료합니다. 전역 Docker service나 다른 Compose project를 건드리지 않으며 PostgreSQL named volume은 현재 정책상 보존합니다.

문제가 생기면 `.fieldops-b02/logs/`의 로컬 로그를 확인할 수 있습니다. 이 디렉터리와 생성 credential은 Git에서 제외되며 CI artifact로 업로드하지 않습니다.
