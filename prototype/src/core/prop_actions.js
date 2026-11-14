// core/prop_actions.js: 오브젝트 행동(본네트 엎드리기·차 밑 숨기)의 단계·도약·점수 (M3-6 O1, 설계 3·4·4A장)
// 에이전트(CatAgent) 객체만 만진다(three 없음). 켜고 끄기는 registerPropActions(on)로 ACTIONS 표에 넣고 뺀다 (D-120 기능 스위치).
// 4A 규칙: 접근점까지 걸어서 간다 / 높이(a.y) 변화는 도약(a.hop) 뿐 / 반응은 그 자리에서 / 쿨다운 90초 / 최근 3개 행동 반복 금지.
import { ACTIONS, REACTIONS, STEP } from './behavior.js';
import { REACT_META } from './touch_rules.js';
import { PROP_ACTION_KEYS, PROP_COOLDOWN, propClaim, propOccupant, propRelease, propSlots } from './props.js';
import { clamp, damp, lerp } from './util.js';

export const HOP = { slow: 1, speed: 0.7, fastSpeed: 1.0 }; // slow: 어드민 "느리게 보기" 배수(1=보통, 4=4배 느리게)
export const pmOf = (a) => a.pm || (a.pm = { cool: {}, recent: [], rej: 0, touchT: -1e9, log: [] });
export const noteAct = (a, k) => { const m = pmOf(a); m.recent.unshift(k); m.recent.length = Math.min(3, m.recent.length); };

// 지금 이 고양이가 쓸 수 있는 지점 (점유·쿨다운·최근 3개 행동·새끼 높이 제한 반영). 시계 대역(a.pm 없음)은 존재만 본다
export function pickSlot(a, action) {
  const m = a.pm;
  for (const s of propSlots(action)) {
    if (s.slot.mode === 'on' && a.kitten) continue;
    const occ = propOccupant(s.key); if (occ && occ !== a) continue;
    if (m && ((m.cool[s.key] || 0) > a.time || m.recent.includes(action))) continue;
    return s;
  }
  return null;
}
// ── 도약 (높이 변화는 오직 이 경로) ──
function startHop(a, x, z, y, fast, onEnd) {
  const dist = Math.hypot(x - a.x, z - a.z);
  const dur = Math.max(fast ? 0.4 : 0.55, dist / (fast ? HOP.fastSpeed : HOP.speed)) * HOP.slow;
  a.hop = { t: 0, dur, x0: a.x, z0: a.z, y0: a.y, x1: x, z1: z, y1: y, up: y > a.y, onEnd };
  if (dist > 0.05) a.yawTarget = Math.atan2(x - a.x, z - a.z);
  a.setPose('stand', { tb: 0.9, fls: -0.7, frs: -0.7, hls: 0.5, hrs: 0.5, eL: 0.1, eR: 0.1, pupil: 1 });
}
export function hopTick(a, dt) {
  const H = a.hop; H.t += dt; const k = clamp(H.t / H.dur, 0, 1);
  a.x = lerp(H.x0, H.x1, k); a.z = lerp(H.z0, H.z1, k);
  const e = H.up ? 1 - Math.pow(1 - Math.min(1, k / 0.4), 2) : Math.pow(clamp((k - 0.55) / 0.45, 0, 1), 1.5); // 오를 땐 먼저 솟고, 내릴 땐 가장자리를 넘은 뒤 떨어진다
  a.y = lerp(H.y0, H.y1, e); a.hopArc = Math.sin(k * Math.PI) * 0.08 * clamp(a.scale, 0.5, 1);
  if (k >= 1) { a.x = H.x1; a.z = H.z1; a.y = H.y1; a.hopArc = 0; a.hop = null; if (H.onEnd) H.onEnd(a); }
}
// 매 프레임 끝: 햇빛 가림(shade) 보간과 root 높이. a.y 는 위 hopTick 만 바꾼다
export function propFrameTick(a, dt) {
  if (a.y > 0 || a.hop || a._yUp) { a.v.root.position.y = a.y + (a.hopArc || 0); a._yUp = a.y > 0 || !!a.hop; }
  const sl = a.slot, want = sl && (sl.state === 'under' || sl.state === 'entering') ? sl.S.slot.shade : 0;
  if (sl || a.shadeK > 0.002) { a.shadeK = damp(a.shadeK || 0, want, 3, dt); const u = a.v.mat && a.v.mat.uniforms.shade; if (u) u.value = a.shadeK; }
}
// 지점 상태를 버리고 지상 시작(복원·지역 전환 전용. 화면에 그리기 전에만 부른다, 4A-1 예외)
export function resetSlot(a) {
  if (a.slot) propRelease(a.slot.key, a);
  a.slot = null; a.hop = null; a.y = 0; a.layer = null; a.hopArc = 0; a.shadeK = 0; a._yUp = false;
}
function leaveDone(a) { // 지점에서 완전히 나왔을 때: 점유 해제·쿨다운·기록
  const sl = a.slot, m = pmOf(a); if (!sl) return;
  propRelease(sl.key, a); m.cool[sl.key] = a.time + PROP_COOLDOWN; m.rej = 0;
  if (sl.state !== 'rising') m.log.push({ t: a.time, ev: 'leave', key: sl.key });
  a.slot = null; a.layer = null; a.setPose('crouch', { pupil: 0.8 });
}
function abort(a, key) { // 접근 실패: 위치를 옮기지 않고 포기, 쿨다운 후 다음 행동
  pmOf(a).cool[key] = a.time + PROP_COOLDOWN; a.steps.length = 0; a.steps.push(STEP.pose('sit', 2));
}

