// 회원(Member)과 고양이별 유대(Bonds). 저장은 Caps.db 또는 브라우저 (설계 3장)
import { clamp } from '../core/util.js';
import { Caps } from '../adapters/caps.js';
import { Local } from '../adapters/store.js';

export const Member = {
  me: null, // {nick, joinedAt}
  listeners: [], joinedFns: [],
  on(fn) { this.listeners.push(fn); },
  emit() { for (const f of this.listeners) f(this.me); },
  onJoined(fn) { this.joinedFns.push(fn); }, // 가입 뒤 유대 기록을 합친 다음 (화면이 이름표를 다시 그린다)
  async load() {
    if (Caps.db && Caps.uid) {
      try { const s = await Caps.db.doc('members/' + Caps.uid).get(); this.me = s.exists ? s.data() : null; } catch (e) { this.me = null; }
    } else this.me = Local.member();
    this.emit();
  },
  async join(nick, home) {
    const m = { nick, joinedAt: Date.now(), home: home || null, ageOk: true };
    if (Caps.db && Caps.uid) {
      try { await Caps.db.doc('members/' + Caps.uid).set(m); }
      catch (e) { if (e && e.code === 'invalid_argument') { Caps.writeOff = true; throw new Error('readonly'); } throw e; }
    } else Local.setMember(m);
    this.me = m; this.emit();
    Bonds.afterJoin().then(() => { for (const f of this.joinedFns) f(this.me); });
    return m;
  },
};
export const Bonds = {
  data: {},
  useDb: () => !!(Caps.db && Caps.uid && Member.me), // 비회원의 친밀도는 이 브라우저에만 기억하고, 가입하면 계정으로 옮긴다 (설계 3장)
  async load() {
    if (this.useDb()) { try { const s = await Caps.db.doc('data/users/' + Caps.uid + '/bonds').get(); this.data = s.exists ? { ...s.data() } : {}; } catch (e) { this.data = {}; } }
    else this.data = Local.bonds();
  },
  async afterJoin() { // 가입 직후: 이 브라우저에 쌓인 기록을 계정 기록과 합쳐 올림
    if (!this.useDb()) return;
    const local = this.data;
    await this.load();
    for (const [id, b] of Object.entries(local)) if (!this.data[id] || (b.n || 0) > (this.data[id].n || 0)) this.data[id] = b;
    try { await Caps.db.doc('data/users/' + Caps.uid + '/bonds').set(this.data); } catch (e) {}
  },
  get(catId) { return this.data[catId] || { trust: 0.1, n: 0, last: [] }; },
  saving: null,
  async bump(catId, delta, note) {
    const b = { ...this.get(catId) };
    b.trust = clamp(b.trust + delta, 0, 1); b.n += 1; b.last = [note, ...(b.last || [])].slice(0, 3); b.at = Date.now();
    this.data[catId] = b;
    if (this.useDb()) {
      clearTimeout(this.saving);
      this.saving = setTimeout(() => { Caps.db.doc('data/users/' + Caps.uid + '/bonds').set(this.data).catch(() => {}); }, 800);
    } else Local.setBonds(this.data);
    return b;
  },
};
