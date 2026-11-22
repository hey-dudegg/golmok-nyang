// core/behavior.js: 행동 단계(STEP)·자율 행동표(ACTIONS)·교감 반응표(REACTIONS) (원래 index.html 60_behavior 구역, D-33 단계 2)
// 표의 함수는 넘겨받은 고양이(CatAgent) 객체만 다룬다. 레시피(R-14)가 ACTIONS 에 rcp_* 행동을 더하고 지운다(같은 객체를 공유).
import { angDiff } from './util.js';
// 고양이가 다닐 수 있는 무대 범위(장면 좌표, m). 원래 50_scene 구역에 있던 값 (D-33 단계 3)
export const LOOK = { tower: null }; // props.js가 넣는 훅: (x, z) => 가까운 켜진 캣타워 쪽 yaw | null (M13-1, 순환 import 피함)
export const BOUNDS = { x0: -2.55, x1: 2.55, z0: -1.55, z1: 1.2 };
// ───────────────────────── 행동 엔진 (효용 기반) ─────────────────────────
export function trackAt(kf, t) { // 키프레임 [[초, 값], ...] 의 t 시점 값(범위 밖은 양 끝값). 비어 있으면 null
  if (!kf || !kf.length) return null;
  if (t <= kf[0][0]) return kf[0][1];
  for (let i = 1; i < kf.length; i++) if (t <= kf[i][0]) { const [t0, v0] = kf[i - 1], [t1, v1] = kf[i], u = (t - t0) / Math.max(1e-9, t1 - t0); return v0 + (v1 - v0) * u * u * (3 - 2 * u); }
  return kf[kf.length - 1][1];
}
// 몸 털기: 구간 봉투 e(0→1 0.06초, 1→0 0.1초) 로 머리 0.4~0.75, 몸통 0.6~1.15, 꼬리 0.9~1.3 초 (t 는 전체 0.4 이후 시각, M19-3)
const shEnv = (t, a, b) => Math.max(0, Math.min(1, (t - a) / 0.06, (b - t) / 0.1));
const shakeFx = (a, t0) => { const t = t0 + 0.4, w = 36, eh = shEnv(t, 0.4, 0.75), eb = shEnv(t, 0.6, 1.15), et = shEnv(t, 0.9, 1.3);
  a.ov.hdr = 0.55 * Math.sin(w * t) * eh; a.ov.eL = a.ov.eR = 0.4 * Math.abs(Math.sin(w * t)) * eh;
  a.ov.cr = 0.32 * Math.sin(w * t - 1.0) * eb; a.ov.hr = 0.14 * Math.sin(w * t - 1.8) * eb; a.ov.puff = 0.6 * eb; a.ov.ts = 0.35 * Math.sin(w * t - 2.6) * et; };
// 재채기 키프레임 (0.7초 기준 상대 시각; 들기 0.6~0.95, 재채기 0.95~1.02, 되돌림 1.07~1.6)
const sneezeTracks = (stand) => { const o = {
  eye: [[0, 0], [0.2, -0.6], [0.6, -0.6], [0.95, -0.85], [1.02, -0.97], [1.07, -0.97], [1.6, 0]], eL: [[0, 0], [0.2, 0.2], [0.6, 0.2], [0.95, 0.2], [1.02, 0.45], [1.07, 0.45], [1.6, 0]],
  mouth: [[0, 0], [0.2, 0.1], [0.6, 0.1], [0.95, 0.35], [1.02, 0.75], [1.07, 0.75], [1.6, 0]],
  np: [[0, 0], [0.6, 0], [0.95, -0.3], [1.02, 0.42], [1.07, 0.42], [1.6, 0]], hdp: [[0, 0], [0.6, 0], [0.95, -0.35], [1.02, 0.5], [1.07, 0.5], [1.6, 0]],
  cp: [[0, 0], [0.6, 0], [0.95, -0.08], [1.02, 0.22], [1.07, 0.22], [1.6, 0]] }; o.eR = o.eL; if (stand) o.hp = [[0, 0], [0.95, 0], [1.02, -0.12], [1.07, -0.12], [1.6, 0]]; return o; };
