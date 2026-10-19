// 고양이 한 마리의 행동 실행(CatAgent): 세계 시계 일정·교감 반응·만남 단계·걸음·시선
import * as THREE from 'three';
import { ACTIONS, BOUNDS, REACTIONS, STEP } from '../core/behavior.js';
import { REACT_META } from '../core/touch_rules.js';
import { TAU, angDiff, clamp, damp, dampAngle, lerp, makeRng, smooth } from '../core/util.js';
import { Clock } from '../state/clock.js';
import { PARAM_KEYS, poseTarget } from '../render/poses.js';

export class CatAgent {
  constructor(cat, view, world, rng) {
    this.cat = cat; this.v = view; this.world = world; this.r = rng;
    this.p = cat.g.personality; this.kitten = cat.g.months < 6;
    this.x = 0; this.z = 0; this.yaw = 0; this.yawTarget = 0;
    this.E = rng.range(0.35, 1); this.B = rng.range(0, 0.6);
    this.P = poseTarget(view.dim, 'sit'); this.T = { ...this.P };
    this.ov = {};
    this.steps = []; this.step = null; this.action = null; this.label = '';
    this.move = null; this.arrived = true; this.speed = 0;
    this.gait = 0; this.gaitAmt = 0; this.runAmt = 0;
    this.lookAt = null; this.lookAtYou = 0; this.lookPt = null; this.lookYaw = 0; this.lookPitch = 0;
    this.blinkT = rng.range(1, 5); this.blink = 0; this.slowT = 0;
    this.earT = [rng.range(2, 8), rng.range(2, 8)]; this.earK = [0, 0];
    this.meowT = rng.range(15, 50);
    this.jump = null; this.lastAction = '';
    this.time = rng() * 100;
    // 세계 시계 연동 (enterClock을 부르면 켜진다)
    this.clk = false; this.entry = null; this.sim = false; this.simNow = 0;
    this.override = false; this.manual = false; this.repeatKey = null;
    // 놀러가기 (M0-3): ext = 일정 대신 바깥(외출·만남)이 움직임을 쥐고 있음, enc = 만남, hidden = 자리 비움, guest = 손님
    this.ext = false; this.enc = null; this.hidden = false; this.guest = false; this._ph = null;
  }
  // 서로 바라보기의 목표 점: 머리 위치 (화면 없이 빨리 감는 중에는 몸 위치로 어림)
  headPt() { if (!this.sim) { const v = this._hp || (this._hp = new THREE.Vector3()); this.v.rig.head.getWorldPosition(v); return v; } return { x: this.x, y: 0.22 * this.scale, z: this.z }; }
  // 만남 중 매 프레임: 단계표(Encounter)를 따라 자리·방향·자세를 정하고 상대에게 시선과 몸을 묶는다 (설계 7장 서로 바라보기)
  encTick(dt) {
    const E = this.enc, ph = E.ph, role = this === E.host ? 'host' : 'guest', o = role === 'host' ? E.guest : E.host;
    if (this._ph !== ph) {
      this._ph = ph; this._posed = false; this._tgt = null; this._said = new Set();
      const lb = ph.label && (typeof ph.label === 'string' ? ph.label : ph.label[role]);
      if (lb) { this.label = lb; this.world.onLabel && this.world.onLabel(this); }
    }
    const tl = E.t - ph.t0;
    this.lookAt = o; this.lookAtYou = 0; this.lookPt = null;
    const tgt = ph.pos ? ph.pos(role, E, tl, ph) : null;
    if (tgt && (!this._tgt || Math.hypot(tgt.x - this._tgt.x, tgt.z - this._tgt.z) > 0.04)) {
      this._tgt = tgt;
      const sp = ph.speed && typeof ph.speed === 'object' ? ph.speed[role] : ph.speed;
      this.moveTo(tgt.x, tgt.z, sp || 1, { timeout: 30 }); this._posed = false;
    }
    const moving = this.move && !this.arrived;
    if (!moving && !this._posed) {
      const pp = (typeof ph.pose === 'function' ? ph.pose(role, E) : ph.pose) || ['stand'];
      this.setPose(pp[0], pp[1]); this._posed = true; this.move = null;
    }
    if (!moving) this.yawTarget = ph.yaw ? ph.yaw(this, o, role, tl) : this.yawTo(o);
    if (ph.says) ph.says.forEach((s, i) => { if (s[1] === role && tl >= s[0] && !this._said.has(i)) { this._said.add(i); this.say(s[2]); } });
    if (ph.fx) ph.fx(this, tl, role, E, ph);
  }
  // ── 세계 시계: 지금 시각의 일정 행동에 들어가서 그 지점부터 이어 보여 준다 ──
  enterClock(now) {
    const { entry, prev } = Clock.entryAt(this.cat, now);
    const H0 = Clock.home(prev, this.world);
    this.clk = true; this.override = false; this.manual = false; this.repeatKey = null; this.isReaction = false;
    this.x = H0.x; this.z = H0.z; this.jump = null; this.v.root.position.y = 0;
    this.yaw = this.yawTarget = makeRng(prev.seed + ':yaw').range(-0.7, 0.7);
    this.setPose('sit'); Object.assign(this.P, this.T);
    this.sim = true; this.simNow = entry.t0;
    this.beginEntry(entry);
    const el = Math.max(0, (now - entry.t0) / 1000);
    for (let t = 0; t < el; t += 0.1) this.update(Math.min(0.1, el - t)); // 화면 없이 빨리 감기
    this.sim = false;
  }
  beginEntry(entry, resume) {
    this.entry = entry; this.isReaction = false; this.override = false;
    const A = ACTIONS[entry.key] || ACTIONS.sit, H = Clock.home(entry, this.world), r = makeRng(entry.seed + (resume ? ':r' : ''));
    const st = Clock.stateAt(this.cat, entry.t0, false);
    this.E = 1 - st.needs.sleep; this.B = st.needs.play;
    this.action = entry.key; this.lastAction = entry.key;
    this.steps = []; this.step = null; this.move = null; this.arrived = true; this.lookAtYou = 0; this.jump = null;
    const walk = Math.hypot(H.x - this.x, H.z - this.z) > 0.15;
    this.label = walk ? '골목 산책 중' : A.label;
    if (walk) this.steps.push(STEP.walk(H.x, H.z, 1.1, { timeout: 24 }));
    this.steps.push(STEP.lazy((a) => { a.label = A.label; a.world.onLabel && a.world.onLabel(a); return A.steps(a, r); }), STEP.hold());
    this.world.onLabel && this.world.onLabel(this);
  }
  clockTick(now) {
    if (!this.clk || !this.entry || this.manual) return;
    if (this.isReaction || this.override) {
      if (this.step || this.steps.length) return; // 교감 반응·어드민 재생이 일정보다 우선, 끝나면 일정으로 돌아간다
      if (this.repeatKey && this.override) { this.play(this.repeatKey); return; }
      this.beginEntry(Clock.entryAt(this.cat, now).entry, true);
      return;
    }
    if (now >= this.entry.t1) {
      if (!this.sim && now - this.entry.t1 > 10000) this.enterClock(now); // 탭을 오래 비웠다 돌아온 경우: 다시 계산해서 이어 붙임
      else this.beginEntry(Clock.entryAt(this.cat, now).entry);
    }
  }
  // 어드민: 행동·반응 하나를 지금 재생 (일정보다 우선)
  play(k) {
    if (this.enc || this.hidden) return; // 만남·외출 중에는 어드민 재생을 받지 않는다 (놀러가기 시험 구역에서 다룸)
    this.manual = false;
    if (REACTIONS[k]) { this.react(k); if (REACTIONS[k].keep) return; } else { this.jump = null; this.runAction(k, false); }
    this.override = true;
  }
  // 어드민: 지금 상태로 뽑은 행동을 실행하고 일정은 잠시 멈춤 (resumeSchedule로 복귀)
  playManual(k) { this.play(k); this.override = false; this.manual = true; this.steps.push(STEP.hold()); }
  resumeSchedule() { this.manual = false; this.repeatKey = null; this.override = false; this.beginEntry(Clock.entryAt(this.cat, Date.now()).entry, true); }
  get scale() { return this.v.dim.scale; }
  setPose(name, extra) { const t = poseTarget(this.v.dim, name, extra); this.T = t; this.v.plant = t.plant; }
  yawTo(o) { return Math.atan2(o.x - this.x, o.z - this.z); }
  mom() { return this.cat.mother ? this.world.agents.find((x) => x.cat.id === this.cat.mother) : null; }
  nearestCat(maxD) { let best = null, bd = maxD; for (const o of this.world.agents) { if (o === this || o.hidden) continue; const d = Math.hypot(o.x - this.x, o.z - this.z); if (d < bd) { bd = d; best = o; } } return best; }
  randomPoint(r, maxStep) {
    for (let i = 0; i < 12; i++) {
      const x = clamp(this.x + r.range(-maxStep, maxStep), BOUNDS.x0, BOUNDS.x1), z = clamp(this.z + r.range(-maxStep, maxStep) * 0.7, BOUNDS.z0, BOUNDS.z1);
      if (!this.world.blocked(x, z, 0.2)) return { x, z };
    }
    return { x: this.x, z: this.z };
  }
  nearYou(dist) {
    const y = this.world.youPoint();
    const ang = Math.atan2(this.x - y.x, this.z - y.z);
    const d = dist * (0.6 + 0.4 * this.scale);
    return [clamp(y.x + Math.sin(ang) * d, BOUNDS.x0, BOUNDS.x1), clamp(y.z + Math.cos(ang) * d, BOUNDS.z0, BOUNDS.z1)];
  }
  farFrom(p) {
    let best = { x: this.x, z: this.z }, bd = -1;
    for (let i = 0; i < 10; i++) { const x = this.r.range(BOUNDS.x0, BOUNDS.x1), z = this.r.range(BOUNDS.z0, BOUNDS.z0 + 1.2); if (this.world.blocked(x, z, 0.2)) continue; const d = Math.hypot(x - p.x, z - p.z); if (d > bd) { bd = d; best = { x, z }; } }
    return best;
  }
  moveTo(x, z, speed, opts = {}) { this.move = { x, z, speed, ...opts }; this.arrived = false; }
  pounce(dist) { this.jump = { t: 0, dur: 0.55, dist, x0: this.x, z0: this.z }; this.setPose('stand', { tb: 0.9, fls: -0.7, frs: -0.7, hls: 0.5, hrs: 0.5, eL: 0.1, eR: 0.1, pupil: 1 }); }
  say(text) { if (!this.sim) this.world.say(this, text); }
  slowBlink() { this.slowT = 1.6; }
  earTwitch(i) { this.earK[i] = 0.35; }
  lookRandom() { const r = this.r; if (r() < 0.35) { this.lookPt = null; this.lookAtYou = r() < this.p.social * 0.6 ? 1 : 0; } else { this.lookAtYou = 0; this.lookPt = { x: this.x + r.range(-2, 2), z: this.z + r.range(-1, 2), y: r.range(0, 1.2) }; } }

