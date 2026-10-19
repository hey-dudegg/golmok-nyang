// 단계 3에서 core 로 옮긴 순수 모듈의 node 단위 시험: format(표기)·recipe_action(레시피 -> 행동)·sido_map(시/도 지도)
// 사용: node --test tests/unit/  (또는 npm run test:unit)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { swatch, timeAgo, fmtKST } from '../../prototype/src/core/format.js';
import { recipeToAction, recipeGuard, recipeStepParts, RECIPE_EMO } from '../../prototype/src/core/recipe_action.js';
import { buildSidoMap } from '../../prototype/src/core/sido_map.js';
import { BOUNDS, STEP } from '../../prototype/src/core/behavior.js';
import { EMO_DEFS } from '../../prototype/src/core/clock.js';
import { parseRecipeText, validateRecipe, RECIPE_SAMPLES, RLIM } from '../../prototype/src/core/recipe_rules.js';
import { buildRegions } from '../../prototype/src/core/regions.js';
import { makeGenome } from '../../prototype/src/core/genome.js';
import { makeRng, hashStr } from '../../prototype/src/core/util.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('format: fmtKST 는 KST 시각, timeAgo 구간', () => {
  assert.equal(fmtKST(Date.UTC(2026, 9, 18, 3, 0, 5)), '12:00:05');
  assert.equal(fmtKST(Date.UTC(2026, 9, 18, 15, 59, 59)), '00:59:59');
  const now = Date.now();
  assert.equal(timeAgo(now - 30e3), '방금');
  assert.equal(timeAgo(now - 125e3), '2분 전');
  assert.equal(timeAgo(now - 2 * 3600e3 - 5e3), '2시간 전');
  assert.match(timeAgo(now - 3 * 86400e3), /월 \d+일$/);
});

