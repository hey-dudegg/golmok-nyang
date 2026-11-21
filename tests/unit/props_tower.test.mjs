// 캣타워 core 단위 시험 (M8-1, 캣타워_설계 5장 TC6·3.2·3.3): 배치 결정성·겹침·접근점 보호·giftSpot 회피·점수 단조성·묶음 반복
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOUNDS } from '../../prototype/src/core/behavior.js';
import { OBJ_GAP, PROPS, PROP_KINDS, PROP_ACTION_KEYS, TOWER_KEEP, TOWER_KEYS, CRATE_KEEP, CAR_FOOT, footOf, giftSpot, layoutFor, propClaim, shapesOverlap, slotWorld } from '../../prototype/src/core/props.js';
import { PROP_ACTIONS, pickSlot, registerPropActions, noteAct } from '../../prototype/src/core/prop_actions.js';
import { CLOCK, EMO_BIAS, createClock } from '../../prototype/src/core/clock.js';
import { makeGenome, makePersonality } from '../../prototype/src/core/genome.js';
import { makeRng } from '../../prototype/src/core/util.js';

const withProps = (fn) => { PROPS.on = true; try { fn(); } finally { PROPS.on = false; PROPS.layout = []; PROPS.force = null; PROPS.claims.clear(); registerPropActions(false); } };
const agent = (o = {}) => ({ p: { bold: 0.5, social: 0.5, playful: 0.5, ...(o.p || {}) }, kitten: !!o.kitten, E: 0.5, world: { day: 1 }, time: 0, scale: 1, ...o.rest });
const towerOf = (theme, code) => layoutFor({ theme, code, obstacles: [] }).find((p) => p.kind === 'tower');

