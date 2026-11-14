// 날씨 → 세계 시계 (M3-f, 날씨_설계 4장): 결정성·clear 동일·비 피할 자리 비율·좌표 정합·자동차 꺼짐 동일
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, PASSIVE_KEYS } from '../../prototype/src/core/clock.js';
import { SHELTER, SHELTER_ROOFS as ROOFS } from '../../prototype/src/core/weather_rules.js';
import { BOUNDS } from '../../prototype/src/core/behavior.js';
import { makeGenome } from '../../prototype/src/core/genome.js';
import { makeRng } from '../../prototype/src/core/util.js';

const store = { get: (k, d) => d, set() {} };
const mk = (src) => { const c = createClock(store); c.wxSrc = src; return c; };
const cats = Array.from({ length: 12 }, (_, i) => ({ id: 'wxcat' + i, g: makeGenome(makeRng('wxcat' + i), { sex: i % 2 ? 'f' : 'm', months: i === 3 ? 4 : 30 }), geo: { lat: 37.5, lng: 127 }, mother: null }));
const T0 = Date.UTC(2026, 10, 14, 3, 0, 0); // 정시
const sched = (c) => cats.map((k) => c.between(k, T0, T0 + 3600000).map((e) => `${e.key}:${e.t0}:${e.S ? e.S.x + ',' + e.S.z : ''}`).join('|'));
const world = { blocked: () => false };
const share = (c) => { let n = 0, s = 0; for (const k of cats) for (const e of c.between(k, T0, T0 + 3600000)) { n++; if (e.S) s++; } return s / n; };
const key = (c) => cats.map((k) => c.between(k, T0, T0 + 3600000).map((e) => e.key + e.t0).join('|'));

test('날씨 없음·clear·cloudy: 일정이 날씨 연결 없을 때와 같다', () => {
  const base = key(mk(null));
  assert.deepEqual(key(mk(() => null)), base);
  for (const kind of ['clear', 'cloudy']) assert.deepEqual(key(mk(() => ({ wx: { kind, amt: 0 }, theme: 'alley' }))), base);
  assert.ok(mk(() => ({ wx: { kind: 'clear', amt: 0 }, theme: 'alley' })).between(cats[0], T0, T0 + 3600000).every((e) => !e.S));
});
test('같은 묶음 두 번 계산하면 같은 일정 (결정성)', () => {
  const src = () => ({ wx: { kind: 'rain', amt: 0.7 }, theme: 'alley' });
  assert.deepEqual(sched(mk(src)), sched(mk(src)));
});
test('rain: 비 피할 자리 비율 상승, 값은 SHELTER 안, 앞 칸과 같은 자리 반복 없음', () => {
  for (const theme of ['alley', 'market', 'park']) {
    const dry = share(mk(() => ({ wx: { kind: 'cloudy', amt: 0 }, theme }))), rain = share(mk(() => ({ wx: { kind: 'rain', amt: 0.8 }, theme }))), light = share(mk(() => ({ wx: { kind: 'rain', amt: 0.25 }, theme })));
    console.log(`  ${theme}: 맑음 ${(dry * 100).toFixed(1)}% -> 비 0.25 ${(light * 100).toFixed(1)}% -> 비 0.8 ${(rain * 100).toFixed(1)}%`);
    assert.equal(dry, 0); assert.ok(rain > 0.2 && rain > light);
    const c = mk(() => ({ wx: { kind: 'rain', amt: 0.8 }, theme }));
    for (const k of cats) { let last = null; for (const e of c.between(k, T0, T0 + 3600000)) { if (e.S) { assert.ok(SHELTER[theme].some(([x, z]) => x === e.S.x && z === e.S.z)); if (last && last.i === e.S.i) assert.fail('같은 자리 반복'); } last = e.S || null; } }
  }
  const snow = share(mk(() => ({ wx: { kind: 'snow', amt: 1 }, theme: 'alley' }))); assert.equal(snow, 0);
});
test('비 피할 행동은 가만히 있는 종류만, 비에서 움직임 행동 비율은 줄고 쉬는 행동은 는다', () => {
  const frac = (c, f) => { let n = 0, s = 0; for (const k of cats) for (const e of c.between(k, T0, T0 + 6 * 3600000)) { n++; if (f(e)) s++; } return s / n; };
  const dry = mk(() => null), rain = mk(() => ({ wx: { kind: 'rain', amt: 0.8 }, theme: 'alley' }));
  for (const k of cats) for (const e of rain.between(k, T0, T0 + 3600000)) if (e.S) assert.ok(PASSIVE_KEYS.has(e.key));
  assert.ok(frac(rain, (e) => ['zoom', 'hunt', 'wander'].includes(e.key)) < frac(dry, (e) => ['zoom', 'hunt', 'wander'].includes(e.key)));
  assert.ok(frac(rain, (e) => ['loaf', 'nap'].includes(e.key)) > frac(dry, (e) => ['loaf', 'nap'].includes(e.key)));
});
test('home: 비 피할 자리 사용, 막히면 다음 자리, 모두 막히면 보통 자리', () => {
  const c = mk(() => ({ wx: { kind: 'rain', amt: 1 }, theme: 'alley' })), e = cats.flatMap((k) => c.between(k, T0, T0 + 3600000)).find((x) => x.S);
  const h = c.home(e, world); assert.deepEqual(h, { x: e.S.x, z: e.S.z });
  const e2 = { ...e }; delete e2.H; const h2 = c.home(e2, { blocked: (x, z) => x === e.S.x && z === e.S.z });
  assert.ok(SHELTER.alley.some(([x, z]) => x === h2.x && z === h2.z) && (h2.x !== e.S.x || h2.z !== e.S.z));
  const e3 = { ...e }; delete e3.H; const h3 = c.home(e3, { blocked: (x, z) => SHELTER.alley.some(([a, b]) => a === x && b === z) });
  assert.ok(!SHELTER.alley.some(([x, z]) => x === h3.x && z === h3.z));
});
test('SHELTER 좌표는 BOUNDS 안이고 처마·차양·지붕 아래에 있다', () => {
  const MARKET = [[-3.5, -1.3], [-1.1, 1.1], [1.3, 3.5]]; // scene_themes.js buildMarket 차양: 중심 x=-4.8+i*2.4, 폭 2.2, z -1.5±0.43
  for (const [th, L] of Object.entries(SHELTER)) for (const [x, z] of L) {
    assert.ok(x >= BOUNDS.x0 && x <= BOUNDS.x1 && z >= BOUNDS.z0 && z <= BOUNDS.z1, `${th} ${x},${z} BOUNDS`);
    if (th === 'market') { assert.ok(MARKET.some(([a, b]) => x >= a && x <= b), `market x ${x}`); assert.ok(z >= -1.93 && z <= -1.07, `market z ${z}`); }
    else assert.ok(ROOFS[th].some((R) => Math.abs(x - R.x) <= R.w / 2 && z >= R.z - R.d / 2 && z <= R.z + R.d / 2), `${th} ${x},${z} 지붕 밖`);
  }
});
