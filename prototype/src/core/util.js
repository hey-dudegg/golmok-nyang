// core/util.js: 수학·해시·난수·글자 도우미 (원래 index.html 00_util 구역, D-33 리팩토링 단계 2)
// core 규칙: three·DOM·window·전역 app 에 닿지 않는다. 다른 core 모듈만 import 한다(순환 금지).
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * (1 - Math.exp(-lambda * dt));
}
export function angDiff(a, b) { return ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; }

// string → 32bit hash
export function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeRng(seed) {
  const r = mulberry32(typeof seed === 'string' ? hashStr(seed) : seed >>> 0);
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.weighted = (pairs) => { // [[item, w], ...]
    let s = 0; for (const p of pairs) s += p[1];
    let x = r() * s;
    for (const p of pairs) { x -= p[1]; if (x <= 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  };
  r.gauss = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  return r;
}
export function josa(word, a, b) { // 받침 여부에 따라 조사 선택 (이/가, 은/는, 을/를)
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return word + b;
  return word + (((c - 0xac00) % 28) ? a : b);
}
// 숫자 표기 (D-20): 999까지 그대로, 1,000 이상 1.2K, 1,000,000 이상 1.2M
export function fmtCount(n) {
  n = Math.max(0, Math.floor(+n || 0));
  if (n < 1000) return String(n);
  const f = (v, u) => { const t = Math.floor(v / 100) / 10; return (Number.isInteger(t) ? String(t) : t.toFixed(1)) + u; };
  return n < 1e6 ? f(n, 'K').replace(/^1000K$/, '999.9K') : f(n / 1000, 'M');
}
