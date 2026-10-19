// core/landmarks.js: 지역 명소 배경 고르기·검증·시즌/시간대/날씨 변주 (R-17, D-26~29·D-36)
// core 규칙: three·DOM 없음. 자료(data/landmarks.json)는 adapters/landmarks_data.js 가 받아 넘긴다.
// 상속: 동(10자리) -> 시군구(5자리) -> 시/도(2자리) -> 자동 지형(terrain) -> 기본 테마(배경 없음)
import { hashStr, makeRng } from './util.js';

export const LM_KINDS = ['tower', 'palace', 'hanok', 'fortress', 'bridge', 'harbor', 'lighthouse', 'mountain', 'island', 'falls', 'field', 'market',
  'skyline', 'temple', 'park', 'lake', 'beach', 'hillvillage', 'forest'];
export const LM_STATUS = ['verified', 'unverified', 'draft'];
export const LM_TERRAIN = ['city', 'coast', 'mountain', 'mixed', 'island', 'plain'];

// 부품 15종과 변수 범위. 공통 변수(x·z·w·h·seed·color·color2)에 부품별 변수를 더한다. 범위 밖이면 검증 오류
const NR = (min, max, int) => ({ min, max, int: !!int });
const E = (...v) => ({ enum: v });
const COMMON = { x: NR(-45, 45), y: NR(-2, 12), z: NR(-40, -8), w: NR(0.2, 90), h: NR(0, 25), seed: NR(0, 99999, 1), color: 'color', color2: 'color' };
export const PART_SCHEMA = {
  ridge: { peaks: NR(1, 12, 1), shape: E('round', 'sharp', 'shield', 'twin', 'flat'), snow: NR(0, 1) },
  rocks: { count: NR(1, 30, 1), style: E('spire', 'columns', 'pair', 'hand', 'triple') },
  tower: { style: E('nseoul', 'needle', 'expo', 'eighty3'), base: NR(0, 12) },
  roofline: { count: NR(1, 30, 1), style: E('palace', 'hanok', 'arcade', 'pavilion', 'thatch'), rows: NR(1, 6, 1) },
  wall: { gates: NR(0, 6, 1), curve: NR(0, 4) },
  buildings: { count: NR(1, 60, 1), style: E('tall', 'mid', 'apt', 'long', 'glass'), hmin: NR(0.2, 20), glow: NR(0, 1) },
  bridge: { style: E('suspension', 'cable', 'ring', 'truss', 'arch'), towers: NR(1, 4, 1), decks: NR(1, 2, 1) },
  water: { style: E('sea', 'lake', 'river'), waves: NR(0, 20, 1), depth: NR(1, 40) },
  lighthouse: { style: E('white', 'red', 'tall'), base: NR(0, 6) },
  islands: { count: NR(1, 20, 1), shape: E('dome', 'crater', 'rock', 'forest'), spread: NR(0, 80) },
  temple: { style: E('pagoda', 'stone', 'hall'), floors: NR(1, 9, 1) },
  harbor: { cranes: NR(0, 8, 1), boats: NR(0, 12, 1), wheel: NR(0, 1, 1), breakwater: NR(0, 1, 1) },
  trees: { count: NR(1, 80, 1), style: E('pine', 'bamboo', 'reed', 'metasequoia', 'round', 'bigtree') },
  village: { rows: NR(1, 10, 1), cols: NR(1, 20, 1), style: E('colorful', 'orange', 'white') },
  cliff: { style: E('layered', 'falls', 'columns') },
};
export const PART_NAMES = Object.keys(PART_SCHEMA);
// 유형마다 기본 부품(자료에 parts 가 없을 때). 자동 지형도 이 표를 쓴다
export const KIND_DEFAULT_PARTS = {
  tower: [{ type: 'ridge', z: -24, w: 70, h: 4, peaks: 4 }, { type: 'tower', x: 1, z: -16, h: 8, base: 2 }],
  palace: [{ type: 'ridge', z: -24, w: 70, h: 6, peaks: 3 }, { type: 'roofline', x: 0, z: -15, w: 16, h: 2.5, count: 3, style: 'palace' }],
  hanok: [{ type: 'ridge', z: -24, w: 70, h: 5 }, { type: 'roofline', x: 0, z: -14, w: 22, h: 1.6, count: 10, style: 'hanok', rows: 3 }],
  fortress: [{ type: 'ridge', z: -24, w: 70, h: 5 }, { type: 'wall', x: 0, z: -15, w: 30, h: 1.4, gates: 2 }],
  bridge: [{ type: 'water', z: -12, w: 90 }, { type: 'bridge', x: 0, z: -18, w: 40, h: 6, style: 'suspension' }],
  harbor: [{ type: 'water', z: -12, w: 90 }, { type: 'harbor', x: 0, z: -16, w: 24, h: 5, cranes: 3, boats: 4 }],
  lighthouse: [{ type: 'water', z: -12, w: 90 }, { type: 'lighthouse', x: 2, z: -16, h: 4, base: 1 }],
  mountain: [{ type: 'ridge', z: -26, w: 80, h: 8, peaks: 4 }, { type: 'ridge', z: -18, w: 60, h: 4, peaks: 5 }],
  island: [{ type: 'water', z: -12, w: 90 }, { type: 'islands', x: 0, z: -20, w: 40, h: 3, count: 5 }],
  falls: [{ type: 'ridge', z: -24, w: 70, h: 6 }, { type: 'cliff', x: 0, z: -16, w: 10, h: 6, style: 'falls' }],
  field: [{ type: 'ridge', z: -26, w: 80, h: 3, shape: 'flat' }, { type: 'trees', x: 0, z: -15, w: 40, count: 20, style: 'reed', h: 0.6 }],
  market: [{ type: 'buildings', x: 0, z: -20, w: 40, count: 14, h: 5, style: 'mid' }, { type: 'roofline', x: 0, z: -14, w: 22, h: 1.2, count: 5, style: 'arcade' }],
  skyline: [{ type: 'buildings', x: 0, z: -18, w: 44, count: 24, h: 8, style: 'tall', glow: 1 }],
  temple: [{ type: 'ridge', z: -24, w: 70, h: 6 }, { type: 'temple', x: 0, z: -15, h: 5, style: 'pagoda', floors: 5 }],
  park: [{ type: 'trees', x: 0, z: -14, w: 40, count: 20, style: 'round', h: 3 }, { type: 'buildings', x: 0, z: -22, w: 40, count: 12, h: 7 }],
  lake: [{ type: 'water', z: -12, w: 90, style: 'lake' }, { type: 'ridge', z: -24, w: 80, h: 5, peaks: 5 }],
  beach: [{ type: 'water', z: -12, w: 90, waves: 6 }, { type: 'rocks', x: 3, z: -18, h: 3, count: 2, style: 'pair' }],
  hillvillage: [{ type: 'ridge', z: -22, w: 60, h: 5, shape: 'round' }, { type: 'village', x: 0, z: -16, w: 16, h: 4, rows: 5, cols: 8 }],
  forest: [{ type: 'trees', x: 0, z: -14, w: 50, count: 40, style: 'bamboo', h: 4 }],
};
// 자동 지형(시/도 지형 태그) -> 부품 조합. 이름은 없다(화면에는 "배경: 자동 지형")
export const TERRAIN_PARTS = {
  city: [{ type: 'ridge', z: -28, w: 80, h: 5, peaks: 4 }, { type: 'buildings', x: 0, z: -19, w: 50, count: 20, h: 6, style: 'mid', glow: 1 }],
  coast: [{ type: 'water', z: -12, w: 90, waves: 5 }, { type: 'islands', x: 4, z: -24, w: 30, h: 2, count: 3 }],
  mountain: KIND_DEFAULT_PARTS.mountain,
  mixed: [{ type: 'ridge', z: -26, w: 80, h: 6, peaks: 5 }, { type: 'buildings', x: 0, z: -18, w: 30, count: 10, h: 4, style: 'apt', glow: 1 }],
  island: [{ type: 'water', z: -12, w: 90, waves: 5 }, { type: 'ridge', z: -26, w: 50, h: 6, shape: 'shield' }],
  plain: [{ type: 'ridge', z: -28, w: 80, h: 3, shape: 'flat' }, { type: 'trees', x: 0, z: -16, w: 50, count: 18, style: 'round', h: 2 }],
};

