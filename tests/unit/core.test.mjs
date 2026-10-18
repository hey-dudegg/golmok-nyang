// core 모듈 node 단위 시험 (브라우저·서버 불필요). 사용: node --test tests/unit/  (또는 npm run test:unit)
//  1) 기준값: tests/baseline/core_ref.json (분리 전 페이지에서 뜬 값)과 같은 계산 결과가 같은지
//  2) 기준값: tests/baseline/state.json 의 일정 해시·고양이 요약·놀러가기 일정(지역 11·26·41)과 같은지
//  3) 결정성(같은 입력 같은 출력)과 경계값
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { clamp, lerp, smooth, angDiff, hashStr, makeRng, josa, fmtCount } from '../../prototype/src/core/util.js';
import { DAY, EPOCH, sunPosition } from '../../prototype/src/core/time.js';
import { mixHex } from '../../prototype/src/core/color.js';
import { makeGenome, makePersonality, dongPopulation, stageOf, ageText, traitTags, nameFor } from '../../prototype/src/core/genome.js';
import { buildRegions, REGION_LEVEL, sggShort, regionFull, themeFor, THEME_LABEL } from '../../prototype/src/core/regions.js';
import { ACTIONS, REACTIONS, STEP } from '../../prototype/src/core/behavior.js';
import { createClock, CLOCK, circadian, vnoise } from '../../prototype/src/core/clock.js';
import { tripConfig, createTrips, NEIGHBORS } from '../../prototype/src/core/trips.js';
import { touchType, petPolarityWeights, resolveRule, REACT_META, THOUGHTS, EMO_POL, TOUCH_TYPES, interpret } from '../../prototype/src/core/touch_rules.js';
import { validateRecipe, parseRecipeText, recipePrompt, RV, RLIM, RECIPE_SAMPLES } from '../../prototype/src/core/recipe_rules.js';
import { NAME_RULE } from '../../prototype/src/core/name_rules.js';

const require = createRequire(import.meta.url);
const { refCases } = require('./ref_cases.js');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

// 메모리 저장소 (localStorage 대역). personal=false 계산은 이것을 읽지 않는다
const memStore = () => { const m = new Map(); return { get: (k, d) => (m.has(k) ? m.get(k) : d), set: (k, v) => m.set(k, v) }; };
const REGIONS = buildRegions(readJson('prototype/data/regions.json')); // 경계 자료는 통째로 출력하지 않는다
const makeApi = () => ({
  makeRng, makeGenome, makePersonality, dongPopulation, touchType, petPolarityWeights, resolveRule,
  Clock: createClock(memStore()), Trips: createTrips(tripConfig(), REGIONS), validateRecipe, parseRecipeText, recipePrompt,
  ACTIONS, REACTIONS, REACT_META, THOUGHTS, EMO_POL, TOUCH_TYPES, NAME_RULE, RV, RLIM, samples: RECIPE_SAMPLES,
});

// ── 1) 분리 전 페이지 기준값과 같은지 (core_ref.json) ──
const REF = readJson('tests/baseline/core_ref.json');
const NOW = refCases(makeApi());
for (const k of Object.keys(REF)) {
  test(`기준값 core_ref.${k} = 분리 전 페이지`, () => {
    if (k === 'recipe') { // JSON 문법 오류 위치 문구는 JS 엔진(Chrome·node) 버전에 따라 달라질 수 있어 검증 결과만 엄격히 본다
      assert.deepEqual(NOW.recipe.validate, REF.recipe.validate);
      assert.equal(NOW.recipe.prompt, REF.recipe.prompt);
      assert.equal(NOW.recipe.parse.length, REF.recipe.parse.length);
      return;
    }
    assert.deepEqual(NOW[k], REF[k]);
  });
}
test('결정성: 같은 계산을 다시 해도 같다', () => { assert.deepEqual(refCases(makeApi()), NOW); });

