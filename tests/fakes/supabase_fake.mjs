// 가짜 supabase client (설계 2차_연결_설계.md 5-4): from·select·insert·delete·upsert·rpc·auth·storage 를 메모리로 흉내 낸다. 서버 없이 번역 시험용.
// init: { tables:{표:[행]}, user:{id}|null, rpc:{이름:(인자)=>값|throw 오류}, fail:{'표:동작':오류객체}, uploadError }
// 돌려주는 값: { client, calls, tables }  calls 는 호출 기록(표·동작·내용·거른 조건)
export function makeFake(init = {}) {
  const tables = {}; for (const [k, v] of Object.entries(init.tables || {})) tables[k] = v.map((r) => ({ ...r }));
  const calls = []; let seq = 0;
  const user = 'user' in init ? init.user : { id: 'me', is_anonymous: true };
  function from(name) {
    const st = { op: 'select', filters: [], order: null, limit: null, payload: null, single: false, ret: false };
    const run = async () => {
      const rec = { table: name, op: st.op, payload: st.payload, filters: st.filters.map((f) => [f.col, f.val]), limit: st.limit };
      calls.push(rec);
      const err = init.fail && init.fail[name + ':' + st.op];
      if (err) return { data: null, error: err };
      const all = tables[name] || (tables[name] = []);
      const match = (r) => st.filters.every((f) => r[f.col] === f.val);
      if (st.op === 'insert') {
        const rows = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((p) => ({ id: 'id' + (++seq), ...p }));
        all.push(...rows); const out = st.single ? rows[0] : rows;
        return { data: st.ret ? out : null, error: null };
      }
      if (st.op === 'upsert') { const i = all.findIndex((r) => r.key === st.payload.key); if (i >= 0) all[i] = { ...st.payload }; else all.push({ ...st.payload }); return { data: null, error: null }; }
      if (st.op === 'delete') { tables[name] = all.filter((r) => !match(r)); return { data: null, error: null }; }
      let rows = all.filter(match);
      if (st.order) rows = rows.slice().sort((a, b) => (a[st.order.c] < b[st.order.c] ? -1 : a[st.order.c] > b[st.order.c] ? 1 : 0) * (st.order.asc ? 1 : -1));
      if (st.limit != null) rows = rows.slice(0, st.limit);
      return { data: st.single ? (rows[0] || null) : rows, error: null };
    };
    const b = {
      select() { if (st.op === 'insert') st.ret = true; return b; },
      insert(p) { st.op = 'insert'; st.payload = p; return b; },
      upsert(p) { st.op = 'upsert'; st.payload = p; return b; },
      delete() { st.op = 'delete'; return b; },
      eq(col, val) { st.filters.push({ col, val }); return b; },
      order(c, o) { st.order = { c, asc: !o || o.ascending !== false }; return b; },
      limit(n) { st.limit = n; return b; },
      maybeSingle() { st.single = true; return run(); },
      single() { st.single = true; return run(); },
      then(res, rej) { return run().then(res, rej); },
    };
    return b;
  }
  // channel: on·subscribe·track·untrack·presenceState 흉내(M2-9). 시험이 channels[i].status(..)·presence({키:[meta]})·broadcast(이벤트, payload)로 서버 쪽 사건을 낸다
  const channels = [];
  function channel(topic, opts) {
    const cfg = (opts && opts.config) || {}, key = cfg.presence && cfg.presence.key, ons = [];
    let sub = null, state = {}, tracked = null;
    const ch = {
      topic, opts, removed: false, get tracked() { return tracked; },
      on(type, filter, cb) { ons.push({ type, filter, cb }); return ch; },
      subscribe(cb) { sub = cb; calls.push({ channel: topic, op: 'subscribe', opts }); return ch; },
      track(meta) { tracked = meta; calls.push({ channel: topic, op: 'track', meta }); if (key) state = { ...state, [key]: [meta] }; return Promise.resolve('ok'); },
      untrack() { tracked = null; calls.push({ channel: topic, op: 'untrack' }); if (key) { state = { ...state }; delete state[key]; } return Promise.resolve('ok'); },
      presenceState: () => state,
      status(s) { if (sub) sub(s); },
      presence(others) { state = { ...others, ...(key && state[key] ? { [key]: state[key] } : {}) }; for (const o of ons) if (o.type === 'presence') o.cb(); },
      broadcast(event, payload) { for (const o of ons) if (o.type === 'broadcast' && o.filter.event === event) o.cb({ event, payload }); },
    };
    channels.push(ch); return ch;
  }
  const client = {
    from, channel, removeChannel: async (c) => { c.removed = true; calls.push({ removeChannel: c.topic }); },
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      const f = init.rpc && init.rpc[name];
      if (!f) return { data: null, error: { code: 'PGRST202', message: 'function not found' } };
      try { return { data: f(args), error: null }; } catch (e) { return { data: null, error: e }; }
    },
    auth: { getSession: async () => ({ data: { session: user ? { user } : null } }) },
    storage: { from: (bucket) => ({
      async upload(path, blob, opts) { calls.push({ upload: path, bucket, opts, size: blob && blob.size }); return init.uploadError ? { data: null, error: init.uploadError } : { data: { path }, error: null }; },
      getPublicUrl: (p) => ({ data: { publicUrl: 'https://files.invalid/' + bucket + '/' + p } }),
      async remove(paths) { calls.push({ remove: paths, bucket }); return { data: [], error: null }; },
    }) },
  };
  return { client, calls, tables, channels };
}
