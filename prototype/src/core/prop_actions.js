// core/prop_actions.js: 오브젝트 행동(본네트 엎드리기·차 밑 숨기)의 단계·도약·점수 (M3-6 O1, 설계 3·4·4A장)
// 에이전트(CatAgent) 객체만 만진다(three 없음). 켜고 끄기는 registerPropActions(on)로 ACTIONS 표에 넣고 뺀다 (D-120 기능 스위치).
// 4A 규칙: 접근점까지 걸어서 간다 / 높이(a.y) 변화는 도약(a.hop) 뿐 / 반응은 그 자리에서 / 쿨다운 90초 / 최근 3개 행동 반복 금지.
import { ACTIONS, REACTIONS, STEP } from './behavior.js';
import { REACT_META } from './touch_rules.js';
import { CRATE, GIFT, PROP_ACTION_KEYS, PROP_COOLDOWN, PROP_KINDS, TOWER_KEYS, propClaim, propOccupant, propRelease, propSlots, slotWorld } from './props.js';
import { clamp, damp, lerp } from './util.js';

export const HOP = { slow: 1, speed: 0.7, fastSpeed: 1.0 }; // slow: 어드민 "느리게 보기" 배수(1=보통, 4=4배 느리게)
export const pmOf = (a) => a.pm || (a.pm = { cool: {}, recent: [], rej: 0, touchT: -1e9, log: [] });
export const noteAct = (a, k) => { const m = pmOf(a); m.recent.unshift(k); m.recent.length = Math.min(3, m.recent.length); };

