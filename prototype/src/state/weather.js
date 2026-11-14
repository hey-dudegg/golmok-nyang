// 날씨 상태 (M3-c, 날씨_설계 1-4·9장): 지역별 현재 날씨(직접 받은 값 own, 빌린 값까지 푼 resolved)와 바뀜 알림.
// 화면(패널·장면)은 Wx.get(id)·Wx.at(id, ms)·Wx.on(fn)만 쓴다. 받기는 어댑터, 계산은 core(wx_borrow·weather_rules).
import { loadWeather } from '../adapters/weather_data.js';
import { resolveAll, BORROW_SIDO } from '../core/wx_borrow.js';
import { wxAt } from '../core/weather_rules.js';

const listeners = new Set();
let pollTimer = null, graph = { ids: () => [], neighbors: () => [], center: () => null };
const norm = (f) => (f === 'cache' ? 'fresh' : f);
const dflt =() => ({ bundle: null, from: 'none', ageMs: Infinity });

export const Wx = {
  bundle: null, from: 'none', ageMs: Infinity, own: new Map(), resolved: new Map(),
  // 이웃 그래프 지정 { ids(), neighbors(id), center(id) }. 지정하지 않으면 받은 묶음의 키·가장 가까운 곳 대체(중심 모름: 코드순)
  setGraph(g) { graph = g; this._resolve(Date.now()); },
  _graph() { return graph.ids().length ? graph : { ...graph, ids: () => [...this.own.keys()] }; },
  _resolve(now) {
    this.own = new Map();
    const b = this.bundle;
    if (b) for (const [id, p] of Object.entries(b.pts)) this.own.set(id, p && p.kind ? { kind: p.kind, amt: Number(p.amt) || 0, t: p.t ?? null, hours: Array.isArray(p.hours) ? p.hours : [], at: b.at } : null);
    this.resolved = resolveAll(this.own, this._graph(), { ...BORROW_SIDO, nowMs: now });
  },
  // 한 지역의 현재 날씨 { wx:{kind,amt,t,hours,at}, from, hops } | null (null 이면 화면은 clear·amt 0, 날씨 칸 숨김)
  get(id) { return this.resolved.get(id) || null; },
  // 그 지역의 ms 시각 날씨 { kind, amt } | null (정시별 예보, 없으면 현재)
  at(id, ms) { const r = this.get(id); return r ? wxAt(r.wx, ms) : null; },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  // 받아 와서 바뀌었으면 알린다. 반환: 바뀜 여부
  async refresh(opt = {}) {
    const now = opt.now ?? Date.now();
    let r; try { r = await loadWeather({ ...opt, now }); } catch (e) { r = dflt(); }
    const changed = r.bundle !== this.bundle && JSON.stringify(r.bundle) !== JSON.stringify(this.bundle) || norm(r.from) !== norm(this.from); // fresh·cache 는 같은 상태로 본다
    this.bundle = r.bundle; this.from = r.from; this.ageMs = r.ageMs; this._resolve(now);
    if (changed) for (const fn of [...listeners]) { try { fn(this); } catch (e) { /* 화면 오류가 받기를 막지 않게 */ } }
    return changed;
  },
  // 보이는 동안 다음 30분 칸 시작 + 0~60초 뒤마다 다시 받는다. 숨은 탭은 안 부르고, 돌아오면 확인한다.
  start({ doc = typeof document !== 'undefined' ? document : null, now = () => Date.now(), rand = Math.random, setT = setTimeout, clearT = clearTimeout } = {}) {
    this.stop();
    const hidden = () => !!doc && doc.visibilityState === 'hidden';
    const arm = () => {
      const t = now(), slot = 30 * 60000; // 중계의 30분 칸과 같다
      clearT(pollTimer);
      pollTimer = setT(tick, Math.floor(t / slot) * slot + slot - t + Math.floor(rand() * 60000));
    };
    const tick = async () => { if (!hidden()) await this.refresh({ now: now() }); arm(); };
    this._vis = () => { if (!hidden()) this.refresh({ now: now() }); };
    if (doc) doc.addEventListener('visibilitychange', this._vis);
    this._doc = doc;
    if (!hidden()) this.refresh({ now: now() });
    arm();
  },
  stop() { if (pollTimer != null) clearTimeout(pollTimer); pollTimer = null; if (this._doc && this._vis) this._doc.removeEventListener('visibilitychange', this._vis); this._doc = null; this._vis = null; },
};
