// 오브젝트(core/props.js·prop_actions.js) 단위 시험: 배치 결정성·지점 좌표·충돌·점유·점수·기능 스위치 (M3-6 O1, 설계 8장 core 단위)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAR, CAR_FOOT, CAR_HOOD_LEN, OBJ_GAP, PROPS, isFree, nearestFree, shapesOverlap, PROP_KINDS, layoutFor, propClaim, propHome, propOccupant, propRelease, propSlots, propsEnter, rectHit, rectPush, slotWorld } from '../../prototype/src/core/props.js';
import { ACTIONS, BOUNDS } from '../../prototype/src/core/behavior.js';
import { EMO_BIAS, createClock } from '../../prototype/src/core/clock.js';
import { PROP_ACTIONS, registerPropActions } from '../../prototype/src/core/prop_actions.js';
import { makeGenome, makePersonality } from '../../prototype/src/core/genome.js';
import { makeRng } from '../../prototype/src/core/util.js';

const withProps = (fn) => { PROPS.on = true; try { fn(); } finally { PROPS.on = false; PROPS.layout = []; PROPS.force = null; PROPS.claims.clear(); registerPropActions(false); } };
const agent = (o = {}) => ({ p: { bold: 0.5, social: 0.5, grumpy: 0.2, playful: 0.5, ...(o.p || {}) }, kitten: !!o.kitten, E: 0.5, world: { day: o.day ?? 1 }, time: 0, scale: 1, ...o.rest });

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
    const all = layoutFor({ theme: 'alley', code: 'z' + i, obstacles: [] }), a = all.filter((p) => p.kind === 'car'), b = layoutFor({ theme: 'alley', code: 'z' + i, obstacles: [] });
    assert.deepEqual(all, b);
    assert.ok(!layoutFor({ theme: 'market', code: 'z' + i, obstacles: [] }).some((p) => p.kind === 'car'));
    assert.ok(!layoutFor({ theme: 'park', code: 'z' + i, obstacles: [] }).some((p) => p.kind === 'car'));
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
  for (let i = 0; i < 30; i++) assert.deepEqual(layoutFor({ theme: 'alley', code: 'q' + i, obstacles: big }), []); // 차·담 모두 건너뜀
});
test('간섭(R-24): 장면 장애물·차·놓은 상자 모든 쌍이 간격 이상 떨어진다', () => {
  const scene = (gx, j) => { const sx0 = gx > 0 ? -2.4 : 0.6, o = [{ x: 0, z: -2, wall: true }];
    for (let i = 0; i < 4; i++) o.push({ x: sx0 + i * 0.5 + j * 0.01, z: -1.66, r: 0.3 });
    o.push({ x: sx0 + 2.3, z: -1.45, r: 0.45 }, { x: -3.3, z: -1.55, r: 0.3 }, { x: gx > 0 ? -1 : 2.6, z: -1.35, r: 0.35 }, { x: 2.75, z: -0.95, r: 0.38 }); return o; };
  let cars = 0, boxes = 0;
  for (const gx of [-1.6, 1.2, 2.2]) for (let j = 0; j < 5; j++) for (let i = 0; i < 40; i++) {
    const obs = scene(gx, j), all = layoutFor({ theme: 'alley', code: 'k' + gx + j + i, obstacles: obs }), a = all.filter((p) => p.kind === 'car');
    for (const p of all) obs.push({ ...footOf(p.kind), x: p.x, z: p.z, rot: p.rot });
    if (a.length) cars++;
    // 사용자가 상자를 놓는다: 차 한가운데를 눌러도 가장 가까운 빈 자리로 밀린다
    const want = a.length ? { x: a[0].x, z: a[0].z } : { x: 0, z: -1 }, f = nearestFree({ hx: 0.25, hz: 0.2, rot: 0.4 }, obs, want.x, want.z);
    if (f) { boxes++; obs.push({ ...f, hx: 0.25, hz: 0.2, rot: 0.4 }); }
    const real = obs.filter((o) => !o.wall);
    for (let m = 0; m < real.length; m++) for (let n = m + 1; n < real.length; n++) {
      if (m < 8 && n < 8) continue; // 장면 장애물끼리는 장면 담당(이 시험 밖)
      assert.ok(!shapesOverlap(real[m], real[n], OBJ_GAP - 1e-6), `겹침 ${gx} ${j} ${i}: ${m},${n}`);
    }
  }
  assert.ok(cars > 100 && boxes > 100, `차 ${cars} 상자 ${boxes}`);
});
test('shapesOverlap: 돌출(바퀴·범퍼) 포함 풋프린트, 회전 직사각형, 원', () => {
  const car = { ...CAR_FOOT, x: 0, z: 0, rot: 0 };
  assert.ok(CAR_FOOT.hx > CAR.l / 2 && CAR_FOOT.hz > CAR.w / 2);
  assert.ok(shapesOverlap(car, { x: 0, z: 0.8, r: 0.3 }, 0.15)); // 원 가장자리 0.5 < 0.47+0.15
  assert.ok(!shapesOverlap(car, { x: 0, z: 1.0, r: 0.3 }, 0.15));
  assert.ok(shapesOverlap(car, { x: 1.8, z: 0, hx: 0.25, hz: 0.2, rot: 0.7 }, 0));
  assert.ok(!shapesOverlap(car, { x: 3.0, z: 0, hx: 0.25, hz: 0.2, rot: 0.7 }, 0.15));
  assert.ok(isFree(car, [{ x: 0, z: -2, wall: true }]));
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
import { WALL, footOf } from '../../prototype/src/core/props.js';

test('낮은 담 정의: 1.8 x 0.22 x 0.80, 위 지점 2 + 뒤 그늘, 테마 골목·시장·공원 (M5-1)', () => {
  const K = PROP_KINDS.lowwall;
  assert.deepEqual([WALL.l, WALL.w, WALL.h], [1.8, 0.22, 0.8]);
  assert.deepEqual(K.size, { l: 1.8, w: 0.22, h: 0.8 }); assert.deepEqual(K.themes, ['alley', 'market', 'park']);
  assert.deepEqual(K.slots.map((s) => s.id), ['top0', 'top1', 'behind']);
  assert.ok(K.slots.filter((s) => s.mode === 'on').every((s) => s.y === 0.8 && s.action === 'wallLoaf' && s.poses.includes('lie')));
  const w = { id: 'wall0', kind: 'lowwall', x: 0.3, z: -1.1, rot: 0, dir: 1 };
  for (const s of K.slots) { const q = slotWorld(w, s); assert.ok(q.az > w.z + K.hz, '접근점은 담 밖(카메라 쪽)'); assert.ok(q.ax >= BOUNDS.x0 && q.ax <= BOUNDS.x1 && q.az <= BOUNDS.z1); }
  assert.ok(footOf('lowwall') === K);
});
test('낮은 담 배치: 결정적·테마별 개수·범위·차와 겹침 0 (M5-1)', () => {
  const cnt = { alley: 0, market: 0, park: 0 };
  for (const theme of Object.keys(cnt)) for (let i = 0; i < 200; i++) {
    const code = 'w' + i, a = layoutFor({ theme, code, obstacles: [] }), b = layoutFor({ theme, code, obstacles: [] });
    assert.deepEqual(a, b);
    const wall = a.find((p) => p.kind === 'lowwall'), car = a.find((p) => p.kind === 'car');
    if (!wall) continue;
    cnt[theme]++; assert.equal(wall.id, 'wall0');
    assert.ok(wall.z >= -1.4 - 1e-9 && wall.z <= -0.9 + 1e-9 && wall.x >= -1.6 - 1e-9 && wall.x <= 1.6 + 1e-9, `범위 ${wall.x} ${wall.z}`);
    if (car) { assert.ok(!shapesOverlap({ ...footOf('car'), x: car.x, z: car.z, rot: 0 }, { ...footOf('lowwall'), x: wall.x, z: wall.z, rot: 0 }, OBJ_GAP - 1e-6), '차와 담 겹침 ' + code); }
  }
  // 골목은 차(3.0m)가 뒷줄 거의 전체를 차지해 차가 있으면 담이 빈 자리를 못 찾고 건너뛴다 (차 없는 40% x 50% 안팎)
  assert.ok(cnt.alley > 15 && cnt.alley < 80, '골목: ' + cnt.alley); assert.ok(cnt.market > 70 && cnt.market < 130, '시장 약 50%: ' + cnt.market);
  assert.equal(cnt.park, 200, '공원은 항상 1개');
  for (let i = 0; i < 100; i++) { // 어드민 다시 배치(force): 둘 다 놓이는 경우 겹침 0 (못 찾으면 force 라 그 자리 그대로 허용 = 겹침 가능, 차 없는 경우만 검사)
    const a = layoutFor({ theme: 'alley', code: 'f' + i, obstacles: [], force: { code: 'f' + i } }), car = a.find((p) => p.kind === 'car'), wall = a.find((p) => p.kind === 'lowwall');
    assert.ok(car && !wall, '골목 차+담 공존 금지');
  }
});
test('M5-4 후속: 시장 실제 가판 장애물에서도 담이 나옴, 골목 차+담 공존 0, 겹침 0', () => {
  const stalls = [-4.8, 0, 4.8].flatMap((sx) => [{ x: sx - 0.4, z: -1.45, r: 0.45 }, { x: sx + 0.4, z: -1.45, r: 0.45 }]).concat([{ x: -3.3, z: -1.2, r: 0.2 }]);
  let walls = 0, both = 0, n = 300;
  for (let i = 0; i < n; i++) {
    const m = layoutFor({ theme: 'market', code: 'm' + i, obstacles: stalls }), w = m.find((p) => p.kind === 'lowwall');
    if (w) { walls++; assert.ok(!stalls.some((o) => shapesOverlap({ ...footOf('lowwall'), x: w.x, z: w.z, rot: 0 }, o, 0.3 - 1e-6)), '가판과 담 간격 0.3 미만 ' + i);
      const ap = { x: w.x, z: w.z + PROP_KINDS.lowwall.hz + 0.28 }; assert.ok(!stalls.some((o) => Math.hypot(ap.x - o.x, ap.z - o.z) < o.r + 0.2), '접근점 막힘 ' + i); }
    const al = layoutFor({ theme: 'alley', code: 'a' + i, obstacles: [] });
    if (al.some((p) => p.kind === 'car') && al.some((p) => p.kind === 'lowwall')) both++;
    const all = [...al, ...m]; for (const q of [al, m]) for (let x = 0; x < q.length; x++) for (let y = x + 1; y < q.length; y++) {
      const A = { ...footOf(q[x].kind), x: q[x].x, z: q[x].z, rot: 0 }, B = { ...footOf(q[y].kind), x: q[y].x, z: q[y].z, rot: 0 };
      if (q[x].kind !== 'lowwall' && q[y].kind !== 'lowwall') assert.ok(!shapesOverlap(A, B, OBJ_GAP - 1e-6), '겹침 ' + i); }
  }
  assert.ok(walls > n * 0.35 && walls < n * 0.65, '시장 담 비율 약 50%: ' + walls); assert.equal(both, 0, '골목 차+담 공존');
});
test('낮은 담 배치: 막히면 빈 자리로 옮기고, 못 찾으면 건너뜀. 차 배치는 담 때문에 바뀌지 않음', () => {
  const block = [{ x: 0, z: -1.15, r: 0.4 }];
  for (let i = 0; i < 40; i++) {
    const w = layoutFor({ theme: 'park', code: 'b' + i, obstacles: block }).find((p) => p.kind === 'lowwall');
    if (w) assert.ok(!shapesOverlap({ ...footOf('lowwall'), x: w.x, z: w.z, rot: 0 }, { ...block[0] }, OBJ_GAP - 1e-6));
    assert.deepEqual(layoutFor({ theme: 'park', code: 'b' + i, obstacles: [{ x: 0, z: -1.1, r: 5 }] }), []);
    const car = (o) => layoutFor({ theme: 'alley', code: 'c' + i, obstacles: [] }).find((p) => p.kind === 'car');
    assert.deepEqual(car(), car());
  }
});
test('force: 차 위치 고정 시험엔 담 없음, 어드민 다시 배치(code)는 항상 담 포함', () => {
  assert.deepEqual(layoutFor({ theme: 'alley', code: 'x', obstacles: [], force: { x: 0, z: -1.1, dir: 1 } }).map((p) => p.kind), ['car']);
  const adm = layoutFor({ theme: 'park', code: 'x', obstacles: [], force: { code: 'a' } }).map((p) => p.kind);
  assert.deepEqual(adm.filter((k) => k !== 'crate'), ['car', 'lowwall']); assert.ok(adm.includes('crate'), '다시 배치에는 상자도 포함');
  const f = layoutFor({ theme: 'alley', code: 'x', obstacles: [], force: { x: 0, z: -1.1, wall: { x: 1, z: -1.0 } } });
  assert.deepEqual(f.map((p) => [p.kind, p.x, p.z]), [['car', 0, -1.1], ['lowwall', 1, -1.0]]);
});
test('wallLoaf: 점수 성격 단조·낮밤·새끼는 못 오름·점유·쿨다운, 스위치 키 등록 (M5-1)', () => {
  const W = PROP_ACTIONS.wallLoaf; assert.ok(W && W.label);
  assert.equal(W.score(agent()), 0, '담 없으면 0');
  withProps(() => {
    PROPS.layout = [{ id: 'wall0', kind: 'lowwall', x: 0, z: -1.1, rot: 0, dir: 1 }];
    assert.equal(propSlots('wallLoaf').length, 2);
    assert.ok(W.score(agent({ p: { bold: 0.8, playful: 0.5 } })) > W.score(agent({ p: { bold: 0.2, playful: 0.5 } })));
    assert.ok(W.score(agent({ p: { playful: 0.9 } })) > W.score(agent({ p: { playful: 0.1 } })));
    assert.ok(W.score(agent({ day: 1 })) > W.score(agent({ day: 0 })));
    assert.equal(W.score(agent({ kitten: true })), 0, '새끼는 0.80m 담에 못 오른다');
    assert.ok(propClaim('wall0:top0', {})); assert.ok(W.score(agent()) > 0, '한 자리가 차도 다른 자리');
    assert.ok(propClaim('wall0:top1', {})); assert.equal(W.score(agent()), 0, '모두 점유면 0');
    propRelease('wall0:top0', PROPS.claims.get('wall0:top0')); propRelease('wall0:top1', PROPS.claims.get('wall0:top1'));
    const mem = { cool: { 'wall0:top0': 100, 'wall0:top1': 100 }, recent: [] };
    assert.equal(W.score(agent({ rest: { pm: mem, time: 50 } })), 0); assert.ok(W.score(agent({ rest: { pm: mem, time: 150 } })) > 0);
    assert.equal(W.score(agent({ rest: { pm: { cool: {}, recent: ['wallLoaf'] } } })), 0, '최근 3개 행동 반복 금지');
    assert.ok(propHome('wallLoaf').z > -1.1); assert.ok(EMO_BIAS.wallLoaf && EMO_BIAS.wallLoaf.scared < 0 && EMO_BIAS.wallLoaf.curious > 0);
    registerPropActions(true); assert.ok(ACTIONS.wallLoaf);
  });
  assert.ok(!ACTIONS.wallLoaf, '스위치 끄면 표에서 빠진다');
});

import { CRATE } from '../../prototype/src/core/props.js';
test('종이 상자 정의: 0.55 x 0.45 x 0.28, in 지점 1, 전체 테마 (M5-2)', () => {
  const K = PROP_KINDS.crate;
  assert.deepEqual([CRATE.l, CRATE.w, CRATE.h], [0.55, 0.45, 0.28]); assert.deepEqual(K.size, { l: 0.55, w: 0.45, h: 0.28 });
  assert.deepEqual(K.themes, ['alley', 'market', 'park']); assert.deepEqual(K.slots.map((s) => [s.id, s.mode, s.action, s.cap]), [['in', 'in', 'crateSit', 1]]);
  const c = { id: 'crate0', kind: 'crate', x: 0.3, z: -0.8, rot: 0, dir: 1 }, q = slotWorld(c, K.slots[0]);
  assert.ok(Math.abs(q.x - 0.3) < 1e-9 && Math.abs(q.z - c.z) < 1e-9 && q.y === 0 && q.az > c.z + K.hz && q.az <= BOUNDS.z1, 'in 지점은 상자 중앙(M5-4 후속: 꼬리가 뒷벽 밖으로 새지 않게 앞으로 옮김, 머리 앞벽 관통은 브라우저 9d-o 로 확인), 접근점은 앞');
  assert.ok(footOf('crate') === K);
});
test('종이 상자 배치: 결정적·테마별 개수·겹침 0·차 담 배치 불변·접근점 무대 안 (M5-2)', () => {
  const range = { alley: [1, 2], market: [2, 3], park: [1, 1] }, tot = { alley: 0, market: 0, park: 0 };
  for (const theme of Object.keys(range)) for (let i = 0; i < 200; i++) {
    const code = 'k' + i, a = layoutFor({ theme, code, obstacles: [] }), cr = a.filter((p) => p.kind === 'crate');
    assert.deepEqual(a, layoutFor({ theme, code, obstacles: [] }));
    assert.ok(cr.length <= range[theme][1], theme + cr.length); tot[theme] += cr.length;
    for (const p of a) for (const o of a) if (p !== o) assert.ok(!shapesOverlap({ ...footOf(p.kind), x: p.x, z: p.z, rot: 0 }, { ...footOf(o.kind), x: o.x, z: o.z, rot: 0 }, OBJ_GAP - 1e-6), p.id + '/' + o.id + ' ' + code);
    for (const p of cr) { const q = slotWorld(p, PROP_KINDS.crate.slots[0]); assert.ok(q.ax >= BOUNDS.x0 && q.ax <= BOUNDS.x1 && q.az <= BOUNDS.z1 && q.az >= BOUNDS.z0); }
    const blocked = layoutFor({ theme, code, obstacles: [{ x: 0, z: -0.7, r: 6 }] }); assert.deepEqual(blocked.filter((p) => p.kind === 'crate'), []);
  }
  assert.ok(tot.alley >= 200 && tot.market >= 400 && tot.park === 200, JSON.stringify(tot));
  // 상자 때문에 차·담 배치가 바뀌지 않는다(별도 난수, 차·담 먼저 놓음)
  for (let i = 0; i < 60; i++) { const a = layoutFor({ theme: 'alley', code: 'k' + i, obstacles: [] }).filter((p) => p.kind !== 'crate'); assert.deepEqual(a.find((p) => p.kind === 'car'), layoutFor({ theme: 'alley', code: 'k' + i, obstacles: [] }).find((p) => p.kind === 'car')); }
  assert.deepEqual(layoutFor({ theme: 'alley', code: 'x', obstacles: [], force: { x: 0, z: -1.1, dir: 1 } }).map((p) => p.kind), ['car'], '차 고정 시험엔 상자 없음');
  assert.deepEqual(layoutFor({ theme: 'alley', code: 'x', obstacles: [], force: { x: 0, z: 0.6, dir: 1, crate: { x: 0.5, z: -0.7 } } }).map((p) => [p.kind, p.x, p.z]), [['car', 0, 0.6], ['crate', 0.5, -0.7]]);
});
test('crateSit: 점수 성격·새끼 가중·새끼 허용·점유·쿨다운, 편향, 스위치 키 (M5-2)', () => {
  const C = PROP_ACTIONS.crateSit; assert.ok(C && C.label); assert.equal(C.score(agent()), 0, '상자 없으면 0');
  withProps(() => {
    PROPS.layout = [{ id: 'crate0', kind: 'crate', x: 0.3, z: -0.8, rot: 0, dir: 1 }];
    assert.equal(propSlots('crateSit').length, 1);
    assert.ok(C.score(agent({ kitten: true })) > C.score(agent()) + 0.5, '새끼 가중'); assert.ok(C.score(agent({ kitten: true })) > 0, '새끼도 들어간다');
    assert.ok(C.score(agent({ p: { bold: 0.1 } })) > C.score(agent({ p: { bold: 0.9 } }))); assert.ok(C.score(agent({ p: { playful: 0.9 } })) > C.score(agent({ p: { playful: 0.1 } })));
    assert.ok(propClaim('crate0:in', {})); assert.equal(C.score(agent()), 0, '점유면 0'); propRelease('crate0:in', PROPS.claims.get('crate0:in'));
    assert.equal(C.score(agent({ rest: { pm: { cool: { 'crate0:in': 100 }, recent: [] }, time: 50 } })), 0); assert.ok(C.score(agent({ rest: { pm: { cool: { 'crate0:in': 100 }, recent: [] }, time: 150 } })) > 0);
    assert.equal(C.score(agent({ rest: { pm: { cool: {}, recent: ['crateSit'] } } })), 0, '최근 3개 행동 반복 금지');
    assert.ok(propHome('crateSit').z > -0.8); assert.deepEqual(EMO_BIAS.crateSit, { calm: 0.4, playful: 0.3 });
    registerPropActions(true); assert.ok(ACTIONS.crateSit);
  });
  assert.ok(!ACTIONS.crateSit, '스위치 끄면 표에서 빠진다');
});

import { CRATE_KEEP } from '../../prototype/src/core/props.js';
test('상자는 낮은 담 접근점 반경 0.2 안에 놓이지 않는다: 시장·골목·공원, 가판·스툴·가로등 장애물 (M5-4)', () => {
  let walls = 0, crates = 0;
  for (const theme of ['market', 'alley', 'park']) for (let i = 0; i < 400; i++) {
    const code = 'w' + i, obs = [];
    if (theme === 'market') { // 장면과 같은 장애물: 가판 원 2개 또는 스툴 원 3개(5곳 중 번갈아), 가로등
      for (let k = 0; k < 5; k++) { const sx = -4.8 + k * 2.4; if ((i + k * 3) % 2) obs.push({ x: sx - 0.4, z: -1.45, r: 0.45 }, { x: sx + 0.4, z: -1.45, r: 0.45 }); else for (let s = 0; s < 3; s++) obs.push({ x: sx - 0.4 + s * 0.4, z: -1.3, r: 0.22 }); }
      obs.push({ x: -3.3, z: -1.2, r: 0.2 });
    }
    const lay = layoutFor({ theme, code, obstacles: obs }), W = lay.filter((p) => p.kind === 'lowwall'), C = lay.filter((p) => p.kind === 'crate');
    walls += W.length; crates += C.length;
    for (const w of W) for (const s of PROP_KINDS.lowwall.slots) if (s.action === 'wallLoaf') {
      const q = slotWorld(w, s); for (const c of C) assert.ok(!shapesOverlap({ x: q.ax, z: q.az, r: CRATE_KEEP }, { ...PROP_KINDS.crate, x: c.x, z: c.z, rot: 0 }, 0), `${theme} ${code} ${s.id}`);
    }
  }
  assert.ok(walls > 300 && crates > 300);
});