// ── 주차 (D-27): KST 월요일 00:00 시작. 1970-01-01(목)을 기준으로 센 주 번호 ──
const DAY = 86400000, KST = 9 * 3600000;
export function weekIndexKST(nowMs) { const days = Math.floor((nowMs + KST) / DAY); return Math.floor((days + 3) / 7); }
export function weekStartKST(week) { return (week * 7 - 3) * DAY - KST; } // 그 주 월요일 00:00 KST 의 UTC ms

// 후보 목록 (예비 reserve 는 순환에서 뺀다, rotation 순)
export function activeCandidates(list) {
  if (!Array.isArray(list)) return [];
  return list.map((p, i) => [p, i]).filter(([p]) => p && !p.reserve)
    .sort((a, b) => ((a[0].rotation ?? a[1]) - (b[0].rotation ?? b[1])) || a[1] - b[1]).map(([p]) => p);
}
const mod = (a, n) => ((a % n) + n) % n;

// 지역 코드 -> 이번 주 명소. opts: { data, weekOffset, pick(후보 번호 강제), noData(폴백 강제) }
// 돌려주는 값: { source:'dong'|'sgg'|'sido'|'auto'|'theme', key, place, parts, candidates, index, week, inherited }
export function landmarkFor(regionCode, nowMs, opts = {}) {
  const code = String(regionCode || '');
  const week = weekIndexKST(nowMs) + (opts.weekOffset | 0);
  const data = opts.noData ? null : opts.data;
  const base = { week, key: null, place: null, parts: null, candidates: [], index: -1, inherited: false };
  if (!data || !data.places) return { ...base, source: 'theme' };
  const levels = [[10, 'dong'], [5, 'sgg'], [2, 'sido']].filter(([n]) => code.length >= n);
  for (const [n, level] of levels) {
    const key = code.slice(0, n), cands = activeCandidates(data.places[key]);
    if (!cands.length) continue;
    let index;
    if (opts.pick != null && opts.pick >= 0) index = mod(opts.pick | 0, cands.length);
    else if (cands.length === 1) index = 0;
    else index = mod(week, cands.length);
    const place = cands[index];
    return { ...base, source: level, key, place, parts: partsOf(place), candidates: cands, index, inherited: n < code.length };
  }
  const terrain = data.terrain && data.terrain[code.slice(0, 2)];
  if (terrain && TERRAIN_PARTS[terrain]) {
    return { ...base, source: 'auto', key: code.slice(0, 2), place: { id: 'auto-' + terrain, name: null, kind: null, terrain }, parts: TERRAIN_PARTS[terrain], inherited: true };
  }
  return { ...base, source: 'theme' };
}
export function partsOf(place) { return (place && Array.isArray(place.parts) && place.parts.length) ? place.parts : (KIND_DEFAULT_PARTS[place && place.kind] || []); }
// 화면 표시 이름 ("배경: 남산 (N서울타워)"). 자동 지형·폴백이면 빈 글자
export function landmarkLabel(sel) { return sel && sel.place && sel.place.name ? '배경: ' + sel.place.name + (sel.inherited && sel.source !== 'auto' ? ' (근처 명소)' : '') : ''; }

