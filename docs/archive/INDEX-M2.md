# INDEX M2 작업표 보관 (2026-11-14 /gate)

## 이번 마일스톤 작업 (M2 2차 배포 최소: Supabase 연결, 2026-10-29 승인)
| 작업 | 내용 | 담당 | 관련 | 상태 |
|---|---|---|---|---|
| M2-1 | 폰 털 확정·?fur 스위치 삭제·180도 모서리 | developer | D-71,92 | 완료 (npm test 15/15) |
| M2-2 | Actions 통과·배포 보안 헤더 확인 | devops | D-45,81,88 | test 브랜치 푸시(78e0cd9), 연결 실패 분석 중 |
| M2-3 | 털 측정 도구 정리(fur_probe) | tester | D-73 | 완료 |
| M2-4 | 2차 설계 확정·개정(C-51) | architect | D-74~77,81~85 | 개정 완료 |
| M2-5 | a: supabase-js·config·CSP / b: 익명 세션(로그인 보류) | developer | D-77,78,82 | 완료(SQL 두 곳 실행) |
| M2-6 | a: 게시판(읽기만)·이름(익명)·캡쳐 / b: 필터·신고 | developer | D-74~76,83,84 | 완료(테스트 DB ALL PASS) |
| M2-7 | 보안 J-3(CSP 강제)·J-6(__app 제거, fur_probe의 __pose 의존 확인) | developer·security | D-38 | 완료(배포 후 콘솔 확인) |
| M2-8 | 2차 보안 점검·배포 판정 | security | D-38 R-19 | 조건부(테스트 가능, 운영은 P-44·img-src 뒤) |
| M2-10 | 의견 중계(Pages Function)·CSP에 Web Analytics 허용 | developer | D-54,55,62 | 구현 완료(배포 후 확인) |
| M2-9 | 사람 수·홍보 잠금 Realtime 연결 | architect·developer | D-79,80,93 | 테스트 DB PASS, Realtime 설정 정정 |
