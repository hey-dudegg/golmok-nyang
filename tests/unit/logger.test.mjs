// 로그 어댑터 단위 시험(M10-3): 모의 버퍼·console 미사용·중복 제한·상한·전송 실패 무시·정제·uh
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { createLogger } = await import('../../prototype/src/adapters/logger.js');

const spyConsole = () => { const calls = []; const o = {}; for (const k of ['log', 'warn', 'error', 'info', 'debug']) { o[k] = console[k]; console[k] = (...a) => calls.push(k); } return { calls, restore: () => Object.assign(console, o) }; };

test('모의: 메모리 기록, console 미사용, 정제', () => {
  const sp = spyConsole();
  try {
    const L = createLogger('mock');
    assert.equal(L.error('client', 'js_error', 'a@b.com 실패 http://x.y/z?k=1'), true);
    L.write('bogus', 'nope', 'zzz', 'm', { region: 'r', secret: 's' });
    const b = L.buffer();
    assert.equal(b.length, 2);
    assert.ok(!/a@b\.com|http/.test(b[0].msg));
    assert.equal(b[1].lvl, 'info'); assert.equal(b[1].part, 'client'); assert.equal(b[1].code, 'other');
    assert.ok(!('secret' in b[1].ctx));
    assert.equal(b[0].uh, undefined);
  } finally { sp.restore(); }
  assert.deepEqual(sp.calls, []);
});

test('중복 제한: 같은 code+msg 는 1분 1회, 다른 msg 는 통과', () => {
  let t = 1000; const L = createLogger('mock', { now: () => t });
  assert.equal(L.error('client', 'js_error', 'x'), true);
  assert.equal(L.error('client', 'js_error', 'x'), false);
  assert.equal(L.error('client', 'js_error', 'y'), true);
  t += 61000;
  assert.equal(L.error('client', 'js_error', 'x'), true);
  assert.equal(L.buffer().length, 3);
});

test('세션 상한과 링버퍼', () => {
  const L = createLogger('mock', { max: 5, ring: 3 });
  let ok = 0; for (let i = 0; i < 20; i++) if (L.info('client', 'js_error', 'm' + i)) ok++;
  assert.equal(ok, 5); assert.equal(L.buffer().length, 3);
  assert.equal(L.buffer()[2].msg, 'm4');
});

test('실전: rpc log_write {p}, uh 일별 해시·원본 id 미전송', async () => {
  const sent = []; const client = { rpc: async (fn, args) => { sent.push([fn, args]); return { data: {} }; } };
  const L = createLogger('supabase', { client, anonId: 'user-secret-123', now: () => Date.parse('2026-11-21T03:00:00Z') });
  assert.equal(L.mock, false);
  L.error('client', 'js_error', 'boom');
  assert.equal(sent.length, 1); assert.equal(sent[0][0], 'log_write');
  const p = sent[0][1].p;
  assert.equal(p.uh, undefined); assert.equal('ts' in p, false); assert.equal(p.code, 'js_error'); assert.equal(p.lvl, 'error');
  assert.ok(!JSON.stringify(sent).includes('user-secret-123'));
  assert.equal(L.buffer().length, 0);
});

test('전송 실패(동기 throw·거부)는 조용히 무시', async () => {
  const sp = spyConsole();
  try {
    const A = createLogger('supabase', { client: { rpc: () => { throw new Error('net'); } }, anonId: 'a' });
    const B = createLogger('supabase', { client: { rpc: () => Promise.reject(new Error('net')) }, anonId: 'a' });
    assert.doesNotThrow(() => A.error('client', 'js_error', 'q'));
    assert.doesNotThrow(() => B.error('client', 'js_error', 'q'));
    await new Promise((r) => setTimeout(r, 10));
    assert.doesNotThrow(() => createLogger('mock').write(undefined, null, {}, Symbol.iterator));
  } finally { sp.restore(); }
  assert.deepEqual(sp.calls, []);
});
