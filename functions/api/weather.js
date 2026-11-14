// Cloudflare Pages Function: 날씨 중계 (M3-b, D-91·95, 날씨_설계 1장). 경로 /api/weather?level=sido (GET, 같은 출처).
// 브라우저 -> 이 함수 -> Open-Meteo(키 없음, 바깥 주소는 아래 상수로 고정). 30분 칸마다 한 번만 받아 모두에게 같은 묶음을 준다.
// 좌표는 시/도 16곳의 공개 중심값(행정동 평균, 소수 둘째 자리). 사용자 입력은 level=sido 뿐이라 임의 좌표 중계로 쓸 수 없다.
import { classify } from '../../prototype/src/core/weather_rules.js';

export const SLOT_MS = 30 * 60000;
const HOUR = 3600000;
export const UPSTREAM_TIMEOUT_MS = 8000; // 바깥 호출 시간 제한(보안 M3 W10). 넘으면 실패로 보고 직전 값 경로로 간다
const UPSTREAM = 'https://api.open-meteo.com/v1/forecast';
export const SIDO_POINTS = {
  '11': [37.55, 126.99], '12': [34.94, 126.91], '26': [35.16, 129.06], '27': [35.88, 128.59], '28': [37.50, 126.61], '30': [36.34, 127.40],
  '31': [35.55, 129.32], '36': [36.53, 127.26], '41': [37.45, 127.03], '43': [36.74, 127.76], '44': [36.53, 126.88], '47': [36.29, 128.71],
  '48': [35.24, 128.37], '50': [33.41, 126.53], '51': [37.67, 128.34], '52': [35.74, 127.04],
};
const CODES = Object.keys(SIDO_POINTS);
const VARS = 'weather_code,precipitation,snowfall,cloud_cover,temperature_2m';
let lastGood = null; // 이 인스턴스 메모리의 직전 값 (Cache API 가 비었을 때 보조)

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store', ...extra },
});
const r1 = (v) => (Number.isFinite(Number(v)) && v != null ? Math.round(Number(v) * 10) / 10 : null);

export function upstreamUrl() {
  const la = CODES.map((c) => SIDO_POINTS[c][0].toFixed(2)).join(','), lo = CODES.map((c) => SIDO_POINTS[c][1].toFixed(2)).join(',');
  return `${UPSTREAM}?latitude=${la}&longitude=${lo}&models=kma_seamless&current=${VARS},is_day&hourly=${VARS}&past_hours=1&forecast_hours=3&timeformat=unixtime&timezone=Asia%2FSeoul`;
}

// Open-Meteo 지점 하나 -> 우리 지점 { t, kind, amt, hours } | null (종류를 정할 수 없으면 null)
export function toPoint(loc) {
  const cur = loc && loc.current;
  if (!cur || typeof cur !== 'object') return null;
  const c = classify(cur);
  if (!c) return null;
  const hours = [], h = loc.hourly;
  if (h && Array.isArray(h.time)) {
    h.time.forEach((sec, i) => {
      const ms = Number(sec) * 1000;
      if (!Number.isFinite(ms)) return;
      const x = classify({ weather_code: h.weather_code?.[i], cloud_cover: h.cloud_cover?.[i], precipitation: h.precipitation?.[i], snowfall: h.snowfall?.[i] });
      if (x) hours.push([Math.floor(ms / HOUR) * HOUR, x.kind, Math.round(x.amt * 100) / 100]);
    });
  }
  return { t: r1(cur.temperature_2m), kind: c.kind, amt: Math.round(c.amt * 100) / 100, hours };
}

export function buildBundle(raw, at) {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  if (list.length !== CODES.length) return null;
  const pts = {}; let any = false;
  CODES.forEach((code, i) => { pts[code] = toPoint(list[i]); if (pts[code]) any = true; });
  return any ? { v: 1, at, src: 'kma', pts } : null;
}

export async function onRequest({ request, now = Date.now(), fetchImpl = fetch, cache = typeof caches !== 'undefined' ? caches.default : null, timeoutMs = UPSTREAM_TIMEOUT_MS }) {
  if (request.method !== 'GET') return json(405, { v: 1, err: 'method' }, { Allow: 'GET' });
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((k) => k !== 'level') || url.searchParams.getAll('level').length !== 1 || url.searchParams.get('level') !== 'sido') return json(400, { v: 1, err: 'input' });
  const at = Math.floor(now / SLOT_MS) * SLOT_MS;
  const key = new Request(`${url.origin}${url.pathname}?level=sido&slot=${at / SLOT_MS}`);
  const lastKey = new Request(`${url.origin}${url.pathname}?level=sido&last=1`);
  const read = async (k) => { try { const r = cache && (await cache.match(k)); return r ? await r.json() : null; } catch (e) { return null; } };
  const write = async (k, b, ttl) => { try { if (cache) await cache.put(k, new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } })); } catch (e) {} };

  const hit = await read(key);
  if (hit && hit.v === 1) return json(200, hit);
  let bundle = null;
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(upstreamUrl(), { headers: { Accept: 'application/json' }, signal: ac.signal });
    if (res.ok) bundle = buildBundle(await res.json(), at);
  } catch (e) { bundle = null; } finally { clearTimeout(timer); }
  if (bundle) {
    lastGood = bundle;
    await write(key, bundle, SLOT_MS / 1000); await write(lastKey, bundle, 86400);
    return json(200, bundle);
  }
  const prev = (await read(lastKey)) || lastGood;
  if (prev && prev.v === 1) return json(200, { ...prev, stale: true });
  return json(503, { v: 1, err: 'upstream' });
}
export const _resetForTest = () => { lastGood = null; };