// ── 시즌·시간대·날씨 변주 (코드만, 0원) ──
export function seasonOf(nowMs) { const m = new Date(nowMs + KST).getUTCMonth() + 1; return m >= 3 && m <= 5 ? 'spring' : m <= 8 && m >= 6 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'; }
// 식물 색(veg)과 섞는 양, 산꼭대기 눈 양. 색은 선형 RGB 0..1
export const SEASON_TINT = {
  spring: { veg: [0.55, 0.62, 0.36], vegAmt: 0.35, blossom: 0.35, snow: 0 },
  summer: { veg: [0.16, 0.34, 0.14], vegAmt: 0.35, blossom: 0, snow: 0 },
  autumn: { veg: [0.50, 0.34, 0.16], vegAmt: 0.3, blossom: 0, snow: 0 },
  winter: { veg: [0.42, 0.44, 0.40], vegAmt: 0.5, blossom: 0, snow: 0.85 },
};
// 해 고도(도) -> 낮·해질녘·밤 양. Scene3D.setTime 과 같은 식(day·gold)이다
const cl = (v, a, b) => (v < a ? a : v > b ? b : v), sm = (t) => t * t * (3 - 2 * t);
export function phaseFromSunDeg(deg) {
  const day = sm(cl((deg + 4) / 14, 0, 1)), gold = cl(1 - Math.abs(deg - 4) / 14, 0, 1) * day;
  const lights = 1 - sm(cl((deg + 2) / 8, 0, 1)); // 창 불빛 (가로등과 같은 시점)
  return { phase: deg < -3 ? 'night' : gold > 0.45 ? 'dusk' : 'day', day, gold, lights };
}
// 날씨: 지역+날짜 결정적 난수 (실제 기상 API 없음, D-01). haze 는 대기 원근 세기 배수
export function weatherFor(regionCode, nowMs) {
  const d = Math.floor((nowMs + KST) / DAY), r = makeRng('wx:' + String(regionCode).slice(0, 2) + ':' + d)();
  return r < 0.6 ? { kind: 'clear', haze: 1 } : r < 0.85 ? { kind: 'haze', haze: 1.35 } : { kind: 'mist', haze: 1.75 };
}
export function backdropVariant(regionCode, nowMs, sunDeg) {
  const season = seasonOf(nowMs);
  return { season, tint: SEASON_TINT[season], weather: weatherFor(regionCode, nowMs), light: phaseFromSunDeg(sunDeg) };
}
export function landmarkSeed(sel) { return hashStr('lm:' + (sel && sel.place ? sel.place.id : 'none')) >>> 0; }

// ── 자료 검증: 허용 kind·parts 이름·변수 범위·필수 필드. 오류 문자열 배열을 돌려준다 ──
const HEX = /^#[0-9a-fA-F]{6}$/;
export function validatePart(pt, where = 'part') {
  const errs = [];
  if (!pt || typeof pt !== 'object') return [where + ': 부품이 객체가 아님'];
  const sc = PART_SCHEMA[pt.type];
  if (!sc) return [where + ': 모르는 부품 ' + pt.type];
  for (const [k, v] of Object.entries(pt)) {
    if (k === 'type') continue;
    const rule = sc[k] || COMMON[k];
    if (!rule) { errs.push(`${where}: ${pt.type}.${k} 모르는 변수`); continue; }
    if (rule === 'color') { if (typeof v !== 'string' || !HEX.test(v)) errs.push(`${where}: ${k} 색 형식(#rrggbb) 아님`); continue; }
    if (rule.enum) { if (!rule.enum.includes(v)) errs.push(`${where}: ${k}=${v} 허용 값 아님`); continue; }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < rule.min || v > rule.max || (rule.int && !Number.isInteger(v))) errs.push(`${where}: ${k}=${v} 범위 ${rule.min}~${rule.max}${rule.int ? ' 정수' : ''} 밖`);
  }
  return errs;
}
export function validateLandmarks(data) {
  const errs = [];
  if (!data || typeof data !== 'object') return ['자료가 객체가 아님'];
  if (data.version !== 1) errs.push('version 은 1');
  if (!data.places || typeof data.places !== 'object') return errs.concat('places 없음');
  for (const [t, v] of Object.entries(data.terrain || {})) if (!LM_TERRAIN.includes(v)) errs.push(`terrain ${t}=${v} 허용 값 아님`);
  const ids = new Set();
  for (const [key, list] of Object.entries(data.places)) {
    if (!/^(\d{2}|\d{5}|\d{10})$/.test(key)) errs.push(`places 키 ${key}: 2·5·10자리 숫자 아님`);
    if (!Array.isArray(list) || !list.length) { errs.push(`places ${key}: 빈 목록`); continue; }
    list.forEach((p, i) => {
      const w = `${key}[${i}]`;
      if (!p || typeof p !== 'object') { errs.push(w + ': 객체 아님'); return; }
      for (const f of ['id', 'name', 'kind', 'status']) if (typeof p[f] !== 'string' || !p[f]) errs.push(`${w}: ${f} 없음`);
      if (p.id && ids.has(p.id)) errs.push(`${w}: id 중복 ${p.id}`); ids.add(p.id);
      if (p.name && p.name.length > 40) errs.push(`${w}: 이름 40자 넘음`);
      if (p.kind && !LM_KINDS.includes(p.kind)) errs.push(`${w}: kind ${p.kind} 허용 값 아님`);
      if (p.status && !LM_STATUS.includes(p.status)) errs.push(`${w}: status ${p.status} 허용 값 아님`);
      if (p.reserve != null && typeof p.reserve !== 'boolean') errs.push(`${w}: reserve 는 true/false`);
      if (p.rotation != null && !(Number.isInteger(p.rotation) && p.rotation >= 0 && p.rotation < 10)) errs.push(`${w}: rotation 0~9 정수`);
      if (p.parts != null) {
        if (!Array.isArray(p.parts) || p.parts.length > 12) errs.push(`${w}: parts 는 12개 이하 배열`);
        else p.parts.forEach((pt, j) => errs.push(...validatePart(pt, `${w}.parts[${j}]`)));
      }
    });
  }
  return errs;
}
// 검증에 걸린 후보는 빼고 쓴다(게임이 멈추지 않게). 돌려주는 값: { data, errors }
export function sanitizeLandmarks(data) {
  const errors = validateLandmarks(data);
  if (!data || !data.places || typeof data.places !== 'object') return { data: null, errors };
  const places = {};
  for (const [key, list] of Object.entries(data.places)) {
    if (!Array.isArray(list)) continue;
    const ok = list.filter((p) => p && typeof p === 'object' && p.id && p.name && LM_KINDS.includes(p.kind) && (!p.parts || (Array.isArray(p.parts) && p.parts.every((pt) => !validatePart(pt).length))));
    if (ok.length) places[key] = ok;
  }
  const terrain = {};
  for (const [k, v] of Object.entries(data.terrain || {})) if (LM_TERRAIN.includes(v)) terrain[k] = v;
  return { data: { version: 1, terrain, places }, errors };
}
