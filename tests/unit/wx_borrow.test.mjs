// 인근 지역 날씨 빌려 쓰기(core/wx_borrow.js) 단위 시험: 날씨_설계 9-7 사례 1~13, 가짜 그래프·지어낸 값
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWx, resolveAll } from '../../prototype/src/core/wx_borrow.js';
import { cellNeighbors, cellCenter } from '../../prototype/src/core/weather_rules.js';

const NOW = 1000000000000, AGE = 3 * 3600000;
const OPT = { maxHops: 2, maxVisit: 16, maxAgeMs: AGE, nowMs: NOW };
const W = (kind, at = NOW) => ({ kind, amt: 0.1, t: 5, hours: [], at });
// 가짜 그래프: pos = {id:[lat,lng]}, edges = [[a,b],...] (양방향), extra = 이웃 목록 직접 지정
function graph(pos, edges, extra = {}) {
  const adj = new Map(Object.keys(pos).map((k) => [k, []]));
  for (const [a, b] of edges) { adj.get(a)?.push(b); adj.get(b)?.push(a); }
  return { ids: () => Object.keys(pos), neighbors: (id) => extra[id] ?? adj.get(id) ?? [], center: (id) => (pos[id] ? { lat: pos[id][0], lng: pos[id][1] } : null) };
}
const own = (o) => new Map(Object.entries(o));
const lite = (r) => r && { kind: r.wx.kind, from: r.from, hops: r.hops };

