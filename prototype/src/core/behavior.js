// core/behavior.js: 행동 단계(STEP)·자율 행동표(ACTIONS)·교감 반응표(REACTIONS) (원래 index.html 60_behavior 구역, D-33 단계 2)
// 표의 함수는 넘겨받은 고양이(CatAgent) 객체만 다룬다. 레시피(R-14)가 ACTIONS 에 rcp_* 행동을 더하고 지운다(같은 객체를 공유).
import { angDiff } from './util.js';
// 고양이가 다닐 수 있는 무대 범위(장면 좌표, m). 원래 50_scene 구역에 있던 값 (D-33 단계 3)
export const BOUNDS = { x0: -2.55, x1: 2.55, z0: -1.55, z1: 1.2 };
// ───────────────────────── 행동 엔진 (효용 기반) ─────────────────────────
export const STEP = {
  pose(name, dur, extra, fx) { return { start(a) { a.setPose(name, extra); this.t = 0; }, tick(a, dt) { this.t += dt; if (fx) fx(a, this.t, dt); return this.t >= dur; } }; },
  walk(x, z, speed, opts = {}) { return { start(a) { a.moveTo(x, z, speed, opts); this.t = 0; }, tick(a, dt) { this.t += dt; return a.arrived || this.t > (opts.timeout || 14); } }; },
  face(yaw, extra) { return { start(a) { a.yawTarget = yaw; }, tick(a) { return Math.abs(angDiff(a.yaw, a.yawTarget)) < 0.12; } }; },
  faceYou() { return { start(a) { a.yawTarget = a.yawTo(a.world.youPoint()); a.lookAtYou = 1; }, tick(a) { return Math.abs(angDiff(a.yaw, a.yawTarget)) < 0.15; } }; },
  call(fn) { return { start(a) { fn(a); }, tick() { return true; } }; },
  wait(dur) { return { start() { this.t = 0; }, tick(a, dt) { this.t += dt; return this.t >= dur; } }; },
  // 세계 시계용: 도착한 뒤에 그 자리에서 단계를 만들어 끼워 넣기 / 다음 일정까지 그대로 머물기(가끔 두리번)
  lazy(fn) { return { start(a) { a.steps.unshift(...fn(a)); }, tick() { return true; } }; },
  hold() { return { start(a) { this.t = 0; this.n = a.r.range(4, 9); }, tick(a, dt) { this.t += dt; if (this.t > this.n) { this.t = 0; this.n = a.r.range(6, 14); a.lookRandom(); } return false; } }; },
};

