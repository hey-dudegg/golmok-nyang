// 의견 중계 Pages Function 단위 시험(M2-10): 가짜 Request·env·fetch 로 서버 없이.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { onRequest, MAX_BODY_BYTES } = await import('../../functions/api/feedback.js');

const URL_ = 'https://site.example/api/feedback';
const good = { title: '고양이 좋아요', from: '', body: '털이 포근해요', honey: '' };
const req = (body, over = {}) => new Request(URL_, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(over.headers || {}) },
  body: typeof body === 'string' ? body : JSON.stringify(body), ...(over.init || {}),
});
const mk = (ok = true, success = true) => { const calls = []; const f = async (u, o) => { calls.push({ u, o }); return new Response(JSON.stringify({ success }), { status: ok ? 200 : 500 }); }; f.calls = calls; return f; };
const run = async (r, env = { WEB3FORMS_ACCESS_KEY: 'TESTKEY' }, f = mk(), now = Date.now()) => {
  const res = await onRequest({ request: r, env, fetchImpl: f, now }); return { res, j: await res.json(), f };
};
let ipn = 0; const ip = () => ({ 'CF-Connecting-IP': '10.0.0.' + (++ipn) }); // 시험끼리 빈도 제한이 겹치지 않게

test('정상: Web3Forms 로 키와 함께 전달, 응답에 키 없음', async () => {
  const { res, j, f } = await run(req(good, { headers: ip() }));
  assert.equal(res.status, 200); assert.deepEqual(j, { ok: true });
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].u, 'https://api.web3forms.com/submit');
  const sent = JSON.parse(f.calls[0].o.body);
  assert.equal(sent.access_key, 'TESTKEY'); assert.match(sent.subject, /고양이 좋아요/);
  assert.ok(!JSON.stringify(j).includes('TESTKEY'));
});
test('키 없음: 503, 전달 안 함', async () => {
  for (const env of [{}, null]) { const { res, j, f } = await run(req(good, { headers: ip() }), env); assert.equal(res.status, 503); assert.equal(j.code, 'config'); assert.equal(f.calls.length, 0); }
});
test('GET 등 잘못된 메서드: 405', async () => {
  for (const m of ['GET', 'PUT', 'DELETE']) { const { res } = await run(new Request(URL_, { method: m })); assert.equal(res.status, 405); }
});
test('다른 출처 Origin: 403, 같은 출처는 통과', async () => {
  assert.equal((await run(req(good, { headers: { Origin: 'https://evil.example', ...ip() } }))).res.status, 403);
  assert.equal((await run(req(good, { headers: { Origin: 'https://site.example', ...ip() } }))).res.status, 200);
});
test('JSON 이 아닌 형식: 415, 깨진 JSON·배열: 400', async () => {
  assert.equal((await run(req('a=b', { headers: { 'Content-Type': 'text/plain' } }))).res.status, 415);
  assert.equal((await run(req('{깨짐'))).res.status, 400);
  assert.equal((await run(req('[1]'))).res.status, 400);
});
test('크기 초과: 413 (선언·실제 모두)', async () => {
  const big = JSON.stringify({ ...good, body: 'a'.repeat(MAX_BODY_BYTES) });
  assert.equal((await run(req(big, { headers: ip() }))).res.status, 413);
  assert.equal((await run(req(good, { headers: { 'Content-Length': String(MAX_BODY_BYTES + 1), ...ip() } }))).res.status, 413);
});
test('필드: 모르는 필드·숫자 타입은 400, 빈 내용·긴 글·링크는 400', async () => {
  const bad = [{ ...good, extra: 'x' }, { ...good, title: 5 }, { ...good, body: '' }, { ...good, body: '가'.repeat(501) }, { ...good, body: '여기 https://x.example' }];
  for (const b of bad) { const { res, f } = await run(req(b, { headers: ip() })); assert.equal(res.status, 400); assert.equal(f.calls.length, 0); }
});
test('허니팟: 성공처럼 응답하고 보내지 않음', async () => {
  const { res, j, f } = await run(req({ ...good, honey: 'bot' }, { headers: ip() }));
  assert.equal(res.status, 200); assert.equal(j.ok, true); assert.equal(f.calls.length, 0);
});
test('Web3Forms 실패·예외: 502, 내부 내용 노출 없음', async () => {
  for (const f of [mk(false), mk(true, false), async () => { throw new Error('SECRET-INTERNAL'); }]) {
    const { res, j } = await run(req(good, { headers: ip() }), undefined, f);
    assert.equal(res.status, 502); assert.deepEqual(j, { ok: false, code: 'upstream' });
  }
});
test('같은 IP 빈도 제한: 1분 3건 넘으면 429, 1분 뒤 풀림', async () => {
  const h = { 'CF-Connecting-IP': '203.0.113.9' }; const t = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal((await run(req(good, { headers: h }), undefined, mk(), t + i)).res.status, 200);
  assert.equal((await run(req(good, { headers: h }), undefined, mk(), t + 10)).res.status, 429);
  assert.equal((await run(req(good, { headers: h }), undefined, mk(), t + 61000)).res.status, 200);
});