test('1 자기 값 있음', () => {
  const g = graph({ A: [0, 0], B: [0, 1] }, [['A', 'B']]);
  assert.deepEqual(lite(resolveWx('A', own({ A: W('rain'), B: W('clear') }), g, OPT)), { kind: 'rain', from: 'A', hops: 0 });
});
test('2 부분 실패: 가까운 이웃 B가 빌려줌', () => {
  const g = graph({ A: [0, 0], B: [0, 1], C: [0, 5] }, [['A', 'B'], ['A', 'C']]);
  assert.deepEqual(lite(resolveWx('A', own({ A: null, B: W('snow'), C: W('fog') }), g, OPT)), { kind: 'snow', from: 'B', hops: 1 });
});
test('3 거리가 같으면 id 작은 쪽', () => {
  const g = graph({ A: [0, 0], B: [0, 1], C: [0, -1] }, [['A', 'C'], ['A', 'B']]);
  assert.equal(resolveWx('A', own({ B: W('rain'), C: W('fog') }), g, OPT).from, 'B');
});
test('4 2단계 D', () => {
  const g = graph({ A: [0, 0], B: [0, 1], C: [1, 0], D: [0, 2] }, [['A', 'B'], ['A', 'C'], ['B', 'D']]);
  assert.deepEqual(lite(resolveWx('A', own({ D: W('storm') }), g, OPT)), { kind: 'storm', from: 'D', hops: 2 });
});
test('5 3단계에만 값이면 null', () => {
  const g = graph({ A: [0, 0], B: [0, 1], C: [0, 2], D: [0, 3] }, [['A', 'B'], ['B', 'C'], ['C', 'D']]);
  assert.equal(resolveWx('A', own({ D: W('rain') }), g, OPT), null);
});
test('6 순환 A-B-C-A 모두 null: 끝나고 방문 수 한도', () => {
  const g = graph({ A: [0, 0], B: [0, 1], C: [1, 0] }, [['A', 'B'], ['B', 'C'], ['C', 'A']]);
  const r = resolveAll(own({ A: null, B: null, C: null }), g, OPT);
  assert.deepEqual([...r.values()], [null, null, null]);
  const nm = (i) => 'n' + String(i).padStart(2, '0');
  const big = graph(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [nm(i), [0, i]])), Array.from({ length: 29 }, (_, i) => [nm(i), nm(i + 1)]));
  const o = own({ n02: W('rain') });
  assert.equal(resolveWx('n00', o, big, { ...OPT, maxHops: 99, maxVisit: 1 }), null); // 방문 상한
  assert.equal(resolveWx('n00', o, big, { ...OPT, maxHops: 99, maxVisit: 2 }).from, 'n02');
  assert.equal(resolveWx('n00', own({ n29: W('rain') }), big, { ...OPT, maxHops: 99, maxVisit: 100 }).hops, 29);
});
test('7 재대여 금지: 사슬 A-B-C, A만 값, maxHops 1', () => {
  const g = graph({ A: [0, 0], B: [0, 1], C: [0, 2] }, [['A', 'B'], ['B', 'C']]);
  const r = resolveAll(own({ A: W('rain'), B: null, C: null }), g, { ...OPT, maxHops: 1 });
  assert.equal(r.get('B').from, 'A'); assert.equal(r.get('C'), null);
});
test('8 전부 실패 또는 알 수 없는 kind → 전부 null', () => {
  const pos = Object.fromEntries(Array.from({ length: 16 }, (_, i) => ['s' + i, [i, 0]]));
  const g = graph(pos, Array.from({ length: 15 }, (_, i) => ['s' + i, 's' + (i + 1)]));
  const o1 = own(Object.fromEntries(Object.keys(pos).map((k) => [k, null])));
  const o2 = own(Object.fromEntries(Object.keys(pos).map((k) => [k, W('haze')])));
  for (const o of [o1, o2]) { const r = resolveAll(o, g, OPT); assert.equal(r.size, 16); assert.ok([...r.values()].every((v) => v === null)); }
});
test('9 고립 지역: 가장 가까운 1곳, hops 1', () => {
  const g = graph({ J: [0, 0], X: [0, 3], Y: [0, 1.5] }, [['X', 'Y']]);
  assert.deepEqual(lite(resolveWx('J', own({ X: W('rain'), Y: W('fog') }), g, OPT)), { kind: 'fog', from: 'Y', hops: 1 });
});
test('10 신선도: 오래된 이웃은 건너뛰고 다음 후보', () => {
  const g = graph({ A: [0, 0], B: [0, 1], C: [0, 2] }, [['A', 'B'], ['A', 'C']]);
  const o = own({ B: W('rain', NOW - AGE - 1), C: W('fog', NOW - AGE) });
  assert.equal(resolveWx('A', o, g, OPT).from, 'C');
  assert.equal(resolveWx('B', o, g, OPT).from, 'C'); // 자기 값도 오래되면 빌림
});
test('11 나쁜 그래프: 자기 연결·중복·없는 id 무시', () => {
  const g = graph({ A: [0, 0], B: [0, 1] }, [], { A: ['A', 'Z', 'B', 'B'], B: ['B', 'A'] });
  assert.deepEqual(lite(resolveWx('A', own({ B: W('rain') }), g, OPT)), { kind: 'rain', from: 'B', hops: 1 });
  assert.equal(resolveWx('Z', own({ B: W('rain') }), g, OPT), null);
});
test('12 결정성: 입력 순서 섞기·두 번 계산·입력 불변', () => {
  const g = graph({ A: [0, 0], B: [0, 1], C: [1, 0], D: [1, 1] }, [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']]);
  const o1 = own({ A: null, B: W('rain'), C: W('fog'), D: W('snow') });
  const o2 = own({ D: W('snow'), C: W('fog'), B: W('rain'), A: null });
  const snap = JSON.stringify([...o1]);
  const a = resolveAll(o1, g, OPT), b = resolveAll(o2, g, OPT), c = resolveAll(o1, g, OPT);
  const flat = (m) => JSON.stringify([...m].sort((x, y) => (x[0] < y[0] ? -1 : 1)));
  assert.equal(flat(a), flat(b)); assert.equal(flat(a), flat(c));
  assert.equal(JSON.stringify([...o1]), snap);
  assert.equal(a.get('A').from, 'B'); assert.notEqual(a, c);
});
test('13 칸 그래프: 상하좌우가 대각보다 먼저', () => {
  const ids = ['100_200', ...cellNeighbors('100_200')];
  const g = { ids: () => ids, neighbors: (id) => cellNeighbors(id), center: (id) => cellCenter(id) };
  const o = own({ '101_201': W('fog'), '100_201': W('rain'), '99_199': W('snow') }); // 대각 둘, 옆 하나
  assert.deepEqual(lite(resolveWx('100_200', o, g, OPT)), { kind: 'rain', from: '100_201', hops: 1 });
  const o2 = own({ '101_201': W('fog'), '99_199': W('snow') }); // 대각만: 거리 같으니 id 문자열 순
  assert.equal(resolveWx('100_200', o2, g, OPT).from, '101_201');
});
