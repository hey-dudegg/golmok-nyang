// 상자 놓기 어댑터 Caps.box (설계 상자_놓기_설계.md 1-2·3장, D-10). Supabase 판과 LocalMock 판이 같은 모양.
// box: { list() → {now, boxes:[{code,id,placed,until,seed,name,mine}]}, place(code,name) → {now, box}, clear(code) → void }
// 오류: Error(code) 에 .code. place: busy(.until 포함)·mine_active·rate_limit·bad_code·bad_name·filter_*·auth·network. 방송은 room.on 의 'box'.
import { validateBoxPayload, BOX_SIDO_CODES } from '../core/box.js';

const fail = (code, extra) => { const e = new Error(code); e.code = code; if (extra) Object.assign(e, extra); return e; };
const cleanBox = (b, at) => { const v = b && validateBoxPayload({ ...b, at }); return v ? { code: v.code, id: v.id, placed: v.placed, until: v.until, seed: v.seed, name: v.name, mine: b.mine === true } : null; };

async function call(client, fn, args) {
  let r; try { r = await client.rpc(fn, args); } catch (e) { throw fail('network'); }
  if (!r || r.error || !r.data || typeof r.data !== 'object') throw fail('network');
  return r.data;
}

export function createBox(client) {
  return {
    async list() {
      const d = await call(client, 'box_list');
      if (d.ok === false) throw fail(typeof d.code === 'string' ? d.code : 'network');
      if (!Number.isFinite(d.now) || !Array.isArray(d.boxes)) throw fail('network');
      return { now: d.now, boxes: d.boxes.map((b) => cleanBox(b, d.now)).filter(Boolean) };
    },
    async place(code, name) {
      const d = await call(client, 'box_place', { p_code: code, p_name: name });
      if (d.ok !== true) throw fail(typeof d.code === 'string' ? d.code : 'network', d.code === 'busy' && Number.isFinite(d.until) ? { until: d.until } : null);
      const box = Number.isFinite(d.now) ? cleanBox({ ...d.box, mine: true }, d.now) : null;
      if (!box) throw fail('network');
      return { now: d.now, box };
    },
    async report(id) { let r; try { r = await client.rpc('report', { p_kind: 'box', p_target: id }); } catch (e) { throw fail('network'); } if (!r || r.error) throw fail('network'); }, // 기존 report RPC(void) 에 kind 'box' (M6-4)
    async clear(code) {
      const d = await call(client, 'box_clear', { p_code: code });
      if (d.ok !== true) throw fail(typeof d.code === 'string' ? d.code : 'network');
    },
  };
}

// LocalMock: localStorage 'gn.box' 지역별 {id,placed,until,seed,name,h(놓은 탭)}, 하루 기록 'gn.boxlog'. 방송은 room.send('box') 가 다른 탭에 전한다.
const HOLD_MS = 3600 * 1000, PER_DAY = 6;
export function createMockBox(room) {
  const me = 'h' + Math.random().toString(36).slice(2, 9);
  const rd = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const pub = (c, b) => ({ code: c, id: b.id, placed: b.placed, until: b.until, seed: b.seed, name: b.name == null ? null : b.name, mine: b.h === me });
  const uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-' + String(Date.now()).padStart(12, '0').slice(-12));
  return {
    async list() { const now = Date.now(), s = rd('gn.box', {}); return { now, boxes: Object.keys(s).filter((c) => s[c].until > now).map((c) => pub(c, s[c])) }; },
    async place(code, name) {
      const now = Date.now(), s = rd('gn.box', {});
      if (!BOX_SIDO_CODES.includes(code)) throw fail('bad_code');
      const nm = typeof name === 'string' ? name.trim() : '';
      if (nm.length < 1 || nm.length > 10) throw fail('bad_name');
      if (Object.keys(s).some((c) => s[c].h === me && s[c].until > now)) throw fail('mine_active');
      const log = rd('gn.boxlog', {}); const mine = (log[me] || []).filter((t) => now - t < 86400000);
      if (mine.length >= PER_DAY) throw fail('rate_limit');
      if (s[code] && s[code].until > now) throw fail('busy', { until: s[code].until });
      const b = { id: uuid(), placed: now, until: now + HOLD_MS, seed: Math.floor(Math.random() * 1e9), name: nm, h: me };
      s[code] = b; wr('gn.box', s); log[me] = [...mine, now]; wr('gn.boxlog', log);
      const p = { code, id: b.id, placed: b.placed, until: b.until, seed: b.seed, name: b.name, at: now };
      if (room && room.send) room.send('box', p);
      return { now, box: pub(code, b) };
    },
    async report() {}, // 로컬 모의: 보낼 곳 없음
    async clear(code) {
      const now = Date.now(), s = rd('gn.box', {}), b = s[code];
      if (!b || b.until <= now) return;
      b.until = now; wr('gn.box', s);
      if (room && room.send) room.send('box', { code, id: b.id, placed: b.placed, until: now > b.placed ? now : b.placed + 1, seed: b.seed, name: b.name, at: now });
    },
  };
}
