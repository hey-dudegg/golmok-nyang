// M13-1: 비 갠 뒤 shake·groom 가중(결정적, 이력 없음), lookUp 캣타워 방향
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../../prototype/src/core/clock.js';
import { ACTIONS } from '../../prototype/src/core/behavior.js';
import { PROPS } from '../../prototype/src/core/props.js';
import { makeGenome } from '../../prototype/src/core/genome.js';
import { makeRng } from '../../prototype/src/core/util.js';

const store = { get: (k, d) => d, set() {} };
const cat = { id: 'rain1', g: makeGenome(makeRng('rain1'), { sex: 'f', months: 30 }), geo: { lat: 37.5, lng: 127 }, mother: null };
const H = 3600000, T = Date.UTC(2026, 10, 14, 6, 0, 0); // 비는 T 직전 정시까지(T-H ~ T 직전), T부터 맑음
const mk = (rainEnd) => { const c = createClock(store); c.wxSrc = (_, ms) => ({ wx: { kind: ms < rainEnd ? 'rain' : 'clear', amt: 0.5 }, theme: 'alley' }); return c; };
const w = (c, ms, k) => { const st = c.state(cat, ms, [], false, null), x = c.weights(cat, ms, st, [], null, c.rainAfter(cat, ms)).find((e) => e.key === k); return x ? x.w : 0; };

test('비 갠 직후 shake·groom 점수가 맑은 날보다 높고 60분 뒤 원래대로', () => {
  const rainy = mk(T), clear = mk(0);
  for (const k of ['shake', 'groom']) {
    const b = (ms) => w(clear, ms, k), base = b(T + 600000), r10 = w(rainy, T + 600000, k), r40 = w(rainy, T + 2400000, k) / b(T + 2400000), r60 = w(rainy, T + 3600000, k) / b(T + 3600000);
    assert.ok(r10 / base > 1.5 && r10 / base < 2.6, k + ' ' + r10 / base);
    assert.ok(r40 < r10 / base && r40 > 1, k);
    assert.ok(Math.abs(r60 - 1) < 1e-9, k);
  }
  assert.equal(w(rainy, T - 600000, 'shake') > 0, true);
});
test('같은 시각 두 번 계산하면 같은 결과, 맑음 쪽 일정은 비 이력 없으면 불변', () => {
  const a = mk(T).between(cat, T, T + H).map((e) => e.key + e.t0).join('|'), b = mk(T).between(cat, T, T + H).map((e) => e.key + e.t0).join('|');
  assert.equal(a, b);
  assert.equal(mk(0).rainAfter(cat, T + 600000), 0);
  assert.equal(mk(T).rainAfter(cat, T + 600000), 20);
});
test('lookUp: 타워 가까이면 타워 방향, 없으면 기존', () => {
  const r = () => 0.5; r.range = (a, b) => (a + b) / 2;
  const a = { x: 0, z: 0 }, yaw = () => ACTIONS.lookUp.steps(a, r)[0];
  const stepYaw = () => { const s = yaw(), o = {}; s.start(o); return o.yawTarget; };
  const old = [PROPS.on, PROPS.layout];
  try {
    PROPS.on = false; PROPS.layout = [];
    assert.ok(Math.abs(stepYaw() - Math.PI) < 0.01);
    PROPS.on = true; PROPS.layout = [{ id: 'tower0', kind: 'tower', x: 1.5, z: 0, rot: 0, dir: 1 }];
    assert.ok(Math.abs(stepYaw() - Math.PI / 2) < 0.4, 'near ' + stepYaw());
    PROPS.layout = [{ id: 'tower0', kind: 'tower', x: 5, z: 0, rot: 0, dir: 1 }];
    assert.ok(Math.abs(stepYaw() - Math.PI) < 0.01);
  } finally { [PROPS.on, PROPS.layout] = old; }
});