export const ACTIONS = {
  sit: { label: '앉아서 골목 구경', score: (a) => 0.75, steps: (a, r) => [STEP.pose('sit', r.range(6, 14), null, (a, t) => { if (Math.floor(t * 0.4) !== a._lk) { a._lk = Math.floor(t * 0.4); a.lookRandom(); } })] },
  loaf: { label: '식빵 굽는 중', score: (a) => 0.55 + (1 - a.p.energy) * 0.6 + (1 - a.E) * 0.4, steps: (a, r) => [STEP.pose('loaf', r.range(10, 24), null, (a, t) => { if (r() < 0.004) a.slowBlink(); })] },
  nap: { label: '웅크려 자는 중', score: (a) => (1 - a.E) * 2.0 + a.world.night * 0.6 + (1 - a.p.energy) * 0.4 - (a.kitten ? 0.3 : 0), steps: (a, r) => [STEP.pose('loaf', 2.5), STEP.pose('curl', r.range(18, 40), null, (a, t, dt) => { a.E = Math.min(1, a.E + dt * 0.04); }), STEP.pose('loaf', 1.5), ...ACTIONS.stretch.steps(a, r)] },
  sideNap: { label: '옆으로 누워 자는 중', score: (a) => (1 - a.E) * 1.4 * a.p.bold + a.world.day * 0.2, steps: (a, r) => [STEP.pose('loaf', 2), STEP.pose('side', r.range(14, 30), null, (a, t, dt) => { a.E = Math.min(1, a.E + dt * 0.04); }), STEP.pose('loaf', 1.2)] },
  belly: { label: '발라당 뒹굴', score: (a) => (a.cat.g.months > 4 ? a.p.bold * a.p.playful * 0.9 : 0.1), steps: (a, r) => [STEP.pose('loaf', 1.2), STEP.pose('belly', r.range(4, 8), null, (a, t) => { a.P.hr += Math.sin(t * 2.2) * 0.002; }), STEP.pose('loaf', 1.2)] },
  groom: { label: '그루밍 중', score: (a) => 0.55, steps: (a, r) => [STEP.pose('sit', 1.2), STEP.pose('groom', r.range(5, 10), null, (a, t) => { a.ov.hdp = Math.sin(t * 9) * 0.09; a.ov.fle = Math.sin(t * 9) * 0.12; a.ov.mouth = 0.12 + Math.sin(t * 9) * 0.1; }), STEP.pose('sit', 1)] },
  stretch: { label: '기지개 켜는 중', score: (a) => 0.05, steps: (a, r) => [STEP.pose('stretch', 2.6, null, (a, t) => { if (t > 0.6 && t < 2.0) a.ov.mouth = Math.sin((t - 0.6) / 1.4 * Math.PI) * 0.8; }), STEP.pose('stand', 0.8)] },
  wander: { label: '골목 산책 중', score: (a) => a.E * 0.7 + a.p.energy * 0.5 + a.B * 0.6 + (a.p.bold - 0.5) * 0.2, steps: (a, r) => { const p = a.randomPoint(r, 1.6); return [STEP.walk(p.x, p.z, 1), STEP.pose(r.chance(0.5) ? 'sit' : 'stand', r.range(1, 3))]; } },
  hunt: { label: '사냥 놀이 중', score: (a) => a.p.playful * a.E * 1.1 + (a.kitten ? 0.9 : 0) + a.B * 0.4, steps: (a, r) => {
    const yaw = a.yaw + r.range(-0.8, 0.8);
    return [STEP.face(yaw), STEP.pose('crouch', r.range(1.5, 3), null, (a, t) => { if (t > 0.8) { a.ov.hr = Math.sin(t * 15) * 0.09; a.ov.hy = Math.sin(t * 15) * 0.06; } }),
      STEP.call((a) => a.pounce(0.32 + r() * 0.2)), STEP.wait(0.75), STEP.pose('sit', r.range(1, 2.5))];
  } },
  zoom: { label: '우다다!', score: (a) => a.p.playful * a.p.energy * a.E * 0.8 + (a.kitten ? 0.35 : 0), steps: (a, r) => { const s = []; for (let i = 0; i < r.int(2, 3); i++) { const p = a.randomPoint(r, 2.4); s.push(STEP.walk(p.x, p.z, 3.2)); } s.push(STEP.pose('stand', 0.6), STEP.pose('sit', 2)); return s; } },
  greet: { label: '이웃 고양이와 코인사', score: (a) => { const o = a.nearestCat(2.2); return o ? a.p.social * 0.9 * (1 - a.p.grumpy) + 0.1 : 0; }, steps: (a, r) => {
    const o = a.nearestCat(2.2); if (!o) return [STEP.wait(0.1)];
    const ang = Math.atan2(a.x - o.x, a.z - o.z), d = 0.3 * (a.v.dim.scale + o.v.dim.scale);
    return [STEP.walk(o.x + Math.sin(ang) * d, o.z + Math.cos(ang) * d, 0.8), STEP.call((a) => { a.yawTarget = a.yawTo(o); a.lookAt = o; o.lookAt = a; }),
      STEP.pose('greet', 1.6, { np: 0.25, hdp: 0.2 }), STEP.call((a) => { a.say(r.pick(['냥', '…', '먀'])); }), STEP.pose('sit', 2.5), STEP.call((a) => { a.lookAt = null; o.lookAt = null; })];
  } },
  hissAt: { label: '하악! 경계 중', score: (a) => { const o = a.nearestCat(0.7); return o && !(o.cat.mother === a.cat.id || a.cat.mother === o.cat.id) ? a.p.grumpy * 1.6 : 0; }, steps: (a, r) => {
    const o = a.nearestCat(0.9); if (!o) return [STEP.wait(0.1)];
    return [STEP.call((a) => { a.yawTarget = a.yawTo(o) + 1.2; a.lookAt = o; a.say('하악!'); }), STEP.pose('hiss', 2.4), STEP.call((a) => { a.lookAt = null; }), STEP.walk(a.x + (a.x - o.x) * 2, a.z + (a.z - o.z) * 2, 1.1), STEP.pose('sit', 2)];
  } },
  watch: { label: '이쪽을 빤히 보는 중', score: (a) => a.p.social * 0.45 + a.p.bold * 0.25, steps: (a, r) => [STEP.faceYou(), STEP.pose('sit', r.range(4, 9), null, (a) => { a.lookAtYou = 1; }), STEP.call((a) => { a.lookAtYou = 0; })] },
  followMom: { label: '엄마 졸졸 따라가기', score: (a) => { const m = a.mom(); if (!m) return 0; const d = Math.hypot(m.x - a.x, m.z - a.z); return d > 0.7 ? 2.2 : 0.3; }, steps: (a, r) => {
    const m = a.mom(); if (!m) return [STEP.wait(0.1)];
    return [STEP.walk(m.x + r.range(-0.3, 0.3), m.z + r.range(0.15, 0.35), 1.3), STEP.pose(r.chance(0.5) ? 'loaf' : 'sit', r.range(3, 8))];
  } },
  yawn: { label: '하품', score: (a) => (1 - a.E) * 0.3, steps: (a, r) => [STEP.pose('sit', 0.8), STEP.pose('yawn', 1.8), STEP.pose('sit', 1.5)] },
};

