// core/prop_actions.js 와 prop_actions_more.js 가 함께 쓰는 지점 행동 공용 도우미 (M23 순환 import 해소: 도약·지점 고르기·단계 PS·접근)
// 에이전트(CatAgent) 객체만 만진다(three 없음). 단계 PS 는 도약 호·점유·쿨다운을 다룬다 (4A 규칙은 prop_actions.js 머리말).
import { STEP } from './behavior.js';
import { detour } from './detour.js';
import { CRATE, PROP_COOLDOWN, PROP_KINDS, TOWER_KEYS, propClaim, propOccupant, propRelease, propSlots, slotWorld } from './props.js';
import { clamp, lerp } from './util.js';

export const HOP = { slow: 1, speed: 0.7, fastSpeed: 1.0, bolt: null }; // bolt: null=확률대로·1=항상·0=안 함(촬영·어드민). slow: 어드민 "느리게 보기" 배수(1=보통, 4=4배 느리게)
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
export function startHop(a, x, z, y, fast, onEnd) {
  const dist = Math.hypot(x - a.x, z - a.z);
  const dur = Math.max(fast ? 0.4 : 0.55, dist / (fast ? HOP.fastSpeed : HOP.speed)) * HOP.slow;
  a.hop = { t: 0, dur, x0: a.x, z0: a.z, y0: a.y, x1: x, z1: z, y1: y, up: y > a.y, onEnd };
  if (dist > 0.05) a.yawTarget = Math.atan2(x - a.x, z - a.z);
  a.setPose('stand', { tb: 0.9, fls: -0.7, frs: -0.7, hls: 0.5, hrs: 0.5, eL: 0.1, eR: 0.1, pupil: 1 });
}
export function leaveDone(a) { // 지점에서 완전히 나왔을 때: 점유 해제·쿨다운·기록
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
export const CRATE_TAIL = { tb: 2.0, tc: 0.0, tcs: 0.1 }; // sit 은 엉덩이가 눕는 자세(hp -0.62)라 그만큼 더 세워야 수직에 가깝다
export const CRATE_TAIL_LOAF = { tb: 1.3, tc: 0.05, tcs: 0.1 };
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

export function approach(a, S, speed = 1.1) {
  if (a.world.blocked(S.ax, S.az, 0.2)) { pmOf(a).cool[S.key] = a.time + PROP_COOLDOWN; return null; }
  const k = 0.26 * (0.65 + 0.35 * a.scale) * speed, tmo = (p, q) => Math.hypot(q.x - p.x, q.z - p.z) / k * 2 + 3; // 제한 시간(4A-1)
  const wps = detour(a.world.obstacles || [], a, { x: S.ax, z: S.az }, { skip: a.layer, ok: (x, z) => !a.world.blocked(x, z, 0.2) }) || []; // 소품 모서리 우회 (M24-2b)
  const pts = [a, ...wps, { x: S.ax, z: S.az }];
  return [...pts.slice(1).map((p, i) => STEP.walk(p.x, p.z, speed, { timeout: tmo(pts[i], p) })), PS.check(S)];
}
// 막힌 접근점은 approach()가 쿨다운을 걸어 pickSlot에서 빠지므로, 다음 지점으로 넘어가 다시 고른다 (M5-4). 모두 막히면 null
export function pickApproach(a, action, opt) {
  for (let S = pickSlot(a, action, opt); S; S = pickSlot(a, action, opt)) { const ap = approach(a, S, (opt && opt.speed) || 1.1); if (ap) return { S, ap }; }
  return null;
}
