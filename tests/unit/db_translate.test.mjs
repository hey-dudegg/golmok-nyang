// Caps.db 번역(설계 5-3, 표 2-3·2-5·2-6)·캡쳐 규격(2-4)·익명 이름 게이트 단위 시험: 가짜 client 로 서버 없이. 사용: node --test tests/unit/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFake } from '../fakes/supabase_fake.mjs';
globalThis.location = { hostname: 'example.test', search: '' };
const { createDb, toError } = await import('../../prototype/src/adapters/supabase_db.js');
const { packCapture, fitSize, CAPTURE } = await import('../../prototype/src/adapters/capture_pack.js');
const { createSupabaseCaps } = await import('../../prototype/src/adapters/supabase.js');
const { Caps } = await import('../../prototype/src/adapters/caps.js');
const { gateNeedsMember } = await import('../../prototype/src/state/gate.js');

const snap = (db, path) => new Promise((res, rej) => { const off = db.collection(path).orderBy('x').limit(60).onSnapshot((s) => { off(); res(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }, rej); });
const T0 = '2026-11-01T00:00:00Z', T1 = '2026-11-02T00:00:00Z';
const P = { pollMs: 1e6 };

test('posts 읽기: likes·comments 를 옛 모양으로 합치고 그림은 공개 주소로, 숨김 댓글은 뺀다', async () => {
  const { client, calls } = makeFake({ tables: { posts: [
    { id: 'p1', uid: 'u1', nick: '삼청동집사', legacy_author: null, body: '안녕', img: 'u1/p1.webp', status: 'ok', created_at: T0,
      post_likes: [{ uid: 'a' }, { uid: 'b' }], post_comments: [{ id: 'c1', uid: 'a', nick: '이웃', body: '댓글', status: 'ok', created_at: T1 }, { id: 'c2', uid: 'b', nick: 'x', body: '숨김', status: 'hidden', created_at: T1 }] },
    { id: 'p2', uid: null, nick: '', legacy_author: '옛작성자', body: '옛글', img: null, status: 'ok', created_at: T1, post_likes: [], post_comments: [] },
    { id: 'p3', uid: 'u2', nick: 'n', body: '숨김글', status: 'hidden', created_at: T1 },
  ] } });
  const list = await snap(createDb(client, P), 'posts');
  assert.deepEqual(list.map((p) => p.id), ['p2', 'p1']); // 최신순, status ok 만
  const p1 = list[1];
  assert.equal(p1.text, '안녕'); assert.equal(p1.nick, '삼청동집사'); assert.equal(p1.img, 'https://files.invalid/captures/u1/p1.webp');
  assert.deepEqual(p1.likes, { a: true, b: true }); assert.deepEqual(Object.keys(p1.comments), ['c1']);
  assert.deepEqual(p1.comments.c1, { uid: 'a', nick: '이웃', text: '댓글', at: Date.parse(T1) }); assert.equal(p1.createdAt, Date.parse(T0));
  assert.equal(list[0].nick, '옛작성자'); assert.equal(list[0].img, null);
  assert.deepEqual(calls[0].filters, [['status', 'ok']]); assert.equal(calls[0].limit, 60);
});

test('좋아요: 켜면 post_likes insert, 끄면 delete, 남의 uid 는 건드리지 않고, 중복은 넘어간다', async () => {
  const { client, calls } = makeFake();
  const db = createDb(client, P);
  await db.doc('posts/p1').update({ likes: { me: true, other: true } });
  assert.deepEqual(calls.filter((c) => c.table === 'post_likes').map((c) => [c.op, c.payload]), [['insert', { post_id: 'p1', uid: 'me' }]]);
  await db.doc('posts/p1').update({ likes: { me: false } });
  const del = calls.find((c) => c.op === 'delete'); assert.equal(del.table, 'post_likes'); assert.deepEqual(del.filters, [['post_id', 'p1'], ['uid', 'me']]);
  const dup = makeFake({ fail: { 'post_likes:insert': { code: '23505', message: 'duplicate key' } } });
  await createDb(dup.client, P).doc('posts/p1').update({ likes: { me: true } }); // 오류 없이 끝
});

test('서버 오류 코드 변환(3-6): feature_off·need_member·dup·network', async () => {
  assert.equal(toError({ code: 'P0001', message: 'feature_off' }).code, 'feature_off');
  assert.equal(toError({ code: '42501', message: 'new row violates row-level security policy' }).code, 'need_member');
  assert.equal(toError({ code: '23505', message: 'duplicate key value' }).code, 'dup');
  assert.equal(toError(new TypeError('Failed to fetch')).code, 'network');
  assert.equal(toError({ code: 'XX000', message: 'boom' }).code, 'unknown');
  const f = makeFake({ fail: { 'posts:insert': { code: 'P0001', message: 'feature_off' }, 'post_comments:insert': { code: 'P0001', message: 'feature_off' } } });
  const db = createDb(f.client, P);
  await assert.rejects(() => db.collection('posts').add({ text: 'x' }), (e) => e.code === 'feature_off');
  await assert.rejects(() => db.doc('posts/p1').update({ comments: { c: { text: 'x' } } }), (e) => e.code === 'feature_off');
});

test('board_write=true 가정: 글 insert 는 uid·본문만, 그림은 규격 변환 -> 업로드 -> post_attach (화면은 아직 부르지 않음)', async () => {
  const pack = async () => ({ blob: { size: 5000 }, type: 'image/webp', ext: 'webp' });
  const { client, calls } = makeFake({ rpc: { post_attach: () => 'me/id1.webp' } });
  const db = createDb(client, { ...P, pack });
  const ref = await db.collection('posts').add({ uid: 'x', nick: '속임수', text: '본문', img: 'data:image/png;base64,AAAA', status: 'ok' });
  const ins = calls.find((c) => c.table === 'posts' && c.op === 'insert');
  assert.deepEqual(ins.payload, { uid: 'me', body: '본문' }); // 서버가 정하는 열은 보내지 않는다
  assert.equal(ref.id, 'id1');
  const up = calls.find((c) => c.upload); assert.equal(up.upload, 'me/id1.webp'); assert.equal(up.bucket, 'captures'); assert.equal(up.opts.upsert, false); assert.equal(up.opts.contentType, 'image/webp');
  assert.deepEqual(calls.find((c) => c.rpc === 'post_attach').args, { p_post_id: 'id1' });
  // 규격을 못 맞추면(null) 그림 없이 올린다
  const n = makeFake(); await createDb(n.client, { ...P, pack: async () => null }).collection('posts').add({ text: 't', img: 'data:image/png;base64,AAAA' });
  assert.equal(n.calls.some((c) => c.upload), false); assert.equal(n.calls.filter((c) => c.table === 'posts' && c.op === 'insert').length, 1);
  // 업로드가 실패해도 글은 남는다
  const u = makeFake({ uploadError: { statusCode: '413', message: 'too large' } });
  await createDb(u.client, { ...P, pack }).collection('posts').add({ text: 't', img: 'data:image/png;base64,AAAA' });
  assert.equal(u.calls.some((c) => c.rpc === 'post_attach'), false);
});

test('댓글 insert 와 글 삭제(그림 먼저)', async () => {
  const { client, calls } = makeFake({ tables: { posts: [{ id: 'p1', img: 'me/p1.jpg' }] } });
  const db = createDb(client, P);
  await db.doc('posts/p1').update({ comments: { c9: { text: '댓글', nick: '속임수', at: 1 } } });
  assert.deepEqual(calls.find((c) => c.table === 'post_comments').payload, { post_id: 'p1', uid: 'me', body: '댓글' });
  await db.doc('posts/p1').delete();
  const iRemove = calls.findIndex((c) => c.remove), iDelete = calls.findIndex((c) => c.table === 'posts' && c.op === 'delete');
  assert.deepEqual(calls[iRemove].remove, ['me/p1.jpg']); assert.ok(iRemove > -1 && iRemove < iDelete);
});

test('names2 읽기: 표 개수를 up·down 맵으로, 내 표 표시, 내려간 이름은 gone', async () => {
  const rows = [
    { id: 'n1', region: '11', name: '치즈', uid: 'u1', nick: null, up: 3, down: 1, status: 'ok', created_at: T0, name_votes: [{ uid: 'me', vote: 'up' }, { uid: 'zz', vote: 'down' }] },
    { id: 'n2', region: '11', name: '고등어', uid: 'u2', nick: '회원', up: 0, down: 2, status: 'removed', created_at: T1, name_votes: [] },
    { id: 'n3', region: '26', name: '다른지역', uid: 'u3', up: 1, down: 0, status: 'ok', created_at: T1 },
  ];
  const { client, calls } = makeFake({ tables: { names2: rows } });
  const list = await snap(createDb(client, P), 'names2/11/list');
  assert.deepEqual(list.map((n) => n.id), ['n1', 'n2']); assert.deepEqual(calls[0].filters, [['region', '11']]);
  const n1 = list[0];
  assert.equal(Object.values(n1.up).filter(Boolean).length, 3); assert.equal(n1.up.me, true);
  assert.equal(Object.values(n1.down).filter(Boolean).length, 1); assert.equal(n1.down.me, undefined);
  assert.equal(n1.nick, ''); assert.deepEqual(n1.rep, {}); assert.equal(n1.gone, undefined);
  assert.equal(list[1].gone, true); assert.equal(list[1].nick, '회원');
});

test('이름 투표·신고·제안 번역: name_vote 는 내 표 종류로, 취소는 지금 표를 보고, 중복 제안은 dup', async () => {
  const f = makeFake({ tables: { name_votes: [{ name_id: 'n1', uid: 'me', vote: 'down' }] }, rpc: { name_vote: () => ({}), report: () => null } });
  const db = createDb(f.client, P);
  await db.doc('names2/11/list/n1').update({ up: { me: true }, down: { me: false } });
  await db.doc('names2/11/list/n1').update({ down: { me: true }, up: { me: false } });
  await db.doc('names2/11/list/n1').update({ up: { me: false }, down: { me: false } }); // 취소: 내 표(down)를 다시 보냄
  await db.doc('names2/11/list/n2').update({ up: { me: false }, down: { me: false } }); // 표가 없으면 아무것도 안 함
  await db.doc('names2/11/list/n1').update({ rep: { me: true } });
  await db.doc('names2/11/list/n1').update({ gone: true }); // 서버가 정하므로 무시
  assert.deepEqual(f.calls.filter((c) => c.rpc).map((c) => [c.rpc, c.args]), [
    ['name_vote', { p_name_id: 'n1', p_vote: 'up' }], ['name_vote', { p_name_id: 'n1', p_vote: 'down' }], ['name_vote', { p_name_id: 'n1', p_vote: 'down' }],
    ['report', { p_kind: 'name', p_target: 'n1' }]]);
  const a = makeFake({ fail: { 'names2:insert': { code: '23505', message: 'duplicate key' } } });
  await assert.rejects(() => createDb(a.client, P).collection('names2/11/list').add({ name: '치즈', up: { me: true } }), (e) => e.code === 'dup');
  const b = makeFake(); const ref = await createDb(b.client, P).collection('names2/11/list').add({ name: '치즈', up: { me: true }, nick: '속임수' });
  assert.deepEqual(b.calls.find((c) => c.op === 'insert').payload, { region: '11', name: '치즈', uid: 'me' }); assert.equal(ref.id, 'id1');
  const c = makeFake({ rpc: { name_vote: () => { throw { code: 'P0001', message: 'need_member' }; } } });
  await assert.rejects(() => createDb(c.client, P).doc('names2/11/list/n1').update({ up: { me: true } }), (e) => e.code === 'need_member');
});

test('admin_kv·members·모르는 경로', async () => {
  const f = makeFake({ tables: { admin_kv: [{ key: 'recipes', value: { json: '[]' } }] } });
  const db = createDb(f.client, P);
  const g = await db.doc('admin/recipes').get(); assert.equal(g.exists, true); assert.deepEqual(g.data(), { json: '[]' });
  await db.doc('admin/recipes').set({ json: '[1]' }); assert.deepEqual(f.tables.admin_kv, [{ key: 'recipes', value: { json: '[1]' } }]);
  assert.equal((await createDb(makeFake().client, P).doc('admin/recipes').get()).exists, false);
  assert.equal((await db.doc('members/me').get()).exists, false);
  await assert.rejects(() => db.doc('members/me').set({ nick: 'x' }), (e) => e.code === 'feature_off');
  await assert.rejects(() => db.doc('data/users/me/bonds').get(), (e) => e.code === 'unsupported');
  assert.throws(() => db.collection('nothing'), (e) => e.code === 'unsupported');
});

test('다시 읽기: 처음 한 번, 주기마다, 내 쓰기 뒤, 해제하면 멈춘다', async () => {
  const { client, calls } = makeFake({ tables: { posts: [] } });
  const db = createDb(client, { pollMs: 25 });
  let n = 0; const off = db.collection('posts').limit(60).onSnapshot(() => { n++; });
  await new Promise((r) => setTimeout(r, 120)); assert.ok(n >= 3, '처음+주기 읽기 ' + n);
  const before = n; await db.doc('posts/p1').update({ likes: { me: true } }); assert.ok(n > before, '쓰기 뒤 바로 다시 읽음');
  off(); const after = n; await new Promise((r) => setTimeout(r, 80)); assert.equal(n, after);
  assert.ok(calls.some((c) => c.table === 'posts' && c.op === 'select'));
});

test('캡쳐 규격: 긴 변 960, WebP 0.8 시작, 120KB 넘으면 품질을 낮추고, JPEG 대체, 끝내 넘으면 null', async () => {
  assert.deepEqual(fitSize(1920, 1080), { w: 960, h: 540 }); assert.deepEqual(fitSize(500, 300), { w: 500, h: 300 });
  const mk = (sizeAt, webp = true) => {
    const log = [];
    return { log, load: async () => ({ width: 1920, height: 1280 }), canvas: (w, h) => ({ w, h }),
      encode: async (cv, type, q) => { log.push([cv.w, cv.h, type, +q.toFixed(1)]); const t = type === 'image/webp' && !webp ? 'image/png' : type; return { type: t, size: sizeAt(q) }; } };
  };
  const e1 = mk(() => 50000); const r1 = await packCapture('data:x', e1);
  assert.equal(r1.ext, 'webp'); assert.deepEqual(e1.log, [[960, 640, 'image/webp', 0.8]]);
  const e2 = mk((q) => (q > 0.55 ? 200000 : 100000)); const r2 = await packCapture('data:x', e2);
  assert.deepEqual(e2.log.map((l) => l[3]), [0.8, 0.7, 0.6, 0.5]); assert.equal(r2.blob.size, 100000);
  const e3 = mk(() => 50000, false); const r3 = await packCapture('data:x', e3);
  assert.equal(r3.ext, 'jpg'); assert.equal(r3.type, 'image/jpeg'); assert.deepEqual(e3.log.map((l) => l[2]), ['image/webp', 'image/jpeg']);
  assert.equal(await packCapture('data:x', mk(() => CAPTURE.MAX_BYTES + 1)), null);
});

test('createSupabaseCaps 는 db 를 만들고, 익명 이름 게이트는 names_anon 이 켜진 서버·모의 모드에서만 풀린다', async () => {
  const { client } = makeFake();
  const c = createSupabaseCaps(client, {}, { login: false, board_write: false, names_anon: true });
  assert.equal(typeof c.db.collection, 'function'); assert.equal(typeof c.db.doc, 'function'); assert.equal(c.room, null);
  Object.assign(Caps, { mode: 'supabase', features: { login: false, board_write: false, names_anon: true } });
  assert.equal(gateNeedsMember('name_suggest'), false); assert.equal(gateNeedsMember('name_like'), false); assert.equal(gateNeedsMember('name_report'), false);
  assert.equal(gateNeedsMember('board_write'), true); // 글쓰기는 여전히 회원 전용(화면은 '준비 중')
  Caps.features = { login: true, board_write: true, names_anon: false }; assert.equal(gateNeedsMember('name_suggest'), true); // 재개 값: 회원 전용 복귀(D-49)
  Object.assign(Caps, { mode: 'static', features: { login: false, board_write: false, names_anon: true } }); assert.equal(gateNeedsMember('name_suggest'), true); // 정적(1차) 모드는 기존대로
});
