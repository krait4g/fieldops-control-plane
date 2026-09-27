# 보안 정책

## 지원 버전

현재 프로젝트는 초기 개발 단계입니다. 버전이 명시된 Release를 제공하기 전까지 보안 수정은 기본 브랜치를 기준으로 적용합니다.

## 취약점 제보

Credential, 비공개 장비 정보, 실제 시스템에 대한 공격 재현 절차, 민감한 로그가 포함된 공개 Issue를 생성하지 마세요. 최소한의 설명으로 GitHub를 통해 저장소 소유자에게 연락하고 비공개로 공개 범위를 조율합니다.

가능하면 영향 받는 commit, component, trust boundary, Synthetic 재현 절차, 영향도, 재현 전제조건, 완화 방안을 함께 전달해 주세요.

## 보안 범위

중요한 보안 경계에는 tenant 격리, MQTT 장비 identity, API 권한 검증, command 승인/idempotency, 이벤트 schema 검증, Redis key scope, SSE subscription 격리, AI tool-policy 검증이 포함됩니다.

독립적인 보안 및 운영 검토 없이 이 프로젝트를 프로덕션 credential이나 안전이 중요한 물리 장비에 사용하지 마세요.
