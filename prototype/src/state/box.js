// 상자 놓기 상태 (M6-4, 설계 docs/design/상자_놓기_설계.md 3·4장). 지금 보는 시/도의 상자 하나만 들고 있다(Q3). DOM·three 없음.
// 구독: Box.on(f) -> 해제 함수, f(box|null, why). Box.get() 은 지금 살아 있는 상자(또는 null). why: place(내가 놓음)·recv(방송)·sync(목록)·expire(만료)·region(지역 바뀜)
import { validateBoxPayload, serverNow, boxActive, boxRemainMs, boxRemainText, boxLabel } from '../core/box.js';

export const BOX_POLL_MS = 60000; // Q5: 방송이 못 닿아도 60초마다 box_list 로 맞춘다
export const BOX_TEXT = {
  busy: '방금 다른 이웃이 상자를 놓았어요', mine_active: '이미 다른 동네에 놓은 상자가 있어요', rate_limit: '상자는 하루에 6번까지 놓을 수 있어요',
  bad_name: '쓸 수 없는 이름이에요', bad_code: '지금은 상자를 놓을 수 없어요', auth: '지금은 상자를 놓을 수 없어요', network: '연결이 끊겨 상자를 놓지 못했어요',
};
export const boxErrText = (ex) => (ex && ex.code && (BOX_TEXT[ex.code] || (String(ex.code).startsWith('filter_') ? BOX_TEXT.bad_name : ''))) || BOX_TEXT.network;

// 같은 지역의 현재 상자에 새 값을 합친다: 같은 id 의 방송은 이름만 바꾸고(숨김·복구), 다른 id 는 더 늦게 놓은 것이 이긴다
export function mergeBox(cur, inc) {
  if (!inc) return cur || null;
  if (!cur) return inc;
  if (cur.id === inc.id) return { ...cur, name: inc.name, until: Math.min(cur.until, inc.until), mine: cur.mine || inc.mine };
  return inc.placed >= cur.placed ? inc : cur;
}
// 상태표 한 줄: { phase, text, canPlace, canReport }. phase: offline·empty·editing·pending·mine·other·hidden·soon
export function boxView(box, nowMs, o = {}) {
  const live = o.live !== false;
  if (o.pending) return { phase: 'pending', text: '놓는 중…', canPlace: false, canReport: false };
  if (boxActive(box, nowMs)) {
    const ms = boxRemainMs(box, nowMs), named = box.name != null;
    const phase = ms < 60000 ? 'soon' : box.mine ? 'mine' : !named ? 'hidden' : 'other';
    return { phase, text: boxLabel(box.name) + ' · ' + boxRemainText(ms).replace('약 ', ''), canPlace: false, canReport: !box.mine && named };
  }
  if (!live) return { phase: 'offline', text: '상자 놓아 주기', canPlace: false, canReport: false };
  return { phase: o.editing ? 'editing' : 'empty', text: '상자 놓아 주기', canPlace: true, canReport: false };
}

export const Box = {
  caps: null, region: null, box: null, offset: 0, subs: [], timer: null, poll: null, started: false,
  init(caps) {
    if (this.started) return; this.started = true; this.caps = caps;
    if (caps.room) {
      caps.room.on((kind, p) => { if (kind === 'box') this.receive(p); });
      caps.room.onCount(() => { const l = this.live(); if (l && this._wasLive === false) this.refresh(); this._wasLive = l; });
    }
    this._wasLive = this.live();
    this.poll = setInterval(() => { if (!(typeof document !== 'undefined' && document.hidden)) this.refresh(); }, BOX_POLL_MS);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
  },
  enabled() { return !!(this.caps && this.caps.box); },
  live() { return this.enabled() && !(this.caps.room && this.caps.room.live === false); },
  now() { return serverNow(this.offset, Date.now()); },
  get() { return boxActive(this.box, this.now()) ? this.box : null; },
  on(f) { this.subs.push(f); return () => { this.subs = this.subs.filter((x) => x !== f); }; },
  emit(why) { for (const f of this.subs.slice()) { try { f(this.get(), why); } catch (e) {} } },
  // 지역(시/도 두 자리)이 바뀌면 상자를 비우고 서버에 다시 묻는다
  setRegion(code) {
    const sido = String(code || '').slice(0, 2); if (sido === this.region) return;
    this.region = sido; this.box = null; this.arm(); this.emit('region'); this.refresh();
  },
  set(box, why) { this.box = box; this.arm(); this.emit(why); },
  arm() { // 만료 순간에 한 번 알린다
    clearTimeout(this.timer); this.timer = null;
    const b = this.get(); if (!b) return;
    this.timer = setTimeout(() => { this.timer = null; if (!this.get()) { this.box = null; this.emit('expire'); } else this.arm(); }, Math.min(boxRemainMs(b, this.now()) + 200, 2147000000));
  },
  async refresh() {
    if (!this.enabled() || !this.region) return;
    const region = this.region;
    try {
      const r = await this.caps.box.list(); if (region !== this.region) return;
      this.offset = r.now - Date.now();
      const mine = r.boxes.find((b) => b.code === region) || null;
      this.set(mine && boxActive(mine, this.now()) ? mine : null, 'sync');
    } catch (e) { /* 연결 문제: 받아 둔 상자는 until 까지 그대로 */ }
  },
  receive(payload) { // 방송: 지금 보는 지역만
    const v = validateBoxPayload(payload); if (!v || v.code !== this.region) return;
    const next = mergeBox(this.box && this.box.code === v.code ? this.box : null, { code: v.code, id: v.id, placed: v.placed, until: v.until, seed: v.seed, name: v.name, mine: false });
    if (v.at != null) this.offset = v.at - Date.now();
    this.set(next && boxActive(next, this.now()) ? next : null, 'recv');
  },
  async place(name) { // 오류는 그대로 던진다(Error.code). 성공하면 내 상자로 반영
    if (!this.enabled()) { const e = new Error('network'); e.code = 'network'; throw e; }
    const r = await this.caps.box.place(this.region, name);
    this.offset = r.now - Date.now(); this.set({ ...r.box, mine: true }, 'place'); return r.box;
  },
  async report(id) { if (this.enabled() && this.caps.box.report) await this.caps.box.report(id); },
  async clear() { if (this.enabled()) { await this.caps.box.clear(this.region); this.set(null, 'sync'); } },
};