export const REACTIONS = {
  approach:   { label: '다가오는 중', steps: (a) => [STEP.walk(...a.nearYou(0.55), 1.0), STEP.faceYou(), STEP.pose('alert', 3, null, (a) => { a.lookAtYou = 1; })] },
  rub:        { label: '부비부비', steps: (a) => [STEP.walk(...a.nearYou(0.45), 1.0), STEP.faceYou(), STEP.call((a) => a.say('그르릉…')), STEP.pose('greet', 3.2, { eye: 0.4, tb: 1.4 }, (a, t) => { a.ov.hdr = Math.sin(t * 3.2) * 0.38; a.ov.hy = Math.sin(t * 3.2) * 0.12; a.lookAtYou = 0.5; }), STEP.pose('sit', 2, { eye: 0.5 })] },
  slow_blink: { label: '느린 눈 깜빡임', steps: (a) => [STEP.faceYou(), STEP.pose('sit', 0.6, null, (a) => { a.lookAtYou = 1; }), STEP.call((a) => a.slowBlink()), STEP.wait(1.8), STEP.call((a) => a.slowBlink()), STEP.pose('sit', 2.5, null, (a) => { a.lookAtYou = 1; })] },
  tail_up:    { label: '꼬리 세우고 인사', steps: (a) => [STEP.walk(...a.nearYou(0.8), 0.9), STEP.faceYou(), STEP.pose('greet', 3, null, (a) => { a.lookAtYou = 1; }), STEP.pose('sit', 1.5)] },
  meow_back:  { label: '대답하는 중', steps: (a) => [STEP.faceYou(), STEP.call((a) => { a.lookAtYou = 1; a.say(a.kitten ? '미야아' : '냐앙'); }), STEP.pose('sit', 1.6, null, (a, t) => { a.ov.mouth = t < 0.6 ? Math.sin(t / 0.6 * Math.PI) * 0.55 : 0; a.lookAtYou = 1; })] },
  head_tilt:  { label: '갸웃', steps: (a) => [STEP.faceYou(), STEP.pose('sit', 2.4, { hdr: 0.42 }, (a) => { a.lookAtYou = 1; }), STEP.pose('sit', 1.2)] },
  ignore:     { label: '무심한 척', steps: (a) => [STEP.call((a) => { a.earTwitch(0); a.earTwitch(1); }), STEP.wait(1.2)], keep: true },
  stare:      { label: '빤히 쳐다봄', steps: (a) => [STEP.faceYou(), STEP.pose('alert', 3.5, { pupil: 0.95 }, (a) => { a.lookAtYou = 1; })] },
  back_off:   { label: '뒷걸음질', steps: (a) => { const y = a.world.youPoint(); return [STEP.pose('stand', 0.3, { eL: 0.6, eR: 0.6 }), STEP.walk(a.x + (a.x - y.x) * 0.8, a.z + (a.z - y.z) * 0.8, 0.9), STEP.faceYou(), STEP.pose('alert', 2.5, { eL: 0.4, eR: 0.4 })]; } },
  flee:       { label: '도망!', steps: (a) => { const y = a.world.youPoint(); const p = a.farFrom(y); return [STEP.call((a) => a.say('!')), STEP.walk(p.x, p.z, 3.2), STEP.pose('loaf', 5, { eL: 0.5, eR: 0.5, pupil: 0.9 })]; } },
  hiss_back:  { label: '맞하악!', steps: (a) => [STEP.call((a) => { a.yawTarget = a.yawTo(a.world.youPoint()) + 1.1; a.lookAtYou = 1; a.say('하아악!'); }), STEP.pose('hiss', 2.8, null, (a) => { a.lookAtYou = 1; }), STEP.pose('sit', 1.5, { eL: 0.5, eR: 0.5 })] },
  puff_side:  { label: '털 세우고 옆걸음', steps: (a) => { const y = a.world.youPoint(); const side = Math.atan2(y.x - a.x, y.z - a.z) + Math.PI / 2; return [STEP.call((a) => { a.yawTarget = side; a.lookAtYou = 1; a.say('캬아…'); }), STEP.pose('hiss', 0.8), STEP.call((a) => a.moveTo(a.x + Math.sin(side) * 0.45, a.z + Math.cos(side) * 0.45, 0.35, { keepPose: 'hiss', crab: true })), STEP.wait(2.2), STEP.pose('alert', 1.5, { eL: 0.6, eR: 0.6 })]; } },
  purr:       { label: '그르릉', steps: (a) => [STEP.call((a) => a.say('그르릉 그르릉')), STEP.pose(a.P.h < 0.12 ? 'loaf' : 'sit', 4, { eye: 0.12 }, (a, t) => { a.ov.hdr = Math.sin(t * 40) * 0.006; })] },
  eat_churu:  { label: '츄르 먹는 중', steps: (a) => [STEP.walk(...a.nearYou(0.42), 1.25), STEP.faceYou(), STEP.call((a) => a.say('냠냠')), STEP.pose('eat', 4.5, null, (a, t) => { a.ov.mouth = 0.2 + Math.sin(t * 11) * 0.18; a.ov.hdp = Math.sin(t * 11) * 0.05; }), STEP.call((a) => a.say('…더 줘')), STEP.pose('sit', 2.5, { eye: 0.6 }, (a) => { a.lookAtYou = 1; })] },
  sniff_only: { label: '킁킁, 냄새만', steps: (a) => [STEP.walk(...a.nearYou(0.9), 0.7), STEP.faceYou(), STEP.pose('crouch', 2.2, { np: 0.1, hdp: -0.05 }, (a, t) => { a.ov.hdp = Math.sin(t * 16) * 0.025; a.lookAtYou = 0.7; }), STEP.pose('sit', 2)] },
  swat:       { label: '냥펀치!', steps: (a) => [STEP.walk(...a.nearYou(0.5), 1.1), STEP.faceYou(), STEP.pose('sit', 0.5), STEP.call((a) => a.say('캭!')), STEP.pose('groom', 0.5, { fls: -1.1, fle: -0.2, eL: 1, eR: 1, eye: 1, pupil: 1, mouth: 0.6, hdp: 0.2, np: 0.2 }, (a, t) => { a.ov.fls = Math.sin(t * 30) * 0.5; a.lookAtYou = 1; }), STEP.pose('hiss', 1.2, { eL: 1, eR: 1 }, (a) => { a.lookAtYou = 1; }), STEP.pose('sit', 1.5, { eL: 0.6, eR: 0.6 })] },
  roll_over:  { label: '발라당', steps: (a) => [STEP.walk(...a.nearYou(0.6), 1.0), STEP.pose('loaf', 0.8), STEP.pose('belly', 4.5, null, (a) => { a.lookAtYou = 0.6; }), STEP.pose('loaf', 1.2)] },
};
export const REACTION_KEYS = Object.keys(REACTIONS);
