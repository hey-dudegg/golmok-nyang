// core/log_rules.js 단위 시험 (M10-1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskText, cleanMsg, cleanCtx, cleanLogRecord, normPart, normCode, dailyHash, MSG_MAX } from '../../prototype/src/core/log_rules.js';

test('마스킹: 이메일·URL·IP·전화·토큰', () => {
  assert.equal(maskText('보냄 a.b@test.com 끝'), '보냄 [x] 끝');
  assert.equal(maskText('see https://ex.com/a?code=abc#t ok'), 'see [x] ok');
  assert.equal(maskText('ip 192.168.0.1 x'), 'ip [x] x');
  assert.equal(maskText('v6 2001:db8::ff00:42:8329 x'), 'v6 [x] x');
  assert.equal(maskText('tel 010-1234-5678 x'), 'tel [x] x');
  assert.equal(maskText('tel 01012345678'), 'tel [x]');
  assert.equal(maskText('tok ABCDEFGHIJKLMNOPQRST1234 x'), 'tok [x] x');
  assert.equal(maskText('jwt eyJhbGciOi.abc.def x'), 'jwt [x] x');
});
test('파일 경로 마스킹', () => {
  assert.equal(maskText('at C:\\Users\\kim\\a.js:1 x'), 'at [x] x');
  assert.equal(maskText('at file:///c/a.js x'), 'at [x] x');
  assert.equal(maskText('p /Users/kim/a.js x'), 'p [x] x');
  assert.equal(maskText('p /home/kim/a.js x'), 'p [x] x');
  assert.equal(maskText('src/a.js:12'), 'src/a.js:12');
});
test('쿼리스트링·해시 절단', () => {
  assert.equal(maskText('/auth/cb?code=zzz&s=1'), '/auth/cb');
  assert.equal(maskText('main.js#access_token=q'), 'main.js');
  assert.equal(maskText('왜 안돼?'), '왜 안돼?');
  assert.equal(maskText(null), '');
});
test('msg 상한·ctx 허용 키', () => {
  assert.equal(Array.from(cleanMsg('가'.repeat(300))).length, MSG_MAX);
  const c = cleanCtx({ region: '11', n: 3, ms: 12, status: 500, ua_class: 'mobile', file: 'a.js:3', nick: '냥이', email: 'a@b.c', ev: 'x' });
  assert.deepEqual(Object.keys(c).sort(), ['ev', 'file', 'ms', 'n', 'region', 'status', 'ua_class']);
  assert.equal(cleanCtx({ ua_class: 'tablet' }).ua_class, undefined);
  assert.equal(cleanCtx({ ev: 'u@x.com' }).ev, '[x]');
  assert.deepEqual(cleanCtx([1]), {});
});
test('ctx 300바이트 상한', () => {
  const c = cleanCtx({ region: '가'.repeat(60), ev: '나'.repeat(60), file: '다'.repeat(60), n: 1 });
  assert.ok(new TextEncoder().encode(JSON.stringify(c)).length <= 300);
});
test('파트·코드 정정, 레코드', () => {
  assert.equal(normPart('zzz'), 'client');
  assert.equal(normCode('auth', 'login_fail'), 'login_fail');
  assert.equal(normCode('auth', 'js_error'), 'other');
  const r = cleanLogRecord({ lvl: 'bad', part: 'x', code: 'js_error', msg: 'e a@b.com', ctx: { n: 1, zz: 1 }, extra: 1 });
  assert.deepEqual(r, { lvl: 'info', part: 'client', code: 'js_error', msg: 'e [x]', ctx: { n: 1 }, ver: '' });
});
test('일별 해시: 결정적·8자·날짜별 다름', () => {
  const a = dailyHash('id-1', '2026-11-21');
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.equal(a, dailyHash('id-1', '2026-11-21'));
  assert.notEqual(a, dailyHash('id-1', '2026-11-22'));
  assert.notEqual(a, dailyHash('id-2', '2026-11-21'));
  assert.ok(!a.includes('id-1'));
});
