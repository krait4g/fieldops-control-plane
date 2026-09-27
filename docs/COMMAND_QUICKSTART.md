# Durable Command 빠른 실행 가이드

이 localhost 전용 B05 slice는 실제 Keycloak session, 요청자/승인자 분리, PostgreSQL durable ledger, 서로 경쟁하는 두 개의 `FOR UPDATE SKIP LOCKED` dispatcher, Gateway delivery deduplication, Synthetic 장비 결과 확인을 이용해 하나의 Synthetic Valve 명령을 검증합니다.

## 사전 준비

- Java 21, Node.js 24, pnpm 11
- Docker 및 Compose
- Playwright용 Chromium 설치(`pnpm --filter @fieldops/web-console exec playwright install chromium`)
- localhost 포트 `3000`, `21883`, `25432`, `26379`, `28080`~`28082`, `28085`, `29092`~`29093` 사용 가능

## 실행

```powershell
pnpm install --frozen-lockfile
py -3 scripts/b05_command.py up
py -3 scripts/b05_command.py status
py -3 scripts/b05_command.py demo
py -3 scripts/b05_command.py verify
py -3 scripts/b05_command.py down
```

Linux에서는 `py -3` 대신 `python3`를 사용합니다. <http://localhost:3000/commands?tenant=tenant-a&site=site-a>를 엽니다. localhost용으로 생성된 credential은 Git에서 제외되는 `.fieldops-b05/b02/demo-credentials.json`에 저장됩니다. 비밀번호를 commit하거나 로그에 출력하지 않습니다.

`b05-operator-a`로 OPEN/CLOSE를 요청하고 `b05-approver-a`로 승인 또는 반려합니다. `SUCCESS`는 먼저 ACK를 반환한 뒤 실제 상태를 확인합니다. `REJECT`는 dispatch 이후 `FAILED`가 되고, `HANG`은 deadline에서 `UNKNOWN`으로 끝나며 자동 재시도하지 않습니다.

## 안전 경계

- B04 PTZ는 별도 경로이며 이 ledger에 들어오지 않습니다.
- Kafka는 telemetry 전용입니다. B05 dispatch는 PostgreSQL claim과 인증된 loopback HTTP를 사용합니다.
- Idempotency는 API 요청의 수렴을 보장하기 위한 것이며 exactly-once 실행을 의미하지 않습니다.
- `ACKNOWLEDGED`는 성공이 아닙니다. 실제 Valve 상태가 확인되어야 `SUCCEEDED`로 전환됩니다.
- `UNKNOWN`은 terminal 상태이며 이후 작업자의 명시적인 판단이 필요합니다.
- `down`은 identity가 일치하는 B05/B02 프로세스와 해당 checkout 범위의 Compose project만 종료합니다. Named volume과 증빙 데이터는 유지합니다.

이 문서는 실행 가능한 Synthetic 포트폴리오 slice를 위한 것이며 프로덕션 Release, HA, 장비 인증 또는 S01 면제를 의미하지 않습니다.