// ── 2) state.json 기준값 (snapshot.js 와 같은 계산) ──
const H = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; };
const rnd = (o, k = 1e4) => JSON.parse(JSON.stringify(o, (key, v) => (typeof v === 'number' ? Math.round(v * k) / k : v)));
const STATE = readJson('tests/baseline/state.json');
const FIX = Date.parse(STATE.meta.fixed), T0 = Date.parse(STATE.meta.t0);
for (const code of STATE.meta.codes) {
  test(`기준값 state.json 지역 ${code}: 일정 해시·고양이·놀러가기`, () => {
    const B = STATE.regions[code], d = REGIONS.unitOf(code), Clock = createClock(memStore()), Trips = createTrips(tripConfig(), REGIONS);
    assert.deepEqual({ c: d.c, n: d.n, level: d.level, sido: d.sido, lat: +d.lat.toFixed(4), lng: +d.lng.toFixed(4) }, B.dong);
    const cat = dongPopulation(d, FIX)[0]; cat.geo = { lat: d.lat, lng: d.lng };
    let s = '', n = 0;
    for (const e of Clock.between(cat, T0, T0 + 6 * 3600000)) { s += cat.id + ':' + e.key + ':' + Math.round(e.t0) + ';'; n++; }
    assert.deepEqual({ entries: n, hash: H(s), head: s.slice(0, 100) }, B.schedule6h);
    assert.deepEqual({ id: cat.id, name: cat.defaultName, sex: cat.g.sex, months: +cat.g.months.toFixed(3), personality: rnd(cat.g.personality), touchType: touchType(cat.id, cat.g.personality), genomeHash: H(JSON.stringify(rnd(cat.g, 1e6))) }, B.cat);
    assert.deepEqual({ entry: Clock.entryAt(cat, FIX).entry.key, state: rnd(Clock.state(cat, FIX, Clock.recentAt(cat, FIX), false)) }, B.clockAtFixed);
    const trips = Trips.between(FIX, FIX + 3 * 3600000).map((x) => [x.kind, x.from, x.to, Math.round((x.t0 - FIX) / 1000), Math.round((x.t1 - FIX) / 1000)]);
    assert.deepEqual({ n: trips.length, hash: H(JSON.stringify(trips)), mine: trips.filter((x) => x[1] === d.c || x[2] === d.c) }, B.trips3h);
    assert.equal(B.census.startsWith(THEME_LABEL[themeFor(d)]), true); // 인구 문구 앞부분 = 장면 테마 이름
  });
}
test('기준값 state.json 지역 시트: 시/도 16곳', () => {
  assert.equal(REGIONS.sidos.length, STATE.picker.sido);
  const list = STATE.picker.list.map((x) => x.split(' / ')[0]);
  assert.deepEqual([...REGIONS.sidoInfo.values()].map((s) => s.n), list);
});

