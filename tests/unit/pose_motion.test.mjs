// 자세 전환 모션 시험 (M4-6, D-129): 모든 자세 쌍을 시간 샘플링해 몸 회전 속도·한 프레임 변화량이 한계 안인지 본다.
// "선 채 옆으로 쓰러지는" 전환(0.2초에 60~100도)을 막는 규칙(core/pose_plan.js)의 회귀 시험.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../lib/three_loader.mjs', import.meta.url);
// cat_model 이 불러올 때 그림자 캔버스를 만든다: 가짜 document 로 넘긴다
globalThis.document = { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
const { POSES, PARAM_KEYS, poseTarget } = await import('../../prototype/src/render/poses.js');
const { BODY_KEYS, PoseQueue, ROT_LIMIT, blendPose, planPose } = await import('../../prototype/src/core/pose_plan.js');
const { damp } = await import('../../prototype/src/core/util.js');

const MAX_SPEED = 2.5; // 몸 회전 속도 한계(라디안/초, 약 145도/초). 옛 동작은 5~8 이었다
const MAX_FRAME = 0.045; // 60fps 한 프레임 변화 한계(라디안, 약 2.9도)
const DT = 1 / 60;
const DIMS = [{ H: 0.2, leg: 1, chub: 1 }, { H: 0.22, leg: 1.06, chub: 1.16 }, { H: 0.17, leg: 0.93, chub: 0.92 }];
const names = Object.keys(POSES);

// 전환 한 번을 재생해 {speed, frame, settle(초)} 를 돌려준다. split=false 면 옛 방식(한 번에 목표로)
export function playTransition(dim, a, b, split = true) {
  const P = poseTarget(dim, a), q = new PoseQueue(P);
  if (!split) q.set = function (to) { this.goal = to; this.T = to; this.q = []; };
  q.snap(); q.set(poseTarget(dim, b));
  const prev = {}; for (const k of BODY_KEYS) prev[k] = P[k];
  const hist = []; let frame = 0, speed = 0, settle = 0;
  for (let i = 0; i < 600; i++) {
    q.tick(DT); blendPose(P, q.T, PARAM_KEYS, DT, false, damp);
    let d = 0; for (const k of BODY_KEYS) { d = Math.max(d, Math.abs(P[k] - prev[k])); prev[k] = P[k]; }
    hist.push(d); frame = Math.max(frame, d);
    if (hist.length >= 6) speed = Math.max(speed, hist.slice(-6).reduce((s, x) => s + x, 0) / (6 * DT)); // 0.1초 이동 평균
    if (d > 0.0004 || q.q.length) settle = (i + 1) * DT;
  }
  return { speed, frame, settle };
}

test('옛 방식은 한계를 넘는다 (시험이 실제로 문제를 잡는지 확인)', () => {
  const r = playTransition(DIMS[0], 'stand', 'belly', false);
  assert.ok(r.speed > MAX_SPEED, 'speed ' + r.speed.toFixed(2));
});
test('몸 회전이 한계를 넘는 전환은 여러 단계로 나뉘고, 단계 하나의 회전은 한계 이하', () => {
  const a = poseTarget(DIMS[0], 'stand'), b = poseTarget(DIMS[0], 'belly'), st = planPose(a, b);
  assert.ok(st.length >= 4, 'stages ' + st.length);
  assert.equal(st[st.length - 1].T, b);
  let prev = a;
  for (const s of st) { for (const k of BODY_KEYS) assert.ok(Math.abs(s.T[k] - prev[k]) <= ROT_LIMIT + 1e-9, k); prev = s.T; }
  assert.equal(st[0].T.plant, 'none'); // 첫 단계는 다리 접기: 몸 회전은 그대로
  for (const k of BODY_KEYS) assert.equal(st[0].T[k], a[k]);
  assert.ok(st.slice(0, -1).every((s) => s.hold >= 0.4), '단계마다 시간 확보');
});
test('작은 전환은 나누지 않는다', () => {
  const a = poseTarget(DIMS[0], 'stand'), b = poseTarget(DIMS[0], 'crouch');
  assert.equal(planPose(a, b).length, 1);
});
test('모든 자세 쌍 x 체형: 몸 회전 속도·프레임 변화가 한계 안', () => {
  const bad = []; let worst = 0, n = 0;
  for (const dim of DIMS) for (const a of names) for (const b of names) {
    if (a === b) continue;
    const r = playTransition(dim, a, b); n++; worst = Math.max(worst, r.speed);
    if (r.speed > MAX_SPEED || r.frame > MAX_FRAME) bad.push(`${a}->${b} speed ${r.speed.toFixed(2)} frame ${r.frame.toFixed(3)}`);
  }
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length}/${n} 실패`);
});
test('가장 긴 전환도 시간이 합리적(6초 이내)', () => {
  let long = 0;
  for (const a of names) for (const b of names) if (a !== b) long = Math.max(long, playTransition(DIMS[0], a, b).settle);
  assert.ok(long <= 6, 'settle ' + long.toFixed(2));
});