export const PS = {
  check(S) { return { start(a) { if (Math.hypot(a.x - S.ax, a.z - S.az) > 0.3) abort(a, S.key); }, tick() { return true; } }; },
  // 위(on) 올라가기: 웅크리기 -> 도약 호 -> 착지
  mount(S) { return { start(a) {
    this.ph = 0; this.t = 0; this.dead = false;
    if (!propClaim(S.key, a)) { this.dead = true; abort(a, S.key); return; }
    a.slot = { key: S.key, action: S.slot.action, S, state: 'rising' };
    a.yawTarget = Math.atan2(S.x - a.x, S.z - a.z); a.setPose('crouch', { pupil: 0.9 });
  }, tick(a, dt) {
    if (this.dead) return true;
    if (!a.slot || a.slot.S !== S) return true;
    this.t += dt;
    if (this.ph === 0 && this.t >= 0.4 * HOP.slow) { this.ph = 1; startHop(a, S.x, S.z, S.y, false, () => { a.slot.state = 'on'; pmOf(a).log.push({ t: a.time, ev: 'mount', key: S.key }); }); }
    else if (this.ph === 1 && !a.hop) { this.ph = 2; this.t = 0; a.setPose('crouch', { pupil: 0.8 }); a.yawTarget = S.yaw; }
    else if (this.ph === 2 && this.t >= 0.3) return true;
    return false;
  } }; },
  // 아래(under) 들어가기: 접근점에서 낮은 걸음으로 직선 이동 (충돌 무시 층)
  enter(S) { return { start(a) {
    this.dead = false;
    if (!propClaim(S.key, a)) { this.dead = true; abort(a, S.key); return; }
    a.slot = { key: S.key, action: S.slot.action, S, state: 'entering' }; a.layer = S.prop.id;
    a.setPose('hideLow'); a.moveTo(S.x, S.z, 0.45, { keepPose: true, timeout: 12 });
  }, tick(a) {
    if (this.dead || !a.slot || a.slot.S !== S) return true;
    if (!a.arrived) return false;
    a.slot.state = 'under'; pmOf(a).log.push({ t: a.time, ev: 'mount', key: S.key }); a.yawTarget = S.yaw; return true;
  } }; },
  // 내려오기/나오기: 도약 호(fast 도 호를 생략하지 않는다)·낮은 걸음. 이 경로만 a.y 를 0으로 돌린다
  dismount(fast) { return { start() { this.ph = 0; this.t = 0; }, tick(a, dt) {
    const sl = a.slot; if (!sl) return true;
    if (a.hop) return false;
    const S = sl.S;
    if (sl.state === 'rising') { if (this.ph === 0 && a.y === 0) { leaveDone(a); return true; } return false; } // 올라가기 전에 취소: 아직 지상
    if (sl.state === 'on') {
      this.t += dt;
      if (this.ph === 0) { a.setPose('crouch', { pupil: 0.9 }); this.ph = 1; this.t = 0; }
      else if (this.ph === 1 && this.t >= (fast ? 0.1 : 0.4) * HOP.slow) { this.ph = 2; startHop(a, S.ax, S.az, 0, !!fast, () => leaveDone(a)); }
      return false;
    }
    if (this.ph === 0) { this.ph = 1; a.setPose('hideLow'); a.moveTo(S.ax, S.az, fast ? 2.0 : 0.5, { keepPose: true, timeout: 12 }); return false; }
    if (a.arrived) { leaveDone(a); return true; }
    return false;
  } }; },
};
// 지점에 있으면 떠나는 단계들 (행동이 바뀔 때 앞에 붙인다)
export const leaveSteps = (a, fast) => (a.slot ? [PS.dismount(fast)] : []);

