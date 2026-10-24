# CHANGELOG - 변경 이력
> 추가만 한다. 요구·결정·설계가 바뀔 때마다 한 줄씩 남긴다. 팀장만 쓴다.

형식: C-번호 | 날짜 | 대상 | 이전 -> 이후 | 이유 | 영향 역할

---
C-01 | 2026-10-18 | 문서 구조 | CLAUDE.md 한 장 -> 팀장 규칙 + docs/(R·D·P) | 팀 운영 키트 적용 | 전원
C-02 | 2026-10-18 | 요구 | R-01~07 -> R-08~15 추가, R-03 회원 범위를 지정 교감으로 축소 예정 | 이전 전 수정 요청 | architect, developer
C-03 | 2026-10-18 | 결정 | D-05 시군구 256 시작 -> 시/도 16 시작(하위 비활성), P-08~13 -> D-15~20 | 사용자 컨펌 | architect, developer, tester
C-04 | 2026-10-18 | 진행·문서 | 아티팩트에서 수정 후 이전 -> 로컬 prototype에서 수정(M0), 설계안 docs/design/로 이동 | 로컬 이전 | 전원
C-05 | 2026-10-18 | 결정 | P-14 -> D-21 로컬 모의 어댑터(BroadcastChannel), M0-1 착수 | 사용자 승인 | developer, tester
C-06 | 2026-10-18 | 결정 | P-06 -> D-22 공개 저장소, 작성자 noreply, 첫 푸시 완료 | 사용자 | 전원
C-07 | 2026-10-18 | 결정 | 어드민 욕구 슬라이더가 파생 감정도 옮김(a안) -> D-23, M0-1 tester 지적 3건 수정 | 사용자 | developer, tester
C-08 | 2026-10-18 | 설계 | R-16 의견 보내기·R-17 명소 배경 추가, 설계 문서 신규, P-16~P-21 | 사용자 요구 | developer
C-09 | 2026-10-18 | 결정 | P-16·17·20·21 -> D-24 Web3Forms, D-25 90일, D-26 명소 이름만, D-27 후보 2~3곳 순환 | 사용자 | architect, developer
C-10 | 2026-10-18 | 구현 | 수정 묶음 A: 공유 개편(5채널·색 원형·기기 공유 제거), 손 위치, 지역창, 게시판 동기, M0-3 보완 | 사용자 요청·tester 지적 | tester
C-11 | 2026-10-18 | 구현 | 수정 묶음 B2: 교감 반응 개냥이 20%·극성 표(D-30), 이름짓기 개편(D-31), 손님 칩 점선+발바닥 | 사용자 시연 지적 | tester
C-12 | 2026-10-18 | 결정 | 중성화 약 50%, 수컷(중)·암컷(중), 귀 끝 컷, 땅콩 유지 -> D-32 | 사용자 | developer, tester
C-13 | 2026-10-18 | 승인 | M0-4 행동 레시피 완료, 안내 문서 한도 동기화, 리팩토링 마일스톤 예고(D-33,34) | 사용자 | developer, tester, documenter
C-14 | 2026-10-18 | 구현 | 리팩토링 단계 0·1: tests/ 이전·기준값, style.css·data/regions.json 분리(index.html 1.62MB -> 0.30MB) | D-33 | developer, tester
C-15 | 2026-10-18 | 구현 | 리팩토링 단계 2: 순수 로직을 prototype/src/core/ 11개 모듈로 분리(index.html 298KB -> 237KB), node 단위 시험·import 검사 추가 | D-33 | developer
C-16 | 2026-10-18 | 구현 | 리팩토링 단계 3: 나머지 코드를 src/ 아래 47개 모듈(core 14·adapters·state·render·sim·ui·app·main)로 분리(index.html 237KB -> 6KB), 층 규칙 검사, 모듈 불러오기 실패 안내 | D-33 | developer, tester
C-17 | 2026-10-19 | 구현 | R-16 의견 보내기 화면·모의 어댑터·어드민 의견함(core/feedback_rules, adapters/feedback, config.js, ui/feedback*), GATE에 feedback 추가 | D-24, D-25 | developer
C-18 | 2026-10-19 | 결정 | 의견 보내기 결함 수정 승인, 명소 1단계 후보표 확정 -> D-36 | 사용자 | developer, architect, tester
C-19 | 2026-10-19 | 구현 | R-17 명소 배경 1단계: data/landmarks.json, core/landmarks.js, render/backdrop*.js(부품 15종), adapters/landmarks_data.js, ui/landmark_admin.js, tests/backdrop.js | D-26~29, D-36 | developer, tester
C-20 | 2026-10-24 | 결정 | P-01~05 해결: 카카오+Google, 보안 검토 후 전체 공개, 상자 이웃 공유, 행동 간격 30~120초, 30일·100명 -> D-37~41 | 사용자 | 전원
C-21 | 2026-10-24 | 결정 | R-17 시야 B 방식 + 줌아웃 거리 확대 -> D-42. R-18 토큰 최적화 에이전트·설계 추가 | 사용자 | developer, 전원
C-22 | 2026-10-24 | 결정 | 토큰 수칙 문서 참조·CLAUDE.md 정리·소스 구조를 prototype/src/README.md로 -> D-43 | 사용자 | 전원
C-23 | 2026-10-24 | 결정 | R-19 보안 설계(P-22~27), R-20 로그 설계·저장 위치 -> D-44, P-28 | 팀장 | developer, security, devops
C-24 | 2026-10-24 | 결정 | P-22~24·26·27 해결 -> D-45~49, 이름짓기 회원 전용으로 D-16 범위 확대 | 사용자 | developer, security, tester
C-25 | 2026-10-24 | 결정 | P-28·P-15·P-25 해결 -> D-50~52(로그 30일·내보내기 없음, 이웃 데이터 이전, 만 14세 이상 확인) | 사용자 | developer, security
C-26 | 2026-10-24 | 변경 | 토큰 최적화 O2·O4·O6~O11 적용, TOKEN_USAGE 기록·token-optimizer 정기 분석 절차 추가 | 사용자 | 전원
C-27 | 2026-10-24 | 결정 | 한글 글꼴 조각 전부 자체 호스팅 -> D-53 (P-29 해결) | 사용자 | developer
C-28 | 2026-10-24 | 결정 | P-30·P-32 해결 -> D-54(의견 실제 전송), D-55(Web Analytics) | 사용자 | developer, devops, security
C-29 | 2026-10-24 | 결정 | P-31 폐기(D-56 지우기 버튼 없음), P-33 해결(D-57 2차 개인정보 표기) | 사용자 | architect, developer, security
C-30 | 2026-10-24 | 결정 | 토큰 수칙 예외(9장)와 11번 수칙 적용 -> D-58 | 사용자 | 전원
C-31 | 2026-10-24 | 변경 | architect Edit 도구 추가, CLAUDE.md 의존성 문구 정정, 문서 분할은 /gate -> D-59 | 사용자 | architect
C-32 | 2026-10-24 | 결정 | 디버깅 30회 상한·중간 보고(D-60), 시험 서버를 node 내장 서버로 교체(D-61, M1-1b 추가) | 사용자 | developer, tester
