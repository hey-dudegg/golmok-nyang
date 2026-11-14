// 오브젝트(core/props.js·prop_actions.js) 단위 시험: 배치 결정성·지점 좌표·충돌·점유·점수·기능 스위치 (M3-6 O1, 설계 8장 core 단위)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAR, CAR_HOOD_LEN, PROPS, PROP_KINDS, layoutFor, propClaim, propHome, propOccupant, propRelease, propSlots, propsEnter, rectHit, rectPush, slotWorld } from '../../prototype/src/core/props.js';
import { ACTIONS, BOUNDS } from '../../prototype/src/core/behavior.js';
import { EMO_BIAS, createClock } from '../../prototype/src/core/clock.js';
import { PROP_ACTIONS, registerPropActions } from '../../prototype/src/core/prop_actions.js';
import { makeGenome, makePersonality } from '../../prototype/src/core/genome.js';
import { makeRng } from '../../prototype/src/core/util.js';

const withProps = (fn) => { PROPS.on = true; try { fn(); } finally { PROPS.on = false; PROPS.layout = []; PROPS.force = null; PROPS.claims.clear(); registerPropActions(false); } };
const agent = (o = {}) => ({ p: { bold: 0.5, social: 0.5, grumpy: 0.2, ...(o.p || {}) }, kitten: !!o.kitten, E: 0.5, world: { day: o.day ?? 1 }, time: 0, scale: 1, ...o.rest });

