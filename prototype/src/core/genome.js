// core/genome.js: 무늬·눈·성격·이름과 지역 마스코트 생성 (원래 index.html 30_genome 구역, D-33 단계 2)
// 같은 시드 -> 같은 고양이(결정적). three 대신 core/color.js 의 mixHex 로 눈 색을 섞는다(three.js 0.160 Color 와 같은 계산).
import { clamp, makeRng } from './util.js';
import { DAY, EPOCH, TIME_SCALE } from './time.js';
import { mixHex } from './color.js';
export const PATTERNS = {
  mackerel:   { label: '고등어', w: 20, base: ['#8b7c69', '#80786f', '#93806a'], stripe: '#2a2521', stripeAmt: 0.95, nose: '#a8625a', names: ['고등어', '꽁치', '줄무늬', '호랑이', '삼치', '갈치'] },
  orange:     { label: '치즈', w: 15, base: ['#e3964c', '#dc8a3f', '#e8a160'], stripe: '#b25d26', stripeAmt: 0.75, nose: '#d88274', names: ['치즈', '노랑이', '호박', '귤', '누룽지', '카레'] },
  cream:      { label: '크림', w: 4, base: ['#f0d6ae', '#ecc99a'], stripe: '#d4a26e', stripeAmt: 0.55, nose: '#e3a094', names: ['크림', '버터', '카스테라', '라떼'] },
  tuxedo:     { label: '턱시도', w: 12, base: ['#161417'], stripe: '#151316', stripeAmt: 0, white: 0.44, wn: 0.12, nose: '#2b2326', names: ['턱시도', '양말이', '신사', '장화', '오레오'] },
  cow:        { label: '젖소', w: 7, base: ['#1f1c1e'], stripe: '#151316', stripeAmt: 0, white: 0.7, wn: 0.8, nose: '#e3a0a0', names: ['젖소', '얼룩이', '점박이', '바둑이', '달마'] },
  calico:     { label: '삼색', w: 9, female: true, base: ['#d98b47'], stripe: '#b8672f', stripeAmt: 0.25, patch: '#201c1e', patchAmt: 0.42, white: 0.55, wn: 0.5, nose: '#e39a96', names: ['삼색이', '꽃분이', '삼순이', '알록이'] },
  tortie:     { label: '카오스', w: 6, female: true, base: ['#2a2220'], stripe: '#1a1514', stripeAmt: 0, patch: '#a85a2a', mottle: 0.62, nose: '#4a3434', names: ['카오스', '깜순이', '누룽지', '초코칩'] },
  black:      { label: '올블랙', w: 8, base: ['#141215'], stripe: '#141215', stripeAmt: 0, nose: '#2a2224', names: ['까망이', '연탄', '짜장', '흑당', '밤톨'] },
  white:      { label: '흰둥이', w: 4, base: ['#f2efe9'], stripe: '#e6e1d8', stripeAmt: 0, white: 1, nose: '#eaa3a3', names: ['흰둥이', '두부', '백설기', '솜사탕', '눈송이'] },
  gray:       { label: '회색', w: 5, base: ['#6f7378', '#7a7d82'], stripe: '#5b5e63', stripeAmt: 0.18, nose: '#6b5a60', names: ['회색이', '먼지', '구름', '재롱', '은비'] },
  mackerelW:  { label: '고등어 흰양말', w: 10, base: ['#8b7c69', '#80786f'], stripe: '#2a2521', stripeAmt: 0.95, white: 0.46, wn: 0.2, nose: '#c97e76', names: ['고등어', '양말이', '줄무늬', '꼬리'] },
  orangeW:    { label: '치즈 흰둥이', w: 8, base: ['#e3964c', '#e8a160'], stripe: '#b25d26', stripeAmt: 0.75, white: 0.48, wn: 0.25, nose: '#e09084', names: ['치즈', '노랑이', '단호박', '유자'] },
};
export const EYES = {
  amber:  ['#b8741f', '#e2ab45'],
  yellow: ['#c8b02a', '#efe07a'],
  green:  ['#5d8a33', '#b5c95a'],
  hazel:  ['#8c7a2e', '#cdb65a'],
  blue:   ['#3f78ba', '#9cc7ec'],
  kitten: ['#4d6f98', '#9db5cf'],
};
export const KITTEN_NAMES = ['콩', '꼬물이', '쪼꼬', '모찌', '깨', '몽실이', '솜이', '토리', '보리', '율무', '앵두', '두두', '찹쌀', '단추', '감자'];
export const ADULT_NAMES = ['나비', '야옹이', '대장', '점순이', '방울이', '복동이', '순심이', '해피', '달님이', '복실이', '장군이', '뭉치'];
export const TRAITS = [
  ['bold', '겁이 없음', '겁이 많음'],
  ['social', '사람을 좋아함', '낯가림'],
  ['playful', '장난꾸러기', '점잖음'],
  ['food', '식탐 대장', '입이 짧음'],
  ['energy', '활발함', '게으름뱅이'],
  ['grumpy', '까칠함', '순둥이'],
];

export function stageOf(months) {
  if (months < 2) return { key: 'baby', label: '아기' };
  if (months < 6) return { key: 'kit', label: '꼬마' };
  if (months < 12) return { key: 'teen', label: '청소년' };
  return { key: 'adult', label: '성체' };
}
export function ageText(months) {
  if (months < 1) return Math.max(1, Math.round(months * 4.3)) + '주';
  if (months < 12) return Math.floor(months) + '개월';
  const y = Math.floor(months / 12);
  return y + '살';
}