// ── 3) 경계값·결정성 ──
test('util: clamp·lerp·smooth·angDiff 경계', () => {
  assert.equal(clamp(-1, 0, 1), 0); assert.equal(clamp(2, 0, 1), 1); assert.equal(clamp(0.5, 0, 1), 0.5);
  assert.equal(lerp(2, 4, 0), 2); assert.equal(lerp(2, 4, 1), 4); assert.equal(smooth(0), 0); assert.equal(smooth(1), 1); assert.equal(smooth(0.5), 0.5);
  assert.ok(Math.abs(angDiff(0, 3 * Math.PI) - Math.PI) < 1e-9 || Math.abs(angDiff(0, 3 * Math.PI) + Math.PI) < 1e-9);
  assert.ok(Math.abs(angDiff(0.1, -0.1) + 0.2) < 1e-12);
});
test('util: hashStr·makeRng 결정성과 범위', () => {
  assert.equal(hashStr('golmok'), hashStr('golmok')); assert.notEqual(hashStr('a'), hashStr('b'));
  assert.ok(Number.isInteger(hashStr('')) && hashStr('') >= 0 && hashStr('') < 2 ** 32);
  const a = makeRng('seed'), b = makeRng('seed'), c = makeRng(hashStr('seed'));
  for (let i = 0; i < 200; i++) { const x = a(); assert.equal(x, b()); assert.equal(x, c()); assert.ok(x >= 0 && x < 1); }
  const r = makeRng(7);
  for (let i = 0; i < 500; i++) { const n = r.int(1, 3); assert.ok(n >= 1 && n <= 3); const v = r.range(-2, 2); assert.ok(v >= -2 && v <= 2); }
  assert.equal(makeRng(1).weighted([['only', 1]]), 'only');
  assert.equal(makeRng(1).weighted([['a', 0], ['b', 0]]), 'a'); // 합이 0이면 첫 항목
});
test('util: josa 받침', () => {
  assert.equal(josa('나비', '이', '가'), '나비가'); assert.equal(josa('점순', '이', '가'), '점순이'); assert.equal(josa('cat', '이', '가'), 'cat가');
});
test('util: fmtCount 표기 (D-20)', () => {
  const cases = [[0, '0'], [-5, '0'], [NaN, '0'], ['12', '12'], [999, '999'], [1000, '1K'], [1049, '1K'], [1099, '1K'], [1100, '1.1K'], [1234, '1.2K'], [12345, '12.3K'],
    [999999, '999.9K'], [1e6, '1M'], [1250000, '1.2M'], [999.9, '999']];
  for (const [n, s] of cases) assert.equal(fmtCount(n), s, String(n));
});
test('color: mixHex 끝점과 범위', () => {
  assert.equal(mixHex('#4d6f98', '#e2ab45', 0), '#4d6f98'); assert.equal(mixHex('#4d6f98', '#e2ab45', 1), '#e2ab45');
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#bcbcbc'); // 선형 공간에서 반 = sRGB 188 (three 와 같음)
  assert.match(mixHex('#123456', '#abcdef', 0.37), /^#[0-9a-f]{6}$/);
});
test('time: 해의 높이 (서울 정오 > 0, 자정 < 0)', () => {
  const noon = sunPosition(new Date(Date.UTC(2026, 9, 18, 3, 30)), 37.55, 126.99).alt, night = sunPosition(new Date(Date.UTC(2026, 9, 18, 15, 0)), 37.55, 126.99).alt;
  assert.ok(noon > 0.5 && night < -0.5, `${noon} ${night}`);
  assert.equal(DAY, 86400000); assert.equal(EPOCH, Date.UTC(2026, 8, 1, -9));
});
test('genome: 결정성·나이 구간·이름', () => {
  const g1 = makeGenome(makeRng('t'), { sex: 'm', months: 1 }), g2 = makeGenome(makeRng('t'), { sex: 'm', months: 1 });
  assert.deepEqual(g1, g2); assert.notEqual(g1.pattern, 'calico'); assert.notEqual(g1.pattern, 'tortie'); // 수컷은 암컷 전용 무늬 없음
  assert.equal(makeGenome(makeRng('t'), { sex: 'f', months: 5.99 }).tnr, false); // 6개월 미만은 중성화 표시 없음
  assert.deepEqual([0, 1.99, 2, 5.99, 6, 11.99, 12].map((m) => stageOf(m).key), ['baby', 'baby', 'kit', 'kit', 'teen', 'teen', 'adult']);
  assert.deepEqual([0.1, 0.5, 3.2, 12, 30].map(ageText), ['1주', '2주', '3개월', '1살', '2살']);
  assert.equal(traitTags(makePersonality(makeRng('p'), false)).length, 2);
  const used = new Set(), r = makeRng('names');
  for (let i = 0; i < 30; i++) nameFor(r, makeGenome(makeRng('n' + i), { sex: 'f', months: 20 }), used);
  assert.equal(used.size, 30); // 같은 골목에서 이름이 겹치지 않는다
});
test('regions: 활성 단위 16곳·코드 변환·이름', () => {
  assert.equal(REGION_LEVEL, 'sido'); assert.equal(REGIONS.units.length, 16);
  assert.equal(REGIONS.unitOf('1111054000').c, '11'); assert.equal(REGIONS.unitOf('99'), null); assert.equal(REGIONS.unitOf(null), null);
  assert.equal(regionFull(REGIONS.unitOf('11')), '서울특별시'); assert.equal(sggShort('수원시장안구'), '수원시 장안구'); assert.equal(sggShort(''), '');
  for (const u of REGIONS.units) { assert.ok(THEME_LABEL[themeFor(u)]); assert.equal(themeFor(u), themeFor(u)); }
  assert.ok(REGIONS.search('종로').length > 0); assert.deepEqual(REGIONS.search('   '), []);
});
test('clock: 일정 칸 길이·연속성·캐시 무관', () => {
  const C = createClock(memStore()), cat = dongPopulation({ c: '11' }, T0)[0]; cat.geo = { lat: 37.55, lng: 126.99 };
  const list = C.between(cat, T0, T0 + 2 * 3600000);
  for (let i = 0; i < list.length; i++) {
    const e = list[i]; assert.ok(ACTIONS[e.key], e.key); assert.ok(e.t1 > e.t0 && e.t1 - e.t0 <= 4 * CLOCK.SLOT);
    if (i && Math.floor(e.t0 / CLOCK.BLOCK) === Math.floor(list[i - 1].t0 / CLOCK.BLOCK)) assert.equal(e.t0, list[i - 1].t1);
  }
  const before = JSON.stringify(list.map((e) => [e.key, e.t0])); C.cache.clear();
  assert.equal(JSON.stringify(C.between(cat, T0, T0 + 2 * 3600000).map((e) => [e.key, e.t0])), before);
  const st = C.state(cat, T0, [], false);
  for (const v of [...Object.values(st.needs), ...Object.values(st.emo)]) assert.ok(v >= 0 && v <= 1);
  for (const h of [0, 6, 12, 18, 23.99]) { const v = circadian(h); assert.ok(v > 0.15 && v < 1.2); }
  const v = vnoise('x', 12345, 1000); assert.ok(v >= 0 && v <= 1); assert.equal(v, vnoise('x', 12345, 1000));
  // personal=true 일 때만 저장소의 츄르 시각을 읽는다
  const S = memStore(), C2 = createClock(S); S.set('fed:' + cat.id, T0 - 1000);
  assert.ok(C2.state(cat, T0, [], true).needs.hunger <= C2.state(cat, T0, [], false).needs.hunger);
  assert.ok(typeof STEP.wait(1).tick === 'function');
});
test('trips: 이웃·겹침 없음·칸 안에서 끝남', () => {
  const TRIP = tripConfig(), T = createTrips(TRIP, REGIONS);
  assert.deepEqual(T.neighbors('50'), []); // 제주는 이웃 없음
  for (const [a, list] of NEIGHBORS) for (const b of list) assert.ok(NEIGHBORS.get(b).includes(a)); // 대칭
  const all = T.between(T0, T0 + 24 * 3600000);
  for (const t of all) {
    assert.ok(['fight', 'play'].includes(t.kind)); assert.ok(T.neighbors(t.from).includes(t.to));
    const d = (t.t1 - t.t0) / 1000; assert.ok(d >= TRIP.DUR[0] && d <= TRIP.DUR[1]);
    assert.equal(Math.floor(t.t0 / TRIP.SLOT), Math.floor((t.t1 - 1) / TRIP.SLOT));
  }
  for (const c of T.codes()) { // 한 지역은 같은 시각에 외출 하나·손님 하나만
    const mine = all.filter((t) => t.from === c || t.to === c).sort((a, b) => a.t0 - b.t0);
    for (let i = 1; i < mine.length; i++) assert.ok(mine[i].t0 >= mine[i - 1].t1);
  }
  assert.deepEqual(tripConfig([12, 14]).DUR, [12, 14]);
});
test('touch_rules: 극성 일치·말 해석', () => {
  for (const t of THOUGHTS) assert.ok(REACT_META[t.r[0]] && REACT_META[t.r[0]].pol === t.pol, t.t);
  for (const m of Object.values(REACT_META)) assert.equal(EMO_POL[m.emo], m.pol);
  for (let i = 0; i < 300; i++) {
    const a = { p: makePersonality(makeRng('x' + i), false), r: makeRng('y' + i), cat: { id: 'c' + i } };
    const x = resolveRule(a, { kind: 'pet', part: ['head', 'chin', 'back', 'belly'][i % 4] }, (i % 11) / 10);
    assert.ok(REACT_META[x.reaction]); if (x.thoughtPol !== null) assert.equal(x.thoughtPol, x.pol);
  }
  const w = petPolarityWeights('dog', 'head', 5); assert.deepEqual(w, petPolarityWeights('dog', 'head', 1)); // 신뢰는 0~1로 자른다
  assert.equal(interpret('하악').intent, 'hiss'); assert.equal(interpret('그르릉').intent, 'calm'); assert.equal(interpret('').intent, 'unknown'); assert.equal(interpret(null).intent, 'unknown');
  assert.equal(touchType('11-m', makePersonality(makeRng('q'), false)), touchType('11-m', makePersonality(makeRng('q'), false)));
});
test('recipe_rules: 제한값 경계·샘플', () => {
  const base = (o = {}) => ({ name: '시험', duration_s: 6, steps: [{ t: 0, pose: 'sit' }], ...o });
  assert.equal(validateRecipe(base({ duration_s: RLIM.durMin })).ok, true); assert.equal(validateRecipe(base({ duration_s: RLIM.durMax })).ok, true);
  assert.equal(validateRecipe(base({ duration_s: RLIM.durMin - 0.01 })).ok, false); assert.equal(validateRecipe(base({ duration_s: RLIM.durMax + 0.01 })).ok, false);
  assert.equal(validateRecipe(base({ name: 'a'.repeat(RLIM.name) })).ok, true); assert.equal(validateRecipe(base({ name: 'a'.repeat(RLIM.name + 1) })).ok, false);
  assert.equal(validateRecipe(base({ steps: Array.from({ length: RLIM.steps }, () => ({ t: 0, pose: 'sit' })) })).ok, true);
  assert.equal(validateRecipe(base({ steps: Array.from({ length: RLIM.steps + 1 }, () => ({ t: 0, pose: 'sit' })) })).ok, false);
  assert.equal(parseRecipeText('x'.repeat(RLIM.raw + 1)).errors.length, 1);
  for (const s of RECIPE_SAMPLES) { const p = parseRecipeText(s.text); assert.ok(!p.errors); assert.equal(validateRecipe(p.value).ok, true); }
  const p = recipePrompt(); for (const w of RV.pose) assert.ok(p.includes(w));
  assert.equal(validateRecipe(JSON.parse('{"__proto__":{"x":1},"name":"x","duration_s":5,"steps":[{"t":0,"pose":"sit"}]}')).ok, false);
});
