# dashboard-query

운영 콘솔용 read model을 구성합니다.

- tenant/site overview
- device와 zone 상태 요약
- active alarm과 최근 command projection
- time-series query 조합
- partial failure와 source/freshness metadata

UI에 필요한 조회 결과를 조합하지만 domain aggregate를 변경하거나 authorization을 우회하지 않습니다. PostgreSQL History와 Redis Latest State는 계속 서로 다른 source로 유지하고, caller에게 source와 freshness 정보를 노출해야 합니다.

현재 상태: 설계 경계만 정의.