const sneezeFx = (a, t, say) => { if (t < 0.6) a.ov.hdr = 0.06 * Math.sin((t + 0.7) * 30); else if (t > 1.07) a.ov.hdr = 0.08 * Math.sin((t + 0.7) * 18) * (1 - (t - 1.07) / 0.53); if (!say.done && t >= 0.95) { say.done = true; a.say('에취!'); } };
export const STEP = {
  pose(name, dur, extra, fx) { return { start(a) { a.setPose(name, extra); this.t = 0; }, tick(a, dt) { this.t += dt; if (fx) fx(a, this.t, dt); return this.t >= dur; } }; },
  // E2 키프레임 오버레이: tracks { 키: [[초, 값], ...] } 구간 smoothstep 보간, period 가 있으면 반복, fx 는 추가 훅
  track(name, dur, extra, tracks, o = {}) { return { start(a) { a.setPose(name, extra); this.t = 0; }, tick(a, dt) { this.t += dt; const tt = o.period ? this.t % o.period : this.t; for (const k in tracks) { const v = trackAt(tracks[k], tt); if (v !== null) a.ov[k] = v; } if (o.fx) o.fx(a, this.t, dt); return this.t >= dur; } }; },
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
  belly: { label: '발라당 뒹굴', score: (a) => (a.cat.g.months > 4 ? a.p.bold * a.p.playful * 0.9 : 0.1), steps: (a, r) => [STEP.pose('loaf', 1.2), STEP.track('belly', r.range(4, 8), null, { hr: [[0, 0], [1.3, 0.22], [2.6, 0]], fle: [[0, 0], [0.65, -0.35], [1.3, 0], [1.95, -0.35], [2.6, 0]], fre: [[0, 0], [0.65, -0.35], [1.3, 0], [1.95, -0.35], [2.6, 0]] }, { period: 2.6 }), STEP.pose('loaf', 1.2)] },
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
  // 작은 동작·탐색·경계 (M11-2): 새 자세 없이 기존 자세 + 오버레이만. 점수는 낮게 두고 감정 편향(EMO_BIAS)으로 올린다
  shake: { label: '몸 털기', score: (a) => 0.1 + a.p.playful * 0.05, steps: (a, r) => [STEP.pose('stand', 0.4, { fsp: 0.1, hsp: 0.1 }), STEP.pose('stand', 0.9, { fsp: 0.1, hsp: 0.1 }, shakeFx), STEP.pose('stand', 0.8)] }, // 머리→몸통→꼬리 위상 지연 roll (M19-3)
  tailFlick: { label: '꼬리 탁탁', score: (a) => (a.kitten ? 0 : 0.08 + a.p.grumpy * 0.1), steps: (a, r) => { // 꼬리를 바닥에 놓고 끝을 들었다 탁 내리침 (M19-4)
    const loaf = true, ex = { ts: 0.7, tcs: 0.04, tw: 0, tb: loaf ? -0.57 : -0.76, eL: 0.25, eR: 0.25 }, s = [STEP.pose(loaf ? 'loaf' : 'sit', 1.8, ex)];
    for (let i = r.int(3, 5), rest; i > 0; i--) { rest = r.range(0.3, 0.9); s.push(STEP.track(loaf ? 'loaf' : 'sit', 0.45 + rest, ex, { tb: [[0, 0], [0.3, 0.3], [0.38, 0]], tc: [[0, 0], [0.3, 0.1], [0.38, 0]] })); }
    return s; } },
  sneeze: { label: '재채기', score: (a) => 0.03, steps: (a, r) => { const pose = r.chance(0.6) ? 'sit' : 'stand', st = pose === 'stand', say = { done: false }; return [STEP.pose(pose, 0.7), STEP.track(pose, 1.6, null, sneezeTracks(st), { fx: (a, t) => sneezeFx(a, t, say) }), STEP.pose('sit', 1.4)]; } }, // 근질→들기→숙이기 (M19-3)
  lookUp: { label: '높은 곳 올려다보기', score: (a) => 0.1 + a.p.bold * 0.05, steps: (a, r) => [STEP.face(((LOOK.tower && LOOK.tower(a.x, a.z)) ?? Math.PI) + r.range(-0.4, 0.4)), STEP.pose('sit', 0.6), STEP.pose('alert', r.range(2.5, 4.5), { np: 0.1, hdp: 0.3 }, (a, t) => { a.ov.hdp = -0.5 * Math.min(1, t / 0.5); a.ov.hdr = Math.sin(t * 1.3) * 0.08; }), STEP.pose('sit', 1)] },
  freeze: { label: '얼어붙기', score: (a) => 0.04 + (1 - a.p.bold) * 0.04, steps: (a, r) => [STEP.pose('crouch', r.range(1.5, 3), { eL: 0.75, eR: 0.75, tb: -0.3, tw: 0, twf: 0, pupil: 1 }), STEP.pose('sit', 1.2, { eL: 0.4, eR: 0.4 })] },
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
  back_off:   { label: '뒷걸음질', steps: (a) => { const y = a.world.youPoint(), dx = a.x - y.x, dz = a.z - y.z, d = Math.hypot(dx, dz) || 1, m = Math.min(0.55, d * 0.8), ex = { eL: 0.6, eR: 0.6, tb: -0.1, pupil: 0.85 }; // 마주 본 채 낮은 자세로 짧은 보폭 뒷걸음 (M19-6)
    return [STEP.faceYou(), STEP.pose('crouch', 0.4, ex, (a) => { a.lookAtYou = 1; }), STEP.call((a) => a.moveTo(a.x + dx / d * m, a.z + dz / d * m, 0.8, { back: true, stride: 0.6, keepPose: 'crouch' })), { start() {}, tick: (a) => { a.lookAtYou = 1; return a.arrived; } }, STEP.pose('alert', 2.5, { eL: 0.4, eR: 0.4 })]; } },
  flee:       { label: '도망!', steps: (a) => { const y = a.world.youPoint(); const p = a.farFrom(y); return [STEP.call((a) => a.say('!')), STEP.walk(p.x, p.z, 3.2), STEP.pose('loaf', 5, { eL: 0.5, eR: 0.5, pupil: 0.9 })]; } },
  hiss_back:  { label: '맞하악!', steps: (a) => [STEP.call((a) => { a.yawTarget = a.yawTo(a.world.youPoint()) + 1.1; a.lookAtYou = 1; a.say('하아악!'); }), STEP.pose('hiss', 2.8, null, (a) => { a.lookAtYou = 1; }), STEP.pose('sit', 1.5, { eL: 0.5, eR: 0.5 })] },
  puff_side:  { label: '털 세우고 옆걸음', steps: (a) => { const y = a.world.youPoint(); const side = Math.atan2(y.x - a.x, y.z - a.z) + Math.PI / 2; return [STEP.call((a) => { a.yawTarget = side; a.lookAtYou = 1; a.say('캬아…'); }), STEP.pose('hiss', 0.8), STEP.call((a) => a.moveTo(a.x + Math.sin(side) * 0.45, a.z + Math.cos(side) * 0.45, 0.35, { keepPose: 'hiss', crab: true })), STEP.wait(2.2), STEP.pose('alert', 1.5, { eL: 0.6, eR: 0.6 })]; } },
  purr:       { label: '그르릉', steps: (a) => [STEP.call((a) => a.say('그르릉 그르릉')), STEP.pose(a.P.h < 0.12 ? 'loaf' : 'sit', 4, { eye: 0.12 }, (a, t) => { a.ov.hdr = Math.sin(t * 40) * 0.006; })] },
  eat_churu:  { label: '츄르 먹는 중', steps: (a) => [STEP.walk(...a.nearYou(0.42), 1.25), STEP.faceYou(), STEP.call((a) => a.say('냠냠')), STEP.pose('eat', 4.5, null, (a, t) => { a.ov.mouth = 0.2 + Math.sin(t * 11) * 0.18; a.ov.hdp = Math.sin(t * 11) * 0.05; }), STEP.call((a) => a.say('…더 줘')), STEP.pose('sit', 2.5, { eye: 0.6 }, (a) => { a.lookAtYou = 1; })] },
  sniff_only: { label: '킁킁, 냄새만', steps: (a) => [STEP.walk(...a.nearYou(0.9), 0.7), STEP.faceYou(), STEP.pose('crouch', 2.2, { np: 0.1, hdp: -0.05 }, (a, t) => { a.ov.hdp = Math.sin(t * 16) * 0.025; a.lookAtYou = 0.7; }), STEP.pose('sit', 2)] },
  swat:       { label: '냥펀치!', steps: (a) => [STEP.walk(...a.nearYou(0.5), 1.1), STEP.faceYou(), STEP.pose('sit', 0.5), STEP.call((a) => a.say('캭!')), STEP.pose('groom', 0.5, { fls: -1.1, fle: -0.2, eL: 1, eR: 1, eye: 1, pupil: 1, mouth: 0.6, hdp: 0.2, np: 0.2 }, (a, t) => { a.ov.fls = Math.sin(t * 30) * 0.5; a.lookAtYou = 1; }), STEP.pose('hiss', 1.2, { eL: 1, eR: 1 }, (a) => { a.lookAtYou = 1; }), STEP.pose('sit', 1.5, { eL: 0.6, eR: 0.6 })] },
  roll_over:  { label: '발라당', steps: (a) => { const sg = a.r.chance(0.5) ? 1 : -1, ex = { hr: -2.0 * sg, cr: -0.35 * sg, hdr: 0.8 * sg, hdp: -0.25, fle: 2.1, fre: 2.0, eye: 0.7 }; // 사용자 쪽으로 배를 보이며 구르고 비빔 (M19-6)
    const wig = (a, t) => { a.lookAtYou = 1; if (t > 2.2) { const u = (t - 2.2) % 1.4; a.ov.hr = -sg * (u < 0.35 ? 0.3 * u / 0.35 : u < 1.05 ? 0.3 - 0.6 * (u - 0.35) / 0.7 : -0.3 * (1.4 - u) / 0.35); a.ov.fle = 0.25 * Math.sin(t * 7); a.ov.fre = 0.25 * Math.sin(t * 7 + Math.PI); } };
    return [STEP.walk(...a.nearYou(0.6), 1.0), STEP.call((a) => { a.yawTarget = a.yawTo(a.world.youPoint()) + sg * Math.PI / 2; a.lookAtYou = 1; }), { start() {}, tick: (a) => Math.abs(angDiff(a.yaw, a.yawTarget)) < 0.12 }, STEP.pose('loaf', 0.8), STEP.pose('belly', 6.7, ex, wig), STEP.pose('loaf', 1.2)]; } },
};
export const REACTION_KEYS = Object.keys(REACTIONS);
