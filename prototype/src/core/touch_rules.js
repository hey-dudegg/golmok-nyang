// core/touch_rules.js: 고양이 말 해석과 교감 반응 규칙 (원래 index.html 65_caps 구역의 순수 계산, D-30·D-33 단계 2)
// 극성 표(EMO_POL·REACT_META·THOUGHTS)·손길 선호(touchType)·규칙 엔진(ruleReaction·resolveRule). 회원·유대(Bonds)·AI 호출(askCat)은 index.html 에 남는다.
import { clamp, lerp, makeRng } from './util.js';
// ── 고양이 말 해석 ──
export const CAT_WORDS = [
  { intent: 'fight', re: /라오+|니겅|우와+옹|와아+옹|으르+렁|크르+/, meaning: '싸움 걸기', trust: -0.15 },
  { intent: 'hiss', re: /하+악|캬+악|샤+악|햐+악|하아+악|쉬+익/, meaning: '경고 (하악질)', trust: -0.12 },
  { intent: 'calm', re: /그르+릉|골골|그릉|고르릉/, meaning: '편안함', trust: 0.05 },
  { intent: 'come', re: /마-*아|^마+$|이리|쮸+|쭈+쭈|츄츄|오라|와봐|나비야|냐아+$|^냐+아/, meaning: '이리 와', trust: 0.03 },
  { intent: 'question', re: /냐+옹\?|\?$|뭐해|뭐냥/, meaning: '궁금함', trust: 0.02 },
  { intent: 'greet', re: /^냥+[!~.]*$|^냐[!~.]*$|^야옹[!~.]*$|안녕|미야+|^먀+/, meaning: '인사', trust: 0.03 },
];
export function interpret(text) {
  const t = (text || '').trim();
  for (const w of CAT_WORDS) if (w.re.test(t)) return w;
  return { intent: 'unknown', meaning: '알 수 없는 울음', trust: 0 };
}
export const QUICK_WORDS = ['마-아', '냥', '냐옹?', '그르릉', '하악', '라오오- 니겅니겅니겅'];
export const PET_PARTS = [['head', '머리'], ['chin', '턱'], ['back', '등'], ['belly', '배']];

