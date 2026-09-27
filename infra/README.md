# 인프라

로컬 개발과 재현 가능한 검증에 사용하는 설정을 관리합니다.

- `compose/`: 로컬 stack 진입점
- `kafka/`: topic/partition/retention 선언
- `redis/`: ACL, persistence, Lua packaging, fault profile
- `postgres/`: 초기화와 로컬 tuning
- `mqtt/`: Mosquitto 설정과 ACL
- `keycloak/`: realm/client bootstrap
- `observability/`: Prometheus, Grafana, Tempo, Loki

이 디렉터리의 구성만으로 프로덕션 수준의 availability를 보장한다고 주장하지 않습니다.
