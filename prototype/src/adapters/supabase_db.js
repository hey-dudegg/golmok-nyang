// Caps.db 번역 (설계 2차_연결_설계.md 5-3, 표 2-3·2-5·2-6): Firestore 모양 경로 6개만 Supabase 표로 옮긴다. client 는 인자(시험은 가짜).
// 읽기: posts(likes·comments 를 옛 모양으로 합침), names2(투표를 옛 up·down 맵 모양으로). 처음 읽고 60초마다 다시 읽는다(실시간 대신).
// 쓰기: 좋아요·이름 투표는 지금도 쓰이고, 글·댓글·업로드 번역은 만들어 두되 서버 스위치(board_write)가 막는다(D-83). 서버 오류는 Error(code).
import { packCapture } from './capture_pack.js';

export const POLL_MS = 60000;
const KNOWN = ['feature_off', 'need_member', 'need_admin', 'filter_word', 'filter_url', 'filter_contact', 'filter_chars', 'rate_limit', 'dup', 'name_limit', 'bad_vote', 'not_found'];
const coded = (code, msg) => Object.assign(new Error(msg || code), { code, gn: true }); // gn: 우리가 만든 오류(서버 오류와 구분)

// 서버·네트워크 오류를 Error(code)로 (3-6). 서버는 코드만 보낸다. RLS 위반(42501)은 need_member, unique 위반(23505)은 dup
export function toError(e) {
  if (e && e.gn) return e;
  const msg = String((e && e.message) || '');
  let code = KNOWN.includes(msg) ? msg : null;
  if (!code && e && (e.code === '42501' || e.statusCode === '403' || e.status === 403 || /row-level security/i.test(msg))) code = 'need_member';
  if (!code && e && e.code === '23505') code = 'dup';
  if (!code && e && (e.statusCode === '413' || e.status === 413)) code = 'too_large';
  if (!code && ((e && (e.name === 'TypeError' || e.status === 0)) || /failed to fetch|network|load failed/i.test(msg))) code = 'network';
  return coded(code || 'unknown', msg);
}

