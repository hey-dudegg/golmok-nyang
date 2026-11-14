// core/wx_borrow.js: 값이 빈 지역이 인근 지역 날씨를 빌려 쓰기 (날씨_설계 9장, D-97·D-99)
// 순수 함수. 직접 받은 값(own)만 빌려주고, 너비 우선·방문 표시·최대 단계·최대 방문 수로 반드시 끝난다.
// own: Map<id, Wx|null> (Wx = { kind, amt, t, hours, at }), graph: { ids(), neighbors(id), center(id) }
import { isKind } from './weather_rules.js';

export const BORROW_SIDO = { maxHops: 2, maxVisit: 16, maxAgeMs: 3 * 3600000 };
export const BORROW_CELL = { maxHops: 2, maxVisit: 25, maxAgeMs: 3 * 3600000 };

const usable = (v, opt) => !!v && isKind(v.kind) && !(Number.isFinite(opt.nowMs) && !(opt.nowMs - v.at <= opt.maxAgeMs));
const dist2 = (a, b) => (a && b ? (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2 : Infinity);

function cleanNeighbors(id, graph, idSet) { // 자기 연결·중복·없는 id 버림
  const out = [], seen = new Set([id]);
  for (const n of graph.neighbors(id) || []) {
    if (!idSet.has(n) || seen.has(n)) continue;
    seen.add(n); out.push(n);
  }
  return out;
}
function byNear(origin, graph) {
  const c = graph.center(origin);
  return (a, b) => dist2(c, graph.center(a)) - dist2(c, graph.center(b)) || (a < b ? -1 : a > b ? 1 : 0);
}

export function resolveWx(id, own, graph, opt = {}) {
  const o = { ...BORROW_SIDO, ...opt };
  const mine = own.get(id);
  if (usable(mine, o)) return { wx: { ...mine }, from: id, hops: 0 };
  const idSet = new Set(graph.ids());
  if (!idSet.has(id)) return null;
  const near = byNear(id, graph);
  const nbrs = (x) => {
    const n = cleanNeighbors(x, graph, idSet);
    if (n.length) return n;
    // 인접 이웃이 없는 지역: 중심 거리 가장 가까운 1곳을 1단계 이웃으로 (가상 연결)
    const rest = [...idSet].filter((k) => k !== x).sort(byNear(x, graph));
    return rest.length ? [rest[0]] : [];
  };
  const visited = new Set([id]);
  let level = [id], visits = 0;
  for (let hop = 1; hop <= o.maxHops; hop++) {
    const next = [];
    for (const x of level) for (const n of nbrs(x)) if (!visited.has(n)) { visited.add(n); next.push(n); }
    next.sort(near);
    for (const n of next) {
      if (++visits > o.maxVisit) return null;
      const v = own.get(n);
      if (usable(v, o)) return { wx: { ...v }, from: n, hops: hop };
    }
    level = next;
    if (!level.length) break;
  }
  return null;
}

export function resolveAll(own, graph, opt = {}) {
  const out = new Map();
  for (const id of graph.ids()) out.set(id, resolveWx(id, own, graph, opt));
  return out;
}
