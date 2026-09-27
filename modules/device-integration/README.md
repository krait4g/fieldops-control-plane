# device-integration

Device connectivity와 canonicalization을 위한 protocol-neutral contract를 정의합니다.

- protocol profile과 adapter capability
- connection session과 health
- connection test 결과
- canonical source identity
- telemetry와 command adapter port

MQTT, TCP, HTTP polling, ONVIF client type이 이 모듈 경계를 넘어오지 않도록 합니다. 구체적인 protocol client는 infrastructure 또는 `device-gateway`에 둡니다.

현재 상태: 설계 경계만 정의.
