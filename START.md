# 시작 안내 (읽고 지워도 됩니다)

이 폴더가 골목냥 저장소 루트입니다. claude.ai 프로젝트의 내용(설계 확정본, 팀 문서, 프로토타입)을 2026-10-18 기준으로 모두 담았습니다.

## 처음 한 번
1. 이 폴더를 원하는 위치(예: `~/golmok-nyang`)에 둡니다. 숨김 폴더 `.claude`, `.private`와 `.gitignore`, `.env.example`이 함께 있는지 확인합니다 (`ls -la`).
2. `git init` (또는 GitHub에서 만든 빈 Private 저장소를 clone한 뒤 이 내용을 그 안에 복사). 이름 제안은 `golmok-nyang` (P-06).
3. 화면 확인: 이 폴더에서 `python3 -m http.server 8000`(Windows는 `python -m http.server 8000`) → http://localhost:8000/prototype/
   `index.html`을 파일로 직접 열면(file://) 지역 자료(`prototype/data/regions.json`)를 못 읽어 안내 문구만 뜹니다. 시험 실행법은 `tests/README.md`.
4. 이 폴더에서 `claude` 실행 → `/report`로 현황 확인. `/migrate`는 이미 했으니 다시 하지 않습니다.
5. `/milestone M0 수정 4단계` → 1단계(시/도 16곳·세계 시계·회원 범위 설정표·어드민 기본) 계획을 보고 승인합니다.
6. 첫 커밋 전에는 `/secure-check`를 돌리고, `.private/`가 커밋 대상에 없는지 확인합니다.

## 알아 둘 점
- 설계는 확정, 구현은 시작 전입니다. 원본 아티팩트(https://claude.ai/artifact/S2WQEgUYBgfJfc99d9RhoL)는 고치지 않은 상태이고, 이웃 데이터(회원·게시판·이름 투표)는 그 아티팩트에만 있습니다 (P-15).
- 로컬에서는 로그인·게시판 저장·사람 수처럼 아티팩트 기능에 기대는 부분이 동작하지 않습니다. 2단계 전에 시험 방법(P-14)을 정합니다.
- 비밀값은 들어 있지 않습니다. 실제 키는 `.env.example`을 복사한 `.env`에만 씁니다.
