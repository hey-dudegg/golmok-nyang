# 시험 (tests/)

브라우저(puppeteer-core + 설치된 Chrome)로 `prototype/` 페이지를 열어 확인하는 회귀 시험과, 동작이 그대로인지 보는 기준값 비교다.
리팩토링(구조 분리) 단계마다 "분리 전후 동작 동일"을 확인하는 안전망으로 쓴다 (docs/design/구조_리팩토링_제안.md 5장).

## 준비

1. Node.js 18 이상, Chrome(또는 Chromium/Edge) 설치
2. 저장소 루트에서 의존성 설치 (개발용 `puppeteer-core` 하나. 브라우저는 내려받지 않는다)
   ```
   npm install
   ```
3. 다른 터미널에서 저장소 루트를 정적 서버로 연다 (`file://`로 열면 모듈·데이터 fetch가 막힌다)
   ```
   python -m http.server 8000      (macOS·Linux는 python3)
   ```
   페이지: http://localhost:8000/prototype/

## 환경 변수

| 이름 | 기본값 | 뜻 |
|---|---|---|
| `BASE_URL` | `http://localhost:8000/prototype/` | 시험할 페이지 주소. 포트를 바꿨으면 여기에 |
| `CHROME_PATH` | 흔한 설치 위치를 찾아 봄 | Chrome 실행 파일. 못 찾으면 직접 지정 |
| `TEST_SLOW` | `1` | 느린 환경 배수. 대기 시간과 시험 제한 시간(90초)에 곱한다. 예: `2` |
| `TEST_TIMEOUT` | `90000 x TEST_SLOW` | 시험 하나의 제한 시간(ms) |
| `HEADLESS` | (headless) | `0`이면 창을 띄워 본다 |

예 (PowerShell): `$env:BASE_URL='http://localhost:8765/prototype/'; npm test`
예 (bash): `BASE_URL=http://localhost:8765/prototype/ TEST_SLOW=2 npm test`

## 시험 목록 (하나씩 단독으로 돌린다. 동시에 돌리지 않는다)

| 명령 | 파일 | 확인 내용 | 통과 조건 |
|---|---|---|---|
| `npm run test:syntax` | check_syntax.js | 모듈 문법(`node --check`), 인라인·data JSON 파싱 | 실패 0 (브라우저·서버 불필요) |
| `npm run test:imports` | check_imports.js | import 그래프 순환, export 안 된 이름, import 없이 쓴 다른 모듈 이름, core 규칙(three·DOM 금지) | 문제 0, 순환 0 (브라우저·서버 불필요) |
| `npm run test:unit` | unit/core.test.mjs | core 모듈 node 단위 시험: 결정성·경계값·기준값(core_ref.json, state.json) | fail 0 (브라우저·서버 불필요) |
| `npm run test:reg` | reg.js | 어드민 행동 버튼 전수 클릭(약 60초) | 멈춤 0, 오류 0 |
| `npm run test:pose` | pose_check.js | 자세 x 체형 바닥 뚫림 | 뚫린 칸 0, 기준값 동일 |
| `npm run test:polarity` | b2_polarity.js | 교감 반응 극성(D-30) 14만 건 모의 | 불일치 0 |
| `npm run test:recipe` | m04_unit.js | 레시피 검증 35건 + 저장·켜기·격리 | 실패 0 |
| `npm run test:promo` | m02c.js | 홍보 잠금 두 탭 12회 + 만료 + 저장 지역(약 70초) | 12/12, 오류 0 |
| `npm run compare` | snapshot.js + compare.js | 상태 기준값 비교 | `tests/baseline/state.json`과 동일 |
| `npm run compare:core` | core_ref.js | 페이지의 시험용 노출로 core 계산(unit/ref_cases.js) 기준값 비교 | `tests/baseline/core_ref.json`과 동일 |
| `npm run shots` | shots.js | 일반·어드민·지역 시트 x 390x800·1100x800 스크린샷 | 화면별 오류 0. 그림은 눈으로 본다 |
| `npm test` | run_all.js | 위 시험을 차례로(syntax·imports·unit·reg·pose·polarity·recipe·promo·compare·core, shots 제외) | 전부 PASS |

