// 날씨 받기 어댑터(adapters/weather_data.js)·상태(state/weather.js) 단위 시험(M3-c): 가짜 localStorage·fetch·문서
import { test } from 'node:test';
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { loadWeather: load, forcedKind, isLive } = await import('../../prototype/src/adapters/weather_data.js');
const { Wx } = await import('../../prototype/src/state/weather.js');

const MIN = 60000, HOUR = 3600000, T0 = 1762560000000;
const LIVE = { protocol: 'https:', hostname: 'site.example', search: '' };
const bundle = (at, over = {}) => ({ v: 1, at, src: 'kma', pts: { '11': { t: 3, kind: 'rain', amt: 0.5, hours: [] }, '26': null, '27': { t: 4, kind: 'clear', amt: 0, hours: [] } }, ...over });
const mkF = (b, ok = true) => { const f = async () => { f.n++; if (!ok) throw new Error('net'); return new Response(JSON.stringify(b), { status: 200 }); }; f.n = 0; return f; };
const reset = () => mem.clear();

test('?wx= 강제: 시험 호스트만, 알 수 없는 값은 무시', () => {
  assert.equal(forcedKind({ hostname: 'localhost', search: '?wx=rain' }), 'rain');
  assert.equal(forcedKind({ hostname: '127.0.0.1', search: '?wx=storm' }), 'storm');
  assert.equal(forcedKind({ hostname: 'site.example', search: '?wx=rain' }), null);
  assert.equal(forcedKind({ hostname: 'localhost', search: '?wx=hail' }), null);
});
test('mock: 로컬은 가짜 값(fetch 안 부름), 배포 주소는 live, 설정으로 고정', async () => {
  assert.equal(isLive({ protocol: 'http:', hostname: 'localhost' }), false);
  assert.equal(isLive(LIVE), true); assert.equal(isLive(LIVE, { mock: true }), false);
  reset(); const f = mkF(bundle(T0));
  const r = await load({ fetchImpl: f, now: T0, loc: { protocol: 'http:', hostname: 'localhost', search: '' } });
  assert.equal(r.from, 'mock'); assert.equal(f.n, 0); assert.equal(Object.keys(r.bundle.pts).length, 16);
  const r2 = await load({ fetchImpl: f, now: T0, loc: { protocol: 'http:', hostname: 'localhost', search: '?wx=snow' } });
  assert.equal(r2.from, 'forced'); assert.ok(Object.values(r2.bundle.pts).every((p) => p.kind === 'snow'));
});
test('3단계: 처음 받기 -> 30분 안 캐시 적중 -> 만료 후 다시 받기', async () => {
  reset(); const f = mkF(bundle(T0));
  assert.equal((await load({ fetchImpl: f, now: T0, loc: LIVE })).from, 'fresh');
  const c = await load({ fetchImpl: f, now: T0 + 29 * MIN, loc: LIVE });
  assert.equal(c.from, 'cache'); assert.equal(f.n, 1);
  assert.equal((await load({ fetchImpl: f, now: T0 + 31 * MIN, loc: LIVE })).from, 'fresh'); assert.equal(f.n, 2);
  assert.equal((await load({ fetchImpl: f, now: T0 + 31 * MIN, loc: LIVE, force: true })).from, 'fresh'); assert.equal(f.n, 3);
});
test('실패: 3시간 안 저장값 stale, 넘으면 none, 저장값 없으면 none', async () => {
  reset();
  assert.equal((await load({ fetchImpl: mkF(null, false), now: T0, loc: LIVE })).from, 'none');
  await load({ fetchImpl: mkF(bundle(T0)), now: T0, loc: LIVE });
  const s = await load({ fetchImpl: mkF(null, false), now: T0 + 2 * HOUR, loc: LIVE });
  assert.equal(s.from, 'stale'); assert.equal(s.ageMs, 2 * HOUR); assert.ok(s.bundle);
  const n = await load({ fetchImpl: mkF(null, false), now: T0 + 3 * HOUR + MIN, loc: LIVE });
  assert.equal(n.from, 'none'); assert.equal(n.bundle, null);
});
test('서버가 stale 을 주면 30분 캐시로 굳지 않고, 깨진 응답·저장값은 무시', async () => {
  reset(); const f = mkF(bundle(T0 - HOUR, { stale: true }));
  assert.equal((await load({ fetchImpl: f, now: T0, loc: LIVE })).from, 'stale');
  await load({ fetchImpl: f, now: T0 + MIN, loc: LIVE }); assert.equal(f.n, 2);
  reset(); assert.equal((await load({ fetchImpl: mkF({ v: 2 }), now: T0, loc: LIVE })).from, 'none');
  mem.set('golmok:wx:sido', '{깨짐'); assert.equal((await load({ fetchImpl: mkF(null, false), now: T0, loc: LIVE })).from, 'none');
  mem.set('golmok:wx:sido', JSON.stringify({ at: T0, data: 5 })); assert.equal((await load({ fetchImpl: mkF(null, false), now: T0, loc: LIVE })).from, 'none');
});
test('상태: 직접 값·빌린 값·알림(같은 값이면 알리지 않음)', async () => {
  reset(); const seen = []; const off = Wx.on((w) => seen.push(w.from));
  globalThis.location = LIVE;
  const C = { '11': { lat: 37, lng: 127 }, '26': { lat: 35, lng: 129 }, '27': { lat: 35.5, lng: 128.5 } };
  Wx.setGraph({ ids: () => ['11', '26', '27'], neighbors: (id) => (id === '26' ? ['11', '27'] : []), center: (id) => C[id] });
  assert.equal(await Wx.refresh({ fetchImpl: mkF(bundle(T0)), now: T0 }), true);
  assert.equal(Wx.get('11').wx.kind, 'rain'); assert.equal(Wx.get('11').hops, 0);
  const b = Wx.get('26'); assert.equal(b.from, '27'); assert.equal(b.hops, 1); // 가까운 27 에서 빌림
  assert.equal(Wx.at('11', T0).kind, 'rain'); assert.equal(Wx.get('99'), null);
  assert.equal(await Wx.refresh({ fetchImpl: mkF(bundle(T0)), now: T0 + MIN }), false); // 캐시 적중, 같은 값
  assert.equal(seen.length, 1);
  assert.equal(await Wx.refresh({ fetchImpl: mkF(null, false), now: T0 + 4 * HOUR }), true); // 3시간 넘음 -> 기본
  assert.equal(Wx.bundle, null); assert.equal(Wx.get('11'), null); assert.equal(seen.length, 2);
  off(); delete globalThis.location;
});
test('받기 주기: 숨은 탭은 안 부르고, 돌아오면 확인', async () => {
  reset(); globalThis.location = LIVE;
  const real = globalThis.fetch; let n = 0;
  globalThis.fetch = async () => { n++; return new Response(JSON.stringify(bundle(T0)), { status: 200 }); };
  const lis = {}; const doc = { visibilityState: 'hidden', addEventListener: (e, f) => { lis[e] = f; }, removeEventListener: (e) => { delete lis[e]; } };
  let cb = null, delay = null;
  Wx.start({ doc, now: () => T0 + 10 * MIN, rand: () => 0.5, setT: (f, d) => { cb = f; delay = d; return 1; }, clearT: () => {} });
  await new Promise((r) => setImmediate(r));
  assert.equal(n, 0); assert.equal(delay, 20 * MIN + 30000); // 다음 칸까지 + 흔들림
  await cb(); assert.equal(n, 0); // 숨은 채로 시간이 돼도 안 부름
  doc.visibilityState = 'visible'; lis.visibilitychange();
  await new Promise((r) => setImmediate(r)); assert.equal(n, 1);
  Wx.stop(); assert.equal(lis.visibilitychange, undefined);
  globalThis.fetch = real; delete globalThis.location;
});
