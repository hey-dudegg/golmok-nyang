// 행동 레시피(검증을 통과한 값) -> 행동 엔진의 행동 객체로 바꾸기 (R-14). 순수 계산, 화면·저장소 없음
// 검증은 recipe_rules.js, 저장·켜기는 state/recipes.js
import { BOUNDS, STEP } from './behavior.js';
import { RLIM, RPOSE } from './recipe_rules.js';
import { clamp } from './util.js';

// ───────────────────────── 행동 레시피 (R-14, 설계 8장, 안내: docs/design/숏츠_행동_가져오기_안내.md) ─────────────────────────
// 숏츠를 보고 AI가 정리한 JSON을 붙여 넣으면, 정해진 단어·숫자 범위만 받아 행동 엔진(ACTIONS)의 새 행동으로 등록한다.
// 붙여 넣은 글은 코드로 실행하지 않는다(eval·Function 없음). 모르는 항목·범위를 넘는 값·너무 큰 입력은 모두 거절하고,
// 검증을 통과한 값만 새 객체로 옮겨 쓴다(원본 객체를 그대로 쓰지 않음 → 프로토타입 오염 불가).
// 이 단어 목록을 바꾸면 안내 문서의 프롬프트와 어드민의 '프롬프트 복사'도 함께 바뀐다(recipePrompt가 이 표에서 만든다).
export const RECIPE_EMO = { 편안: ['calm'], 호기심: ['curious'], 신남: ['playful', 'happy'], 애정: ['happy', 'lonely'], 경계: ['wary'], 두려움: ['scared'], 짜증: ['grumpy'], 졸림: ['calm'] };
// 레시피 한 단계 → 자세 덧값(ex)·순간 호출(pre)·매 프레임 덧값(fx). 단어마다 정해진 값만 쓰고 레시피의 글은 값으로 쓰지 않는다.
export function recipeStepParts(s) {
  const ex = {}, pre = [], fx = [];
  const E = { forward: [0, 0], side: [0.45, 0.45], back_flat: [1, 1], one_back: [0, 0.95] };
  if (s.ears && E[s.ears]) { ex.eL = E[s.ears][0]; ex.eR = E[s.ears][1]; }
  if (s.ears === 'swivel') fx.push((a, t) => { a.ov.eL = 0.3 + Math.sin(t * 5) * 0.3; a.ov.eR = 0.3 + Math.sin(t * 5 + 2) * 0.3; });
  const EY = { open: 1, half_closed: 0.45, closed: 0, wide: 1 };
  if (s.eyes && EY[s.eyes] !== undefined) ex.eye = EY[s.eyes];
  if (s.eyes === 'wide' && !s.pupil) ex.pupil = 0.9;
  if (s.eyes === 'slow_blink') pre.push((a) => a.slowBlink());
  const PU = { small: 0.2, normal: 0.55, large: 0.95 };
  if (s.pupil && PU[s.pupil] !== undefined) ex.pupil = PU[s.pupil];
  const TL = { up: { tb: 1.3, tc: -0.03, tw: 0.06 }, up_hook: { tb: 1.3, tc: 0.35, tw: 0.06 }, low: { tb: -0.12, tc: 0.02 }, puff: { tb: 0.95, puff: 1, tw: 0.12 },
    wrap: { tb: -0.1, tc: 0, tcs: 0.6, ts: 0.9, tw: 0.03 }, flick: { tw: 0.55, twf: 3.2 }, lash: { tb: 0.4, tw: 0.95, twf: 5.5 } };
  if (s.tail && TL[s.tail]) Object.assign(ex, TL[s.tail]);
  const ease = (t) => Math.min(1, t / 0.4);
  if (s.head === 'tilt_left') fx.push((a, t) => { a.ov.hdr = 0.42 * ease(t); });
  if (s.head === 'tilt_right') fx.push((a, t) => { a.ov.hdr = -0.42 * ease(t); });
  if (s.head === 'look_up') fx.push((a, t) => { a.ov.hdp = -0.45 * ease(t); });
  if (s.head === 'look_down') fx.push((a, t) => { a.ov.hdp = 0.4 * ease(t); });
  if (s.head === 'rub_left' || s.head === 'rub_right') { const sg = s.head === 'rub_left' ? 1 : -1; fx.push((a, t) => { a.ov.hdr = sg * (0.2 + Math.sin(t * 3.2) * 0.38) * ease(t); a.ov.hy = sg * Math.sin(t * 3.2) * 0.12; }); }
  const SND = { meow: ['냥', 0.6], trill: ['르르릉', 0.35], purr: ['그르릉', 0.1], hiss: ['하악!', 0.9], yowl: ['냐아오오', 0.9] };
  if (s.sound && SND[s.sound]) { const [word, open] = SND[s.sound]; pre.push((a) => a.say(word)); fx.push((a, t) => { if (t < 0.8) a.ov.mouth = Math.sin(t / 0.8 * Math.PI) * open; }); }
  return { ex, pre, fx };
}
// 레시피 한 단계가 엔진을 깨뜨리지 않게: 예외가 나면 그 레시피를 끄고 단계를 마친다
export function recipeGuard(step, onFail) {
  let bad = false;
  return { start(a) { try { step.start(a); } catch (e) { bad = true; onFail(e); } }, tick(a, dt) { if (bad) return true; try { return step.tick(a, dt); } catch (e) { bad = true; onFail(e); return true; } } };
}
export function recipeToAction(id, R, onFail) {
  const emos = R.when.emotion || [], need = R.when.need, sleepy = emos.includes('졸림');
  const fail = (e) => { if (onFail) onFail(e); };
  return {
    label: R.name, recipe: true,
    score(a) {
      try {
        let s = 0.35;
        if (need === '에너지 높음') s += 0.5 * a.E; else if (need === '에너지 낮음') s += 0.5 * (1 - a.E);
        else if (need === '지루함 높음') s += 0.5 * a.B; else if (need === '안심 높음') s += 0.4 * a.p.bold; else if (need === '안심 낮음') s += 0.4 * (1 - a.p.bold);
        else if (need === '배고픔 높음') s += 0.3 * a.p.food;
        if (sleepy) s += 0.4 * (1 - a.E);
        return Number.isFinite(s) ? clamp(s, 0, 1.6) : 0;
      } catch (e) { fail(e); return 0; }
    },
    steps(a, r) {
      try {
        const out = [], carry = {}; let cur = 'sit';
        const G = (st) => recipeGuard(st, fail);
        R.steps.forEach((s, i) => {
          const end = i + 1 < R.steps.length ? R.steps[i + 1].t : R.duration_s, dur = clamp(end - s.t, 0.4, RLIM.durMax);
          switch (s.move) { // 이동 (몸동작이 없는 단어는 건너뛴다)
            case 'walk': { const p = a.randomPoint(r, 1.0); out.push(G(STEP.walk(p.x, p.z, 1, { timeout: 8 }))); break; }
            case 'trot': { const p = a.randomPoint(r, 1.6); out.push(G(STEP.walk(p.x, p.z, 1.8, { timeout: 8 }))); break; }
            case 'run': { const p = a.randomPoint(r, 2.0); out.push(G(STEP.walk(p.x, p.z, 3.2, { timeout: 8 }))); break; }
            case 'to:wall': { const x = clamp(a.x + r.range(-0.8, 0.8), BOUNDS.x0, BOUNDS.x1), z = BOUNDS.z0 + 0.1; const p = a.world.blocked(x, z, 0.2) ? a.randomPoint(r, 1.0) : { x, z }; out.push(G(STEP.walk(p.x, p.z, 1, { timeout: 8 }))); break; }
            case 'to:you': { const [x, z] = a.nearYou(0.6); out.push(G(STEP.walk(x, z, 1, { timeout: 8 })), G(STEP.faceYou())); break; }
            case 'pounce': out.push(G(STEP.call((a2) => a2.pounce(0.35))), G(STEP.wait(0.75))); break;
            default: break;
          }
          const pn = s.pose && RPOSE[s.pose]; if (pn) cur = pn;
          const { ex, pre, fx } = recipeStepParts(s); Object.assign(carry, ex);
          for (const f of pre) out.push(G(STEP.call(f)));
          out.push(G(STEP.pose(cur, dur, { ...carry }, fx.length ? (a2, t, dt) => { for (const f of fx) f(a2, t, dt); } : null)));
        });
        return out;
      } catch (e) { fail(e); return [STEP.wait(0.1)]; }
    },
    emoBias: Object.fromEntries(emos.flatMap((e) => RECIPE_EMO[e] || []).map((k) => [k, 0.9])),
  };
}
