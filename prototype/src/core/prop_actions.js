// core/prop_actions.js: 오브젝트 행동(본네트 엎드리기·차 밑 숨기)의 단계·도약·점수 (M3-6 O1, 설계 3·4·4A장)
// 에이전트(CatAgent) 객체만 만진다(three 없음). 켜고 끄기는 registerPropActions(on)로 ACTIONS 표에 넣고 뺀다 (D-120 기능 스위치).
// 4A 규칙: 접근점까지 걸어서 간다 / 높이(a.y) 변화는 도약(a.hop) 뿐 / 반응은 그 자리에서 / 쿨다운 90초 / 최근 3개 행동 반복 금지.
import { ACTIONS, REACTIONS, STEP } from './behavior.js';
import { REACT_META } from './touch_rules.js';
import { GIFT, PROP_ACTION_KEYS, propRelease } from './props.js';
import { clamp, damp, lerp } from './util.js';
import { CRATE_TAIL, CRATE_TAIL_LOAF, HOP, PS, approach, noteAct, pickApproach, pickSlot, pmOf } from './prop_common.js';
import { MORE_ACTIONS, crateExit } from './prop_actions_more.js'; // 25KB 넘어 나눈 새 행동 (M23-2a)
export { HOP, PS, approach, noteAct, pickApproach, pickSlot, pmOf, CRATE_TAIL }; // 공용 도우미는 prop_common.js (외부 import 경로 유지)

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
      if (a.slot && a.slot.action === 'crateSit') return [sit(r.range(5, 14)), ...crateExit(a, r)]; // 반응 뒤 이어서
      const P = pickApproach(a, 'crateSit');
      if (!P) return [STEP.pose('sit', 2)];
      const { S, ap } = P;
      return [...ap, PS.enter(S), STEP.pose('sit', 3, CRATE_TAIL), sit(r.range(10, 35)), ...crateExit(a, r)];
    } },
  crateNap: { label: '상자 안에서 자는 중', // 상자 안 잠 (M12-2): crateSit 자리 규칙(pickSlot·쿨다운)을 그대로 따른다. 이미 들어가 있으면 이어서 잔다
    stay: (a) => a.slot.action === 'crateSit', // runAction: 이 조건이면 먼저 내려오지 않고 이어 감(steps 의 이어서 분기와 같은 조건, R-24)
    score: (a) => { const S = a.slot && a.slot.action === 'crateSit' ? { slot: {} } : pickSlot(a, 'crateSit', { as: 'crateNap' }); return S ? 0.08 + (a.kitten ? 0.1 : 0) + (1 - a.E) * 0.3 + (1 - a.world.day) * 0.1 : 0; },
    steps: (a, r) => {
      const nap = (d) => [STEP.pose('loaf', 2, CRATE_TAIL_LOAF), STEP.pose(r() < 0.5 ? 'curl' : 'loaf', d, CRATE_TAIL_LOAF, (a, t, dt) => { a.E = Math.min(1, a.E + dt * 0.04); }), STEP.pose('loaf', 1.2, CRATE_TAIL_LOAF)];
      if (a.slot && a.slot.action === 'crateSit') return [...nap(r.range(15, 35)), ...crateExit(a, r, -0.05)];
      const P = pickApproach(a, 'crateSit', { as: 'crateNap' });
      if (!P) return [STEP.pose('sit', 2)];
      const { S, ap } = P;
      return [...ap, PS.enter(S), STEP.pose('sit', 2, CRATE_TAIL), ...nap(r.range(18, 40)), ...crateExit(a, r, -0.05)];
    } },
  // 선물 상자 (M6-5, 상자_놓기_설계 5-3): 호기심은 성격값이 없어 장난기로 대신한다(감정 편향은 EMO_BIAS curious)
  giftPeek: { label: '상자에서 빼꼼 내다보는 중',
    stay: (a) => a.slot.S.prop.look === 'gift', // 위 crateNap.stay 와 같음 (R-24)
    score: (a) => (pickSlot(a, 'crateSit', { gift: true, as: 'giftPeek' }) ? 0.2 + a.p.playful * 0.6 + (1 - a.p.bold) * 0.4 : 0),
    steps: (a, r) => {
      const peek = (d) => STEP.pose('peek', d, CRATE_TAIL_LOAF, (a, t) => { if (Math.floor(t * 0.3) !== a._lk) { a._lk = Math.floor(t * 0.3); a.lookRandom(); } });
      if (a.slot && a.slot.S.prop.look === 'gift') return [peek(r.range(3, 7)), ...crateExit(a, r, 0.12)]; // 반응 뒤 이어서
      const P = pickApproach(a, 'crateSit', { gift: true, as: 'giftPeek' });
      if (!P) return [STEP.pose('sit', 2)];
      const { S, ap } = P, tail = r() < 0.5 ? [crateSitStep(r, r.range(5, 12))] : []; // 빼꼼 뒤 앉거나 바로 나옴
      return [...ap, PS.enter(S), STEP.pose('crouch', 1.5, CRATE_TAIL), peek(r.range(4, 10)), ...tail, ...crateExit(a, r, 0.12)];
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
      return [...ap, sniff, PS.enter(S), STEP.pose('crouch', 1.5, CRATE_TAIL), inner, ...crateExit(a, r, 0.12)];
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
  if (on) Object.assign(ACTIONS, PROP_ACTIONS, MORE_ACTIONS); else for (const k of PROP_ACTION_KEYS) delete ACTIONS[k];
}
