// 행정구역 경계 자료 불러오기 (D-33 단계 1). 최상위 await로 data/regions.json 을 받아 REGIONS 를 만든다
import { buildRegions } from '../core/regions.js';

// ───────────────────────── 행정구역 ─────────────────────────
// 경계 자료는 data/regions.json (D-33 리팩토링 단계 1). 모듈 최상위 await로 먼저 받아 둔다.
// 못 받으면(file://로 연 경우 등) 로딩 화면에 로컬 서버 안내를 띄우고 여기서 멈춘다.
const REGIONS_RAW = await (async () => {
  try {
    const res = await fetch('./data/regions.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    const l = document.getElementById('loading');
    if (l) {
      const box = document.createElement('div'), small = document.createElement('small');
      box.style.cssText = 'text-align:center;padding:0 16px;max-width:36em';
      small.textContent = (location.protocol === 'file:' ? '파일을 직접 열면(file://) 브라우저가 자료 읽기를 막아요. ' : '')
        + '저장소 루트에서 "python -m http.server 8000"(macOS·Linux는 python3)을 실행한 뒤 http://localhost:8000/prototype/ 으로 열어 주세요.';
      box.append('지역 자료(data/regions.json)를 불러오지 못했어요', small);
      l.setAttribute('role', 'alert'); l.replaceChildren(box);
    }
    throw new Error('regions.json 불러오기 실패: ' + (e && e.message));
  }
})();
export const REGIONS = buildRegions(REGIONS_RAW);
