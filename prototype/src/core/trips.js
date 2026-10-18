// core/trips.js: 놀러가기·싸움 일정 계산 (원래 index.html 68_visit 구역, R-13·D-18·D-19, D-33 단계 2)
// 서버 없이 시각만으로 정해진다. 주소(?tripdur)·경계 자료는 직접 읽지 않고 넘겨받는다:
//   const TRIP = tripConfig(dur); const Trips = createTrips(TRIP, REGIONS);
import { clamp, makeRng } from './util.js';
import { REGION_LEVEL } from './regions.js';
import { dongPopulation } from './genome.js';
// 놀러가기 설정값. dur = 외출 길이(초) [최소, 최대]. 시험 주소(?admin&tripdur=)에서만 바뀐다
export function tripConfig(dur = [60, 120]) {
  return { SLOT: 30 * 60000, PROB: 0.54, DUR: dur, FIGHT: 0.73, ENTER: 8, LEAVE: 8, WALKOUT: 6 };
}
// 경계가 맞닿은 시/도 쌍 (경계 자료의 꼭짓점이 겹치는 곳을 한 번 계산해 둔 값). 제주는 이웃이 없어 놀러 가지 않는다.
// 11 서울 12 전남광주 26 부산 27 대구 28 인천 30 대전 31 울산 36 세종 41 경기 43 충북 44 충남 47 경북 48 경남 50 제주 51 강원 52 전북
export const NEIGHBOR_PAIRS = '27-47 43-47 41-51 12-52 11-41 47-48 43-51 44-52 48-52 47-51 36-44 43-44 41-43 26-48 30-44 31-47 28-41 30-43 31-48 36-43 43-52 12-48 41-44 27-48 30-36 26-31 47-52 11-28';
export const NEIGHBORS = (() => {
  const m = new Map();
  for (const pr of NEIGHBOR_PAIRS.split(' ')) { const [a, b] = pr.split('-'); if (!m.has(a)) m.set(a, []); if (!m.has(b)) m.set(b, []); m.get(a).push(b); m.get(b).push(a); }
  for (const v of m.values()) v.sort();
  return m;
})();
// 놀러가기 일정 객체를 만든다. 예전 index.html 의 const Trips = { ... } 와 같은 객체(안의 코드는 그대로)
export function createTrips(TRIP, REGIONS) {
  return {
  cache: new Map(),
  codes() { return REGIONS.units.map((u) => u.c).sort(); },
  neighbors(code) { return REGION_LEVEL === 'sido' ? (NEIGHBORS.get(code) || []) : []; }, // 시/군/구 단계의 이웃은 아직 만들지 않았다
  cat(code, ms) { const u = REGIONS.byUnit.get(code); return u ? dongPopulation(u, ms)[0] : null; },
  // 싸움이냐 어울리기냐: 평균 70%, 까칠한 쌍은 더 자주 싸우고 사교적인 쌍은 덜 싸운다
  kindOf(from, to, ms, id) {
    const a = this.cat(from, ms), b = this.cat(to, ms); if (!a || !b) return 'fight';
    const pa = a.g.personality, pb = b.g.personality;
    const pf = clamp(TRIP.FIGHT + 0.3 * ((pa.grumpy + pb.grumpy) / 2 - 0.5) - 0.25 * ((pa.social + pb.social) / 2 - 0.5), 0.4, 0.92);
    return makeRng('tripkind:' + id)() < pf ? 'fight' : 'play';
  },
  make(from, to, t0, durSec, kind, id) { return { id, from, to, t0, t1: t0 + durSec * 1000, kind: kind === 'fight' || kind === 'play' ? kind : this.kindOf(from, to, t0, id) }; },
  // 칸 si(30분)의 외출 목록. 외출은 칸 안에서 끝나므로 칸끼리 서로 영향이 없다.
  slot(si) {
    const hit = this.cache.get(si); if (hit) return hit;
    if (this.cache.size > 300) this.cache.clear();
    const cand = [];
    for (const from of this.codes()) {
      const nb = this.neighbors(from); if (!nb.length) continue;
      const r = makeRng('trip:' + from + ':' + si);
      if (!r.chance(TRIP.PROB)) continue; // 칸당 50% = 평균 한 시간에 한 번
      const to = r.pick(nb), dur = Math.round(r.range(TRIP.DUR[0], TRIP.DUR[1])), st = Math.round(r.range(30, 1800 - dur - 30)), pri = r();
      cand.push({ from, to, dur, st, pri });
    }
    cand.sort((a, b) => a.pri - b.pri || (a.from < b.from ? -1 : 1));
    const busy = {}, out = [];
    const free = (c, t0, t1) => !(busy[c] || []).some((x) => t0 < x[1] && x[0] < t1);
    for (const c of cand) { // 가려는 이웃이 그 시각에 외출 중이거나 이미 손님이 있으면, 또는 내가 손님을 맞는 중이면 이번 외출은 취소
      const t0 = si * TRIP.SLOT + c.st * 1000, t1 = t0 + c.dur * 1000;
      if (!free(c.from, t0, t1) || !free(c.to, t0, t1)) continue;
      for (const k of [c.from, c.to]) (busy[k] = busy[k] || []).push([t0, t1]);
      const id = si + ':' + c.from;
      out.push({ id, from: c.from, to: c.to, t0, t1, kind: this.kindOf(c.from, c.to, t0, id) });
    }
    out.sort((a, b) => a.t0 - b.t0);
    this.cache.set(si, out);
    return out;
  },
  at(code, ms) { // 그 시각 code 지역의 마스코트가 나가 있는지(away) / 손님을 맞는 중인지(host)
    let away = null, host = null;
    for (const t of this.slot(Math.floor(ms / TRIP.SLOT))) if (ms >= t.t0 && ms < t.t1) { if (t.from === code) away = t; if (t.to === code) host = t; }
    return { away, host };
  },
  between(t0, t1) {
    const out = [];
    for (let si = Math.floor(t0 / TRIP.SLOT); si * TRIP.SLOT < t1; si++) for (const t of this.slot(si)) if (t.t1 > t0 && t.t0 < t1) out.push(t);
    return out;
  },
  };
}
