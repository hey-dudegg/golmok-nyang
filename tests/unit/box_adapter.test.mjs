// 상자 어댑터 단위 시험(M6-3): 가짜 client rpc 로 오류 코드→예외, 방송 수신 전달, 나쁜 페이로드 버림. 사용: node --test tests/unit/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFake } from '../fakes/supabase_fake.mjs';
globalThis.location = { hostname: 'example.test', search: '' };
const { createBox } = await import('../../prototype/src/adapters/box.js');
const { createRoom } = await import('../../prototype/src/adapters/supabase_room.js');
const { createSupabaseCaps } = await import('../../prototype/src/adapters/supabase.js');

const ID = '123e4567-e89b-42d3-a456-426614174000';
const BOX = { code: '11', id: ID, placed: 1000, until: 1000 + 3600000, seed: 7, name: '철수' };
const mk = (rpc) => { const f = makeFake({ rpc }); return { ...f, box: createBox(f.client) }; };

test('box.place: ok 는 {now, box(mine)}, rpc 이름·인자 그대로', async () => {
  const { box, calls } = mk({ box_place: () => ({ ok: true, now: 1500, box: BOX }) });
  const r = await box.place('11', '철수');
  assert.equal(r.now, 1500); assert.equal(r.box.mine, true); assert.equal(r.box.until, BOX.until);
  const c = calls.find((x) => x.rpc === 'box_place' || x.fn === 'box_place' || JSON.stringify(x).includes('box_place'));
  assert.ok(c); assert.ok(JSON.stringify(c).includes('철수'));
});

test('box.place: 오류 코드→예외(busy 는 until 포함)', async () => {
  for (const code of ['mine_active', 'rate_limit', 'bad_code', 'bad_name', 'auth', 'filter_word']) {
    const { box } = mk({ box_place: () => ({ ok: false, code }) });
    await assert.rejects(box.place('11', 'x'), (e) => e.code === code && e.message === code);
  }
  const { box } = mk({ box_place: () => ({ ok: false, code: 'busy', until: 99999 }) });
  await assert.rejects(box.place('11', 'x'), (e) => e.code === 'busy' && e.until === 99999);
});

test('box: rpc 오류·모양 틀림·예외는 network', async () => {
  for (const rpc of [() => { throw new Error('x'); }, () => null, () => ({ ok: true, now: 1 })]) {
    const { box } = mk({ box_place: rpc, box_list: rpc, box_clear: rpc });
    await assert.rejects(box.place('11', 'x'), (e) => e.code === 'network');
    await assert.rejects(box.list(), (e) => e.code === 'network');
  }
});

test('box.list: 나쁜 상자는 버리고 mine 은 그대로', async () => {
  const { box } = mk({ box_list: () => ({ now: 2000, boxes: [{ ...BOX, mine: true }, { ...BOX, code: '99' }, { ...BOX, name: '가'.repeat(11) }] }) });
  const r = await box.list();
  assert.equal(r.now, 2000); assert.equal(r.boxes.length, 1); assert.equal(r.boxes[0].mine, true);
  assert.ok(!('at' in r.boxes[0]));
});

test('box.clear: 거부는 예외, 성공은 조용히', async () => {
  await assert.rejects(mk({ box_clear: () => ({ ok: false, code: 'auth' }) }).box.clear('11'), (e) => e.code === 'auth');
  await mk({ box_clear: () => ({ ok: true }) }).box.clear('11');
});

test('room: box 방송은 검사 후 f(box, payload) 로 전달, 나쁜 것은 버림', () => {
  const { client, channels } = makeFake();
  const room = createRoom(client, { id: 'me', doc: null });
  const got = []; room.on((k, p) => got.push([k, p])); room.join('r:11');
  channels[0].broadcast('box', { ...BOX, at: 1100 });
  channels[0].broadcast('box', { ...BOX, at: 1100, code: '99' });
  channels[0].broadcast('box', { ...BOX, id: 'nope' });
  channels[0].broadcast('box', { ...BOX, name: '<b>'.repeat(5) });
  channels[0].broadcast('box', null);
  assert.equal(got.length, 1); assert.equal(got[0][0], 'box'); assert.equal(got[0][1].at, 1100);
});

test('createSupabaseCaps 에 box 가 들어 있다', () => {
  const { client } = makeFake();
  assert.equal(typeof createSupabaseCaps(client, {}).box.place, 'function');
});

test('box.list: {ok:false, code} 는 auth 등 코드 유지', async () => {
  const { box } = mk({ box_list: () => ({ ok: false, code: 'auth' }) });
  await assert.rejects(box.list(), (e) => e.code === 'auth');
});
