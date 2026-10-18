# PLAN
> 목표, 범위, 아키텍처 개요. 자주 바뀌지 않는다. 바뀌면 CHANGELOG에 남긴다. 60줄 이내.

## 목표
- 길에서 만나는 길고양이를 웹으로 옮긴다. 목적은 오직 보는 즐거움(심미).
- 동네마다 복슬한 고양이가 새끼~성체로 무작위 생성되어 그 동네에 귀속되고, 성격대로 스스로 행동한다.
- 비용 0원으로 만들고 운영한다 (D-01).

## 범위
- 포함: 동네 선택과 고양이 관상(R-01, R-02), 회원 교감(쓰다듬기·츄르·고양이 말, R-03),
  캡쳐·자유게시판(R-04), 이름 짓기(R-05), 물건 놓아 주기(R-06), 반응 수집(R-07),
  홍보하기·세계 시계·회원 범위·공유·사람 수·놀러가기·숏츠 행동·어드민(R-08~15)
- 제외: 유료 API·서버·모델, AI 실시간 대화, Blender·AI 3D 변환·AI 영상 파이프라인, Firebase

## 아키텍처 개요
- 구성: 정적 웹(Cloudflare Pages) + Supabase 무료(로그인·DB·파일·실시간·RLS) (D-08)
- 화면: three.js 0.160 절차적 뼈대 + 셸 털 렌더링 (D-02)
- 행동 엔진: 입력 → 상태(욕구 4·감정 8) → 행동 선택 → 실행 4겹 (D-07)
- 생애주기: 동네 코드 + 날짜로 브라우저가 결정적으로 계산 (D-04)
- 저장소 계층: 프로토타입의 Caps(db·user·downloads·sample)를 Supabase 어댑터 한 파일로 교체 (D-10)
- 폴더(M1 목표): `index.html` / `src/`(scene, cat-rig, fur, behavior, ui, storage) / `data/regions.json`
- 기술 스택: HTML + ES 모듈 + CDN import map, 빌드 도구 없음 (D-13). three.js CDN `cdn.jsdelivr.net/npm/three@0.160.0`

## 역할 분담
| 역할 | 맡는 일 | 산출물 |
|---|---|---|
| analyst | 요구 분석, 기술 조사(무료 등급 한도 등) | 분석 보고 |
| architect | 파일 구조, 행동 엔진·DB 스키마 설계 | docs/design/ |
| developer | 구현 | 소스 코드 |
| tester | 행동 엔진·생애주기 계산 테스트 | tests/ |
| reviewer | 코드 리뷰 (읽기 전용) | 리뷰 보고 |
| debugger | 오류 원인 분석·최소 수정 | 수정 코드 |
| documenter | README, 개인정보 안내 초안 | README, 사용법 |
| devops | Pages·Actions 설정 파일(배포 실행은 사용자) | 설정 파일 |

## 마일스톤 개요
- M0: 수정 4단계 (prototype/index.html 한 파일에서, docs/design/골목냥_수정설계_2026-10-18.md 10장)
- M1: 단일 HTML을 파일로 나누기 (동작 변화 없음)
- M2: 표정·작은 동작 (감정·욕구 상태, 표정 레이어, 뼈대 확장, 스케줄러, `?debug`)
- M3: 장소가 필요한 행동 (장면 지점, 담장 점프, 상자 빼꼼, 하악 아치, 자극, 물건 놓아 주기)
- M4: 저장소 교체 (Supabase 어댑터, 로그인, 이벤트·의견)
- M5: 배포 (GitHub → Cloudflare Pages, 방문 통계, 개인정보 안내)
- M6: 지표를 보고 행동 확률·간격 조정

## 참고 문서 (claude.ai 링크, 사용자 계정으로 열림)
- 기획서: https://claude.ai/code/artifact/a0d4aefb-5285-41cd-bd91-be641c94a7ec
- 행동 설계와 서버리스 배포: https://claude.ai/code/artifact/dc59a8fc-2466-4068-9d87-224e2230d8cb
- 고양이 비주얼 분석(참고용): https://claude.ai/code/artifact/411cd54c-ff43-4482-b901-d04ade589d2c
- 프로토타입 원본 아티팩트: https://claude.ai/artifact/S2WQEgUYBgfJfc99d9RhoL (이웃 데이터 보관처, P-15)
