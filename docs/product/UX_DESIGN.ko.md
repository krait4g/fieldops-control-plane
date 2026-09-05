# UX 설계와 사용자 검증 계획

> 버전: `0.7.0`  
> 상태: `DEFINED / IN DEVELOPMENT`  
> 기본 지원 목표: Chromium desktop 1440px와 mobile 390px

## 목표와 정보 구조

운영자가 현재 문제가 무엇인지, 어떤 근거를 볼지, 정보가 최신인지 판단하도록 합니다. 이후 제어 기능에서는 요청·승인·전송·ACK·실제 결과를 구별합니다. Tenant → Site → Zone → Device → State/History라는 모델을 유지하고 Protocol은 보조 정보로 둡니다.

활성 UI 범위는 /login, /overview, /devices, /devices/{deviceId}, /admin/members입니다. Camera/Alarm/Command 등 미래 Route를 동작하지 않는 메뉴로 노출하지 않습니다. Overview의 미래 위젯은 가짜 성공 대신 Empty/Unavailable/권한 상태를 표시합니다.

## 상태를 혼합하지 않음

| 축 | 의미 |
|---|---|
| Stream | Connecting/Live/Reconnecting/Disconnected |
| 장비 연결 | Online/Offline/Degraded/Unknown |
| 최신성 | Fresh/Stale/Unknown |
| 준비 상태 | Ready/Not ready/Unknown |
| 위젯 | Available/Empty/Stale/Unavailable/Forbidden |
| 후속 명령 | 승인 대기/전송/ACK/수행 확인/실패/Unknown |

Stream Live는 장비 Fresh의 증거가 아니고 ACK는 수행 완료가 아닙니다. Snapshot 실패를 정상 0으로 표시하지 않습니다.

## 화면별 최소 동작

Overview는 상태·Freshness·Trend·Health를 우선하고 KPI에서 관련 필터 목록으로 이동합니다. Time Range는 이를 사용하는 Overview와 Device Detail에서만 보여줍니다.

Device List는 검색과 계약상 Device Type/Protocol/Connectivity/Readiness/Freshness 필터를 URL에 반영합니다. 계약에 없는 Zone 필터를 선행 추가하지 않습니다. Filter 변경은 Cursor를 초기화하고 Back/Forward·Clear·상세 이동을 지난 Debounce가 덮지 않게 합니다. 같은 값은 URL을 다시 갱신하지 않습니다.

Filter Toolbar는 결과 재조회 중에도 유지합니다. 초기 결과 Loading과 배경 Updating을 구분하며 Placeholder는 실제 Snapshot 성공이 아닙니다. 다른 Tenant/Site 또는 권한 철회에는 이전 성공 데이터를 노출하지 않습니다.

Device Detail은 Registry/State/History 오류를 나누고 값·단위·Quality·관측/수신 시각을 구분합니다. Registry 수정 시각을 Last Received로 대체하지 않습니다. Chart는 Gap을 연결하지 않고 다른 단위를 구분하며 읽을 수 있는 요약을 제공합니다. 계약에 없는 Delta를 만들지 않습니다.

Members는 read-only이고 권한이 없으면 메뉴를 숨기되 직접 접근 거부도 처리합니다. 수정/초대 기능을 추가하지 않습니다.

## 키보드·모바일

주요 이동은 키보드로 가능하고 Focus가 보이며, 핵심 텍스트 대비를 확보합니다. Chart Summary와 상태의 Text/Icon을 제공합니다. Drawer는 Tab/Escape·닫힌 후 적절한 Focus 복원·배경 inert 해제를 처리합니다. Drawer가 열린 채 Desktop으로 전환되어도 숨은 Modal 잠금이 남지 않아야 합니다.

페이지 이동과 단순 Query 변경을 구별하여 검색 중 Focus를 Heading으로 빼앗지 않습니다. 전체 Viewport/브라우저 행렬은 후속이며, 실제 구현한 중요한 Breakpoint 경계는 관련 회귀로 확인합니다.

## 후속 제어

Camera Connectivity/Preview/Control을 구분하고, 제어권 획득 전 PTZ를 허용하지 않습니다. 재연결 후 과거 입력을 재전송하지 않습니다. Stop 요청 실패와 장비 Timeout 한계를 정상 정지처럼 숨기지 않습니다.

Command는 승인 대기, Dispatch, ACK, Reported State, Unknown을 다른 단계로 표시합니다. 실행 여부가 불확실한 명령을 성공으로 추정하지 않습니다.

## 사용자 검증은 개선 입력

문제 식별 Median 10초, 근거 도달 30초, 상태 의미 이해 80%는 검증 전 가설입니다. 가능한 사용자에게 문제 찾기·상태와 Trend 읽기·Partial/Unknown 설명을 요청하고 관찰→작은 수정→관련 재검증을 남깁니다. 첫 UI Preview에 Proxy 3명이나 이 가설 수치 달성을 강제하지 않습니다.

## Preview Gate

주요 Route와 실패 상태, 권한/Scope, 키보드/핵심 모바일, 실제 타입·빌드·핵심 테스트, development-only Fixture 표시가 필수입니다. 미세 여백·문구 취향·모든 Screenshot 조합 때문에 공개를 늦추지 않습니다. 실제 접근성과 기능 결함을 시각 취향으로 분류하지 않습니다.

[PRD](PRD.ko.md) · [로드맵](ROADMAP.ko.md)
