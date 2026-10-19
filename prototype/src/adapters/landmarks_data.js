// 명소 자료 불러오기 (R-17). data/landmarks.json 을 한 번 받아 캐시한다(약 22KB, 시/도 16곳 전체).
// 시군구 단계로 늘어나면 같은 모양의 조각(data/landmarks/<시도코드>.json)을 지역에 들어갈 때만 받도록 load(code)를 바꾸면 된다(설계 14장).
// 못 받거나 형식이 틀리면 null 로 두고 콘솔 경고만 남긴다(기본 테마로 폴백, 게임은 멈추지 않는다).
import { sanitizeLandmarks } from '../core/landmarks.js';

let cache = null, pending = null;
export const LandmarkData = {
  url: './data/landmarks.json',
  failed: false, bytes: 0, loadMs: 0, errors: [],
  forceNone: false, // 어드민 '폴백 강제'
  get() { return this.forceNone ? null : cache; },
  load() {
    if (cache || pending) return pending || Promise.resolve(cache);
    const t0 = performance.now();
    pending = fetch(this.url).then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); }).then((txt) => {
      this.bytes = new Blob([txt]).size;
      const { data, errors } = sanitizeLandmarks(JSON.parse(txt));
      this.errors = errors;
      if (errors.length) console.warn('명소 자료 검증 경고 ' + errors.length + '건 (해당 후보는 뺌):', errors.slice(0, 5));
      cache = data; this.loadMs = performance.now() - t0;
      return cache;
    }).catch((e) => {
      this.failed = true; console.warn('명소 자료(data/landmarks.json)를 불러오지 못해 기본 배경으로 보여요:', e && e.message);
      return null;
    });
    return pending;
  },
};
