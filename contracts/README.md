# API 및 이벤트 Contract

기계 판독 가능한 API 및 이벤트 contract를 이 디렉터리에서 관리합니다.

```text
contracts/
├─ openapi/       REST 및 SSE를 지원하는 HTTP 정의
├─ asyncapi/      Kafka 및 MQTT channel/event 정의
└─ json-schema/   canonical envelope와 payload schema
```

Contract 변경과 영향 받는 producer/consumer 구현은 같은 Pull Request에서 함께 검증해야 합니다. Generated client는 contract에서 파생되는 산출물이며 별도의 정본이 아닙니다.

`contract-inventory.json`은 M0 foundation review를 M1 source 및 B02 개발 telemetry schema와 연결합니다. 추가된 `event-envelope-v1.schema.json`은 명시적으로 `DRAFT / NOT_CONSUMED_BY_RUNTIME` 상태이며 새로운 endpoint, topic, event type, delivery guarantee를 정의하지 않습니다. B02 runtime message는 구체적인 `b02-telemetry-raw.schema.json`과 `b02-telemetry-normalized.schema.json` contract를 사용합니다.

표준 parser, reference 검사, schema compile, inventory 검사는 `pnpm contract:lint`로 실행합니다. 정상/오류 예제와 기존 Frozen M1 validator는 `pnpm contract:test`로 검증합니다.
