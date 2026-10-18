// core/regions.js: 행정구역 자료 가공·이름·장면 테마 (원래 index.html 35_regions 구역, D-33 단계 2)
// 경계 JSON(data/regions.json)은 받지 않는다. index.html 이 fetch 한 값을 buildRegions(raw) 에 넘긴다.
import { makeRng } from './util.js';
// 활성 단계 (D-05). 시/도 16곳만 활성이고 시/군/구·행정동은 경계 자료만 남긴 비활성 상태다.
// 'sgg' | 'dong'으로 올리면 고양이·장면·시계는 그 단위로 돌지만, 지역 고르기 화면은 아직 시/도 전용이다.
export const REGION_LEVEL = 'sido';
export const REGION_CODE_LEN = { sido: 2, sgg: 5, dong: 10 };
export const SIDO_SHORT = {
  '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천', '전남광주통합특별시': '전남광주', '대전광역시': '대전',
  '울산광역시': '울산', '세종특별자치시': '세종', '경기도': '경기', '강원특별자치도': '강원', '충청북도': '충북', '충청남도': '충남',
  '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주', '전북특별자치도': '전북',
};
// 경계 JSON(raw) -> 검색·단위 묶음. raw 안의 동 객체에 sido·sgg·lat·lng 를 덧붙인다(예전 REGIONS 와 같은 값). level 기본값 = REGION_LEVEL
export function buildRegions(raw, level = REGION_LEVEL) {
  const all = [];
  const bySgg = {};
  for (const [sido, sggs] of Object.entries(raw)) {
    for (const [sgg, dongs] of Object.entries(sggs)) {
      bySgg[sido + '|' + sgg] = dongs;
      for (const d of dongs) { d.sido = sido; d.sgg = sgg; d.lng = d.x / 1e4; d.lat = d.y / 1e4; all.push(d); }
    }
  }
  const byCode = new Map(all.map((d) => [d.c, d]));
  // 활성 지역 단위 (D-05): REGION_LEVEL 단계의 묶음. 시/도는 행정동 코드 앞 2자리, 시/군/구는 앞 5자리.
  const len = REGION_CODE_LEN[level] || 2;
  const units = [], byUnit = new Map();
  for (const d of all) {
    const c = d.c.slice(0, len);
    let u = byUnit.get(c);
    if (!u) {
      u = level === 'dong' ? d : { c, level: level, sido: d.sido, sgg: level === 'sido' ? '' : d.sgg, n: level === 'sido' ? (SIDO_SHORT[d.sido] || d.sido) : d.sgg, dongs: [], lat: 0, lng: 0 };
      byUnit.set(c, u); units.push(u);
    }
    if (u !== d) { u.dongs.push(d); u.lat += d.lat; u.lng += d.lng; }
  }
  for (const u of units) if (u.dongs) { u.lat /= u.dongs.length; u.lng /= u.dongs.length; } // 중심 = 속한 동들의 평균
  // 시/도 요약 (지역 고르기 화면용. REGION_LEVEL과 상관없이 16곳)
  const sidoInfo = new Map();
  for (const d of all) {
    const c = d.c.slice(0, 2);
    let s = sidoInfo.get(c);
    if (!s) { s = { c, sido: d.sido, n: SIDO_SHORT[d.sido] || d.sido, dongs: [], sggs: new Set() }; sidoInfo.set(c, s); }
    s.dongs.push(d); s.sggs.add(d.sgg);
  }
  return {
    raw, all, byCode, bySgg, units, byUnit, sidoInfo,
    unitOf: (code) => byUnit.get(String(code || '').slice(0, len)) || null, // 동 코드·시/도 코드 어느 쪽이든 활성 단위로 변환
    sidos: Object.keys(raw),
    sggsOf: (sido) => Object.keys(raw[sido] || {}),
    dongsOf: (sido, sgg) => (raw[sido] && raw[sido][sgg]) || [],
    search(q) {
      q = q.trim().replace(/\s+/g, '');
      if (!q) return [];
      const out = [];
      for (const d of all) {
        const full = (d.sido + d.sgg + d.n).replace(/\s+/g, '');
        if (d.n.startsWith(q)) out.push([0, d]);
        else if (d.n.includes(q)) out.push([1, d]);
        else if (full.includes(q)) out.push([2, d]);
        if (out.length > 400) break;
      }
      out.sort((a, b) => a[0] - b[0] || a[1].n.length - b[1].n.length);
      return out.slice(0, 40).map((x) => x[1]);
    },
    rings(d) { // 경계 복원 [ [ [lng,lat], ... ], ... ]
      return d.p.map((flat) => { const pts = []; let x = d.x, y = d.y; for (let i = 0; i < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; pts.push([x / 1e4, y / 1e4]); } return pts; });
    },
  };
}
export function sggShort(sgg) { return (sgg || '').replace(/^(.+?시)(.+구)$/, '$1 $2'); }
// 화면에 쓸 지역 이름 (활성 단위의 전체 이름, 예: 서울특별시)
export function regionFull(d) { return d.level === 'sido' ? d.sido : [d.sido, sggShort(d.sgg), d.level === 'sgg' ? '' : d.n].filter(Boolean).join(' '); }
export const DO_CODES = ['41', '43', '44', '47', '48', '50', '51', '52']; // 도 지역은 공원 비중을 높인다
export function themeFor(d) {
  const r = makeRng('theme:' + d.c);
  if (d.level === 'sido') return r.weighted(DO_CODES.includes(d.c) ? [['park', 5], ['alley', 3], ['market', 2]] : [['alley', 6], ['market', 2.5], ['park', 2.5]]);
  if (d.level === 'sgg') return r.weighted([['alley', 5], ['market', 2.5], ['park', 3]]);
  if (/[면]$/.test(d.n)) return r.weighted([['park', 6], ['alley', 3], ['market', 1]]);
  if (/[읍]$/.test(d.n)) return r.weighted([['market', 4], ['alley', 4], ['park', 2]]);
  if (/시장|중앙|남포|동문|서문|광장/.test(d.n)) return r.weighted([['market', 6], ['alley', 3], ['park', 1]]);
  if (/공원|숲|호수|천/.test(d.n)) return r.weighted([['park', 6], ['alley', 3]]);
  return r.weighted([['alley', 6], ['market', 2], ['park', 2.5]]);
}
export const THEME_LABEL = { alley: '골목 담벼락', market: '시장 골목', park: '동네 공원' };
