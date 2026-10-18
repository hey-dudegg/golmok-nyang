// core 기준값 계산 함수. 브라우저(분리 전·후 페이지의 window.__inter/__recipe/__trips)와
// node(prototype/src/core/*.js 를 직접 import)에서 같은 함수를 돌려 결과를 비교한다.
// 주의: 이 함수는 page.evaluate 로 브라우저에 그대로 넘어가므로 바깥 변수를 쓰지 않는다(자기 완결).
// api: { makeRng, makeGenome, makePersonality, dongPopulation, touchType, petPolarityWeights, resolveRule,
//        Clock, Trips, validateRecipe, parseRecipeText, recipePrompt, ACTIONS, REACTIONS, REACT_META, THOUGHTS,
//        EMO_POL, TOUCH_TYPES, NAME_RULE, RV, RLIM, samples }
function refCases(api) {
  const H = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; };
  const rnd = (o, k = 1e6) => JSON.parse(JSON.stringify(o, (key, v) => (typeof v === 'number' ? Math.round(v * k) / k : v)));
  const J = (o) => H(JSON.stringify(rnd(o)));
  const FIX = Date.UTC(2026, 9, 18, 3, 0, 5), T0 = Date.UTC(2026, 9, 18, 0, 0, 0), DAYMS = 86400000;
  const out = {};

  // 1) 난수: 시드별 첫 값들과 도우미
  out.rng = {};
  for (const seed of ['a', 'mascot:11', 'clock:11-m:12345', 12345, 0, 4294967295]) {
    const r = api.makeRng(seed), v = [];
    for (let i = 0; i < 6; i++) v.push(r());
    v.push(r.range(-2, 3), r.int(1, 6), r.pick(['x', 'y', 'z']), r.chance(0.5), r.weighted([['a', 1], ['b', 2], ['c', 0.5]]), r.gauss());
    out.rng[String(seed)] = rnd(v, 1e12);
  }

  // 2) 유전체: 새끼(눈 색 섞임 포함)·성체·어미 무늬 이어받기
  const gs = [];
  for (let i = 0; i < 120; i++) {
    const months = (i % 40) * 0.12 + (i >= 80 ? 12 : 0);
    const g = api.makeGenome(api.makeRng('ref:g:' + i), { sex: i % 3 ? 'f' : 'm', months, mother: i % 7 === 0 ? { pattern: 'calico' } : null });
    gs.push([g.pattern, g.eyeKey, g.eye.join(','), g.tnr ? 1 : 0, J(g)]);
  }
  out.genome = { n: gs.length, hash: H(JSON.stringify(gs)), head: gs.slice(0, 6) };
  out.personality = rnd([api.makePersonality(api.makeRng('ref:p'), false), api.makePersonality(api.makeRng('ref:p'), true)]);

  // 3) 지역 마스코트(16곳 x 세 시각)
  const codes = api.Trips.codes();
  out.codes = codes;
  out.mascots = {};
  for (const c of codes) {
    out.mascots[c] = [FIX - 40 * DAYMS, FIX, FIX + 200 * DAYMS].map((ms) => { const cat = api.dongPopulation({ c }, ms)[0]; return [cat.id, cat.defaultName, Math.round(cat.g.months * 1e3) / 1e3, cat.g.pattern, J(cat.g)]; });
  }

  // 4) 손길 유형·극성 비율·교감 규칙
  const tt = [], cnt = {};
  for (let i = 0; i < 400; i++) { const p = api.makePersonality(api.makeRng('ref:tp:' + i), false), t = api.touchType('ref-' + i, p); tt.push(t); cnt[t] = (cnt[t] || 0) + 1; }
  out.touchType = { hash: H(tt.join(',')), counts: cnt };
  const pw = [];
  for (const type of Object.keys(api.TOUCH_TYPES)) for (const part of ['head', 'chin', 'back', 'belly', 'tail']) for (const tr of [-1, 0, 0.35, 1, 2]) pw.push(api.petPolarityWeights(type, part, tr));
  out.petWeights = J(pw);
  const acts = [{ kind: 'pet', part: 'head' }, { kind: 'pet', part: 'belly' }, { kind: 'pet', part: 'back' }, { kind: 'churu' },
    ...['come', 'greet', 'question', 'calm', 'hiss', 'fight', 'unknown'].map((intent) => ({ kind: 'word', word: { intent } }))];
  const rr = [];
  for (let i = 0; i < 60; i++) {
    const p = api.makePersonality(api.makeRng('ref:rp:' + i), i % 4 === 0);
    const a = { p, r: api.makeRng('ref:rr:' + i), cat: { id: 'ref-' + (i % 17) } };
    for (const act of acts) for (const trust of [0, 0.5, 1]) { const x = api.resolveRule(a, act, trust); rr.push([x.reaction, x.thought, x.pol, x.emo, x.thoughtPol, x.trust_delta]); }
  }
  out.rules = { n: rr.length, hash: H(JSON.stringify(rr)), head: rr.slice(0, 4) };
  out.tables = { REACT_META: J(api.REACT_META), THOUGHTS: J(api.THOUGHTS), EMO_POL: J(api.EMO_POL), TOUCH_TYPES: J(api.TOUCH_TYPES), NAME_RULE: J(api.NAME_RULE), RV: J(api.RV), RLIM: J(api.RLIM),
    ACTIONS: H(Object.entries(api.ACTIONS).map(([k, v]) => k + '=' + v.label).join(',')), REACTIONS: H(Object.entries(api.REACTIONS).map(([k, v]) => k + '=' + v.label + (v.keep ? '!' : '')).join(',')) };

  // 5) 세계 시계: 16곳 마스코트의 24시간 일정 해시, 고정 시각 상태·상위 5개
  const C = api.Clock;
  out.clock = {};
  for (const c of codes) {
    const cat = api.dongPopulation({ c }, FIX)[0]; cat.geo = c === '50' ? { lat: 33.4, lng: 126.55 } : { lat: 36.5 + (+c % 7) * 0.2, lng: 127 + (+c % 5) * 0.3 };
    C.cache.clear();
    let s = '', n = 0;
    for (const e of C.between(cat, T0, T0 + 24 * 3600000)) { s += e.key + ':' + e.t0 + ':' + e.t1 + ';'; n++; }
    const st = C.state(cat, FIX, C.recentAt(cat, FIX), false);
    out.clock[c] = { n, hash: H(s), entry: C.entryAt(cat, FIX).entry.key, state: J(st), top5: J(C.top5(cat, FIX, st, C.recentAt(cat, FIX))) };
  }

  // 6) 놀러가기: 48시간 일정
  api.Trips.cache.clear();
  const tr = api.Trips.between(T0, T0 + 48 * 3600000).map((x) => [x.id, x.kind, x.from, x.to, x.t0, x.t1]);
  out.trips = { n: tr.length, hash: H(JSON.stringify(tr)), head: tr.slice(0, 3), at: codes.map((c) => { const a = api.Trips.at(c, FIX + 3600000); return [c, a.away && a.away.id, a.host && a.host.id]; }) };

  // 7) 레시피 검증기
  const base = () => ({ name: '시험', duration_s: 6, steps: [{ t: 0, pose: 'sit' }, { t: 3, tail: 'flick' }] });
  const vcases = [base(), { ...base(), duration_s: 99999 }, { ...base(), evil: 1 }, { ...base(), steps: [{ t: 3, pose: 'sit' }, { t: 1, pose: 'loaf' }] },
    { ...base(), name: '<b>x</b>' }, { ...base(), when: { emotion: ['편안', '편안', '졸림'], need: '배고픔 높음', place: '담장 위' } },
    { ...base(), steps: [{ t: 0, pose: 'arch', move: 'jump_up' }], unknown_moves: ['뒷발로 서기'] }, [], null, 'x', { ...base(), steps: [] }];
  const ptexts = [...(api.samples || []).map((s) => s.text), '', '   ', '{"a":', '```json\n{"name":"x","duration_s":5,"steps":[{"t":0,"pose":"sit"}]}\n```', 'x'.repeat(7000), 5];
  out.recipe = {
    validate: vcases.map((v) => J(api.validateRecipe(v))),
    parse: ptexts.map((t) => { const p = api.parseRecipeText(t); return J(p.errors ? { errors: p.errors.map((e) => e.path + '|' + e.msg) } : { v: p.value, ok: api.validateRecipe(p.value).ok }); }),
    prompt: H(api.recipePrompt()),
  };
  return out;
}
if (typeof module !== 'undefined') module.exports = { refCases };
