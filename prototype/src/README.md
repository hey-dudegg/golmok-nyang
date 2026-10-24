# prototype/src 모듈 지도 (D-33, 리팩토링 단계 3)
> 코드 작업 전에만 읽는다. CLAUDE.md에서 옮김(2026-10-24, R-18).

`prototype/index.html`은 HTML 뼈대·import map·로더(모듈 못 받으면 안내)만. 코드는 `prototype/src/` ES 모듈, 시작은 `src/main.js`.
import 방향은 한쪽만: core ← adapters ← state ← render·sim ← ui ← app·main (순환 금지, `npm run test:imports`가 검사).
- `src/core/` 순수 계산(three·DOM 없음, node 단위 시험): util·time·color·genome·regions·behavior(행동표·BOUNDS)·clock·trips·
  touch_rules(교감 규칙)·recipe_rules(레시피 검증)·recipe_action(레시피→행동)·name_rules·format(표기)·sido_map(시/도 지도)·
  feedback_rules(의견 글자 정리·링크 차단·쿨다운, R-16)·landmarks(명소 고르기·주차 순환·상속·자료 검증·시즌/시간대/날씨 변주, R-17)
- `src/adapters/` 바깥 세상: store(localStorage·Local)·caps(Caps·initCaps)·local_mock(모의 room·lock)·regions_data(경계 fetch)·recipe_store·feedback(의견 전송 모의/Web3Forms 자리·쿨다운 기록, R-16)·landmarks_data(명소 자료 fetch·캐시·실패 시 null, R-17)
- `src/state/` 상태: members(Member·Bonds)·gate(GATE·Admin·SHARE_ENABLED·PROMO)·board·names·recipes·clock(세계 시계 인스턴스)
- `src/render/` three.js: shaders·cat_model(CatView)·poses·scene(Scene3D)·scene_themes(골목·시장·공원 빌더, 담 뒤 높이 상수)·backdrop(명소 원경 병합·재질, R-17)·backdrop_parts(자연 부품)·backdrop_built(구조물 부품)·backdrop_shapes(공통 모양)  / `src/sim/` agent(CatAgent)·encounter·trips·ask_cat
- `src/ui/` 화면: dom(h·toast·시트)·signup·picker·card·names_panel·board·together(사람 수·홍보)·share·feedback(의견 팝업)·feedback_admin(어드민 의견함)·landmark_admin(어드민 명소 미리보기, R-17)·recipe_panel·admin_panel
- `src/config.js` 배포 설정 자리(의견 전송 접근 키·live 스위치, 비밀·이메일 금지, 기본은 모의). 층 규칙에서는 adapters 만 import 한다.
- `src/app/` App 의 부분(visit: 놀러가기, interact: 교감·캡쳐)을 `src/main.js`가 App 에 붙인다. 시험용 `window.__*` 노출도 main.js 끝 한곳.
- 화면 함수는 App 인스턴스를 인자로 받는다(전역 `app`은 main.js 만). 파일 하나 400줄·25KB 넘으면 나눈다.
- 빌드 도구 없이 ES 모듈 + CDN import map을 쓴다 (D-13). 의존성 추가는 CDN 버전 고정으로만, 먼저 확인받는다.
- 기획·행동 설계 원문은 claude.ai 문서 링크(docs/PLAN.md 참고 문서)다. 이 링크는 Claude Code에서 열리지 않을 수 있으니, 필요한 내용은 사용자에게 붙여 달라고 요청한다.
- 이관 전 원본 문서는 docs/archive/legacy/에 있다. 평소에는 읽지 않는다.