모든 시험은 마지막 줄에 `RESULT PASS|FAIL`을 찍고, 종료 코드도 0/1로 돌려준다.
오류 수에는 페이지 오류, 콘솔 오류(404 제외), 같은 서버 파일(`style.css`, `data/*.json`) 요청 실패가 들어간다.
시험은 `?admin`일 때만 열리는 `window.__app`, `__inter`, `__recipe`, `__pose`, `__trips` 등에 기댄다. 이 노출을 지우면 시험이 깨진다.

## 기준값 (tests/baseline/)

| 파일 | 만드는 법 | 내용 |
|---|---|---|
| `state.json` | `node tests/snapshot.js --baseline` | 브라우저 시계를 2026-10-18 12:00:05(KST)에서 시작하게 고정하고 뽑은 값. 레시피를 켜지 않은 상태의 Clock 일정 해시(6시간), 지역 11·26·41 첫 화면 요약(주소판·인구 문구·시계·고양이 성격·욕구·감정·지금 행동·놀러가기 일정·장면 테마), 지역 시트(시/도 목록, 지도 SVG 해시) |
| `core_ref.json` | `node tests/core_ref.js --baseline` | 분리 전 페이지에서 뜬 core 계산값: 난수, 유전체 120개(새끼 눈 색 섞임 포함), 16곳 마스코트, 손길 유형·교감 규칙 1,980건, 16곳 24시간 일정 해시, 48시간 놀러가기, 레시피 검증 결과. node 단위 시험이 core 모듈로 같은 값을 계산해 비교한다 |
| `pose_after.json` | `node tests/pose_check.js after --baseline` | 자세별 부위 최저점·다리 겹침 수치 |

- 세 개를 한 번에: `npm run baseline`
- **기준값은 "동작이 바뀌지 않아야 하는" 리팩토링 전에만 새로 뜬다.** 기능을 일부러 바꾼 경우에만 갱신하고, 갱신한 이유를 docs/history/LOG.md에 남긴다.
- 비교: `npm run compare` (새로 뽑은 값은 `tests/out/state.json`). 두 파일을 직접 비교: `node tests/compare.js A.json B.json`
- 스크린샷은 픽셀 비교를 하지 않는다(WebGL·난수 때문에 매번 조금 다르다). `node tests/shots.js --label before`, 고친 뒤 `--label after`로 떠서 `tests/out/shots/`에서 나란히 본다.

`tests/out/`은 결과물 폴더라 저장소에 올리지 않는다(.gitignore).

## 느린 환경

- 소프트웨어 렌더링(swiftshader)이라 GPU가 없어도 돌지만 느리다. 제한 시간에 걸리면 `TEST_SLOW=2`(또는 3)로 대기와 제한 시간을 늘린다.
- reg.js·m02c.js는 원래 60~70초 걸린다. 다른 시험·브라우저와 동시에 돌리면 시간 초과가 나기 쉽다.
- 시험 주소에는 이미 `pr`(픽셀 배율)·`shells`(털 겹 수)·`still`(N프레임 뒤 멈춤)을 낮게 넣어 두었다.

## node 단위 시험 (tests/unit/, 리팩토링 단계 2)

- `prototype/src/core/*.js`(three·DOM을 쓰지 않는 순수 계산)를 node가 직접 import 한다. 브라우저·서버·npm 의존성이 필요 없다(Node.js 18 이상).
- 실행: `npm run test:unit` 또는 `node --test tests/unit/`. 정적 검사: `npm run test:imports`.
- `prototype/src/package.json`(`"type": "module"`)은 node가 src/ 아래 .js를 ES 모듈로 읽게 하는 표시다. 브라우저 동작과는 상관없다.
- `unit/ref_cases.js`의 계산 함수 하나를 브라우저(`core_ref.js`, 시험용 노출 사용)와 node(`core.test.mjs`, core 직접 import)가 같이 쓴다.
  core 모듈을 고친 뒤 `npm run test:unit`이 깨지면 동작이 바뀐 것이다. 일부러 바꾼 경우에만 `node tests/core_ref.js --baseline`으로 갱신하고 LOG에 이유를 남긴다.
- 레시피 글 해석의 JSON 문법 오류 위치 문구는 JS 엔진 버전마다 다를 수 있어, node 시험은 그 항목의 개수만 비교한다(검증 결과는 그대로 비교).
