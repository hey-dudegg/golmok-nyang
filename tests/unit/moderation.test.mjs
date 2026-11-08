// 신고·어드민 검토 번역과 이름 필터 연결 단위 시험 (M2-6b). 가짜 client 로 서버 없이. 사용: node --test tests/unit/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFake } from '../fakes/supabase_fake.mjs';
globalThis.location = { hostname: 'example.test', search: '' };
const { createDb, toError } = await import('../../prototype/src/adapters/supabase_db.js');
const { errText } = await import('../../prototype/src/ui/err_text.js');
const { Names } = await import('../../prototype/src/state/names.js');
const P = { pollMs: 1e6 };

test('필터 오류 코드는 Error(code) 로 바뀌고 화면 문구가 있다(걸린 단어는 안 알림)', () => {
  for (const code of ['filter_word', 'filter_url', 'filter_contact', 'filter_chars', 'rate_limit', 'dup', 'need_admin']) {
    const e = toError({ message: code });
    assert.equal(e.code, code); assert.ok(errText(e, 'x') !== 'x', code);
  }
});

test('이름 신고(rep)는 rpc report(name)로, 게시글 신고는 rpc report(post)로 번역한다', async () => {
  const { client, calls } = makeFake({ user: { id: 'me' }, rpc: { report: () => null } });
  const db = createDb(client, P);
  await db.doc('names2/11/list/n1').update({ rep: { me: true } });
  await db.doc('posts/p1').update({ rep: { me: true } });
  const rs = calls.filter((c) => c.rpc === 'report').map((c) => c.args);
  assert.deepEqual(rs, [{ p_kind: 'name', p_target: 'n1' }, { p_kind: 'post', p_target: 'p1' }]);
});

test('남의 uid 의 rep 는 보내지 않는다', async () => {
  const { client, calls } = makeFake({ user: { id: 'me' }, rpc: { report: () => null } });
  await createDb(client, P).doc('names2/11/list/n1').update({ rep: { other: true } });
  assert.equal(calls.filter((c) => c.rpc === 'report').length, 0);
});

test('서버 거부(need_member·not_found)는 Error(code)로 던진다', async () => {
  const { client } = makeFake({ user: { id: 'me' }, rpc: { report: () => { throw { message: 'need_member' }; } } });
  await assert.rejects(createDb(client, P).doc('names2/11/list/n1').update({ rep: { me: true } }), (e) => e.code === 'need_member');
});

test('mod: 목록·복구·삭제(글이면 그림 파일도 지움)·어드민 아니면 need_admin', async () => {
  const items = [{ kind: 'name', target: 'n1', text: '냥', reports: 3, hidden_at: '2026-11-08T00:00:00Z' }];
  const { client, calls } = makeFake({ rpc: {
    mod_list: () => items, mod_restore: () => null,
    mod_remove: (a) => (a.p_kind === 'post' ? 'u1/p1.webp' : null),
  } });
  const m = createDb(client, P).mod;
  assert.deepEqual(await m.list(), items);
  await m.restore('name', 'n1');
  await m.remove('name', 'n1');
  assert.equal(calls.filter((c) => c.remove).length, 0);
  await m.remove('post', 'p1');
  assert.deepEqual(calls.find((c) => c.remove).remove, ['u1/p1.webp']);
  const bad = makeFake({ rpc: { mod_list: () => { throw { message: 'need_admin' }; } } });
  await assert.rejects(createDb(bad.client, P).mod.list(), (e) => e.code === 'need_admin');
});

test('Names.check: 앱 쪽 필터(연락처·링크 모양)는 걸러 코드와 문구를 주고, 보통 이름은 통과', () => {
  assert.equal(Names.check('치즈').name, '치즈');
  const c = Names.check('공일공냥'); assert.equal(c.code, 'filter_contact'); assert.ok(c.err);
  assert.ok(Names.check('냥!!').err); // 기존 글자 검사
});
