# Backend Engineer

Java와 Spring Boot를 중심으로 백엔드 시스템을 개발하고 있습니다.  
실시간 데이터 처리, 외부 시스템 연동, 상태 관리와 데이터 정합성 문제를 주로 다뤄왔습니다.

최근에는 실제 업무에서 경험한 문제를 일반화해 작은 프로젝트로 구현하고, 설계 선택과 검증 과정을 함께 기록하고 있습니다.

## Projects

### [FieldOps Control Plane](https://github.com/krait4g/fieldops-control-plane)

서로 다른 현장 장비의 데이터를 공통 모델로 수집하고 최신 상태와 이력을 제공하는 운영 플랫폼을 만들고 있습니다.

`Java` `Spring Boot` `Kafka` `PostgreSQL` `Redis` `MQTT` `SSE`

- 장비별 통신 방식과 도메인 모델 분리
- History와 Latest State 저장 경로 분리
- 중복·역순 이벤트와 장애 상황에서의 상태 정합성 검증
- 인증과 장비 접근 범위를 포함한 운영 화면 구성

---

### [OutcomeProbe](https://github.com/krait4g/outcomeprobe-public)

외부 API 호출과 Webhook 처리 과정에서 발생할 수 있는 모호한 실패 상황을 재현하고 최종 상태를 검증하는 테스트 도구입니다.

`Java` `Spring Boot` `PostgreSQL` `Docker`

- Timeout after commit
- Duplicate / delayed / reordered webhook
- Provider 상태와 애플리케이션 상태 분리 검증
- 재현 가능한 Scenario 기반 실패 테스트

---

### [Radar Correction Explorer](https://github.com/krait4g/radar-correction-explorer)

Radar와 RF Scanner의 관측 데이터를 함께 비교하기 위해 만든 로컬 분석 도구입니다.

`Java` `Spring Boot` `PostgreSQL`

- Raw / Corrected 좌표 비교
- Radar / RF Scanner 데이터 통합 조회
- Track 단위 시각화와 고도 변화 분석
- Synthetic Data 기반 독립 실행 환경 제공

## Tech

**Backend**  
Java · Spring Boot · REST API · SSE

**Data & Messaging**  
Kafka · PostgreSQL · Redis

**Integration**  
MQTT · TCP/IP · HTTP API

**Engineering**  
Docker · Testcontainers · GitHub Actions

---

각 Repository에는 구현뿐 아니라 문제를 어떤 기준으로 나누고 어떤 선택을 했는지도 함께 기록하려고 합니다.