export function makePersonality(r, kitten) {
  const p = {};
  for (const [k] of TRAITS) p[k] = clamp(0.5 + r.gauss() * 0.22, 0.02, 0.98);
  if (kitten) { p.playful = clamp(p.playful + 0.3, 0, 1); p.energy = clamp(p.energy + 0.25, 0, 1); p.grumpy = clamp(p.grumpy - 0.25, 0, 1); }
  return p;
}
export function traitTags(p) {
  const arr = TRAITS.map(([k, hi, lo]) => ({ k, d: p[k] - 0.5, hi, lo })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  return arr.slice(0, 2).map((t) => (t.d > 0 ? t.hi : t.lo));
}

export const TNR_MIN_MONTHS = 6; // 중성화 표시는 6개월 이상부터
export function makeGenome(r, opts) {
  const { sex, months, mother } = opts;
  let pk;
  if (mother && r.chance(0.6)) pk = mother.pattern;
  else pk = r.weighted(Object.entries(PATTERNS).filter(([k, v]) => !(v.female && sex === 'm')).map(([k, v]) => [k, v.w]));
  if (PATTERNS[pk].female && sex === 'm') pk = 'mackerel';
  const P = PATTERNS[pk];
  const growth = Math.pow(clamp((months - 0.8) / 11, 0, 1), 0.7);
  const base = r.pick(P.base);
  let eyeKey = r.weighted([['amber', 30], ['yellow', 26], ['green', 22], ['hazel', 16], ['blue', pk === 'white' ? 40 : 3]]);
  let eye = EYES[eyeKey].slice();
  if (pk === 'white' && r.chance(0.25)) { eye = EYES.blue.concat(EYES.amber); eyeKey = 'odd'; }
  if (months < 3.5) { // 아기 고양이는 파란 눈 → 점점 제 색
    const t = clamp((months - 1.5) / 2, 0, 1);
    const mix = (a, b) => mixHex(a, b, t); // 예전: '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString() (같은 값)
    eye = [mix(EYES.kitten[0], eye[0]), mix(EYES.kitten[1], eye[1])];
  }
  const tnrRoll = r.chance(0.5);
  const whiteBase = P.white ?? (r.chance(0.12) ? 0.25 : 0);
  const g = {
    pattern: pk, patternLabel: P.label, sex, months, growth,
    colors: { base, stripe: P.stripe, patch: P.patch || '#1f1c1e', white: '#f3f0ea' },
    stripeAmt: P.stripeAmt, stripeFreq: r.range(150, 200),
    patchAmt: P.patchAmt || 0, patchScale: r.range(6, 10), mottle: P.mottle || 0,
    whiteAmt: whiteBase === 1 ? 1 : clamp(whiteBase + (whiteBase ? r.range(-0.08, 0.08) : 0), 0, 1),
    whiteNoise: P.wn ?? 0.15,
    eye, eyeKey,
    nose: P.nose, earInner: ['black', 'tuxedo', 'tortie'].includes(pk) ? '#8a6262' : '#e6a49b',
    furLen: r.range(0.78, 1.18), fluff: r.range(0.3, 1),
    tipLight: ['black', 'tuxedo', 'tortie', 'cow'].includes(pk) ? 0.12 : pk.startsWith('mackerel') || pk === 'gray' ? 0.3 : 0.5,
    body: { chub: r.range(0.92, 1.16), legLen: r.range(0.93, 1.06), headSize: r.range(0.95, 1.06), earSize: r.range(0.9, 1.12), tailLen: r.range(0.85, 1.1), faceWidth: r.range(0.94, 1.08) },
    tnr: months >= TNR_MIN_MONTHS && tnrRoll, // 성묘 약 50%, 수컷·암컷 모두. 월령과 상관없이 같은 값을 뽑아 새로고침·나이에 흔들리지 않는다
    personality: makePersonality(r, months < 6),
    seedF: r() * 100,
  };
  return g;
}

export const sexText = (g) => (g.sex === 'f' ? '암컷' : '수컷') + (g.tnr ? '(중)' : ''); // (중) = 중성화
export function nameFor(r, g, used) {
  const pool = g.months < 6 ? KITTEN_NAMES : PATTERNS[g.pattern].names.concat(ADULT_NAMES.slice(0, 4));
  let name = r.pick(pool);
  let tries = 0;
  while (used.has(name) && tries++ < 12) name = r.pick(g.months < 6 ? KITTEN_NAMES : PATTERNS[g.pattern].names.concat(ADULT_NAMES));
  if (used.has(name)) name = name + (2 + [...used].filter((u) => u.startsWith(name)).length);
  if (g.months >= 12 && g.body.chub > 1.12 && !name.startsWith('뚱') && r.chance(0.5)) name = '뚱' + name.replace(/이$/, '');
  used.add(name);
  return name;
}

// 활성 지역(현재 시/도) 하나에 마스코트 고양이 한 마리 (결정적: 같은 지역 코드 → 같은 고양이, 나이는 실제 시간에 따라 자람)
export function dongPopulation(dong, now = Date.now()) {
  const r = makeRng('mascot:' + dong.c);
  const sex = r.chance(0.55) ? 'f' : 'm';
  const stage = r.weighted([['kit', 3], ['teen', 2], ['adult', 5]]);
  const ageAtEpoch = stage === 'kit' ? r.range(0.4, 3.5) : stage === 'teen' ? r.range(5, 10) : r.range(13, 72);
  const months = ageAtEpoch + ((now - EPOCH) / DAY) * TIME_SCALE / 30.4;
  const g = makeGenome(makeRng('mascotg:' + dong.c), { sex, months });
  const cat = { id: dong.c + '-m', idx: 0, dong: dong.c, g, name: '', born: EPOCH - (ageAtEpoch * 30.4 / TIME_SCALE) * DAY, mother: null, litter: null, here: true };
  cat.defaultName = nameFor(r, g, new Set());
  cat.name = cat.defaultName;
  return [cat];
}
