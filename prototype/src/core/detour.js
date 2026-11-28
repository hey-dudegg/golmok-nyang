// 소품 접근 우회점 계산 (M24-2b, 설계 소품_접근_우회_설계.md). 순수 함수: 장애물 사각형을 넓혀 모서리로 돌아간다 (three·DOM 없음)
export const DETOUR = { m: 0.11, maxPts: 4, maxIter: 6, skipBelow: 0.085 };

const dtBox = (o) => (o.wall ? null : o.hx !== undefined ? { x: o.x, z: o.z, hx: o.hx, hz: o.hz, rot: o.rot || 0, id: o.id } : o.r !== undefined ? { x: o.x, z: o.z, hx: o.r, hz: o.r, rot: 0, id: o.id } : null);
const toLocal = (o, p) => { const c = Math.cos(o.rot), s = Math.sin(o.rot), dx = p.x - o.x, dz = p.z - o.z; return { x: dx * c - dz * s, z: dx * s + dz * c }; };
const toWorld = (o, l) => { const c = Math.cos(o.rot), s = Math.sin(o.rot); return { x: o.x + l.x * c + l.z * s, z: o.z - l.x * s + l.z * c }; };
const faceDist = (o, p) => { const l = toLocal(o, p); return Math.max(Math.abs(l.x) - o.hx, Math.abs(l.z) - o.hz); };

// 다리 a->b 가 넓힌 사각형(여유 m)과 겹치면 진입 t(0~1), 아니면 null
function hit(o, a, b, m) {
  const A = toLocal(o, a), B = toLocal(o, b), hx = o.hx + m - 0.01, hz = o.hz + m - 0.01;
  let t0 = 0, t1 = 1;
  for (const [p, q, h] of [[A.x, B.x, hx], [A.z, B.z, hz]]) {
    const d = q - p;
    if (Math.abs(d) < 1e-9) { if (Math.abs(p) >= h) return null; continue; }
    let u = (-h - p) / d, v = (h - p) / d; if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 >= t1) return null;
  }
  return t0;
}
// 그 다리에서 이 장애물에 쓸 여유: 끝점이 이미 면에 붙어 있으면 줄이고, 너무 붙었으면 0(건너뜀)
function margin(o, a, b, m) {
  let e = m; for (const p of [a, b]) { const d = faceDist(o, p); if (d < m) e = Math.min(e, d - 0.01); }
  return e < DETOUR.skipBelow ? 0 : e;
}
const dtLen = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0);

// 장애물 하나를 도는 우회 점들(1점 우선, 없으면 같은 변 2점). 못 찾으면 null
function around(o, a, b, m, ok) {
  const cs = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([sx, sz]) => toWorld(o, { x: sx * (o.hx + m), z: sz * (o.hz + m) }));
  const clear = (p, q) => hit(o, p, q, m) === null;
  let best = null, bl = Infinity;
  for (const c of cs) if (ok(c.x, c.z) && clear(a, c) && clear(c, b)) { const l = dtLen([a, c, b]); if (l < bl) { bl = l; best = [c]; } }
  if (best) return best;
  for (let i = 0; i < 4; i++) for (const [c1, c2] of [[cs[i], cs[(i + 1) % 4]], [cs[(i + 1) % 4], cs[i]]]) {
    if (!ok(c1.x, c1.z) || !ok(c2.x, c2.z) || !clear(a, c1) || !clear(c1, c2) || !clear(c2, b)) continue;
    const l = dtLen([a, c1, c2, b]); if (l < bl) { bl = l; best = [c1, c2]; }
  }
  return best;
}

// 반환: [{x,z},...] 우회점(0개=직선 그대로), null=못 찾음(호출부는 직선 유지). opt.skip: 무시할 장애물 id, opt.ok(x,z): 우회점 허용
export function detour(obstacles, from, to, { skip = null, ok = () => true } = {}) {
  const obs = obstacles.map(dtBox).filter((o) => o && !(skip != null && o.id === skip));
  let pts = [{ x: from.x, z: from.z }, { x: to.x, z: to.z }];
  for (let it = 0; it <= DETOUR.maxIter; it++) {
    let found = null;
    for (let i = 0; i + 1 < pts.length && !found; i++) {
      let bt = Infinity;
      for (const o of obs) { const m = margin(o, pts[i], pts[i + 1], DETOUR.m); if (!m) continue; const t = hit(o, pts[i], pts[i + 1], m); if (t !== null && t < bt) { bt = t; found = { i, o, m }; } }
    }
    if (!found) return pts.slice(1, -1);
    if (it === DETOUR.maxIter) return null;
    const via = around(found.o, pts[found.i], pts[found.i + 1], found.m, ok);
    if (!via) return null;
    pts = [...pts.slice(0, found.i + 1), ...via, ...pts.slice(found.i + 1)];
    if (pts.length - 2 > DETOUR.maxPts) return null;
  }
  return null;
}