test('TC6 배치: 200개 코드 겹침 0·접근점 보호·시장 0·골목 차 있으면 0·결정적', () => {
  const n = { park: 0, alley: 0 };
  for (let i = 0; i < 200; i++) for (const theme of ['park', 'alley', 'market']) {
    const code = 'tw' + i, lay = layoutFor({ theme, code, obstacles: [] }), T = lay.filter((p) => p.kind === 'tower');
    assert.deepEqual(lay, layoutFor({ theme, code, obstacles: [] }));
    assert.ok(T.length <= 1);
    if (theme === 'market') assert.equal(T.length, 0);
    if (theme === 'alley' && lay.some((p) => p.kind === 'car')) assert.equal(T.length, 0);
    if (!T.length) continue;
    n[theme]++;
    const t = T[0], me = { ...PROP_KINDS.tower, x: t.x, z: t.z, rot: 0 }, q = slotWorld(t, PROP_KINDS.tower.slots[0]);
    assert.ok(q.ax >= BOUNDS.x0 && q.ax <= BOUNDS.x1 && q.az <= BOUNDS.z1);
    assert.ok(t.x >= -1.6 - 1e-6 && t.x <= 1.6 + 1e-6 && t.z >= -1.3 - 1e-6 && t.z <= -0.7 + 1e-6);
    for (const o of lay) if (o !== t) assert.ok(!shapesOverlap(me, { ...footOf(o.kind), x: o.x, z: o.z, rot: o.rot || 0 }, OBJ_GAP - 1e-6), `${theme} ${code} ${o.kind}`);
    for (const o of lay) if (o !== t) for (const s of PROP_KINDS[o.kind].slots) { // 다른 지점 접근점 둘레 0.2 안에 캣타워 본체 없음
      const w = slotWorld(o, s); assert.ok(!shapesOverlap({ x: w.ax, z: w.az, r: TOWER_KEEP - 1e-6 }, me, 0), `${theme} ${code} ap ${o.kind}.${s.id}`);
    }
    assert.ok(!lay.some((o) => o !== t && Math.hypot(slotWorld(o, PROP_KINDS[o.kind].slots[0]).ax - q.ax, slotWorld(o, PROP_KINDS[o.kind].slots[0]).az - q.az) < TOWER_KEEP - 1e-6));
    for (const seed of [1, 2, 3]) { // giftSpot 과 겹침 0, 접근점 둘레 0.2 피함
      const g = giftSpot({ code, seed, obstacles: [], props: lay });
      if (g) { assert.ok(!shapesOverlap({ ...PROP_KINDS.crate, x: g.x, z: g.z, rot: 0 }, me, 0)); assert.ok(Math.hypot(g.x - q.ax, g.z - q.az) >= TOWER_KEEP); }
    }
  }
  assert.ok(n.park > 100 && n.park < 180 && n.alley > 5, JSON.stringify(n)); // 공원 약 70%, 골목 차 없는 장면 중 25%
});
test('기존 kind 배치는 캣타워가 있어도 같다(맨 끝에 추가)', () => {
  for (let i = 0; i < 50; i++) { const lay = layoutFor({ theme: 'park', code: 'tw' + i, obstacles: [] }); const k = lay.findIndex((p) => p.kind === 'tower'); if (k >= 0) assert.equal(k, lay.length - 1); }
});
test('force: tower 지정은 그 자리, 차 고정 시험은 놓지 않음', () => {
  assert.deepEqual(layoutFor({ theme: 'park', code: 'a', obstacles: [], force: { tower: { x: 1, z: -1 } } }).find((p) => p.kind === 'tower'), { id: 'tower0', kind: 'tower', x: 1, z: -1, rot: 0, dir: 1 });
  assert.ok(!layoutFor({ theme: 'park', code: 'a', obstacles: [], force: { x: 0, z: -1.2 } }).some((p) => p.kind === 'tower'));
});
test('행동 키·EMO_BIAS·지점 정의', () => {
  for (const k of TOWER_KEYS) { assert.ok(PROP_ACTION_KEYS.has(k)); assert.ok(EMO_BIAS[k]); assert.ok(PROP_ACTIONS[k]); }
  assert.deepEqual(PROP_KINDS.tower.slots.map((s) => s.action), ['towerDen', 'towerLie', 'towerLookout']);
  assert.deepEqual(PROP_KINDS.tower.slots[2].via, ['mid']);
});
test('캣타워 점수: 오브젝트 없으면 0, 있으면 양수, 새끼는 den 만, mid 점유 중 top 0, 묶음 반복 0', () => withProps(() => {
  const a = agent(), K = ['towerDen', 'towerLie', 'towerLookout'];
  registerPropActions(true);
  PROPS.layout = [];
  for (const k of K) assert.equal(PROP_ACTIONS[k].score(a), 0);
  PROPS.layout = [{ id: 'tower0', kind: 'tower', x: 0, z: -1, rot: 0, dir: 1 }];
  for (const k of K) assert.ok(PROP_ACTIONS[k].score(a) > 0, k);
  assert.ok(PROP_ACTIONS.towerLookout.score(agent({ p: { bold: 0.9 } })) > PROP_ACTIONS.towerLookout.score(agent({ p: { bold: 0.1 } }))); // 대담할수록 망보기
  assert.ok(PROP_ACTIONS.towerDen.score(agent({ p: { bold: 0.1 } })) > PROP_ACTIONS.towerDen.score(agent({ p: { bold: 0.9 } }))); // 소심할수록 집
  const kit = agent({ kitten: true });
  assert.equal(PROP_ACTIONS.towerLie.score(kit), 0); assert.equal(PROP_ACTIONS.towerLookout.score(kit), 0); assert.ok(PROP_ACTIONS.towerDen.score(kit) > 0);
  const other = {}; propClaim('tower0:mid', other); // mid 점유 중: top 불가, 다른 고양이 mid 도 불가
  assert.equal(PROP_ACTIONS.towerLookout.score(a), 0); assert.equal(PROP_ACTIONS.towerLie.score(a), 0); assert.ok(PROP_ACTIONS.towerDen.score(a) > 0);
  PROPS.claims.clear();
  const b = agent({ rest: { pm: { cool: {}, recent: [], rej: 0, touchT: -1e9, log: [] } } });
  assert.ok(pickSlot(b, 'towerLie')); noteAct(b, 'towerDen'); // 최근 3개 안에 캣타워 행동이 있으면 다른 캣타워 행동 0
  for (const k of K) assert.equal(pickSlot(b, k), null, k);
  noteAct(b, 'sit'); noteAct(b, 'sit'); noteAct(b, 'sit'); assert.ok(pickSlot(b, 'towerLie'));
}));

