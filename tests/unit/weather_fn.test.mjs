// 날씨 중계 Pages Function 단위 시험(M3-b): 가짜 fetch·가짜 Cache, 지어낸 Open-Meteo 응답(tests/fixtures/openmeteo_kma.json)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { onRequest, upstreamUrl, SLOT_MS, SIDO_POINTS, _resetForTest } = await import('../../functions/api/weather.js');
const FIX = JSON.parse(readFileSync(new URL('../fixtures/openmeteo_kma.json', import.meta.url), 'utf8'));

const URL_ = 'https://site.example/api/weather?level=sido';
const T0 = 1762560000000 + 5 * 60000; // 칸 시작 + 5분
const mkFetch = (impl) => { const f = async (u, o) => { f.calls.push(u); return impl(u, o); }; f.calls = []; return f; };
const okF = (data = FIX) => mkFetch(async () => new Response(JSON.stringify(data), { status: 200 }));
const badF = () => mkFetch(async () => new Response('x', { status: 500 }));
const throwF = () => mkFetch(async () => { throw new Error('net'); });
const mkCache = () => { const m = new Map(); return { m, match: async (r) => { const v = m.get(r.url); return v ? v.clone() : undefined; }, put: async (r, res) => { m.set(r.url, res); } }; };
const run = async (f, cache, now = T0, url = URL_, method = 'GET') => {
  const res = await onRequest({ request: new Request(url, { method }), now, fetchImpl: f, cache });
  return { res, j: await res.json() };
};

test('정상: 형식 1-3, 16곳, 칸 시작 시각, 바깥 주소 고정', async () => {
  _resetForTest(); const f = okF();
  const { res, j } = await run(f, mkCache());
  assert.equal(res.status, 200); assert.equal(j.v, 1); assert.equal(j.src, 'kma');
  assert.equal(j.at, Math.floor(T0 / SLOT_MS) * SLOT_MS);
  assert.equal(Object.keys(j.pts).length, 16);
  assert.deepEqual(Object.keys(j.pts).sort(), Object.keys(SIDO_POINTS).sort());
  assert.equal(j.pts['11'].kind, 'clear'); assert.equal(j.pts['11'].t, 5);
  assert.equal(j.pts['26'].kind, 'rain'); assert.ok(j.pts['26'].amt > 0 && j.pts['26'].amt <= 1);
  assert.ok(Array.isArray(j.pts['11'].hours) && j.pts['11'].hours.length === 4);
  assert.equal(j.pts['11'].hours[0].length, 3);
  assert.equal(f.calls.length, 1); assert.ok(f.calls[0].startsWith('https://api.open-meteo.com/v1/forecast?'));
  assert.equal(f.calls[0], upstreamUrl()); assert.match(f.calls[0], /models=kma_seamless/);
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=300');
});
test('null 변수 지점: 그 키만 null, 나머지는 정상', async () => {
  _resetForTest();
  const { j } = await run(okF(), mkCache());
  assert.equal(j.pts['27'], null);
  assert.equal(Object.values(j.pts).filter((p) => p).length, 15);
});
test('같은 칸 두 번: 바깥 호출 1회, 같은 묶음. 다음 칸은 다시 호출', async () => {
  _resetForTest(); const f = okF(), c = mkCache();
  const a = await run(f, c, T0), b = await run(f, c, T0 + 20 * 60000);
  assert.deepEqual(a.j, b.j); assert.equal(f.calls.length, 1);
  const n = await run(f, c, T0 + SLOT_MS);
  assert.equal(f.calls.length, 2); assert.equal(n.j.at, a.j.at + SLOT_MS);
});
test('Open-Meteo 오류: 직전 값이 있으면 stale, 없으면 503', async () => {
  _resetForTest(); const c = mkCache();
  const first = await run(badF(), c);
  assert.equal(first.res.status, 503); assert.deepEqual(first.j, { v: 1, err: 'upstream' });
  assert.equal(first.res.headers.get('Cache-Control'), 'no-store');
  await run(okF(), c, T0);
  for (const f of [badF(), throwF(), okF({ error: true })]) {
    const s = await run(f, c, T0 + SLOT_MS);
    assert.equal(s.res.status, 200); assert.equal(s.j.stale, true); assert.equal(s.j.at, Math.floor(T0 / SLOT_MS) * SLOT_MS);
  }
});
test('Open-Meteo 오류: Cache 없이도 메모리 직전 값으로 stale', async () => {
  _resetForTest();
  await run(okF(), null, T0);
  const s = await run(throwF(), null, T0 + SLOT_MS);
  assert.equal(s.j.stale, true);
});
test('모양이 이상한 응답(지점 수 다름·전부 null): 오류로 취급', async () => {
  _resetForTest();
  assert.equal((await run(okF(FIX.slice(0, 3)), mkCache())).res.status, 503);
  const allNull = FIX.map(() => ({ current: {} }));
  assert.equal((await run(okF(allNull), mkCache())).res.status, 503);
});
test('잘못된 입력: 400, 바깥 호출 없음', async () => {
  _resetForTest();
  for (const q of ['', '?level=cell', '?level=sido&x=1', '?level=sido&level=sido', '?cells=7515_25395', '?level=sido&lat=1']) {
    const f = okF(); const { res } = await run(f, mkCache(), T0, 'https://site.example/api/weather' + q);
    assert.equal(res.status, 400, q); assert.equal(f.calls.length, 0);
  }
});
test('GET 이외: 405', async () => {
  for (const m of ['POST', 'PUT', 'DELETE']) assert.equal((await run(okF(), mkCache(), T0, URL_, m)).res.status, 405);
});
test('바깥 호출 시간 초과: 중단 신호로 끊고 기존 오류 경로(503, 직전 값이면 stale)', async () => {
  _resetForTest(); const c = mkCache();
  const hangF = () => mkFetch((u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('aborted')))));
  const go = async (f, now) => { const res = await onRequest({ request: new Request(URL_), now, fetchImpl: f, cache: c, timeoutMs: 20 }); return { res, j: await res.json() }; };
  const a = await go(hangF(), T0);
  assert.equal(a.res.status, 503); assert.deepEqual(a.j, { v: 1, err: 'upstream' });
  await run(okF(), c, T0);
  const b = await go(hangF(), T0 + SLOT_MS);
  assert.equal(b.res.status, 200); assert.equal(b.j.stale, true);
});
