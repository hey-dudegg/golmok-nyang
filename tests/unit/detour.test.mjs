// core/detour.js 단위 시험 (M24-2b): 소품 접근 우회점
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detour, DETOUR } from '../../prototype/src/core/detour.js';
import { CRATE, TOWER } from '../../prototype/src/core/props.js';

const crate = (x, z, id = 'c') => ({ id, x, z, hx: CRATE.l / 2, hz: CRATE.w / 2, rot: 0 });
const tower = (x, z, id = 't') => ({ id, x, z, hx: TOWER.l / 2, hz: TOWER.w / 2, rot: 0 });
const P = (x, z) => ({ x, z });
// 다리마다 (m-0.01) 사각형과 안 겹치는지
function clearOf(o, pts) {
  for (let i = 0; i + 1 < pts.length; i++) for (let k = 0; k <= 50; k++) {
    const x = pts[i].x + (pts[i + 1].x - pts[i].x) * k / 50, z = pts[i].z + (pts[i + 1].z - pts[i].z) * k / 50;
    if (Math.abs(x - o.x) < o.hx + DETOUR.m - 0.012 && Math.abs(z - o.z) < o.hz + DETOUR.m - 0.012) return false;
  }
  return true;
}
const run = (o, from, to) => { const w = detour([o], from, to); assert.ok(w, '우회점을 찾아야 함'); assert.ok(w.length <= DETOUR.maxPts); assert.ok(clearOf(o, [from, ...w, to])); return w; };

test('상자: 옆에서 오면 1점(앞-왼쪽 모서리)', () => {
  const w = run(crate(0.6, 0.4), P(0, 0), P(0.6, 0.795));
  assert.equal(w.length, 1); assert.ok(Math.abs(w[0].x - 0.215) < 0.01 && Math.abs(w[0].z - 0.735) < 0.01);
});
test('상자: 뒤에서 오면 2점', () => assert.equal(run(crate(0.6, 0.4), P(0.6, -0.2), P(0.6, 0.795)).length, 2));
test('상자: 이미 앞이면 0점', () => assert.deepEqual(detour([crate(0.6, 0.4)], P(0.6, 0.9), P(0.6, 0.795)), []));
test('탑: 왼쪽 1점, 오른쪽 뒤 2점', () => {
  const a = run(tower(-0.6, 0), P(0, 0), P(-0.8, 0.4)); assert.ok(a.length >= 1);
  assert.equal(run(tower(0.6, 0), P(0.6, -0.7), P(0.4, 0.4)).length, 2);
});
test('탑 단독 재현: tower@-0.6,0 cat 0,0 -> 접근점(-0.8,0.4)', () => assert.equal(run(tower(-0.6, 0), P(0, 0), P(-0.8, 0.4)).length, 1));
test('skip id 는 무시, wall 은 무시', () => {
  assert.deepEqual(detour([crate(0.6, 0.4, 'x')], P(0, 0), P(0.6, 0.795), { skip: 'x' }), []);
  assert.deepEqual(detour([{ wall: true, z: -1 }], P(0, 0), P(0.6, 0.795)), []);
});
test('상자+차(원 장애물) 겹침: 우회점이 막히면 다른 쪽 선택, 전부 막히면 null', () => {
  const o = crate(0.6, 0.4), from = P(0, 0), to = P(0.6, 0.795);
  const w = detour([o], from, to, { ok: (x) => x > 0.3 }); // 왼쪽 모서리 금지 -> 오른쪽 변 2점으로 돌아감 (실제 결과로 고정)
  assert.equal(w.length, 2); assert.ok(w.every((p) => p.x > 0.3));
  assert.ok(Math.abs(w[0].x - 0.985) < 0.01 && Math.abs(w[0].z - 0.065) < 0.01 && Math.abs(w[1].x - 0.985) < 0.01 && Math.abs(w[1].z - 0.735) < 0.01);
  assert.ok(clearOf(o, [from, ...w, to]));
  assert.equal(detour([o], from, to, { ok: () => false }), null);
});
test('원 장애물도 우회', () => { const w = detour([{ id: 'r', x: 0.3, z: 0.3, r: 0.2 }], P(0, 0), P(0.6, 0.6)); assert.ok(w && w.length >= 1); });
test('소품 2개가 겹침: 둘 다 피하는 1점(왼쪽 모서리)', () => {
  const a = crate(0.6, 0.4, 'a'), b = crate(0.75, 0.4, 'b'), from = P(0, 0), to = P(0.6, 0.795);
  const w = detour([a, b], from, to);
  assert.ok(w && w.length === 1 && w.length <= DETOUR.maxPts);
  assert.ok(Math.abs(w[0].x - 0.215) < 0.01 && Math.abs(w[0].z - 0.735) < 0.01);
  assert.ok(clearOf(a, [from, ...w, to]) && clearOf(b, [from, ...w, to]));
});
test('시작점이 소품 안: 우회 시도 없이 0점(직선 유지), 오류 없음', () => {
  assert.deepEqual(detour([crate(0.6, 0.4)], P(0.6, 0.4), P(0.6, 0.795)), []);
  assert.deepEqual(detour([crate(0.6, 0.4)], P(0.5, 0.3), P(1.5, 0.4)), []);
});