test('M8-6 세계 시계: 구간(10분) 경계를 넘어서도 최근 3개 안 tower 행동 1개만 (결정적)', () => withProps(() => {
  let tw = null; for (let i = 0; i < 500 && !tw; i++) tw = towerOf('park', 'tw' + i);
  PROPS.layout = [tw]; registerPropActions(true);
  let towers = 0;
  for (let c = 0; c < 20; c++) {
    const Clock = createClock({ get: (k, d) => d, set() {} }), cat = { id: 'twr' + c, mother: null, g: { ...makeGenome(makeRng('twr' + c), { sex: 'f', months: 30 }) }, geo: { lat: 37.5, lng: 127 } };
    cat.g.personality = makePersonality(makeRng('p' + c), false);
    const b0 = Math.floor(Date.UTC(2026, 9, 10, 4, 0) / CLOCK.BLOCK), L = [];
    for (let b = b0; b < b0 + 12; b++) for (const e of Clock.block(cat, b)) L.push(e.key);
    for (let i = 0; i < L.length; i++) if (TOWER_KEYS.has(L[i])) { towers++; assert.ok(!L.slice(Math.max(0, i - 2), i).some((k) => TOWER_KEYS.has(k)), cat.id + ': ' + L.slice(Math.max(0, i - 3), i + 1).join(' > ')); }
    Clock.cache.clear(); const again = []; for (let b = b0 + 11; b >= b0; b--) again.unshift(...Clock.block(cat, b).map((e) => e.key));
    assert.deepEqual(again, L, '역순 계산해도 같은 일정');
  }
  assert.ok(towers > 50, 'tower 행동 ' + towers);
}));

test('M9-1 세계 시계: 구간 경계를 넘어서도 지점 행동 재진입 쿨다운(최근 5개)·tower 묶음 지킴 (결정적)', () => withProps(() => {
  const lay = [], seen = new Set();
  for (const th of ['park', 'alley', 'market', 'residential']) for (let i = 0; i < 300; i++) for (const p of layoutFor({ theme: th, code: th + i, obstacles: [] })) if (!seen.has(p.kind)) { seen.add(p.kind); lay.push(p); }
  PROPS.layout = lay; registerPropActions(true);
  let props = 0;
  for (let c = 0; c < 20; c++) {
    const Clock = createClock({ get: (k, d) => d, set() {} }), cat = { id: 'mz' + c, mother: null, g: { ...makeGenome(makeRng('mz' + c), { sex: c % 2 ? 'f' : 'm', months: 30 }) }, geo: { lat: 37.5, lng: 127 } };
    cat.g.personality = makePersonality(makeRng('pz' + c), false);
    const b0 = Math.floor(Date.UTC(2026, 9, 10, 0, 0) / CLOCK.BLOCK), L = [];
    for (let b = b0; b < b0 + 24; b++) for (const e of Clock.block(cat, b)) L.push(e.key);
    for (let i = 0; i < L.length; i++) {
      const k = L[i], r = L.slice(Math.max(0, i - 5), i); if (!PROP_ACTION_KEYS.has(k)) continue; props++;
      assert.ok(!r.includes(k) && !(TOWER_KEYS.has(k) && r.some((x) => TOWER_KEYS.has(x))), cat.id + ': ' + [...r, k].join(' > '));
    }
    Clock.cache.clear(); const again = []; for (let b = b0 + 23; b >= b0; b--) again.unshift(...Clock.block(cat, b).map((e) => e.key));
    assert.deepEqual(again, L, '역순 계산해도 같은 일정');
  }
  assert.ok(props > 500, '지점 행동 ' + props);
}));

// M8-8: 자연 배치 4개 이하. layoutFor는 화면 폭을 입력으로 받지 않아 기기와 무관하게 같은 배치 (D-131, D-19)
test('모든 지역 코드 자연 배치 4개 이하', async () => {
  const { readFileSync } = await import('node:fs');
  const { themeFor } = await import('../../prototype/src/core/regions.js');
  const raw = JSON.parse(readFileSync(new URL('../../prototype/data/regions.json', import.meta.url), 'utf8')), over = [];
  let n = 0, max = 0;
  for (const sido of Object.values(raw)) for (const sgg of Object.values(sido)) for (const d of sgg) { n++; const lay = layoutFor({ theme: themeFor({ c: d.c, n: d.n, level: 'dong' }), code: d.c, obstacles: [] }); max = Math.max(max, lay.length); if (lay.length > 4) over.push(d.c + ' ' + d.n + ' ' + lay.length); }
  assert.ok(n > 1000, 'regions ' + n);
  assert.equal(over.length, 0, 'max ' + max + ' over ' + over.length + ': ' + over.slice(0, 5).join(' / '));
});
