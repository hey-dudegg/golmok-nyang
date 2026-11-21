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

// M12-2: ★2차 5개(sunbathe·sniffProp·cheekRub·crateNap·tailChase)
import { PROPS } from '../../prototype/src/core/props.js';
import { PROP_ACTIONS } from '../../prototype/src/core/prop_actions.js';
const K2 = ['sunbathe', 'sniffProp', 'cheekRub', 'tailChase'];
const mkRng = () => { let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); r.range = (a, b) => a + r() * (b - a); r.int = (a, b) => Math.floor(r.range(a, b + 1)); r.chance = (p) => r() < p; r.pick = (l) => l[Math.floor(r() * l.length)]; return r; };
const agent = (o = {}) => { const a = { ...adult(), x: 0.3, z: 0.2, yaw: 0, yawTarget: 0, ov: {}, arrived: true, r: mkRng(), setPose() {}, moveTo(x, z) { this.x = x; this.z = z; this.arrived = true; }, yawTo(p) { return Math.atan2(p.x - this.x, p.z - this.z); }, randomPoint(r) { return { x: this.x + r.range(-1, 1), z: this.z + r.range(-0.5, 0.5) }; }, slowBlink() {}, lookRandom() {}, say() {}, ...o }; return a; };
const run = (a, steps) => { let n = 0; for (const s of steps) { s.start && s.start(a); for (let i = 0; i < 4000; i++) { n++; a.yaw = a.yawTarget; if (s.tick(a, 0.1)) break; if (i === 3999) assert.fail('step 무한'); } } return n; };
const withProps = (l, f) => { const old = PROPS.layout; PROPS.layout = l; try { f(); } finally { PROPS.layout = old; } };
test('M12-2 등록·낮 점수·아기 전용·오브젝트 유무', () => {
  for (const k of [...K2, 'crateNap']) assert.ok((ACTIONS[k] || PROP_ACTIONS[k]).label);
  assert.ok(ACTIONS.sunbathe.score(adult({ world: { day: 1, night: 0 } })) > ACTIONS.sunbathe.score(adult({ world: { day: 0, night: 1 } })) * 3);
  assert.equal(ACTIONS.tailChase.score(adult()), 0); assert.ok(ACTIONS.tailChase.score(adult({ kitten: true })) > 0);
  withProps([], () => assert.equal(ACTIONS.sniffProp.score(agent()), 0));
  withProps([{ kind: 'crate', id: 'c1', x: 1, z: 0.3, rot: 0 }], () => assert.ok(ACTIONS.sniffProp.score(agent()) > 0));
  for (const k of [...K2, 'crateNap']) for (const w of [{ day: 0, night: 1 }, { day: 1, night: 0 }]) { const A = ACTIONS[k] || PROP_ACTIONS[k]; assert.ok(A.score(adult({ kitten: true, world: w, slot: null })) * 1.8 < 0.75 || k === 'crateNap'); }
});
test('M12-2 steps 유한·끝남·좌표 NaN 없음', () => {
  const L = [{ kind: 'crate', id: 'c1', x: 1, z: 0.3, rot: 0 }, { kind: 'car', id: 'k1', x: -1.2, z: -0.8, rot: 0.4 }];
  withProps(L, () => { for (const k of K2) for (let i = 0; i < 6; i++) { const a = agent({ kitten: true, r: mkRng() }); const st = ACTIONS[k].steps(a, a.r); assert.ok(st.length > 0 && st.length < 30, k); run(a, st); assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z) && Number.isFinite(a.yaw), k); } });
  withProps([], () => { for (const k of K2) { const a = agent({ kitten: true }); run(a, ACTIONS[k].steps(a, a.r)); } });
});
test('M12-2 tailChase 2~4바퀴', () => { const a = agent({ kitten: true }); const y0 = a.yaw; run(a, ACTIONS.tailChase.steps(a, a.r)); const t = (a.yaw - y0) / (Math.PI * 2); assert.ok(t >= 1.99 && t <= 4.01, String(t)); });
test('M12-2 crateNap 상자 없으면 점수 0, 있으면 자리 null 아님·쿨다운', () => {
  withProps([], () => assert.equal(PROP_ACTIONS.crateNap.score(agent()), 0));
  withProps([{ kind: 'crate', id: 'c1', x: 1, z: 0.3, rot: 0 }], () => { const a = agent({ time: 0, pm: { cool: {}, recent: [], rej: 0, touchT: -1e9, log: [] } }); assert.ok(PROP_ACTIONS.crateNap.score(a) > 0); a.pm.cool['c1:in'] = 90; assert.equal(PROP_ACTIONS.crateNap.score(a), 0); a.pm.cool = {}; a.pm.recent = ['crateNap']; assert.equal(PROP_ACTIONS.crateNap.score(a), 0); });
});