export function createDb(client, opts = {}) {
  const pollMs = opts.pollMs == null ? POLL_MS : opts.pollMs;
  const pack = opts.pack || packCapture;
  const watchers = new Set();
  const ok = (r) => { if (r && r.error) throw toError(r.error); return r ? r.data : null; };
  const session = async () => { try { const g = await client.auth.getSession(); return (g && g.data && g.data.session && g.data.session.user && g.data.session.user.id) || null; } catch (e) { return null; } };
  const me = async () => { const id = await session(); if (!id) throw coded('need_member'); return id; };
  const pub = (path) => { const r = client.storage.from('captures').getPublicUrl(path); return r && r.data && r.data.publicUrl; };
  const refresh = (kind) => Promise.all([...watchers].filter((w) => w.kind === kind).map((w) => w.run()));
  const ms = (t) => { const v = Date.parse(t); return Number.isFinite(v) ? v : 0; };

  // 처음 한 번 읽고 pollMs 마다 다시 읽는다. 숨은 탭은 건너뛴다. 돌려주는 함수를 부르면 그만둔다
  function listen(kind, read, f, errf) {
    let live = true;
    const run = async () => { try { const docs = await read(); if (live) f({ docs }); } catch (e) { if (live && errf) errf(toError(e)); } };
    const w = { kind, run }; watchers.add(w);
    run();
    const timer = setInterval(() => { if (typeof document !== 'undefined' && document.hidden) return; run(); }, pollMs);
    return () => { live = false; clearInterval(timer); watchers.delete(w); };
  }
  const mkDoc = (id, data) => ({ id, data: () => data });

  // ── 읽기 ──
  async function readPosts(limit) {
    const rows = ok(await client.from('posts').select('id,uid,nick,legacy_author,body,img,status,created_at,post_likes(uid),post_comments(id,uid,nick,legacy_author,body,status,created_at)')
      .eq('status', 'ok').order('created_at', { ascending: false }).limit(limit)) || [];
    return rows.map((r) => {
      const likes = {}; for (const l of r.post_likes || []) likes[l.uid] = true;
      const comments = {};
      for (const c of r.post_comments || []) if (c.status === 'ok') comments[c.id] = { uid: c.uid, nick: c.nick || c.legacy_author || '이웃', text: c.body, at: ms(c.created_at) };
      return mkDoc(r.id, { uid: r.uid, nick: r.nick || r.legacy_author || '이웃', text: r.body, img: r.img ? pub(r.img) : null, createdAt: ms(r.created_at), likes, comments });
    });
  }
  async function readNames(code, limit) {
    const meId = await session();
    const rows = ok(await client.from('names2').select('id,region,name,uid,nick,up,down,status,created_at,name_votes(uid,vote)')
      .eq('region', code).order('created_at', { ascending: true }).limit(limit)) || [];
    return rows.map((r) => {
      const mine = ((r.name_votes || []).find((v) => v.uid === meId) || {}).vote;
      // 남의 표는 서버가 알려 주지 않는다(개수만). 화면은 맵의 참 값 개수를 세므로 개수만큼 자리표시 키를 채운다
      const fill = (kind, n) => { const m = {}; if (mine === kind && meId) m[meId] = true; for (let i = 0; i < n - (mine === kind ? 1 : 0); i++) m['_' + kind[0] + i] = true; return m; };
      const d = { name: r.name, uid: r.uid, nick: r.nick || '', createdAt: ms(r.created_at), up: fill('up', r.up | 0), down: fill('down', r.down | 0), rep: {} };
      if (r.status !== 'ok') d.gone = true;
      return mkDoc(r.id, d);
    });
  }

  // ── 쓰기 ──
  async function attach(uid, id, dataUrl) { // 그림: 규격에 맞추고 올린 뒤 post_attach. 규격을 못 맞추면 그림 없이 둔다
    const pk = await pack(dataUrl); if (!pk) return;
    const path = uid + '/' + id + '.' + pk.ext;
    const up = await client.storage.from('captures').upload(path, pk.blob, { contentType: pk.type, upsert: false });
    if (up && up.error) throw toError(up.error);
    ok(await client.rpc('post_attach', { p_post_id: id }));
  }
  async function addPost(p) {
    const uid = await me();
    const row = ok(await client.from('posts').insert({ uid, body: String(p.text || '') }).select('id').single());
    if (typeof p.img === 'string' && p.img.startsWith('data:')) { try { await attach(uid, row.id, p.img); } catch (e) {} } // 글은 올라갔으니 그림 실패는 넘어간다
    await refresh('posts'); return mkDoc(row.id, null);
  }
  async function updatePost(id, f) {
    const uid = await me();
    for (const [who, on] of Object.entries(f.likes || {})) {
      if (who !== uid) continue; // 남의 좋아요는 만지지 않는다(서버도 막음)
      if (on) { const r = await client.from('post_likes').insert({ post_id: id, uid }); if (r && r.error && toError(r.error).code !== 'dup') throw toError(r.error); }
      else ok(await client.from('post_likes').delete().eq('post_id', id).eq('uid', uid));
    }
    for (const c of Object.values(f.comments || {})) ok(await client.from('post_comments').insert({ post_id: id, uid, body: String(c.text || '') }));
    await refresh('posts');
  }
  async function deletePost(id) {
    const r = await client.from('posts').select('img').eq('id', id).maybeSingle();
    const img = r && !r.error && r.data && r.data.img;
    if (img) { try { await client.storage.from('captures').remove([img]); } catch (e) {} } // 그림 먼저(남는 파일은 어드민이 정리)
    ok(await client.from('posts').delete().eq('id', id));
    await refresh('posts');
  }
  async function updateName(id, f) {
    const uid = await me();
    const want = (f.up && f.up[uid] === true) ? 'up' : (f.down && f.down[uid] === true) ? 'down' : null;
    if ('up' in f || 'down' in f) {
      let kind = want;
      if (!kind) { // 취소: 서버는 같은 표를 다시 보내면 취소하므로 지금 내 표가 뭔지 본다
        const r = await client.from('name_votes').select('vote').eq('name_id', id).eq('uid', uid).maybeSingle();
        kind = r && !r.error && r.data && r.data.vote;
      }
      if (kind) ok(await client.rpc('name_vote', { p_name_id: id, p_vote: kind }));
    }
    if (f.rep && f.rep[uid]) ok(await client.rpc('report', { p_kind: 'name', p_target: id })); // report 는 05_moderation(M2-6b)
    await refresh('names2');
  }
  async function addName(code, item) {
    const uid = await me();
    const row = ok(await client.from('names2').insert({ region: code, name: String(item.name || ''), uid }).select('id').single());
    await refresh('names2'); return mkDoc(row.id, null);
  }

  // ── Firestore 모양 입구: 경로 6개만 ──
  const none = () => { throw coded('unsupported', 'unsupported path'); }; // 컬렉션 경로용
  const nope = async () => { throw coded('unsupported', 'unsupported path'); }; // 문서 메서드용(Promise 로 거부)
  function collection(path) {
    let m, kind, read, add;
    const q = { n: 60 };
    if (path === 'posts') { kind = 'posts'; read = () => readPosts(q.n); add = addPost; }
    else if ((m = /^names2\/([^/]+)\/list$/.exec(path))) { kind = 'names2'; read = () => readNames(m[1], q.n); add = (o) => addName(m[1], o); }
    else none();
    const api = {
      orderBy: () => api, limit: (n) => { q.n = Math.max(1, Math.min(n | 0 || 60, 300)); return api; },
      onSnapshot: (f, errf) => listen(kind, read, f, errf),
      add: (o) => add(o),
    };
    return api;
  }
  function doc(path) {
    let m;
    if ((m = /^posts\/([^/]+)$/.exec(path))) return { update: (f) => updatePost(m[1], f), delete: () => deletePost(m[1]), get: nope, set: nope };
    if ((m = /^names2\/[^/]+\/list\/([^/]+)$/.exec(path))) return { update: (f) => updateName(m[1], f), delete: nope, get: nope, set: nope };
    if (path === 'admin/recipes') return {
      async get() { const d = ok(await client.from('admin_kv').select('value').eq('key', 'recipes').maybeSingle()); return { exists: !!d, data: () => (d ? d.value : null) }; },
      async set(v) { ok(await client.from('admin_kv').upsert({ key: 'recipes', value: v })); },
      update: nope, delete: nope,
    };
    if (/^members\//.test(path)) return { // 로그인 보류(D-82): 회원은 아직 없다. 읽으면 없음, 쓰기는 꺼짐
      get: async () => ({ exists: false, data: () => null }), set: async () => { throw coded('feature_off'); }, update: nope, delete: nope };
    return { get: nope, set: nope, update: nope, delete: nope };
  }
  return { collection, doc };
}
