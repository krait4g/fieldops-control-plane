# DB Migration

Flyway migration은 merge 이후 append-only로 관리합니다. Runtime DDL 자동 생성은 비활성화합니다. M0에서 migration 실행 기반을 만들고, domain schema는 해당 마일스톤과 함께 추가합니다.