// ── 교감 반응 데이터 (D-30): 극성·감정·속마음·손길 선호를 이 블록 한 곳에 둔다 ──
// 극성: +1 긍정 / 0 중립 / -1 부정. 속마음 문구와 행동(반응)은 같은 극성끼리만 짝지어진다 (resolveRule, 검사: pp/b2_polarity.js)
export const EMO_POL = { happy: 1, calm: 1, playful: 1, curious: 0, lonely: 0, indifferent: 0, wary: -1, scared: -1, grumpy: -1 };
export const EMO_LABEL = { happy: '기쁨', calm: '편안', playful: '장난', curious: '호기심', indifferent: '무관심', wary: '경계', scared: '겁', grumpy: '짜증', lonely: '외로움' };
export const REACT_META = { // 행동의 극성(눈에 보이는 몸짓 기준)과 그때의 감정
  approach: { pol: 1, emo: 'happy' }, rub: { pol: 1, emo: 'happy' }, slow_blink: { pol: 1, emo: 'calm' }, tail_up: { pol: 1, emo: 'happy' },
  meow_back: { pol: 1, emo: 'happy' }, purr: { pol: 1, emo: 'calm' }, eat_churu: { pol: 1, emo: 'happy' }, roll_over: { pol: 1, emo: 'playful' },
  head_tilt: { pol: 0, emo: 'curious' }, ignore: { pol: 0, emo: 'indifferent' }, stare: { pol: 0, emo: 'curious' }, sniff_only: { pol: 0, emo: 'curious' },
  back_off: { pol: -1, emo: 'wary' }, flee: { pol: -1, emo: 'scared' }, hiss_back: { pol: -1, emo: 'grumpy' }, puff_side: { pol: -1, emo: 'scared' }, swat: { pol: -1, emo: 'grumpy' },
};
// 속마음 문구. pol·emo는 문구 자신의 극성/감정(행동에서 가져오지 않는다). acts: 이 교감에서만, part: 이 쓰다듬기 부위에서만
export const THOUGHTS = [
  { r: ['approach'], pol: 1, emo: 'happy', t: '불렀지? 가 볼게' }, { r: ['approach'], pol: 1, emo: 'happy', t: '가까이 가 봐도 되겠네' },
  { r: ['rub'], pol: 1, emo: 'happy', t: '이 사람 냄새, 내 거 해야지' }, { r: ['rub'], pol: 1, emo: 'happy', t: '여기 좋아, 더 해 줘', acts: ['pet'] },
  { r: ['slow_blink'], pol: 1, emo: 'calm', t: '…너 나쁜 사람 아니구나' }, { r: ['slow_blink'], pol: 1, emo: 'calm', t: '눈 깜빡깜빡, 마음이 편해' },
  { r: ['tail_up'], pol: 1, emo: 'happy', t: '어, 왔어? 반가워' }, { r: ['tail_up'], pol: 1, emo: 'happy', t: '꼬리 세우고 인사해야지' },
  { r: ['meow_back'], pol: 1, emo: 'happy', t: '불렀어? 왜애', acts: ['word'] }, { r: ['meow_back'], pol: 1, emo: 'happy', t: '대답해 줄게, 냐앙', acts: ['word'] },
  { r: ['purr'], pol: 1, emo: 'calm', t: '거기… 거기 좋아…' }, { r: ['purr'], pol: 1, emo: 'calm', t: '기분 좋아서 저절로 골골' },
  { r: ['eat_churu'], pol: 1, emo: 'happy', t: '츄르는 못 참지' }, { r: ['eat_churu'], pol: 1, emo: 'happy', t: '이거 맛있다, 더 줘' },
  { r: ['roll_over'], pol: 1, emo: 'playful', t: '배 보여주는 건 특별히다', part: ['belly'] }, { r: ['roll_over'], pol: 1, emo: 'playful', t: '너니까 보여주는 거야', part: ['belly'] },
  { r: ['head_tilt'], pol: 0, emo: 'curious', t: '무슨 소리야 그게', acts: ['word'] }, { r: ['head_tilt'], pol: 0, emo: 'curious', t: '음? 뭐라는 거지', acts: ['word'] }, { r: ['head_tilt'], pol: 0, emo: 'curious', t: '어? 뭘 하려는 거야', acts: ['pet'] },
  { r: ['ignore'], pol: 0, emo: 'indifferent', t: '못 들은 척해야지', acts: ['word'] }, { r: ['ignore'], pol: 0, emo: 'indifferent', t: '지금은 별 관심 없어' }, { r: ['ignore'], pol: 0, emo: 'indifferent', t: '만지든 말든…', acts: ['pet'] },
  { r: ['stare'], pol: 0, emo: 'curious', t: '…' }, { r: ['stare'], pol: 0, emo: 'curious', t: '뭐 하는 사람이지' },
  { r: ['sniff_only'], pol: 0, emo: 'curious', t: '수상한 냄새… 일단 보류' }, { r: ['sniff_only'], pol: 0, emo: 'curious', t: '먹어도 되나… 일단 킁킁' },
  { r: ['back_off'], pol: -1, emo: 'wary', t: '너무 가까워' }, { r: ['back_off'], pol: -1, emo: 'wary', t: '아직은 만지지 마', acts: ['pet'] }, { r: ['back_off'], pol: -1, emo: 'wary', t: '거긴 안 돼, 비켜', acts: ['pet'], part: ['belly'] }, { r: ['back_off'], pol: -1, emo: 'wary', t: '츄르라도 아직은 못 믿어', acts: ['churu'] },
  { r: ['flee'], pol: -1, emo: 'scared', t: '으악 도망!' }, { r: ['flee'], pol: -1, emo: 'scared', t: '무서워, 숨어야지' },
  { r: ['hiss_back'], pol: -1, emo: 'grumpy', t: '감히 나한테!' }, { r: ['hiss_back'], pol: -1, emo: 'grumpy', t: '건드리지 마!', acts: ['pet'] },
  { r: ['puff_side'], pol: -1, emo: 'scared', t: '나 커 보이지? 무섭지?' },
  { r: ['swat'], pol: -1, emo: 'grumpy', t: '배는 안 된다고 했지', acts: ['pet'], part: ['belly'] }, { r: ['swat'], pol: -1, emo: 'grumpy', t: '손 치워, 싫어', acts: ['pet'] },
];
export function pickThought(r, reaction, act) {
  const M = REACT_META[reaction] || REACT_META.stare;
  const ok = THOUGHTS.filter((x) => x.r.includes(reaction) && x.pol === M.pol && (!x.acts || x.acts.includes(act.kind)) && (!x.part || (act.kind === 'pet' && x.part.includes(act.part))));
  if (!ok.length) return null;
  return r.weighted(ok.map((x) => [x, x.part ? 3 : 1]));
}
// 손길 선호 (D-30): 고양이마다 결정적으로 정해진다 (고양이 id 해시 + 성격, 새로고침해도 같다). 개냥이는 약 20%.
export const TOUCH_TYPES = { dog: '개냥이', tolerant: '참아줌', aloof: '무관심', wary: '경계', avoid: '피함' };
export function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
export function touchType(id, p) {
  const g = makeRng(String(id) + ':touch').gauss();
  const L = 0.8 * g + 0.6 * (p.social - 0.5) / 0.22 - 0.4 * (p.grumpy - 0.5) / 0.22; // 분산 약 1.16
  const q = 0.5 * (1 + erf(L / 1.077 / Math.SQRT2)); // 0~1 분위
  return q > 0.83 ? 'dog' : q > 0.58 ? 'tolerant' : q > 0.43 ? 'aloof' : q > 0.17 ? 'wary' : 'avoid';
}
// 쓰다듬기 부위별 [긍정, 중립, 부정] 비율: 신뢰 0일 때 -> 신뢰 1일 때 (신뢰가 쌓이면 허용 쪽으로 옮겨 간다)
export const PET_PREF = {
  dog:      { head: [[.75, .15, .10], [.92, .07, .01]], chin: [[.80, .12, .08], [.94, .05, .01]], back: [[.65, .20, .15], [.86, .10, .04]], belly: [[.08, .20, .72], [.30, .20, .50]] },
  tolerant: { head: [[.15, .55, .30], [.45, .45, .10]], chin: [[.20, .50, .30], [.55, .40, .05]], back: [[.08, .50, .42], [.30, .55, .15]], belly: [[0, .10, .90], [.05, .25, .70]] },
  aloof:    { head: [[.03, .80, .17], [.20, .75, .05]], chin: [[.05, .75, .20], [.30, .65, .05]], back: [[.02, .80, .18], [.12, .80, .08]], belly: [[0, .20, .80], [.03, .40, .57]] },
  wary:     { head: [[0, .20, .80], [.12, .50, .38]], chin: [[.02, .20, .78], [.20, .50, .30]], back: [[0, .20, .80], [.08, .50, .42]], belly: [[0, .05, .95], [.02, .20, .78]] },
  avoid:    { head: [[0, .10, .90], [.05, .35, .60]], chin: [[0, .10, .90], [.10, .40, .50]], back: [[0, .10, .90], [.03, .35, .62]], belly: [[0, 0, 1], [0, .10, .90]] },
};
// 츄르를 먹을 확률 = 기본 + 신뢰 x 증가분 + 식탐 보정 (먹지 않으면 냄새만 맡거나 물러난다)
export const CHURU_PREF = { dog: [.85, .10], tolerant: [.72, .22], aloof: [.62, .30], wary: [.35, .55], avoid: [.15, .62] };
export const WORD_POS = { dog: 1, tolerant: 0.55, aloof: 0.25, wary: 0.2, avoid: 0.1 }; // 고양이 말에 긍정으로 답할 정도
export function petPolarityWeights(type, part, trust) {
  const t = clamp(trust, 0, 1), tab = PET_PREF[type][part] || PET_PREF[type].head;
  return [0, 1, 2].map((i) => lerp(tab[0][i], tab[1][i], t));
}
export function ruleReaction(a, act, trust) {
  const p = a.p, r = a.r, type = touchType(a.cat.id, p), tr = clamp(trust, 0, 1);
  const pick = (pairs) => r.weighted(pairs.filter((x) => x[1] > 0));
  switch (act.kind) {
    case 'pet': {
      const w = petPolarityWeights(type, act.part, tr);
      const pol = r.weighted([[1, w[0] * (0.8 + 0.4 * p.social)], [0, w[1]], [-1, w[2] * (0.8 + 0.4 * p.grumpy)]]);
      if (pol > 0) return act.part === 'belly' ? 'roll_over' : pick([['purr', 1.4 + tr], ['rub', 0.3 + p.social * 2], ['slow_blink', 1], ['tail_up', 0.2 + p.social]]);
      if (pol === 0) return pick([['ignore', 1 + (1 - p.social)], ['stare', 1], ['head_tilt', 0.4]]);
      const shy = (1 - p.bold) * (1 - tr);
      return act.part === 'belly'
        ? pick([['swat', 1.5 + p.grumpy * 2], ['back_off', 0.8], ['hiss_back', p.grumpy * 1.5], ['flee', shy]])
        : pick([['back_off', 2], ['flee', shy * 2], ['swat', 0.3 + p.grumpy], ['hiss_back', p.grumpy * 1.5], ['puff_side', p.bold * 0.5]]);
    }
    case 'churu': {
      const [b0, gain] = CHURU_PREF[type];
      const pe = clamp(b0 + gain * tr + 0.3 * (p.food - 0.5), 0.05, 0.98);
      if (r() < pe) return 'eat_churu';
      const shy = (1 - p.bold) * (1 - tr);
      return pick([['sniff_only', 1 + (1 - p.food)], ['back_off', shy * 2 + (type === 'avoid' ? 1 : 0)]]);
    }
    case 'word': {
      const i = act.word.intent, pf = WORD_POS[type];
      if (i === 'come') return ((p.social * 0.6 + tr * 0.6 + p.bold * 0.3) * (0.5 + 0.65 * pf) > 0.72) ? pick([['approach', 2], ['tail_up', p.social * 2]]) : pick([['stare', 1], ['head_tilt', 1], ['ignore', 1 + p.grumpy]]);
      if (i === 'greet') return pick([['meow_back', 1.5 * pf], ['tail_up', p.social * pf], ['slow_blink', tr * 2 * pf], ['ignore', p.grumpy + 0.4], ['stare', 0.5], ['head_tilt', 0.5]]);
      if (i === 'question') return pick([['head_tilt', 2], ['meow_back', pf], ['stare', 0.5]]);
      if (i === 'calm') return pick([['slow_blink', 2 * pf], ['purr', tr * 2 * pf], ['stare', 0.5], ['ignore', 0.4], ['head_tilt', 0.4]]);
      if (i === 'hiss') return pick([['hiss_back', p.grumpy * 2.5], ['back_off', 1.2], ['flee', (1 - p.bold) * 2], ['puff_side', p.bold]]);
      if (i === 'fight') return pick([['puff_side', p.bold * 2 + p.grumpy], ['hiss_back', p.grumpy * 2], ['flee', (1 - p.bold) * 2.5]]);
      return pick([['head_tilt', 1.5], ['stare', 1], ['ignore', 1]]);
    }
  }
  return 'stare';
}
export const TRUST_D = { purr: 0.07, rub: 0.09, slow_blink: 0.06, tail_up: 0.06, eat_churu: 0.12, sniff_only: 0.02, approach: 0.04, meow_back: 0.03, head_tilt: 0.01, roll_over: 0.06, ignore: 0, stare: 0, back_off: -0.03, flee: -0.06, hiss_back: -0.08, puff_side: -0.06, swat: -0.02 };
// 규칙 엔진 한 번 실행: 반응 + 같은 극성의 속마음 + 감정을 함께 돌려준다 (검사 스크립트도 이 함수를 쓴다)
export function resolveRule(a, act, trust) {
  const reaction = ruleReaction(a, act, trust), M = REACT_META[reaction];
  const line = pickThought(a.r, reaction, act);
  return { reaction, thought: line ? line.t : '…', thoughtPol: line ? line.pol : null, thoughtEmo: line ? line.emo : null, pol: M.pol, emo: M.emo, trust_delta: TRUST_D[reaction] || 0, by: 'rule' };
}