  chooseAction() {
    const r = this.r;
    const ctx = this.world;
    const scored = [];
    for (const [k, A] of Object.entries(ACTIONS)) {
      if (k === 'followMom' && !this.cat.mother) continue;
      let s = A.score(this, ctx);
      if (k === this.lastAction) s *= 0.35;
      if (this.kitten && (k === 'sideNap' || k === 'hissAt')) s *= 0.3;
      s *= 0.7 + r() * 0.6;
      if (s > 0) scored.push([k, s]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    const k = r.weighted(scored.slice(0, 3));
    this.runAction(k);
  }
  runAction(k, isReaction) {
    const A = isReaction ? REACTIONS[k] : ACTIONS[k];
    this.action = k; this.lastAction = k; this.label = A.label; this.isReaction = !!isReaction;
    this.steps = A.steps(this, this.r);
    this.step = null; this.move = null; this.arrived = true; this.lookAtYou = 0;
    this.world.onLabel && this.world.onLabel(this);
  }
  react(k) {
    const R = REACTIONS[k] || REACTIONS.stare;
    if (R.keep) { // 무관심: 직전 반응의 라벨·말풍선·몸짓을 남기지 않는다 (부정 몸짓은 즉시 해제, 그 외엔 지금 자세 유지)
      const neg = this.isReaction && REACT_META[this.lastAction] && REACT_META[this.lastAction].pol < 0;
      this.label = R.label; this.isReaction = true; this.lookAtYou = 0;
      this.world.dropBubble && this.world.dropBubble(this);
      if (neg) { this.jump = null; this.move = null; this.arrived = true; this.step = null; this.steps = [STEP.pose(this.lastAction === 'flee' ? 'loaf' : 'sit', 0.8, { eL: 0.7, eR: 0.7 })]; }
      for (const s of R.steps(this)) { s.start(this); }
      this.lastAction = 'ignore'; this.world.onLabel && this.world.onLabel(this); return;
    }
    this.jump = null;
    this.runAction(k in REACTIONS ? k : 'stare', true);
  }
  // ── 매 프레임 ──
  update(dt) {
    this.time += dt;
    const t = this.time;
    // 욕구 변화
    const moving = this.move && !this.arrived;
    this.E = clamp(this.E - dt * (moving ? 0.012 * (this.move.speed > 2 ? 3 : 1) : 0.002), 0, 1);
    this.B = clamp(this.B + dt * (moving ? -0.02 : 0.006), 0, 1);
    // 세계 시계: 일정이 바뀔 때가 되었는지
    if (this.clk && !this.ext) { if (this.sim) this.simNow += dt * 1000; this.clockTick(this.sim ? this.simNow : Date.now()); }
    // 단계 진행 (만남 중에는 Encounter 단계표가 대신한다)
    if (this.enc) { this.ov = {}; this.encTick(dt); }
    else {
      if (!this.step) {
        if (!this.steps.length) { if (this.clk) this.steps.push(STEP.hold()); else this.chooseAction(); }
        this.step = this.steps.shift(); this.step.start(this);
      }
      this.ov = {};
      if (this.step.tick(this, dt)) this.step = null;
    }
    // 이동
    let speedNow = 0;
    if (this.jump) {
      const J = this.jump; J.t += dt; const k = clamp(J.t / J.dur, 0, 1);
      const d = J.dist * this.scale * smooth(k);
      this.x = J.x0 + Math.sin(this.yaw) * d; this.z = J.z0 + Math.cos(this.yaw) * d;
      this.v.root.position.y = Math.sin(k * Math.PI) * 0.12 * this.scale;
      if (k >= 1) { this.jump = null; this.v.root.position.y = 0; this.setPose('crouch', { pupil: 0.8 }); }
    } else if (this.move && !this.arrived) {
      const M = this.move;
      const dx = M.x - this.x, dz = M.z - this.z, dist = Math.hypot(dx, dz);
      if (dist < 0.05) { this.arrived = true; }
      else {
        if (!M.crab) this.yawTarget = Math.atan2(dx, dz);
        const err = Math.abs(angDiff(this.yaw, this.yawTarget));
        const base = 0.26 * (0.65 + 0.35 * this.scale) * M.speed;
        speedNow = M.crab ? base : base * clamp(1.2 - err, 0, 1);
        const step = Math.min(dist, speedNow * dt);
        let nx = this.x + (dx / dist) * step, nz = this.z + (dz / dist) * step;
        const pushed = this.world.resolve(this, nx, nz);
        this.x = pushed.x; this.z = pushed.z;
        if (pushed.stuck) M.stuckT = (M.stuckT || 0) + dt; if (M.stuckT > 1.5) this.arrived = true;
      }
      if (!M.keepPose && this.T !== this._walkPose) { this._walkPose = poseTarget(this.v.dim, 'stand', { tb: M.speed > 2 ? 0.35 : this.p.social > 0.6 ? 1.2 : 0.75, tw: 0.08 }); this.T = this._walkPose; this.v.plant = 'all'; }
    }
    const runK = clamp((speedNow / (0.26 * this.scale) - 1.6) / 1.2, 0, 1);
    this.gaitAmt = damp(this.gaitAmt, speedNow > 0.01 ? 1 : 0, 10, dt);
    this.runAmt = damp(this.runAmt, runK, 6, dt);
    const stride = 0.2 * this.scale * (1 + this.runAmt * 0.8);
    this.gait += (speedNow * dt) / stride;
    this.yaw = dampAngle(this.yaw, this.yawTarget, this.move && !this.arrived ? 7 : 4, dt);
    // 다른 고양이와 겹침 방지 (멈춰 있을 때 살살 밀기)
    // 자세 보간
    const P = this.P, T = this.T;
    for (const k of PARAM_KEYS) {
      if (T[k] === undefined) continue;
      const rate = k === 'eye' || k === 'mouth' ? 10 : k === 'puff' ? 3 : k === 'h' ? 5 : 4.2;
      P[k] = damp(P[k], T[k], this.jump ? 14 : rate, dt);
    }
    // 최종 자세 = 보간값 + 오버레이
    const F = this.v.pose;
    for (const k of PARAM_KEYS) F[k] = P[k] + (this.ov[k] || 0);
    // 걸음걸이
    const ga = this.gaitAmt;
    if (ga > 0.01) {
      const ph = this.gait * TAU, run = this.runAmt;
      const legs = [['fls', 'fle', 0.25, 0.48], ['frs', 'fre', 0.75, 0.48], ['hls', 'hlk', 0.0, 0.42], ['hrs', 'hrk', 0.5, 0.42]];
      const runOff = { fls: 0.0, frs: 0.1, hls: 0.5, hrs: 0.6 };
      for (const [s, e, off, amp] of legs) {
        const o = lerp(off, runOff[s], run);
        const ps = ph + o * TAU;
        const a = amp * (1 + run * 0.6) * ga;
        F[s] += Math.sin(ps) * a;
        F[e] += Math.max(0, -Math.cos(ps)) * a * (s[0] === 'f' ? 1.3 : 1.1);
      }
      F.hr += Math.sin(ph) * 0.03 * ga * (1 - run);
      F.hp += Math.sin(ph * 1) * 0.12 * run;
      F.cp -= Math.sin(ph * 1) * 0.1 * run;
      F.hdp += Math.sin(ph * 2) * 0.03 * ga;
      this.v.root.position.y = this.jump ? this.v.root.position.y : Math.max(0, Math.sin(ph + 1)) * 0.03 * run * this.scale;
    }
    // 숨쉬기
    F.h += Math.sin(t * (F.eye < 0.2 ? 1.4 : 2.2)) * 0.0016;
    // 시선
    let lt = null;
    if (this.lookAtYou > 0) lt = this.world.camPos;
    else if (this.lookAt) lt = this.lookAt.headPt ? this.lookAt.headPt() : { x: this.lookAt.x, y: 0.15, z: this.lookAt.z };
    else if (this.lookPt) lt = this.lookPt;
    let wantYaw = 0, wantPitch = 0;
    if (lt && F.eye > 0.15) {
      const hy = this.yaw + F.hy + F.cy;
      const lm = this.enc ? 2.6 : 1.1; // 만나는 동안엔 몸이 옆·뒤를 향해도 상대를 볼 수 있게 목·머리를 크게(최대 약 150도) 돌린다
      // 만나는 동안은 몸 중심이 아니라 내 머리 자리에서 상대 머리를 잰다(나란히 설 때 머리가 몸보다 앞에 있어 각도가 크게 달라짐)
      const hp0 = this.enc && !this.sim ? this.headPt() : null, ox = hp0 ? hp0.x : this.x, oz = hp0 ? hp0.z : this.z;
      wantYaw = clamp(angDiff(hy, Math.atan2(lt.x - ox, lt.z - oz)), -lm, lm);
      const dd = Math.hypot(lt.x - ox, lt.z - oz);
      if (this.enc) { // 자세가 이미 몸·목·고개를 숙이거나 든 만큼(엉덩이·가슴·목·머리 기울기)을 빼서, 머리가 상대 머리 높이를 향하게
        const oy = this.sim ? 0.22 * this.scale : this.headPt().y;
        wantPitch = clamp(-Math.atan2((lt.y || 0) - oy, Math.max(dd, 0.2)) - (F.hp + F.cp + F.np + F.hdp), -1.1, 0.9);
      } else {
        wantPitch = clamp(-Math.atan2((lt.y || 0) - 0.25 * this.scale, dd) * 0.6, -0.5, 0.4);
        if (Math.abs(angDiff(hy, Math.atan2(lt.x - ox, lt.z - oz))) > 1.9) { wantYaw = 0; wantPitch = 0; }
      }
    }
    const lk = this.enc ? 9 : 5;
    this.lookYaw = damp(this.lookYaw, wantYaw, lk, dt); this.lookPitch = damp(this.lookPitch, wantPitch, lk, dt);
    if (this.enc) { F.cy += this.lookYaw * 0.25; F.ny += this.lookYaw * 0.75; } else F.ny += this.lookYaw; // 만날 때는 등뼈도 조금 비튼다(몸 방향은 그대로)
    F.hdp += this.lookPitch * (1 - Math.abs(F.hr) * 0.5);
    // 눈 깜빡임
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.16; this.blinkT = this.r.range(2.5, 6.5); }
    if (this.blink > 0) { this.blink -= dt; F.eye *= 0.08; }
    if (this.slowT > 0) { this.slowT -= dt; const k = 1 - this.slowT / 1.6; F.eye *= 1 - Math.sin(k * Math.PI) * 0.88; }
    // 귀 쫑긋
    for (let i = 0; i < 2; i++) {
      this.earT[i] -= dt; if (this.earT[i] < 0) { this.earK[i] = 0.3; this.earT[i] = this.r.range(3, 11); }
      if (this.earK[i] > 0) { this.earK[i] -= dt; const k = Math.sin((this.earK[i] / 0.3) * Math.PI) * 0.55; if (i === 0) F.eL += k; else F.eR += k; }
    }
    // 가끔 울기
    this.meowT -= dt;
    if (this.meowT < 0) { this.meowT = this.r.range(25, 70); if (F.eye > 0.3 && !this.isReaction && !this.enc) this.say(this.kitten ? this.r.pick(['미야', '먀아', '삐약']) : this.r.pick(['냥', '야옹', '냐아', '앵'])); }
    // 배치
    this.v.root.position.x = this.x; this.v.root.position.z = this.z;
    this.v.root.rotation.y = this.yaw;
    if (!this.sim) this.v.update(t, dt);
  }
}
