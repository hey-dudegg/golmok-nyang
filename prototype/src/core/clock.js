// core/clock.js: 세계 시계의 계산 부분 (원래 index.html 62_clock 구역, D-19·D-33 단계 2)
// 브라우저 저장(localStorage)은 직접 쓰지 않는다. createClock(store) 로 store({ get(k, d), set(k, v) })를 넘겨받는다.
// (index.html: const Clock = createClock(store). node 시험은 메모리 store 를 넘긴다)
import { clamp, lerp, smooth, hashStr, makeRng } from './util.js';
import { DAY, sunPosition } from './time.js';
import { ACTIONS } from './behavior.js';
// ───────────────────────── 세계 시계 (D-19) ─────────────────────────
// 서버 없이 시각만으로 고양이의 하루를 계산한다. 같은 (고양이 id, 시각)이면 누가 언제 들어와도 같은 행동·같은 자리 근처가 나온다.
//  · 시간을 30초 칸으로 나누고, 칸마다 (고양이 id, 칸 번호) 시드로 "무슨 행동을, 몇 칸(60~120초) 동안, 어디서" 할지 정한다.
//  · 10분(20칸)마다 일정을 새로 이어 붙이는 기준점을 두어, 접속 순간 최근 10~30분만 계산하면 된다.
//  · 욕구·감정은 시각의 함수. 교감으로 생기는 변화(츄르 먹은 시각 등)는 일정에 쓰지 않고 표시용 상태에만 반영한다.
export const CLOCK = { SLOT: 30000, BLOCK_SLOTS: 20, DEPTH: 3 };
CLOCK.BLOCK = CLOCK.SLOT * CLOCK.BLOCK_SLOTS;
export const PASSIVE_KEYS = new Set(['sit', 'loaf', 'nap', 'sideNap', 'belly', 'groom', 'stretch', 'yawn', 'watch']);
export const NEED_DEFS = [['sleep', '졸림'], ['hunger', '배고픔'], ['play', '놀고 싶음'], ['social', '관심이 고픔']];
export const EMO_DEFS = [['calm', '편안'], ['happy', '기쁨'], ['playful', '장난'], ['curious', '호기심'], ['wary', '경계'], ['scared', '겁'], ['grumpy', '짜증'], ['lonely', '외로움']];
// 감정이 행동 점수를 얼마나 밀어 주는지 (감정 0.5가 기준)
export const EMO_BIAS = {
  sit: { calm: 0.4 }, loaf: { calm: 0.6 }, nap: { calm: 0.3, scared: -0.5 }, sideNap: { calm: 0.4, wary: -0.8 }, belly: { happy: 0.8, wary: -0.8 },
  groom: { calm: 0.4 }, wander: { curious: 0.7 }, hunt: { playful: 0.9 }, zoom: { playful: 1, scared: -0.6 }, watch: { curious: 0.6, lonely: 0.6, wary: 0.3 },
  hissAt: { grumpy: 0.9, wary: 0.5 }, greet: { happy: 0.4, lonely: 0.5 },
};
export function vnoise(seed, ms, periodMs) { // 시각에 따라 천천히 변하는 0~1 값 (칸 사이는 부드럽게 이음)
  const c = Math.floor(ms / periodMs), f = ms / periodMs - c;
  const a = hashStr(seed + ':' + c) / 4294967296, b = hashStr(seed + ':' + (c + 1)) / 4294967296;
  return lerp(a, b, smooth(f));
}
export function circadian(hour) { // 한낮·새벽에 졸림이 높고 해질녘·이른 아침에 낮은 하루 곡선
  const g = (x, c, w) => { let d = Math.abs(x - c); d = Math.min(d, 24 - d); return Math.exp(-(d * d) / (2 * w * w)); };
  return 0.2 + 0.5 * g(hour, 14, 3) + 0.45 * g(hour, 2.5, 3);
}
// 시계 객체를 만든다. 예전 index.html 의 const Clock = { ... } 와 같은 객체(안의 코드는 그대로)
export function createClock(store) {
  return {
  cache: new Map(),
  state(cat, ms, recent, personal) {
    const p = cat.g.personality, id = cat.id, kitten = cat.g.months < 6;
    const hour = (((ms + 9 * 3600000) % DAY) + DAY) % DAY / 3600000;
    const nz = (k, per) => vnoise(id + ':' + k, ms, per) - 0.5;
    const sleep = clamp(circadian(hour) + (0.5 - p.energy) * 0.3 + nz('sl', 900000) * 0.24 - (kitten ? 0.05 : 0), 0, 1);
    const passive = (recent || []).slice(0, 4).filter((k) => PASSIVE_KEYS.has(k)).length;
    const nAct = Math.min(4, (recent || []).length);
    const play = clamp(0.4 + 0.12 * (passive - nAct / 2) * (nAct ? 1 : 0) + (p.playful - 0.5) * 0.3 + (kitten ? 0.15 : 0) + nz('pl', 600000) * 0.2, 0, 1);
    // 배고픔: 마지막 식사 뒤 시간. 식사 시각은 8시간 주기에 고양이마다 정해진 흔들림을 준 값 (츄르는 personal일 때만 반영)
    const cyc = 8 * 3600000; let cell = Math.floor(ms / cyc);
    const mealAt = (cl) => cl * cyc + (hashStr(id + ':meal:' + cl) / 4294967296) * cyc * 0.5;
    let meal = mealAt(cell); if (meal > ms) meal = mealAt(cell - 1);
    if (personal) { const fed = store.get('fed:' + id, 0); if (fed > meal && fed <= ms) meal = fed; }
    const hunger = clamp(((ms - meal) / (9 * 3600000)) * (0.6 + 0.8 * p.food), 0, 1);
    const touch = personal ? store.get('touch:' + id, 0) : 0;
    const social = clamp(0.25 + (touch ? clamp((ms - touch) / (6 * 3600000), 0, 1) * 0.5 * (0.4 + p.social) : 0.15 * (0.4 + p.social)) + nz('so', 1200000) * 0.2, 0, 1);
    const needs = { sleep, hunger, play, social };
    const e = (k, v) => clamp(v + nz('e' + k, 420000) * 0.2, 0, 1);
    const emo = {
      calm: e('calm', 0.35 + 0.35 * sleep + 0.2 * (1 - p.grumpy) - 0.25 * play + 0.1 * (p.bold - 0.5)),
      happy: e('happy', 0.25 + 0.3 * (1 - hunger) + 0.2 * (1 - social) + 0.2 * (p.social - 0.5)),
      playful: e('playful', 0.2 + 0.5 * play * (1 - sleep) + 0.35 * (p.playful - 0.5) + (kitten ? 0.15 : 0)),
      curious: e('curious', 0.25 + 0.4 * play + 0.25 * (p.bold - 0.5)),
      wary: e('wary', 0.2 + 0.35 * (1 - p.bold) + 0.15 * p.grumpy),
      scared: e('scared', 0.05 + 0.4 * (1 - p.bold)),
      grumpy: e('grumpy', 0.1 + 0.45 * p.grumpy + 0.25 * hunger + 0.15 * sleep),
      lonely: e('lonely', 0.1 + 0.6 * social * (0.4 + p.social)),
    };
    return { needs, emo };
  },
  ctx(cat, ms, st) { // 점수 함수(ACTIONS[k].score)가 읽는 모양으로 맞춘 계산용 대역
    const { alt } = sunPosition(new Date(ms), cat.geo.lat, cat.geo.lng), deg = alt * 180 / Math.PI;
    return { p: cat.g.personality, kitten: cat.g.months < 6, cat, E: 1 - st.needs.sleep, B: st.needs.play,
      world: { night: deg < -3 ? 1 : 0, day: smooth(clamp((deg + 4) / 14, 0, 1)) }, nearestCat: () => null, mom: () => null };
  },
  weights(cat, ms, st, recent) { // 행동 후보와 점수 (잡음 전). recent: 최근 행동 키, 최신이 앞
    const c = this.ctx(cat, ms, st), out = [];
    for (const [k, A] of Object.entries(ACTIONS)) {
      if (k === 'followMom' && !cat.mother) continue;
      let s = A.score(c, c.world);
      const ri = recent.indexOf(k);
      s *= ri === 0 ? 0.3 : ri === 1 ? 0.6 : ri > 1 ? 0.85 : 1.3;
      if (c.kitten && (k === 'sideNap' || k === 'hissAt')) s *= 0.3;
      const bias = EMO_BIAS[k];
      if (bias) { let m = 1; for (const [ek, w] of Object.entries(bias)) m += w * (st.emo[ek] - 0.5) * 2; s *= clamp(m, 0.4, 1.8); }
      if (s > 0) out.push({ key: k, label: A.label, w: s });
    }
    return out.sort((a, b) => b.w - a.w);
  },
  top5(cat, ms, st, recent) { // 화면 표시용: 상위 5개와 확률
    const l = this.weights(cat, ms, st, recent).slice(0, 5), sum = l.reduce((s, x) => s + x.w, 0) || 1;
    return l.map((x) => ({ ...x, p: x.w / sum }));
  },
  block(cat, b, depth = CLOCK.DEPTH) { // 10분 구간 b의 일정. depth만큼 앞 구간을 이어 반복 방지에 쓴다
    const ck = cat.id + '|' + b + '|' + depth;
    const hit = this.cache.get(ck); if (hit) return hit;
    if (this.cache.size > 400) this.cache.clear();
    const prev = depth > 0 ? this.block(cat, b - 1, depth - 1) : [];
    const t0 = b * CLOCK.BLOCK, end = t0 + CLOCK.BLOCK, out = [];
    let t = t0;
    while (t < end) {
      const slot = Math.round(t / CLOCK.SLOT), rs = makeRng('clock:' + cat.id + ':' + slot);
      const n = rs.pick([2, 3, 3, 4]); // 60~120초
      const recent = [...out.map((e) => e.key).reverse(), ...prev.map((e) => e.key).reverse()].slice(0, 5);
      const st = this.state(cat, t, recent, false);
      const cand = this.weights(cat, t, st, recent).map((x) => [x.key, x.w * (0.7 + rs() * 0.6)]).sort((a, c) => c[1] - a[1]).slice(0, 5);
      const key = cand.length ? rs.weighted(cand) : 'sit';
      out.push({ key, label: ACTIONS[key].label, slot, t0: t, t1: Math.min(t + n * CLOCK.SLOT, end), seed: 'clock:' + cat.id + ':' + slot + ':run' });
      t += n * CLOCK.SLOT;
    }
    this.cache.set(ck, out);
    return out;
  },
  entryAt(cat, ms) { // 그 시각의 행동과 바로 앞 행동
    const b = Math.floor(ms / CLOCK.BLOCK), list = this.block(cat, b);
    let i = list.findIndex((e) => ms >= e.t0 && ms < e.t1); if (i < 0) i = list.length - 1;
    const prev = i > 0 ? list[i - 1] : this.block(cat, b - 1).slice(-1)[0];
    return { entry: list[i], prev };
  },
  between(cat, t0, t1) { // [t0, t1) 안의 일정 목록
    const out = [];
    for (let b = Math.floor(t0 / CLOCK.BLOCK); b * CLOCK.BLOCK < t1; b++) for (const e of this.block(cat, b)) if (e.t1 > t0 && e.t0 < t1) out.push(e);
    return out;
  },
  recentAt(cat, ms) { // 그 시각 행동 앞의 최근 행동 키(최신이 앞)
    const b = Math.floor(ms / CLOCK.BLOCK), list = [...this.block(cat, b - 1), ...this.block(cat, b)];
    let i = list.findIndex((e) => ms >= e.t0 && ms < e.t1); if (i < 0) i = list.length - 1;
    return list.slice(Math.max(0, i - 5), i).map((e) => e.key).reverse();
  },
  stateAt(cat, ms, personal = true) { return this.state(cat, ms, this.recentAt(cat, ms), personal); },
  home(entry, world) { // 이 행동을 하는 자리 (장애물을 피한 시드 난수)
    if (entry.H) return entry.H;
    const r = makeRng(entry.seed + ':home');
    for (let i = 0; i < 30; i++) { const x = r.range(-1.8, 1.8), z = r.range(-1.0, 0.7); if (!world.blocked(x, z, 0.3)) return (entry.H = { x, z }); }
    return (entry.H = { x: 0, z: 0 });
  },
  markFed(cat) { store.set('fed:' + cat.id, Date.now()); },
  markTouch(cat) { store.set('touch:' + cat.id, Date.now()); },
  };
}
