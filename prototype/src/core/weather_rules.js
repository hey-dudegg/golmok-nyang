// core/weather_rules.js: 날씨 종류 매핑·세기·행동 배수·비 피할 자리·칸 id·묶음 읽기 (날씨_설계 1-2·4·5장, D-95·D-98)
// core 규칙: 순수 함수만. 네트워크·DOM·three·window에 닿지 않는다.
import { hashStr, mulberry32 } from './util.js';

export const KINDS = ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'];
export const isKind = (k) => KINDS.includes(k);
const HOUR = 3600000;

const inRange = (c, a, b) => c >= a && c <= b;
export function kindFromCode(code) { // WMO weather_code → 종류. 알 수 없는 코드는 cloudy
  const c = Number(code);
  if (code == null || code === '' || !Number.isFinite(c)) return null;
  if (c === 0 || c === 1) return 'clear';
  if (c === 2 || c === 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if (inRange(c, 51, 57) || inRange(c, 61, 67) || inRange(c, 80, 82)) return 'rain';
  if (inRange(c, 71, 77) || c === 85 || c === 86) return 'snow';
  if (c === 95 || c === 96 || c === 99) return 'storm';
  return 'cloudy';
}
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
export function kindFromFields({ cloud_cover, precipitation, snowfall } = {}) { // 코드가 없을 때 직접 판정. 정할 수 없으면 null
  const sn = num(snowfall), pr = num(precipitation), cc = num(cloud_cover);
  if (sn != null && sn > 0) return 'snow';
  if (pr != null && pr >= 0.1 && (sn == null || sn === 0)) return 'rain';
  if (cc == null) return null;
  return cc < 40 ? 'clear' : 'cloudy';
}
export function amtOf(kind, precipitation, snowfall) { // 세기 0~1
  if (kind === 'rain' || kind === 'storm') return Math.min(1, Math.max(0, num(precipitation) ?? 0) / 8);
  if (kind === 'snow') return Math.min(1, Math.max(0, num(snowfall) ?? 0) / 3);
  return 0;
}
// 한 시각의 원자료 → { kind, amt } | null (코드 우선, 없으면 직접 판정)
export function classify({ weather_code, cloud_cover, precipitation, snowfall } = {}) {
  const kind = kindFromCode(weather_code) ?? kindFromFields({ cloud_cover, precipitation, snowfall });
  return kind ? { kind, amt: amtOf(kind, precipitation, snowfall) } : null;
}

// 행동 점수 배수표(시작점, ?debug에서 조정). 배수 = 1 + (표 값 - 1) × max(0.5, amt)
export const WX_BIAS = {
  rain:  { zoom: 0.3, hunt: 0.4, wander: 0.5, belly: 0.3, nap: 1.3, loaf: 1.4, groom: 1.2, watch: 1.2, underHide: 1.6 },
  storm: { zoom: 0.2, hunt: 0.3, wander: 0.3, belly: 0.2, nap: 1.2, loaf: 1.5, watch: 1.3, underHide: 1.8 },
  snow:  { wander: 0.8, belly: 0.5, loaf: 1.2 },
  fog:   { watch: 1.2 }, cloudy: {}, clear: {},
};
export const WX_BIAS_BABY = { snow: { zoom: 1.2 } }; // 아기 고양이는 눈 장난
export function wxBias(wx, key, baby = false) { // wx 없음·clear·표에 없는 행동이면 정확히 1
  if (!wx) return 1;
  const t = (baby ? WX_BIAS_BABY[wx.kind]?.[key] : null) ?? WX_BIAS[wx.kind]?.[key];
  if (t == null) return 1;
  return 1 + (t - 1) * Math.max(0.5, wx.amt || 0);
}
export const WX_EMO = { storm: { scared: 0.15, wary: 0.1 }, rain: { calm: 0.1, playful: -0.1 } };

// 비 피할 자리 [x,z] (장면 테마별, BOUNDS 안). 좌표는 render/shelter_roofs.js 의 처마·지붕, scene_themes.js 의 시장 차양 아래에 맞춘다.
//  alley: 담 앞 처마(x ±3.2, z -2.02~-1.07)  market: 차양 3칸(x -3.5~-1.3 / -1.1~1.1 / 1.3~3.5, z -1.93~-1.07, 걸상·좌판 비켜 4곳)
//  park: 간이 지붕 둘(x -2.65~-0.75 / 0.75~2.65, z -1.75~-0.25, 벤치 뒤쪽을 비켜 앞쪽)
export const SHELTER = {
  alley:  [[-2.2, -1.25], [-1.2, -1.25], [-0.1, -1.25], [1.0, -1.25], [2.1, -1.25]],
  market: [[-1.5, -1.2], [-1.0, -1.15], [1.0, -1.15], [1.5, -1.2]],
  park:   [[-2.2, -0.75], [-1.3, -0.75], [-1.75, -0.4], [1.3, -0.75], [2.2, -0.75]],
};
// 처마·지붕 자료(render/shelter_roofs.js 가 그린다). alley: 담(z -2.0) 앞으로 내민 함석 처마. park: 뒤쪽 기둥에 기대 앞으로 숙인 간이 지붕 둘. 값을 바꾸면 SHELTER 도 같이 본다.
export const SHELTER_ROOFS = {
  alley: [{ x: 0, z: -1.55, w: 6.4, d: 0.95, y: 0.9, tilt: 0.16, col: '#6f7a80' }],
  market: [],
  park: [{ x: -1.7, z: -1.0, w: 1.9, d: 1.5, y: 0.95, tilt: 0.12, col: '#8a5d3a', post: -1.75 }, { x: 1.7, z: -1.0, w: 1.9, d: 1.5, y: 0.95, tilt: 0.12, col: '#8a5d3a', post: -1.75 }],
};
export const needShelter = (wx) => !!wx && (wx.kind === 'rain' || wx.kind === 'storm') && wx.amt >= 0.2;
export function pickShelter(theme, catId, slot, avoid = -1) { // (고양이 id, 칸 번호)로 결정적. avoid: 앞 칸과 같은 자리 번호면 다음 자리로. 자리 없으면 null
  const list = SHELTER[theme];
  if (!list || !list.length) return null;
  const r = mulberry32(hashStr(`shelter:${catId}:${slot}`));
  let i = Math.floor(r() * list.length);
  if (i === avoid && list.length > 1) i = (i + 1) % list.length;
  return { x: list[i][0], z: list[i][1], i };
}
// 비 올 때 이 칸을 비 피할 자리에서 보낼지 (세기가 셀수록 자주). 결정적
export const shelterChance = (wx, catId, slot) => hashStr(`shelterp:${catId}:${slot}`) / 4294967296 < 0.15 + 0.65 * Math.min(1, Math.max(0, wx.amt || 0));

// 비 피할 칸 중 차 밑(underHide 지점)을 고르는 비율 50% (M4-4). 나머지는 위 SHELTER 처마 자리. 결정적
export const underShelterPick = (catId, slot) => hashStr(`shelteru:${catId}:${slot}`) / 4294967296 < 0.5;

// 칸 id: round(위도×20)_round(경도×20) (0.05°)
export const cellId = (lat, lng) => `${Math.round(lat * 20)}_${Math.round(lng * 20)}`;
export function cellCenter(id) {
  const m = /^(-?\d+)_(-?\d+)$/.exec(id);
  return m ? { lat: Number(m[1]) / 20, lng: Number(m[2]) / 20 } : null;
}
export function cellNeighbors(id) { // 8칸 (상하좌우·대각)
  const m = /^(-?\d+)_(-?\d+)$/.exec(id);
  if (!m) return [];
  const a = Number(m[1]), b = Number(m[2]), out = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (i || j) out.push(`${a + i}_${b + j}`);
  return out;
}

// 묶음의 한 지점 pt = { t, kind, amt, hours:[[정시ms, kind, amt],...] } 에서 ms가 속한 정시의 { kind, amt }.
// hours에 없으면 pt의 현재 종류로 채우고, pt가 없거나 종류를 모르면 null.
export function wxAt(pt, ms) {
  if (!pt) return null;
  const h = Math.floor(ms / HOUR) * HOUR;
  if (Array.isArray(pt.hours)) {
    for (const e of pt.hours) if (e && e[0] === h && isKind(e[1])) return { kind: e[1], amt: Number(e[2]) || 0 };
  }
  return isKind(pt.kind) ? { kind: pt.kind, amt: Number(pt.amt) || 0 } : null;
}