// 지금 이 고양이가 쓸 수 있는 지점 (점유·쿨다운·최근 3개 행동·새끼 높이 제한 반영). 시계 대역(a.pm 없음)은 존재만 본다
// opt: { gift: true(선물 상자 지점만), as: 행동 키(최근 3개 행동 검사용) }. 선물 상자 지점은 world.gift 가 있을 때만 후보(없으면 만료·미래 시각), 있으면 먼저 고른다 (M6-5)
export function pickSlot(a, action, opt) {
  const m = a.pm, g = a.world && a.world.gift, key = (opt && opt.as) || action;
  const all = propSlots(action).filter((s) => s.prop.look !== 'gift' || g), list = g ? [...all.filter((s) => s.prop.look === 'gift'), ...all.filter((s) => s.prop.look !== 'gift')] : all;
  for (const s of list) {
    if (opt && opt.gift && s.prop.look !== 'gift') continue;
    if (TOWER_KEYS.has(key) && m && m.recent.some((k) => TOWER_KEYS.has(k))) continue; // 같은 캣타워 묶음: 최근 3개 행동 안에 하나만 (M8-1, 설계 3.3)
    if (s.slot.via && s.slot.via.some((v) => propOccupant(s.prop.id + ':' + v))) continue; // 올라갈 단(via)이 차 있으면 못 오른다 (mid 점유 중 top 불가, 3.1)
    if (s.slot.mode === 'on' && a.kitten) continue; // 새끼는 높은 곳(본네트 0.58m·담 0.80m)에 못 오른다
    const occ = propOccupant(s.key); if (occ && occ !== a) continue;
    if (m && ((m.cool[s.key] || 0) > a.time || m.recent.includes(key))) continue;
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

const CRATE_TOP = CRATE.h + 0.04; // 벽 위로 넘을 때의 발 높이(벽 끝보다 약간 위)
// 상자 앞벽 위 지점: 접근점에서 지점 쪽으로 w/2 - t 만큼 들어간 곳(벽 두께 한가운데 부근)
function wallTop(S) { const dx = S.x - S.ax, dz = S.z - S.az, d = Math.hypot(dx, dz) || 1, k = 0.2; return { x: S.ax + dx / d * k, z: S.az + dz / d * k }; }
// 상자 안 꼬리: 세워 올려 벽 위로만 나오게 한다(앉은 몸 뒤로 눕히면 뒷벽 밖으로 샌다)
const CRATE_TAIL = { tb: 2.0, tc: 0.0, tcs: 0.1 }; // sit 은 엉덩이가 눕는 자세(hp -0.62)라 그만큼 더 세워야 수직에 가깝다
const CRATE_TAIL_LOAF = { tb: 1.3, tc: 0.05, tcs: 0.1 };
// 올라갈 때 거치는 단(via)의 월드 좌표 (낮은 단부터). 캣타워 top 은 mid 를 거친다 (M8-2, 설계 3.1)
const viaWorld = (S) => (S.slot.via || []).map((id) => slotWorld(S.prop, PROP_KINDS[S.prop.kind].slots.find((q) => q.id === id)));
const hopsIn = (S) => S.slot.mode === 'in' && S.prop.kind === 'crate'; // 상자만 벽을 넘어 들어간다. 캣타워 칸은 입구로 걸어 들어간다
const lowPose = (S) => (S.slot.mode === 'in' ? 'crouch' : 'hideLow'); // 들어가고 나올 때의 낮은 걸음 자세 (상자 안은 웅크림)
export const PS = {
  check(S) { return { start(a) { if (Math.hypot(a.x - S.ax, a.z - S.az) > 0.3) abort(a, S.key); }, tick() { return true; } }; },
  // 위(on) 올라가기: 웅크리기 -> 도약 호 -> 착지
  mount(S) { return { start(a) {
    this.ph = 0; this.t = 0; this.dead = false; this.i = 0; this.path = [...viaWorld(S), S]; this.wait = 0.4 * HOP.slow;
    if (!propClaim(S.key, a)) { this.dead = true; abort(a, S.key); return; }
    a.slot = { key: S.key, action: S.slot.action, S, state: 'rising' };
    a.yawTarget = Math.atan2(this.path[0].x - a.x, this.path[0].z - a.z); a.setPose('crouch', { pupil: 0.9 });
  }, tick(a, dt) {
    if (this.dead) return true;
    if (!a.slot || a.slot.S !== S) return true;
    this.t += dt;
    const Q = this.path[this.i], last = this.i === this.path.length - 1;
    if (this.ph === 0 && this.t >= this.wait) { this.ph = 1; startHop(a, Q.x, Q.z, Q.y, false, last ? () => { a.slot.state = 'on'; pmOf(a).log.push({ t: a.time, ev: 'mount', key: S.key }); } : null); }
    else if (this.ph === 1 && !a.hop) { this.ph = 2; this.t = 0; a.setPose('crouch', { pupil: 0.8 }); a.yawTarget = last ? S.yaw : Math.atan2(this.path[this.i + 1].x - a.x, this.path[this.i + 1].z - a.z); }
    else if (this.ph === 2 && this.t >= 0.3) { // 단 사이: 착지 웅크림 뒤 0.3~0.6초 멈췄다가 다음 단으로 (통짜 도약 금지, 3.1)
      if (last) return true;
      this.i++; this.ph = 0; this.t = 0; this.wait = a.r.range(0.3, 0.6) * HOP.slow; }
    return false;
  } }; },
  // 아래(under) 들어가기: 접근점에서 낮은 걸음으로 직선 이동 (충돌 무시 층)
  // 상자(in)는 앞벽을 넘어 들어간다: 웅크렸다가 벽 위로 도약 -> 벽 안쪽 바닥으로 내려앉기 (몸통이 벽 높이 아래로 벽 면을 지나지 않는다)
  enter(S) { return { start(a) {
    this.dead = false; this.ph = 0; this.t = 0;
    if (S.prop.gone || !propClaim(S.key, a)) { this.dead = true; abort(a, S.key); return; } // 사라지는 중인 상자에는 들어가지 않는다 (M6-5)
    a.slot = { key: S.key, action: S.slot.action, S, state: 'entering' }; a.layer = S.prop.id;
    if (hopsIn(S)) { a.yawTarget = Math.atan2(S.x - a.x, S.z - a.z); a.setPose('crouch', { pupil: 0.9 }); return; }
    a.setPose(lowPose(S)); a.moveTo(S.x, S.z, 0.45, { keepPose: true, timeout: 12 });
  }, tick(a, dt) {
    if (this.dead || !a.slot || a.slot.S !== S) return true;
    if (hopsIn(S)) {
      if (this.ph === 0) { this.t += dt; if (this.t >= 0.4 * HOP.slow) { this.ph = 1; const W = wallTop(S);
        startHop(a, W.x, W.z, CRATE_TOP, false, () => { if (a.slot && a.slot.S === S) startHop(a, S.x, S.z, 0, false, null); }); } return false; }
      if (a.hop) return false;
      a.setPose('crouch', { pupil: 0.8, ...CRATE_TAIL });
    } else if (!a.arrived) return false;
    a.slot.state = 'under'; pmOf(a).log.push({ t: a.time, ev: 'mount', key: S.key }); a.yawTarget = S.yaw; return true;
  } }; },
  // 내려오기/나오기: 도약 호(fast 도 호를 생략하지 않는다)·낮은 걸음. 이 경로만 a.y 를 0으로 돌린다
  dismount(fast) { return { start() { this.ph = 0; this.t = 0; }, tick(a, dt) {
    const sl = a.slot; if (!sl) return true;
    if (a.hop) return false;
    const S = sl.S;
    if (sl.state === 'rising' && a.y > 0) sl.state = 'on'; // 단 사이에서 멈춘 채 취소: 지금 높이에서 내려간다
    if (sl.state === 'rising') { if (this.ph === 0 && a.y === 0) { leaveDone(a); return true; } return false; } // 올라가기 전에 취소: 아직 지상
    if (sl.state === 'on') {
      this.t += dt;
      if (this.ph === 0) { a.setPose('crouch', { pupil: 0.9 }); this.ph = 1; this.t = 0; this.i = 0; // 단마다 역순 hop. 빠른 내리기·단이 차 있으면(mid 점유) 한 번에 접근점으로 (3.1)
        this.stops = fast ? [] : viaWorld(S).filter((q) => q.y < a.y - 0.05).reverse().filter((q) => !propOccupant(q.key) || propOccupant(q.key) === a); }
      else if (this.ph === 1 && this.t >= (fast ? 0.1 : this.i ? 0.3 : 0.4) * HOP.slow) { this.ph = 2; const Q = this.stops[this.i];
        if (Q) startHop(a, Q.x, Q.z, Q.y, false, () => { this.ph = 1; this.t = 0; this.i++; a.setPose('crouch', { pupil: 0.9 }); });
        else startHop(a, S.ax, S.az, 0, !!fast, () => leaveDone(a)); }
      return false;
    }
    if (hopsIn(S) && sl.state === 'under') { // 상자에서 나오기: 앞벽 위로 도약 -> 벽 밖 접근점으로 내려앉기
      this.t += dt;
      if (this.ph === 0) { a.setPose('crouch', { pupil: 0.9, ...CRATE_TAIL }); a.yawTarget = Math.atan2(S.ax - a.x, S.az - a.z); this.ph = 1; this.t = 0; }
      else if (this.ph === 1 && this.t >= (fast ? 0.1 : 0.4) * HOP.slow) { this.ph = 2; const W = wallTop(S);
        startHop(a, W.x, W.z, CRATE_TOP, !!fast, () => { if (a.slot === sl) startHop(a, S.ax, S.az, 0, !!fast, () => leaveDone(a)); else leaveDone(a); }); }
      return false;
    }
    if (this.ph === 0) { this.ph = 1; a.setPose(lowPose(S)); a.moveTo(S.ax, S.az, fast ? 2.0 : 0.5, { keepPose: true, timeout: 12 }); return false; }
    if (a.arrived) { leaveDone(a); return true; }
    return false;
  } }; },
};
// 지점에 있으면 떠나는 단계들 (행동이 바뀔 때 앞에 붙인다)
export const leaveSteps = (a, fast) => (a.slot ? [PS.dismount(fast)] : []);

// ── 그 자리 반응 (4A-2): 지점 위·아래에서 쓰다듬기·츄르를 받으면 내려오지 않고 몸짓만. 거부 연속 2회 넘으면 전환 ──
export function slotReactSteps(a, k) {
  const sl = a.slot; if (!sl || sl.state === 'rising' || sl.state === 'entering' || a.hop) return null;
  const m = pmOf(a), pol = (REACT_META[k] || { pol: 0 }).pol, rest = sl.state === 'on' ? 'lie' : (sl.S.slot.rest || 'peek');
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
// 막힌 접근점은 approach()가 쿨다운을 걸어 pickSlot에서 빠지므로, 다음 지점으로 넘어가 다시 고른다 (M5-4). 모두 막히면 null
function pickApproach(a, action, opt) {
  for (let S = pickSlot(a, action, opt); S; S = pickSlot(a, action, opt)) { const ap = approach(a, S); if (ap) return { S, ap }; }
  return null;
}
const crateSitStep = (r, d) => STEP.pose(...(r() < 0.3 ? ['loaf', d, CRATE_TAIL_LOAF] : ['sit', d, CRATE_TAIL]), (a, t) => { if (Math.floor(t * 0.25) !== a._lk) { a._lk = Math.floor(t * 0.25); a.lookRandom(); } if (a.r() < 0.004) a.slowBlink(); });
export const PROP_ACTIONS = {
  hoodLoaf: { label: '본네트에서 엎드린 중',
    score: (a) => { const S = pickSlot(a, 'hoodLoaf'); return S ? 0.30 + a.world.day * 0.55 + S.slot.warm * 0.4 + a.p.bold * 0.35 + (1 - a.E) * 0.3 : 0; },
    steps: (a, r) => {
      if (a.slot && a.slot.action === 'hoodLoaf') return [STEP.pose('lie', r.range(6, 20), null, lieFx), PS.dismount(false)]; // 반응 뒤 이어서
      const P = pickApproach(a, 'hoodLoaf');
      if (!P) return [STEP.pose('sit', 2)];
      const { S, ap } = P;
      return [...ap, PS.mount(S), STEP.pose('lie', r.range(10, 30), null, lieFx), PS.dismount(false)];
    } },
  wallLoaf: { label: '담 위에 엎드린 중', // 호기심은 성격값이 따로 없어 장난기(playful)로 대신한다 (설계 3장: 새 성격 값 없음)
    score: (a) => { const S = pickSlot(a, 'wallLoaf'); return S ? 0.25 + a.p.bold * 0.5 + a.p.playful * 0.5 + a.world.day * 0.3 : 0; },
    steps: (a, r) => {
      const alertLook = () => STEP.pose('alert', r.range(1.6, 3), null, (a) => { if (a.r() < 0.05) a.lookRandom(); }); // 가끔 두리번
      const lie = (d) => { const s = [STEP.pose('lie', d, null, lieFx)]; if (r() < 0.3) s.push(alertLook(), STEP.pose('lie', r.range(3, 8), null, lieFx)); return s; };
      if (a.slot && a.slot.action === 'wallLoaf') return [...lie(r.range(8, 20)), PS.dismount(false)]; // 반응 뒤 이어서
      const P = pickApproach(a, 'wallLoaf');
      if (!P) return [STEP.pose('sit', 2)];
      const { S, ap } = P;
      return [...ap, PS.mount(S), ...lie(r.range(15, 40)), PS.dismount(false)];
    } },
  crateSit: { label: '상자 안에 들어간 중', // 새끼·소심한 쪽 가중 ("상자 사랑"). 새끼도 들어간다(높이 제한 없음)
    score: (a) => { const S = pickSlot(a, 'crateSit'); if (!S) return 0; const v = 0.30 + (a.kitten ? 0.6 : 0) + (1 - a.p.bold) * 0.3 + a.p.playful * 0.2, g = a.world.gift;
      return g && S.prop.look === 'gift' ? v * (g.age < GIFT.newMs ? GIFT.multNew : GIFT.mult) : v; }, // 선물 상자: 배수 2.5(처음 15분 4)
    steps: (a, r) => {
      const sit = (d) => STEP.pose(...(r() < 0.3 ? ['loaf', d, CRATE_TAIL_LOAF] : ['sit', d, CRATE_TAIL]), (a, t) => { if (Math.floor(t * 0.25) !== a._lk) { a._lk = Math.floor(t * 0.25); a.lookRandom(); } if (a.r() < 0.004) a.slowBlink(); });
      if (a.slot && a.slot.action === 'crateSit') return [sit(r.range(5, 14)), PS.dismount(false)]; // 반응 뒤 이어서
      const P = pickApproach(a, 'crateSit');
      if (!P) return [STEP.pose('sit', 2)];
      const { S, ap } = P;
      return [...ap, PS.enter(S), STEP.pose('sit', 3, CRATE_TAIL), sit(r.range(10, 35)), PS.dismount(false)];
    } },
  // 선물 상자 (M6-5, 상자_놓기_설계 5-3): 호기심은 성격값이 없어 장난기로 대신한다(감정 편향은 EMO_BIAS curious)
  giftPeek: { label: '상자에서 빼꼼 내다보는 중',
    score: (a) => (pickSlot(a, 'crateSit', { gift: true, as: 'giftPeek' }) ? 0.2 + a.p.playful * 0.6 + (1 - a.p.bold) * 0.4 : 0),
    steps: (a, r) => {
      const peek = (d) => STEP.pose('peek', d, CRATE_TAIL_LOAF, (a, t) => { if (Math.floor(t * 0.3) !== a._lk) { a._lk = Math.floor(t * 0.3); a.lookRandom(); } });
      if (a.slot && a.slot.S.prop.look === 'gift') return [peek(r.range(3, 7)), PS.dismount(false)]; // 반응 뒤 이어서
      const P = pickApproach(a, 'crateSit', { gift: true, as: 'giftPeek' });
      if (!P) return [STEP.pose('sit', 2)];
      const { S, ap } = P, tail = r() < 0.5 ? [crateSitStep(r, r.range(5, 12))] : []; // 빼꼼 뒤 앉거나 바로 나옴
      return [...ap, PS.enter(S), STEP.pose('crouch', 1.5, CRATE_TAIL), peek(r.range(4, 10)), ...tail, PS.dismount(false)];
    } },
  giftSniff: { label: '상자 냄새를 맡는 중', // 놓인 뒤 첫 결정·처음 15분·고양이당 1회(첫 결정만이라 자동으로 1회)
    score: (a) => { const g = a.world.gift; return g && g.first && g.age < GIFT.newMs && pickSlot(a, 'crateSit', { gift: true, as: 'giftSniff' }) ? 1.6 : 0; },
    steps: (a, r) => {
      const P = pickApproach(a, 'crateSit', { gift: true, as: 'giftSniff' });
      if (!P) return [STEP.pose('sit', 2)];
      const { S, ap } = P, sniff = STEP.pose('crouch', 3, { np: 0.1, hdp: -0.05 }, (a, t) => { a.ov.hdp = Math.sin(t * 16) * 0.025; });
      const o = r(); // 냄새 뒤: 들어가 앉기 / 빼꼼 / 그냥 떠남
      if (o < 0.3) return [...ap, sniff, STEP.pose('sit', 2)];
      const inner = o < 0.65 ? crateSitStep(r, r.range(8, 20)) : STEP.pose('peek', r.range(4, 9), CRATE_TAIL_LOAF);
      return [...ap, sniff, PS.enter(S), STEP.pose('crouch', 1.5, CRATE_TAIL), inner, PS.dismount(false)];
    } },
  underHide: { label: '차 밑에 숨은 중',
    score: (a) => (pickSlot(a, 'underHide') ? 0.12 + (1 - a.p.bold) * 0.9 + (1 - a.p.social) * 0.5 : 0),
    steps: (a, r) => {
      const peek = (d) => STEP.pose('peek', d, null, (a, t) => { if (Math.floor(t * 0.3) !== a._lk) { a._lk = Math.floor(t * 0.3); a.lookRandom(); } });
      if (a.slot && a.slot.action === 'underHide') return [peek(r.range(5, 15)), PS.dismount(false)];
      const P = pickApproach(a, 'underHide');
      if (!P) return [STEP.pose('sit', 2)];
      const { S, ap } = P;
      return [...ap, PS.enter(S), STEP.pose('hideLow', 3), peek(r.range(10, 32)), STEP.pose('hideLow', 2), PS.dismount(false)];
    } },
  // 캣타워 (M8-1, 설계 3.2): 새 성격 값 없음(호기심은 장난기 대용). 이동은 기존 mount/enter 그대로, via 연속 hop 은 M8-2 에서 STEP.mount 가 slot.via 로 줄 세운다
  towerLookout: { label: '캣타워 꼭대기에서 망보는 중',
    score: (a) => { const S = pickSlot(a, 'towerLookout'); return S ? 0.20 + a.p.bold * 0.5 + a.p.playful * 0.4 + a.world.day * 0.3 : 0; },
    steps: (a, r) => {
      const look = (d) => STEP.pose('sit', d, null, (a, t) => { if (Math.floor(t / 8) !== a._lk) { a._lk = Math.floor(t / 8); a.lookRandom(); } if (a.r() < 0.004) a.slowBlink(); }); // 6~10초마다 두리번
      if (a.slot && a.slot.action === 'towerLookout') return [look(r.range(8, 20)), PS.dismount(false)];
      const P = pickApproach(a, 'towerLookout');
      if (!P) return [STEP.pose('sit', 2)];
      return [...P.ap, PS.mount(P.S), look(r.range(15, 40)), PS.dismount(false)];
    } },
  towerLie: { label: '캣타워에서 엎드린 중',
    score: (a) => { const S = pickSlot(a, 'towerLie'); return S ? 0.25 + a.world.day * 0.4 + S.slot.warm * 0.4 + (1 - a.E) * 0.3 : 0; },
    steps: (a, r) => {
      if (a.slot && a.slot.action === 'towerLie') return [STEP.pose('lie', r.range(8, 20), null, lieFx), PS.dismount(false)];
      const P = pickApproach(a, 'towerLie');
      if (!P) return [STEP.pose('sit', 2)];
      return [...P.ap, PS.mount(P.S), STEP.pose('lie', r.range(15, 40), null, lieFx), PS.dismount(false)];
    } },
  towerDen: { label: '캣타워 집에 숨은 중', // 새끼도 들어간다(높이 제한 없음)
    score: (a) => { const S = pickSlot(a, 'towerDen'); return S ? 0.15 + (1 - a.p.bold) * 0.6 + (a.kitten ? 0.5 : 0) + (1 - a.world.day) * 0.3 : 0; },
    steps: (a, r) => {
      const peek = (d) => STEP.pose('peek', d, null, (a, t) => { if (Math.floor(t * 0.3) !== a._lk) { a._lk = Math.floor(t * 0.3); a.lookRandom(); } });
      if (a.slot && a.slot.action === 'towerDen') return [peek(r.range(5, 15)), PS.dismount(false)];
      const P = pickApproach(a, 'towerDen');
      if (!P) return [STEP.pose('sit', 2)];
      return [...P.ap, PS.enter(P.S), STEP.pose('loaf', r.range(10, 30), null, lieFx), peek(r.range(3, 8)), PS.dismount(false)];
    } },
};
export function registerPropActions(on) {
  if (on) Object.assign(ACTIONS, PROP_ACTIONS); else for (const k of PROP_ACTION_KEYS) delete ACTIONS[k];
}
