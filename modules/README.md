# Java 모듈

`modules/`에는 재사용 가능한 domain, application, infrastructure 경계를 둡니다.

```text
Domain ← Application ← Infrastructure ← Runtime
```

Domain code는 Spring Web, Kafka, Redis, JPA, SQL mapper, device client에 의존할 수 없습니다. Application module은 use case와 port를 정의하고 infrastructure module이 해당 port를 구현합니다. Runtime application은 wiring을 담당합니다.

## 모듈 구성

| 구분 | 모듈 |
|---|---|
| Foundation | `common-kernel`, `tenancy`, `registry` |
| Integration | `device-integration`, `camera-control` |
| Telemetry | `telemetry-domain`, `telemetry-application`, `telemetry-infrastructure`, `state-projection` |
| Product query | `dashboard-query` |
| Operations | `rule-engine`, `alarm-incident`, `command-domain`, `command-application` |
| Extensions | `ai-operations`, `usage-billing` |
| Cross-cutting | `audit`, `observability` |

모듈 이름은 책임을 나타내며 자동으로 독립 배포 단위를 의미하지 않습니다. Runtime 경계는 `apps/` 문서에서 관리합니다.