test('차 크기 상수: 본네트 길이 하나로 전체 길이가 정해진다 (D-115)', () => {
  assert.equal(CAR.l, CAR_HOOD_LEN + CAR.cabin + CAR.trunk);
  assert.equal(PROP_KINDS.car.hx, CAR.l / 2);
});
test('스위치 꺼짐: 배치 빈 배열, 일정 자리 없음 (기존 장면 그대로)', () => {
  assert.deepEqual(propsEnter('alley', 'c1', []), []);
  assert.equal(propHome('hoodLoaf'), null);
  assert.ok(!ACTIONS.hoodLoaf && !ACTIONS.underHide);
});
test('layoutFor 결정성·테마·범위', () => {
  let cars = 0;
  for (let i = 0; i < 200; i++) {
    const a = layoutFor({ theme: 'alley', code: 'z' + i, obstacles: [] }), b = layoutFor({ theme: 'alley', code: 'z' + i, obstacles: [] });
    assert.deepEqual(a, b);
    assert.deepEqual(layoutFor({ theme: 'market', code: 'z' + i, obstacles: [] }), []);
    assert.deepEqual(layoutFor({ theme: 'park', code: 'z' + i, obstacles: [] }), []);
    if (a.length) {
      cars++; const p = a[0], w = slotWorld(p, PROP_KINDS.car.slots[0]), u = slotWorld(p, PROP_KINDS.car.slots[1]);
      assert.ok(p.z >= -1.3 && p.z <= -1.05 && Math.abs(p.x) <= 1.0);
      for (const s of [w, u]) assert.ok(s.ax >= BOUNDS.x0 && s.ax <= BOUNDS.x1 && s.az >= BOUNDS.z0 && s.az <= BOUNDS.z1, 'approach in bounds');
    }
  }
  assert.ok(cars > 90 && cars < 150, '약 60%: ' + cars);
});
test('layoutFor: 겹치는 원형 장애물이면 건너뛴다(없는 장면)', () => {
  const big = [{ x: 0, z: -1.1, r: 3 }];
  for (let i = 0; i < 30; i++) assert.deepEqual(layoutFor({ theme: 'alley', code: 'q' + i, obstacles: big }), []);
});
test('slotWorld: 방향(dir)·접근점은 카메라 쪽(+z)', () => {
  const car = { id: 'car0', kind: 'car', x: 0.2, z: -1.1, rot: 0, dir: 1 }, hood = PROP_KINDS.car.slots[0];
  const a = slotWorld(car, hood), b = slotWorld({ ...car, dir: -1 }, hood);
  assert.ok(Math.abs(a.x - (0.2 + CAR.l / 2 - CAR.hood / 2)) < 1e-9 && a.y === CAR.hoodY);
  assert.ok(Math.abs((b.x - 0.2) + (a.x - 0.2)) < 1e-9, '거울');
  assert.ok(a.az > car.z + PROP_KINDS.car.hz, '접근점은 차 밖');
  const r = slotWorld({ ...car, rot: Math.PI / 2 }, hood);
  assert.ok(Math.abs(r.x - 0.2) < 1e-9 || Math.abs(r.x - 0.2) < 0.2 + 1e-9); // 90도 회전하면 길이 방향이 z 로 간다
});
test('rectPush: 밖은 null, 안은 가장 가까운 변 바깥으로', () => {
  const o = { x: 0, z: 0, hx: 1.5, hz: 0.45, rot: 0 };
  assert.equal(rectPush(o, 2, 0, 0.08), null);
  const q = rectPush(o, 0.3, 0.4, 0.08); assert.ok(q && Math.abs(q.z - 0.53) < 1e-9 && q.x === 0.3);
  assert.ok(rectHit(o, 0, 0, 0)); assert.ok(!rectHit(o, 0, 0.6, 0.05));
});
test('점유: 한 자리에 한 마리, 해제하면 다음이 쓴다', () => {
  const A = {}, B = {};
  assert.ok(propClaim('car0:hood', A)); assert.ok(propClaim('car0:hood', A)); assert.ok(!propClaim('car0:hood', B));
  assert.equal(propOccupant('car0:hood'), A);
  propRelease('car0:hood', B); assert.equal(propOccupant('car0:hood'), A);
  propRelease('car0:hood', A); assert.ok(propClaim('car0:hood', B)); propRelease('car0:hood', B);
});
test('점수: 지점 없으면 0, 있으면 성격·낮밤에 단조, 새끼는 본네트 불가', () => {
  const H = PROP_ACTIONS.hoodLoaf, U = PROP_ACTIONS.underHide;
  assert.equal(H.score(agent()), 0); assert.equal(U.score(agent()), 0);
  withProps(() => {
    PROPS.layout = [{ id: 'car0', kind: 'car', x: 0, z: -1.1, rot: 0, dir: 1 }];
    assert.ok(H.score(agent({ p: { bold: 0.8 } })) > H.score(agent({ p: { bold: 0.2 } })));
    assert.ok(H.score(agent({ day: 1 })) > H.score(agent({ day: 0 })));
    assert.ok(U.score(agent({ p: { bold: 0.1 } })) > U.score(agent({ p: { bold: 0.9 } })));
    assert.equal(H.score(agent({ kitten: true })), 0); assert.ok(U.score(agent({ kitten: true })) > 0);
    assert.equal(propSlots('hoodLoaf').length, 1);
    const mem = { cool: { 'car0:hood': 100 }, recent: [] }; // 쿨다운 중이면 점수 0
    assert.equal(H.score(agent({ rest: { pm: mem, time: 50 } })), 0); assert.ok(H.score(agent({ rest: { pm: mem, time: 150 } })) > 0);
    assert.equal(H.score(agent({ rest: { pm: { cool: {}, recent: ['hoodLoaf'] } } })), 0, '최근 3개 행동 안 반복 금지');
    assert.equal(propHome('hoodLoaf').z > -1.1, true);
  });
});
test('Clock.weights: 꺼짐이면 새 키 없음·켜면 등장하고 최근 5개 안 반복은 제외, 기존 키 점수 불변', () => {
  const store = { get: (k, d) => d, set() {} }, Clock = createClock(store);
  const cat = { id: 'k1', mother: null, g: { ...makeGenome(makeRng('k1'), { sex: 'f', months: 30 }) }, geo: { lat: 37.5, lng: 127 } };
  cat.g.personality = makePersonality(makeRng('p'), false);
  const ms = Date.UTC(2026, 9, 10, 4, 0), st = Clock.state(cat, ms, [], false);
  const off = Clock.weights(cat, ms, st, []);
  assert.ok(!off.some((x) => x.key === 'hoodLoaf'));
  withProps(() => {
    PROPS.layout = [{ id: 'car0', kind: 'car', x: 0, z: -1.1, rot: 0, dir: 1 }]; registerPropActions(true);
    const on = Clock.weights(cat, ms, st, []);
    assert.ok(on.some((x) => x.key === 'hoodLoaf'));
    for (const o of off) assert.equal(on.find((x) => x.key === o.key).w, o.w, o.key);
    assert.ok(!Clock.weights(cat, ms, st, ['sit', 'hoodLoaf']).some((x) => x.key === 'hoodLoaf'));
    assert.ok(EMO_BIAS.hoodLoaf && EMO_BIAS.underHide);
  });
  assert.ok(!ACTIONS.hoodLoaf, '스위치 끄면 표에서 빠진다');
});
