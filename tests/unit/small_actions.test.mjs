// M11-2: 작은 동작 5개(shake·tailFlick·sneeze·lookUp·freeze) 점수 조건 단조성·제한
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../../prototype/src/core/behavior.js';
import { EMO_BIAS, PASSIVE_KEYS } from '../../prototype/src/core/clock.js';

const KEYS = ['shake', 'tailFlick', 'sneeze', 'lookUp', 'freeze'];
const adult = (o = {}) => ({ p: { bold: 0.5, playful: 0.5, grumpy: 0.5, social: 0.5, energy: 0.5 }, kitten: false, E: 0.7, B: 0.3, world: { night: 0, day: 1 }, ...o });
const bias = (k, emo) => { let m = 1; for (const [ek, w] of Object.entries(EMO_BIAS[k] || {})) m += w * ((emo[ek] ?? 0.5) - 0.5) * 2; return Math.min(1.8, Math.max(0.4, m)); };

test('5개 행동 등록·점수 양수(아기 tailFlick 제외)·라벨', () => {
  for (const k of KEYS) { assert.ok(ACTIONS[k] && ACTIONS[k].label); assert.ok(ACTIONS[k].score(adult(), {}) > 0); }
  assert.equal(ACTIONS.tailFlick.score(adult({ kitten: true }), {}), 0);
});
test('감정이 높을수록 점수 상승(단조)', () => {
  const pairs = { tailFlick: 'grumpy', lookUp: 'curious', freeze: 'scared', shake: 'playful' };
  for (const [k, e] of Object.entries(pairs)) { let prev = 0; for (const v of [0, 0.25, 0.5, 0.75, 1]) { const m = bias(k, { [e]: v }); assert.ok(m >= prev, k); prev = m; } assert.ok(bias(k, { [e]: 1 }) > bias(k, { [e]: 0 }), k); }
});
test('점수는 주요 행동보다 낮다(사이 동작)', () => { for (const k of KEYS) assert.ok(ACTIONS[k].score(adult(), {}) * 1.8 < ACTIONS.sit.score(adult(), {}), k); });
test('PASSIVE: 앉은 채 하는 동작만', () => { for (const k of ['sneeze', 'tailFlick', 'lookUp']) assert.ok(PASSIVE_KEYS.has(k)); assert.ok(!PASSIVE_KEYS.has('shake') && !PASSIVE_KEYS.has('freeze')); });
