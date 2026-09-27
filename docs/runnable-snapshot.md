# FieldOps 실행 소스 Snapshot

이 저장소는 localhost에서 Synthetic 장비 데이터를 관찰하고 Camera/PTZ 및 승인형 Valve 명령을 실행하는 포트폴리오 Snapshot을 포함합니다. 프로덕션 Release가 아니며 실제 고객 데이터나 운영 credential을 사용하지 않습니다. 이 문서를 포함한 Git commit이 공개 Snapshot의 정확한 source identifier입니다.

## 포함 범위

실행 경로는 다음과 같습니다.

```text
Simulator
  → MQTT QoS 1
  → Device Gateway
  → Kafka raw
  → FieldOps Worker / normalized
  → PostgreSQL History + Redis Latest State
  → FieldOps Server REST/SSE
  → Next.js Web Console

Synthetic H.264 / RTSP
  → MediaMTX / WebRTC
  → Next.js Camera Preview
  → Redis Lease + Generation Fencing
  → WebSocket PTZ
  → Device Gateway final revalidation
  → Synthetic ONVIF ContinuousMove / Stop

Operator request → PENDING_APPROVAL → separate Approver
  → PostgreSQL durable ledger / SKIP LOCKED claim
  → Device Gateway commandId dedup → Synthetic Valve
  → ACKNOWLEDGED → actual state proof → SUCCEEDED / FAILED / UNKNOWN
```

공개 실행 소스에는 다음이 포함됩니다.

- `apps/fieldops-server` — 인증 Session, Tenant/Site scope, REST/SSE 조회
- `apps/device-gateway` — MQTT telemetry 수집과 Kafka raw publish
- `apps/fieldops-worker` — 정규화, PostgreSQL History, Redis Latest State
- `apps/simulator` — Synthetic random/portfolio 시나리오
- `apps/web-console` — 한국어 기본 운영 화면과 영어 전환
- `modules/telemetry-domain`, `modules/telemetry-application` — 공통 telemetry model과 정규화
- `modules/camera-control` — realtime lease와 latest-wins PTZ command 경계
- `modules/command-domain` — Durable Command 상태 전이와 payload 경계
- `contracts`, `fixtures/m1` — OpenAPI/AsyncAPI/JSON Schema, UI contract, Synthetic fixture
- `infra/compose`, `infra/b02`, `scripts/b02_observe.py` — localhost 전용 실행 구성과 orchestration
- `infra/b04`, `scripts/b04_camera.py` — exact-digest MediaMTX와 Camera/PTZ orchestration
- `scripts/b05_command.py` — Synthetic Valve Durable Command와 실제 Chromium orchestration
- Gradle/pnpm wrapper, lockfile, contract 검사, 공개 저장소 baseline

Compose include, bind mount, Gradle project dependency, Web import, contract 검사, orchestration 파일 참조를 따라 이 범위를 구성했습니다. 실행 소스는 해당 공개 시점에 검증된 Local Observe 구현과 동일한 내용이며, 공개 문서·CI·allowlist용 build 설정만 이 저장소에 맞게 유지합니다.

## 제외 범위

Billing, TCP/Binary, Alarm, AI, Rule Engine 구현은 이 Snapshot에 포함하지 않습니다. Camera/PTZ와 Durable Command는 각각 Synthetic 장비 한 대와 localhost 경로만 포함하며 전체 벤더 호환성, exactly-once, 다단계 승인, 자동 재전송을 의미하지 않습니다. 성능 benchmark, 고가용성, 프로덕션 배포, Tag, GitHub Release, Hosting도 포함하지 않습니다.

## 안전 경계와 알려진 제한

- localhost 전용 Synthetic Preview입니다.
- 모든 host port와 Web process는 `127.0.0.1`에만 bind됩니다.
- 실행 중 생성되는 비밀번호와 로그는 `.fieldops-b02/` 아래에만 저장하고 Git에서 제외합니다.
- Camera 실행 중 생성되는 credential, log, screenshot은 `.fieldops-b04/` 아래에 저장하고 Git에서 제외합니다.
- Command 실행 중 생성되는 credential과 log는 `.fieldops-b05/` 아래에 저장하고 Git에서 제외합니다.
- PostgreSQL named volume은 `down` 이후에도 보존합니다.
- Container image 취약점 검토는 계속 릴리스 차단 조건입니다.
- macOS 실행은 가능할 것으로 예상하지만 이 Snapshot에서는 직접 검증하지 않았습니다(`NOT_RUN`).

실행 방법은 [Local Observe 빠른 실행 가이드](LOCAL_OBSERVE_QUICKSTART.md), [Camera/PTZ 빠른 실행 가이드](CAMERA_PTZ_QUICKSTART.md), [Durable Command 빠른 실행 가이드](COMMAND_QUICKSTART.md)를 참고하세요.