test('format: swatch 는 무늬마다 정해진 CSS 배경', () => {
  const g = (o) => ({ colors: { base: '#111111', white: '#ffffff', patch: '#cc6600', stripe: '#333333' }, pattern: 'solid', whiteAmt: 0, stripeAmt: 0, ...o });
  assert.match(swatch(g({ pattern: 'calico' })), /^conic-gradient\(#111111 0 35%, #ffffff 0 70%, #cc6600 0\)$/);
  assert.match(swatch(g({ pattern: 'tortie' })), /^conic-gradient/);
  assert.equal(swatch(g({ whiteAmt: 1 })), '#ffffff');
  assert.match(swatch(g({ whiteAmt: 0.5 })), /^linear-gradient/);
  assert.match(swatch(g({ stripeAmt: 0.8 })), /^repeating-linear-gradient/);
  assert.equal(swatch(g({})), '#111111');
  for (let i = 0; i < 60; i++) { const s = swatch(makeGenome(makeRng('sw' + i), {})); assert.equal(typeof s, 'string'); assert.ok(s.length > 3 && !/undefined/.test(s), s); }
});

// 레시피 행동이 쓰는 고양이 쪽 최소 기능만 흉내 낸다
const fakeAgent = (o = {}) => ({ E: 0.5, B: 0.5, x: 0, z: 0, p: { bold: 0.5, food: 0.5 }, world: { blocked: () => false },
  randomPoint: (r, n) => ({ x: r.range(-n, n), z: r.range(-n, n) }), nearYou: () => [0, 0.5], ov: {}, ...o });

test('recipe_action: 샘플 레시피 -> 행동 (점수 범위·단계 모양·감정 가중)', () => {
  const emoKeys = new Set(EMO_DEFS.map(([k]) => k));
  for (const s of RECIPE_SAMPLES) {
    const p = parseRecipeText(s.text); assert.ok(!p.errors, s.label);
    const v = validateRecipe(p.value); assert.ok(v.ok, s.label);
    const fails = [];
    const A = recipeToAction('t', v.recipe, (e) => fails.push(e));
    assert.equal(A.label, v.recipe.name); assert.equal(A.recipe, true);
    for (const E of [0, 0.5, 1]) { const sc = A.score(fakeAgent({ E, B: 1 - E })); assert.ok(Number.isFinite(sc) && sc >= 0 && sc <= 1.6, `${s.label} ${sc}`); }
    const steps = A.steps(fakeAgent(), makeRng('r:' + s.label));
    assert.ok(steps.length >= v.recipe.steps.length, s.label);
    for (const st of steps) { assert.equal(typeof st.start, 'function'); assert.equal(typeof st.tick, 'function'); }
    for (const [k, w] of Object.entries(A.emoBias)) { assert.ok(emoKeys.has(k), k); assert.equal(w, 0.9); }
    assert.equal(fails.length, 0, s.label);
  }
  for (const list of Object.values(RECIPE_EMO)) for (const k of list) assert.ok(emoKeys.has(k), k);
});

test('recipe_action: 단계 값은 정해진 단어만 쓰고, 오류는 끄기로 이어진다', () => {
  const sp = recipeStepParts({ ears: 'back_flat', eyes: 'half_closed', pupil: 'large', tail: 'up' });
  assert.deepEqual({ eL: sp.ex.eL, eR: sp.ex.eR, eye: sp.ex.eye, pupil: sp.ex.pupil, tb: sp.ex.tb }, { eL: 1, eR: 1, eye: 0.45, pupil: 0.95, tb: 1.3 });
  // 모르는 단어는 검증(validateRecipe)에서 먼저 걸러진다. 단계 변환은 검증을 통과한 값만 받는다
  const bad = JSON.parse(RECIPE_SAMPLES[0].text.trim().replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
  bad.steps[0].ears = '__proto__';
  assert.equal(validateRecipe(bad).ok, false);
  // 가드: start·tick 에서 예외가 나면 onFail 을 한 번 부르고 단계를 끝낸다
  let n = 0;
  const g = recipeGuard({ start() { throw new Error('x'); }, tick() { return false; } }, () => n++);
  g.start({}); assert.equal(g.tick({}, 0.1), true); assert.equal(n, 1);
  const g2 = recipeGuard({ start() {}, tick() { throw new Error('y'); } }, () => n++);
  g2.start({}); assert.equal(g2.tick({}, 0.1), true); assert.equal(n, 2);
  // 점수 계산 중 오류(고양이 값이 이상함)는 0점 + 알림
  const v = validateRecipe(parseRecipeText(RECIPE_SAMPLES[0].text).value);
  let f = 0; const A = recipeToAction('t', { ...v.recipe, when: { need: '에너지 높음' } }, () => f++);
  assert.equal(A.score({ get E() { throw new Error('bad'); }, p: {} }), 0); assert.equal(f, 1);
  // 벽으로 가기는 무대 범위 안
  const w = { steps: [{ t: 0, move: 'to:wall', pose: 'sit' }], duration_s: 3, name: '벽', when: {} };
  const st = recipeToAction('w', w, () => {}).steps(fakeAgent({ x: 2.5 }), makeRng('w'));
  assert.ok(st.length >= 2);
  assert.ok(BOUNDS.x0 < BOUNDS.x1 && BOUNDS.z0 < BOUNDS.z1 && STEP.walk && RLIM.durMax > 0);
});

test('sido_map: 시/도 16곳 경로·이름 자리, 같은 자료는 한 번만 계산', () => {
  const REGIONS = buildRegions(JSON.parse(fs.readFileSync(path.join(ROOT, 'prototype/data/regions.json'), 'utf8')));
  const M = buildSidoMap(REGIONS);
  assert.equal(M.paths.size, 16); assert.equal(M.labels.size, 16);
  for (const [c, d] of M.paths) { assert.match(d, /^M[\d.,L]+Z/, c); }
  for (const [c, [x, y]] of M.labels) assert.ok(x > 0 && x < M.W && y > 0 && y < M.H, c);
  assert.equal(buildSidoMap(REGIONS), M);
  const H = hashStr([...M.paths].map(([c, d]) => c + d).join('|'));
  const M2 = buildSidoMap(buildRegions(JSON.parse(fs.readFileSync(path.join(ROOT, 'prototype/data/regions.json'), 'utf8'))));
  assert.notEqual(M2, M); assert.equal(hashStr([...M2.paths].map(([c, d]) => c + d).join('|')), H);
});