// ── 그 자리 반응 (4A-2): 지점 위·아래에서 쓰다듬기·츄르를 받으면 내려오지 않고 몸짓만. 거부 연속 2회 넘으면 전환 ──
export function slotReactSteps(a, k) {
  const sl = a.slot; if (!sl || sl.state === 'rising' || sl.state === 'entering' || a.hop) return null;
  const m = pmOf(a), pol = (REACT_META[k] || { pol: 0 }).pol, rest = sl.state === 'on' ? 'lie' : 'peek';
  if (a.time - m.touchT > 60) m.rej = 0;
  m.touchT = a.time;
  if (k === 'flee') return [PS.dismount(true), ...REACTIONS.flee.steps(a)];
  if (k === 'eat_churu' && sl.state === 'under') { m.rej = 0; return [PS.dismount(false), ...REACTIONS.eat_churu.steps(a)]; } // 숨은 고양이는 걸어 나와 받는다 (6장, 1회: 나오면 쿨다운이라 다시 들어가지 않음)
  if (pol < 0) m.rej++; else if (pol > 0) m.rej = 0;
  if (m.rej > 2) { // 3번째 거부부터는 반복하지 않고 감정 누적으로 전환
    m.rej = 0;
    if (a.p.grumpy < 0.5) return [STEP.pose(rest, 3.5, { eye: 0.12, tw: 0.04 }, (a) => { a.lookAtYou = 0; })]; // (a) 무시하고 계속 엎드림
    const p = a.farFrom(a.world.youPoint());
    return [PS.dismount(true), STEP.walk(p.x, p.z, 1.0), STEP.pose('sit', 2)]; // (b) 한 번 내려와 멀리 걸어감 (이 지점은 쿨다운)
  }
  if (k === 'eat_churu') return [STEP.call((a) => a.say('냠냠')), STEP.pose(rest, 4.5, { eye: 0.6 }, (a, t) => { a.ov.mouth = 0.2 + Math.sin(t * 11) * 0.18; a.ov.hdp = Math.sin(t * 11) * 0.05; a.lookAtYou = 0.8; })];
  if (pol >= 0) return [STEP.pose(rest, 2.6, { eye: 0.25, tw: 0.1, twf: 0.7 }, (a, t) => { a.lookAtYou = pol > 0 ? 0.7 : 0; })];
  return [STEP.pose(rest, 2.2, { eL: 0.8, eR: 0.8, tw: 0.3, twf: 3.0 }, (a, t) => { a.ov.hdr = Math.sin(Math.min(t, 1) * Math.PI) * 0.3; })];
}

// ── 행동 표 ──
const lieFx = (a, t) => { if (Math.floor(t * 0.17) !== a._lk) { a._lk = Math.floor(t * 0.17); a.lookRandom(); } if (a.r() < 0.004) a.slowBlink(); };
function approach(a, S) {
  if (a.world.blocked(S.ax, S.az, 0.2)) { pmOf(a).cool[S.key] = a.time + PROP_COOLDOWN; return null; }
  const d = Math.hypot(S.ax - a.x, S.az - a.z), to = d / (0.26 * (0.65 + 0.35 * a.scale) * 1.1) * 2 + 3; // 제한 시간(4A-1)
  return [STEP.walk(S.ax, S.az, 1.1, { timeout: to }), PS.check(S)];
}
export const PROP_ACTIONS = {
  hoodLoaf: { label: '본네트에서 엎드린 중',
    score: (a) => { const S = pickSlot(a, 'hoodLoaf'); return S ? 0.30 + a.world.day * 0.55 + S.slot.warm * 0.4 + a.p.bold * 0.35 + (1 - a.E) * 0.3 : 0; },
    steps: (a, r) => {
      if (a.slot && a.slot.action === 'hoodLoaf') return [STEP.pose('lie', r.range(6, 20), null, lieFx), PS.dismount(false)]; // 반응 뒤 이어서
      const S = pickSlot(a, 'hoodLoaf'), ap = S && approach(a, S);
      if (!ap) return [STEP.pose('sit', 2)];
      return [...ap, PS.mount(S), STEP.pose('lie', r.range(10, 30), null, lieFx), PS.dismount(false)];
    } },
  underHide: { label: '차 밑에 숨은 중',
    score: (a) => (pickSlot(a, 'underHide') ? 0.12 + (1 - a.p.bold) * 0.9 + (1 - a.p.social) * 0.5 : 0),
    steps: (a, r) => {
      const peek = (d) => STEP.pose('peek', d, null, (a, t) => { if (Math.floor(t * 0.3) !== a._lk) { a._lk = Math.floor(t * 0.3); a.lookRandom(); } });
      if (a.slot && a.slot.action === 'underHide') return [peek(r.range(5, 15)), PS.dismount(false)];
      const S = pickSlot(a, 'underHide'), ap = S && approach(a, S);
      if (!ap) return [STEP.pose('sit', 2)];
      return [...ap, PS.enter(S), STEP.pose('hideLow', 3), peek(r.range(10, 32)), STEP.pose('hideLow', 2), PS.dismount(false)];
    } },
};
export function registerPropActions(on) {
  if (on) Object.assign(ACTIONS, PROP_ACTIONS); else for (const k of PROP_ACTION_KEYS) delete ACTIONS[k];
}
