// 날씨 받기 어댑터 (M3-c, D-95·97, 날씨_설계 1-4·1-7): 같은 출처 /api/weather 를 부르고 localStorage(wx:sido)에 30분 보관.
// 새로 받기가 실패하면 3시간까지 저장값을 쓰고, 그보다 오래되면 null(기본 날씨). 로컬 서버에서는 mock, 시험 호스트에서는 ?wx= 강제.
// loadWeather() -> { bundle|null, from: 'forced'|'mock'|'cache'|'fresh'|'stale'|'none', ageMs }
import { WEATHER_CONFIG } from '../config.js';
import { KINDS, isKind } from '../core/weather_rules.js';
import { isTestHost } from '../core/test_host.js';
import { store } from './store.js';

const KEY = 'wx:sido';
const SIDO = ['11', '12', '26', '27', '28', '30', '31', '36', '41', '43', '44', '47', '48', '50', '51', '52'];
const AMT = { clear: 0, cloudy: 0, fog: 0, rain: 0.5, snow: 0.5, storm: 0.9 };

const locOf = () => (typeof location !== 'undefined' ? location : null);
export function isLive(loc = locOf(), cfg = WEATHER_CONFIG) {
  if (cfg.mock === true) return false;
  if (cfg.mock === false) return true;
  if (!loc || !/^https?:$/.test(loc.protocol || '')) return false;
  return !/^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(loc.hostname || '');
}
export function forcedKind(loc = locOf()) { // ?wx=rain 등. 배포 주소에서는 무시
  if (!loc || !isTestHost(loc.hostname)) return null;
  const k = new URLSearchParams(loc.search || '').get('wx');
  return isKind(k) ? k : null;
}
// 가짜 묶음: kind 가 있으면 16곳 모두 그 종류, 없으면 종류를 돌려 가며 (화면 확인용, 지어낸 값)
export function fakeBundle(now, kind = null) {
  const h = Math.floor(now / 3600000) * 3600000, pts = {};
  SIDO.forEach((c, i) => {
    const k = kind || KINDS[i % KINDS.length];
    pts[c] = { t: 12 + (i % 5), kind: k, amt: AMT[k], hours: [[h, k, AMT[k]]] };
  });
  return { v: 1, at: Math.floor(now / 1800000) * 1800000, src: 'mock', pts };
}
function validBundle(b) {
  return !!b && typeof b === 'object' && b.v === 1 && Number.isFinite(b.at) && !!b.pts && typeof b.pts === 'object' && !Array.isArray(b.pts);
}

// env: { fetchImpl, now, loc, cfg } (시험용으로 바꿀 수 있다)
export async function loadWeather({ force = false, fetchImpl = (typeof fetch !== 'undefined' ? fetch : null), now = Date.now(), loc = locOf(), cfg = WEATHER_CONFIG } = {}) {
  const fk = forcedKind(loc);
  if (fk) return { bundle: fakeBundle(now, fk), from: 'forced', ageMs: 0 };
  const saved = store.get(KEY, null);
  const ok = validBundle(saved && saved.data) && Number.isFinite(saved.at);
  const age = ok ? now - saved.at : Infinity;
  if (!isLive(loc, cfg)) return { bundle: fakeBundle(now), from: 'mock', ageMs: 0 };
  if (ok && !force && age >= 0 && age < cfg.freshMs) return { bundle: saved.data, from: 'cache', ageMs: age };
  try {
    if (!fetchImpl) throw new Error('no fetch');
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), cfg.timeoutMs) : null;
    let res;
    try { res = await fetchImpl(cfg.endpoint, { headers: { Accept: 'application/json' }, signal: ctl && ctl.signal }); } finally { if (timer) clearTimeout(timer); }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const b = await res.json();
    if (!validBundle(b)) throw new Error('bad bundle');
    const at = b.stale ? b.at : now; // 서버가 직전 값(stale)을 주면 데이터 나이로 센다 (30분 캐시로 굳지 않게)
    store.set(KEY, { at, data: b });
    return { bundle: b, from: b.stale ? 'stale' : 'fresh', ageMs: now - at };
  } catch (e) {
    if (ok && age >= 0 && age <= cfg.staleMs) return { bundle: saved.data, from: 'stale', ageMs: age };
    return { bundle: null, from: 'none', ageMs: Infinity };
  }
}
