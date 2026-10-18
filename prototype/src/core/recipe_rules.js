// core/recipe_rules.js: 행동 레시피 단어표·제한값·프롬프트·글 해석·검증기 (원래 index.html 70_recipe 구역 앞부분, R-14·D-33 단계 2)
// 저장(RecipeStore)·행동 변환(recipeToAction)·어드민 화면은 index.html 에 남는다.
export const RV = {
  pose: ['sit', 'stand', 'loaf', 'lie_side', 'lie_belly', 'crouch', 'stretch', 'arch', 'lean_side', 'roll'],
  move: ['stay', 'walk', 'trot', 'run', 'jump_up', 'jump_down', 'pounce', 'to:box', 'to:wall', 'to:sunny', 'to:hide', 'to:you'],
  ears: ['forward', 'side', 'back_flat', 'swivel', 'one_back'],
  eyes: ['open', 'half_closed', 'slow_blink', 'wide', 'closed'],
  pupil: ['small', 'normal', 'large'],
  tail: ['up', 'up_hook', 'low', 'puff', 'wrap', 'flick', 'lash'],
  head: ['tilt_left', 'tilt_right', 'rub_left', 'rub_right', 'look_up', 'look_down'],
  sound: ['none', 'meow', 'trill', 'purr', 'hiss', 'yowl'],
  emotion: ['편안', '호기심', '신남', '애정', '경계', '두려움', '짜증', '졸림'],
  need: ['에너지 높음', '에너지 낮음', '배고픔 높음', '지루함 높음', '안심 높음', '안심 낮음'],
};
// 단어는 받지만 아직 몸동작이 없는 것 → "새 동작 필요"로 표시하고 미리보기에서는 건너뛴다
export const RV_NEW = { pose: ['arch', 'lean_side', 'roll'], move: ['jump_up', 'jump_down', 'to:box', 'to:sunny', 'to:hide'] };
export const RPOSE = { sit: 'sit', stand: 'stand', loaf: 'loaf', lie_side: 'side', lie_belly: 'belly', crouch: 'crouch', stretch: 'stretch' };
export const RLIM = { raw: 6000, name: 24, place: 16, steps: 24, unknown: 8, unkLen: 80, durMin: 1, durMax: 40, saved: 30, enabled: 10 };
export const RKEYS = {
  top: new Set(['name', 'when', 'duration_s', 'steps', 'unknown_moves']),
  when: new Set(['emotion', 'need', 'place']),
  step: new Set(['t', 'pose', 'move', 'ears', 'eyes', 'pupil', 'tail', 'head', 'sound']),
};
export const RTEXT = /^[\p{L}\p{N} _\-·.,!?~()]+$/u; // 이름·장소: 글자·숫자·공백과 몇 가지 기호만
export const RFREE = /^[^<>\u0000-\u001f\u007f]+$/;   // 못 하는 동작 설명: 꺾쇠·제어문자만 막는다 (표시는 textContent로만)
export function recipePrompt() {
  return `너는 고양이 행동 분석가다. 사용자가 보낸 영상 속 고양이의 행동 하나를 골라
아래 JSON 형식으로만 답하라. 설명 문장은 쓰지 마라.
행동이 여러 개면 가장 귀엽고 눈에 띄는 것 하나만 고른다.

{
  "name": "행동 이름(한국어, 짧게, ${RLIM.name}자 이내)",
  "when": { "emotion": ["감정"], "need": "욕구 상황", "place": "장소(한국어 ${RLIM.place}자 이내)" },
  "duration_s": 숫자(${RLIM.durMin}~${RLIM.durMax}),
  "steps": [ { "t": 시작초, "pose": "", "move": "", "ears": "", "eyes": "", "pupil": "", "tail": "", "head": "", "sound": "" } ],
  "unknown_moves": ["목록에 없는 몸동작을 한국어로 묘사"]
}

단계(steps)는 ${RLIM.steps}개 이하, t는 0부터 duration_s 안에서 커지는 순서로 쓴다.
각 칸에는 아래 단어만 쓴다. 해당 없으면 칸을 빼라.
- pose: ${RV.pose.join(', ')}
- move: ${RV.move.join(', ')}
- ears: ${RV.ears.join(', ')}
- eyes: ${RV.eyes.join(', ')}
- pupil: ${RV.pupil.join(', ')}
- tail: ${RV.tail.join(', ')}
- head: ${RV.head.join(', ')}
- sound: ${RV.sound.join(', ')}
- emotion: ${RV.emotion.join(', ')}
- need: ${RV.need.join(', ')}

목록 단어로 표현할 수 없는 몸동작(예: 뒷발로 서서 앞발 모으기)은 steps에 넣지 말고
unknown_moves에 한국어로 자세히 적어라.`;
}
// 글 → 값. 문법 오류는 줄·칸을 알려 준다.
export function parseRecipeText(text) {
  if (typeof text !== 'string') return { errors: [{ path: '입력', msg: '글이 아니에요', pos: -1 }] };
  let s = text.trim();
  if (!s) return { errors: [{ path: '입력', msg: '비어 있어요', pos: -1 }] };
  if (s.length > RLIM.raw) return { errors: [{ path: '입력', msg: `너무 길어요 (${s.length}자 > ${RLIM.raw}자)`, pos: -1 }] };
  const fence = s.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/); // AI가 코드 블록으로 감싸 준 경우
  if (fence) s = fence[1];
  try { return { value: JSON.parse(s), text: s }; }
  catch (e) {
    const msg = String(e && e.message), m = /position (\d+)/.exec(msg), lc = /line (\d+) column (\d+)/.exec(msg);
    const pos = m ? +m[1] : -1; let line = 0, col = 0;
    if (lc) { line = +lc[1]; col = +lc[2]; }
    else if (pos >= 0) { const before = s.slice(0, pos).split('\n'); line = before.length; col = before[before.length - 1].length + 1; }
    return { errors: [{ path: line ? `줄 ${line}, 칸 ${col}` : 'JSON', msg: 'JSON 문법이 맞지 않아요 (괄호·쉼표·따옴표를 확인해 주세요)', pos }], text: s };
  }
}
export const recipeIsPlain = (o) => { if (o === null || typeof o !== 'object' || Array.isArray(o)) return false; const p = Object.getPrototypeOf(o); return (p === Object.prototype || p === null) && Object.getOwnPropertySymbols(o).length === 0; };
// 값(객체) → 검사 결과 { ok, errors:[{path,msg}], recipe(검증된 새 객체), needs:[새 동작 필요 목록] }
export function validateRecipe(input) {
  const errors = [], needs = [];
  const err = (path, msg) => { if (errors.length < 40) errors.push({ path, msg }); };
  const show = (v) => (typeof v === 'string' ? JSON.stringify(v.slice(0, 20)) : v === null ? 'null' : Array.isArray(v) ? '(배열)' : typeof v === 'object' ? '(객체)' : String(v).slice(0, 20));
  const done = (recipe) => ({ ok: errors.length === 0, errors, recipe: errors.length ? null : recipe, needs });
  try { const n = JSON.stringify(input); if (typeof n !== 'string' || n.length > RLIM.raw * 2) { err('입력', '너무 크거나 변환할 수 없어요'); return done(null); } }
  catch (e) { err('입력', '순환 참조이거나 변환할 수 없는 값이에요'); return done(null); }
  if (!recipeIsPlain(input)) { err('입력', '{ ... } 모양의 객체여야 해요'); return done(null); }
  const keys = (o, set, path) => { for (const k of Object.keys(o)) if (!set.has(k)) err(path ? path + '.' + k : k, `알 수 없는 항목이에요 (받지 않아요): ${show(k)}`); };
  const en = (v, list, path) => { if (typeof v === 'string' && list.includes(v)) return true; err(path, `허용되지 않은 값이에요: ${show(v)} (가능: ${list.join(', ')})`); return false; };
  const text = (v, max, path, re) => { if (typeof v !== 'string') { err(path, '글이어야 해요'); return false; } const t = v.trim(); if (!t || t.length > max) { err(path, `1~${max}자여야 해요 (지금 ${t.length}자)`); return false; } if (!re.test(t)) { err(path, '쓸 수 없는 글자가 있어요 (< > 같은 기호·제어문자 불가)'); return false; } return true; };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  keys(input, RKEYS.top, '');
  const out = { name: '', when: {}, duration_s: 0, steps: [], unknown_moves: [] };
  // name
  if (!has(input, 'name')) err('name', '꼭 필요해요'); else if (text(input.name, RLIM.name, 'name', RTEXT)) out.name = input.name.trim();
  // duration_s
  if (!has(input, 'duration_s')) err('duration_s', '꼭 필요해요');
  else if (typeof input.duration_s !== 'number' || !Number.isFinite(input.duration_s) || input.duration_s < RLIM.durMin || input.duration_s > RLIM.durMax) err('duration_s', `${RLIM.durMin}~${RLIM.durMax} 사이 숫자여야 해요: ${show(input.duration_s)}`);
  else out.duration_s = Math.round(input.duration_s * 10) / 10;
  // when
  if (has(input, 'when')) {
    const w = input.when;
    if (!recipeIsPlain(w)) err('when', '{ emotion, need, place } 모양이어야 해요');
    else {
      keys(w, RKEYS.when, 'when');
      if (has(w, 'emotion')) {
        if (!Array.isArray(w.emotion)) err('when.emotion', '배열이어야 해요');
        else if (w.emotion.length > RV.emotion.length) err('when.emotion', `최대 ${RV.emotion.length}개예요`);
        else { const seen = []; w.emotion.forEach((e, i) => { if (en(e, RV.emotion, `when.emotion[${i}]`) && !seen.includes(e)) seen.push(e); }); out.when.emotion = seen; }
      }
      if (has(w, 'need') && en(w.need, RV.need, 'when.need')) out.when.need = w.need;
      if (has(w, 'place') && text(w.place, RLIM.place, 'when.place', RTEXT)) out.when.place = w.place.trim();
    }
  }
  // steps
  if (!has(input, 'steps')) err('steps', '꼭 필요해요');
  else if (!Array.isArray(input.steps)) err('steps', '배열이어야 해요');
  else if (!input.steps.length) err('steps', '단계가 하나는 있어야 해요');
  else if (input.steps.length > RLIM.steps) err('steps', `단계는 최대 ${RLIM.steps}개예요 (지금 ${input.steps.length}개)`);
  else {
    let last = -1;
    input.steps.forEach((s, i) => {
      const P = `steps[${i}]`;
      if (!recipeIsPlain(s)) { err(P, '{ t, pose, ... } 모양이어야 해요'); return; }
      keys(s, RKEYS.step, P);
      const o = {};
      if (!has(s, 't')) err(P + '.t', '시작 초(t)가 꼭 필요해요');
      else if (typeof s.t !== 'number' || !Number.isFinite(s.t) || s.t < 0 || s.t > RLIM.durMax) err(P + '.t', `0~${RLIM.durMax} 사이 숫자여야 해요: ${show(s.t)}`);
      else if (s.t < last) err(P + '.t', `앞 단계(${last}초)보다 작아요. 시작 초는 커지는 순서여야 해요`);
      else if (out.duration_s && s.t > out.duration_s) err(P + '.t', `전체 길이(${out.duration_s}초)를 넘어요`);
      else { o.t = Math.round(s.t * 10) / 10; last = o.t; }
      let n = 0;
      for (const k of ['pose', 'move', 'ears', 'eyes', 'pupil', 'tail', 'head', 'sound']) {
        if (!has(s, k)) continue;
        if (en(s[k], RV[k], `${P}.${k}`)) { o[k] = s[k]; n++; if (RV_NEW[k] && RV_NEW[k].includes(s[k])) needs.push(`${P}.${k}: ${s[k]}`); }
      }
      if (!n && has(s, 't') && Object.keys(s).length <= 1) err(P, '바꿀 내용이 하나도 없어요');
      out.steps.push(o);
    });
  }
  // unknown_moves
  if (has(input, 'unknown_moves')) {
    const u = input.unknown_moves;
    if (!Array.isArray(u)) err('unknown_moves', '배열이어야 해요');
    else if (u.length > RLIM.unknown) err('unknown_moves', `최대 ${RLIM.unknown}개예요`);
    else u.forEach((m, i) => { if (text(m, RLIM.unkLen, `unknown_moves[${i}]`, RFREE)) { out.unknown_moves.push(m.trim()); needs.push(`unknown_moves[${i}]: ${m.trim().slice(0, 30)}`); } });
  }
  return done(out);
}
// 샘플 (직접 만든 단순 동작. 영상·자막과 무관)
export const RECIPE_SAMPLES = [
  { label: '꼬리 흔들며 앉기', text: JSON.stringify({ name: '꼬리 흔들며 앉기', when: { emotion: ['편안', '애정'], need: '안심 높음', place: '골목' }, duration_s: 10,
    steps: [{ t: 0, pose: 'sit', ears: 'forward', eyes: 'open', tail: 'low' }, { t: 2, tail: 'flick', head: 'tilt_left', sound: 'trill' }, { t: 5, eyes: 'slow_blink', head: 'tilt_right' }, { t: 8, tail: 'wrap', eyes: 'half_closed', sound: 'purr' }], unknown_moves: [] }, null, 2) },
  { label: '살금살금 한 번 덮치기', text: JSON.stringify({ name: '살금살금 한 번 덮치기', when: { emotion: ['호기심', '신남'], need: '지루함 높음', place: '골목' }, duration_s: 9,
    steps: [{ t: 0, pose: 'crouch', pupil: 'large', ears: 'forward', tail: 'lash' }, { t: 3, move: 'trot', pose: 'crouch', tail: 'lash' }, { t: 5, move: 'pounce', tail: 'up' }, { t: 6.5, pose: 'sit', eyes: 'slow_blink', tail: 'wrap', ears: 'side' }], unknown_moves: ['앞발을 번갈아 들고 제자리 걷기'] }, null, 2) },
];
