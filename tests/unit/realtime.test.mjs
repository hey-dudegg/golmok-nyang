// 실시간 room·lock 단위 시험(M2-9, 설계 2차_연결_실시간.md 8-5·8-6): 가짜 channel·rpc 로 서버 없이. 사용: node --test tests/unit/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFake } from '../fakes/supabase_fake.mjs';
globalThis.location = { hostname: 'example.test', search: '' };
const { createRoom, createLock } = await import('../../prototype/src/adapters/supabase_room.js');
const { createSupabaseCaps } = await import('../../prototype/src/adapters/supabase.js');

const mkDoc = () => { const fs = []; return { visibilityState: 'visible', addEventListener: (t, f) => { if (t === 'visibilitychange') fs.push(f); }, set(v) { this.visibilityState = v; fs.forEach((f) => f()); } }; };
const mkTimers = () => { const q = []; return { setTimer: (f, ms) => { const t = { f, ms }; q.push(t); return t; }, clearTimer: (t) => { const i = q.indexOf(t); if (i >= 0) q.splice(i, 1); }, fire: () => { const t = q.shift(); if (t) t.f(); }, size: () => q.length }; };

test('room: 비공개 채널 하나, 구독되면 live 와 track, 지역별·전체 수', () => {
  const { client, channels, calls } = makeFake();
  const room = createRoom(client, { id: 'me', doc: null });
  let n = 0; room.onCount(() => n++);
  assert.equal(room.live, false); room.join('r:11');
  assert.equal(channels.length, 1); assert.equal(channels[0].topic, 'gn:site');
  assert.deepEqual(channels[0].opts.config, { private: true, presence: { key: 'me' } });
  assert.equal(room.count('r:11'), 1); // 연결 전: 나 한 명
  channels[0].status('SUBSCRIBED');
  assert.equal(room.live, true); assert.deepEqual(channels[0].tracked, { r: 'r:11' });
  channels[0].presence({ a: [{ r: 'r:11' }], b: [{ r: 'r:26' }, { r: 'r:11' }], c: [{ r: 'r:26' }] });
  assert.equal(room.count('r:11'), 3); // a, b(마지막 meta), 나
  assert.equal(room.count('r:26'), 1); assert.equal(room.count('*'), 4);
  room.join('r:26'); assert.deepEqual(channels[0].tracked, { r: 'r:26' });
  assert.ok(n >= 2);
  assert.ok(!JSON.stringify(calls.filter((c) => c.op === 'track')).match(/uid|nick/));
});

test('room: 상태 변화로 live 전환, 끊기면 알림', () => {
  const { client, channels } = makeFake();
  const room = createRoom(client, { id: 'me', doc: null }); room.join('r:11');
  const lives = []; room.onCount(() => lives.push(room.live));
  for (const s of ['SUBSCRIBED', 'CHANNEL_ERROR', 'SUBSCRIBED', 'TIMED_OUT', 'CLOSED']) channels[0].status(s);
  assert.deepEqual(lives, [true, false, true, false]); // CLOSED 는 이미 false 라 알림 없음
  assert.equal(room.live, false);
});

test('room: 홍보 수신 on, send 는 무동작', () => {
  const { client, channels, calls } = makeFake();
  const room = createRoom(client, { id: 'me', doc: null }); room.join('r:11');
  const got = []; room.on((k, d) => got.push([k, d]));
  channels[0].broadcast('promo', { code: '26', name: '냥', at: 1 });
  assert.deepEqual(got, [['promo', { code: '26', name: '냥', at: 1 }]]);
  const before = calls.length; room.send('promo', { code: '11' }); assert.equal(calls.length, before);
});

test('room: 60초 넘게 숨겨지면 해제, 다시 보이면 재가입', () => {
  const { client, channels } = makeFake(); const doc = mkDoc(), t = mkTimers();
  const room = createRoom(client, { id: 'me', doc, setTimer: t.setTimer, clearTimer: t.clearTimer, hideMs: 60000 }); room.join('r:11'); channels[0].status('SUBSCRIBED');
  doc.set('hidden'); assert.equal(t.size(), 1); doc.set('visible'); assert.equal(t.size(), 0); assert.equal(channels.length, 1); // 짧게 숨겨졌다 돌아옴
  doc.set('hidden'); t.fire();
  assert.equal(channels[0].removed, true); assert.equal(room.live, false);
  doc.set('visible'); assert.equal(channels.length, 2); channels[1].status('SUBSCRIBED');
  assert.equal(room.live, true); assert.deepEqual(channels[1].tracked, { r: 'r:11' });
  channels[0].status('SUBSCRIBED'); channels[0].broadcast('promo', {}); // 옛 채널 사건은 무시
});

test('lock: promo_claim 번역(ok·busy·오류 코드·network), ttlMs 무시, peek null', async () => {
  const run = (res) => { const { client, calls } = makeFake({ rpc: { promo_claim: () => res } }); return { l: createLock(client), calls }; };
  let { l, calls } = run({ ok: true });
  assert.equal(await l.acquire('promo', { holder: 'x', ttlMs: 10000, data: { code: '11', name: '냥이' } }), true);
  assert.deepEqual(calls[0], { rpc: 'promo_claim', args: { p_code: '11', p_name: '냥이' } });
  assert.equal(l.peek('promo'), null);
  ({ l } = run({ ok: false, code: 'busy' })); assert.equal(await l.acquire('promo', { data: { code: '11', name: '냥' } }), false);
  for (const code of ['rate_limit', 'blocked', 'bad_text', 'auth']) { ({ l } = run({ ok: false, code })); await assert.rejects(l.acquire('promo', { data: {} }), (e) => e.code === code); }
  const bad = makeFake({}); await assert.rejects(createLock(bad.client).acquire('promo', { data: {} }), (e) => e.code === 'network'); // rpc 없음 = 오류
  ({ l } = run({ ok: true, sent: false })); await assert.rejects(l.acquire('promo', { data: {} }), (e) => e.code === 'not_sent');
  ({ l } = run(null)); await assert.rejects(l.acquire('promo', { data: {} }), (e) => e.code === 'network');
  const c = makeFake({ rpc: { promo_clear: () => null } }); await createLock(c.client).clear('promo'); assert.equal(c.calls[0].rpc, 'promo_clear');
});

test('createSupabaseCaps: room·lock 이 채워진다', () => {
  const { client } = makeFake(); const c = createSupabaseCaps(client, {}, undefined, { pollMs: 1e6 }, { doc: null });
  assert.equal(typeof c.room.join, 'function'); assert.equal(typeof c.lock.acquire, 'function');
});
