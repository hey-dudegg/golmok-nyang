// core/prop_actions_more.js: prop_actions.js 가 25KB 를 넘어 나눈 새 지점 행동 (M23, 별행동 설계 2장)
// registerPropActions 가 PROP_ACTIONS 와 함께 ACTIONS 에 넣고 뺀다. 순환 import 는 호출 때만 쓰므로 안전하다.
import { STEP } from './behavior.js';
import { pickSlot, pickApproach, PS, HOP, CRATE_TAIL } from './prop_common.js';
import { clamp } from './util.js';

const HIDE_NEAR = 3.0, FLEE_SPEED = 3.2;
const lookFx = (a, t) => { if (Math.floor(t * 0.3) !== a._lk) { a._lk = Math.floor(t * 0.3); a.lookRandom(); } };
const startle = (r) => STEP.pose('crouch', r.range(0.35, 0.6), { eL: 0.85, eR: 0.85, pupil: 1, puff: 0.6, tb: -0.3, tw: 0 });
// 숨을 곳 후보: 차 밑·캣타워 굴 중 접근점이 가까운 순. 시계 문맥(위치 없음)은 존재만 본다
const hideCands = (a) => ['underHide', 'towerDen'].map((act) => ({ act, S: pickSlot(a, act, { as: 'fleeHide' }) })).filter((c) => c.S);

// 상자 뛰쳐나오기 (M23-2b, 설계 3장): 상자 행동 끝맺음. HOP.bolt null=확률대로, 1=항상, 0=안 함
const boltSteps = (a, r) => { const s = [STEP.track('crouch', r.range(0.4, 0.8), { pupil: 1, eL: 0.1, eR: 0.1, ...CRATE_TAIL }, { hp: [[0, 0], [0.15, -0.06], [0.3, 0]] }, { period: 0.3 }), PS.dismount(true)];
  for (let i = r.int(2, 3); i > 0; i--) { const p = a.randomPoint(r, 2.4); s.push(STEP.walk(p.x, p.z, 3.2)); }
  return [...s, STEP.pose('stand', 0.6), STEP.pose('sit', 2)]; };
export const crateExit = (a, r, pAdd = 0) => { const p = HOP.bolt ?? clamp(0.08 + a.p.playful * 0.3 + (a.kitten ? 0.15 : 0) + pAdd, 0, 0.55);
  return r() < p ? boltSteps(a, r) : [PS.dismount(false)]; };

// 담 위 앉기 (M23-3, 설계 5장): wallLoaf 슬롯 공유. 담 길이 방향으로 앉아 두리번, 가끔 엎드림. 꼬리는 담 밖으로 늘어뜨림
export const WALL_TAIL = { tb: -0.9, tc: 0.08, tcs: 0, ts: 0 };
const wallLook = (a, t) => { if (Math.floor(t / 8) !== a._lk) { a._lk = Math.floor(t / 8); a.lookRandom(); } if (a.r() < 0.004) a.slowBlink(); };
const wallLie = (a, t) => { if (a.r() < 0.003) a.slowBlink(); };

export const MORE_ACTIONS = {
  fleeHide: { label: '깜짝 놀라 숨는 중',
    score: (a) => (hideCands(a).length ? 0.04 + (1 - a.p.bold) * 0.12 + (a.kitten ? 0.05 : 0) : 0),
    steps: (a, r) => {
      const start = [STEP.call((a) => a.say('!')), startle(r)];
      const cs = hideCands(a).map((c) => ({ ...c, d: Math.hypot(c.S.ax - a.x, c.S.az - a.z) })).filter((c) => c.d <= HIDE_NEAR).sort((p, q) => p.d - q.d);
      for (const c of cs) { // 가까운 쪽부터, 접근점이 막혔으면 다음 후보
        const P = pickApproach(a, c.act, { as: 'fleeHide', speed: FLEE_SPEED }); if (!P) continue;
        const { S, ap } = P, low = c.act === 'underHide';
        return [...start, STEP.face(Math.atan2(S.ax - a.x, S.az - a.z)), ...ap, PS.enter(S), STEP.pose(low ? 'hideLow' : 'loaf', r.range(4, 8), { eL: 0.6, eR: 0.6, puff: 0.3 }),
          STEP.pose('peek', r.range(6, 15), null, lookFx), PS.dismount(false)];
      }
      const p = a.farFrom(a.world.youPoint()); // 숨을 곳이 막혔으면 멀어져 웅크림
      return [...start, STEP.walk(p.x, p.z, FLEE_SPEED), STEP.pose('crouch', 2, { eL: 0.6, eR: 0.6 })];
    } },
  wallSit: { label: '담 위에 앉아 구경하는 중',
    stay: (a) => a.slot.action === 'wallLoaf' && a.slot.state === 'on', // 엎드려 있다가 일어나 앉기 (내려오지 않음, R-24)
    score: (a) => { const S = a.slot && a.slot.action === 'wallLoaf' && a.slot.state === 'on' ? { slot: {} } : pickSlot(a, 'wallLoaf', { as: 'wallSit' }); return S ? 0.15 + a.p.bold * 0.3 + a.p.playful * 0.2 + a.world.day * 0.2 : 0; },
    steps: (a, r) => {
      const tail = [STEP.pose('sit', r.range(10, 25), WALL_TAIL, wallLook)]; if (r() < 0.35) tail.push(STEP.pose('lie', r.range(6, 15), null, wallLie));
      if (a.slot && a.slot.action === 'wallLoaf') return [...tail, PS.dismount(false)]; // 이어서
      const P = pickApproach(a, 'wallLoaf', { as: 'wallSit' });
      if (!P) return [STEP.pose('sit', 2)];
      return [...P.ap, PS.mount(P.S), ...tail, PS.dismount(false)];
    } },
};
