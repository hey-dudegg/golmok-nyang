// Cloudflare Pages Function: 의견 보내기 중계 (M2-10, D-54·62). 경로 /api/feedback (같은 출처).
// 브라우저 -> 이 함수 -> Web3Forms. 접근 키는 환경 변수 WEB3FORMS_ACCESS_KEY 에만 있고 브라우저·저장소에는 없다.
// 응답은 {ok:true} 또는 {ok:false, code} 뿐이다(내부 오류 내용·키 노출 금지). 검증 규칙은 화면과 같은 core/feedback_rules.js 를 쓴다.
import { validateFeedback, mailPreview } from '../../prototype/src/core/feedback_rules.js';

export const MAX_BODY_BYTES = 4096;
export const RATE = { windowMs: 60000, max: 3, keep: 2000 }; // 같은 IP 1분 3건(이 인스턴스 메모리 안에서만 센다: 보조 수단)
const WEB3FORMS_URL = 'https://api.web3forms.com/submit';
const hits = new Map(); // ip -> [시각 ms]

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
});
const fail = (status, code, extra) => json(status, { ok: false, code }, extra);

function limited(ip, now) {
  if (!ip) return false;
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE.windowMs);
  if (list.length >= RATE.max) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list);
  if (hits.size > RATE.keep) hits.delete(hits.keys().next().value); // 메모리 상한
  return false;
}

export async function onRequest({ request, env, now = Date.now(), fetchImpl = fetch }) {
  if (request.method !== 'POST') return fail(405, 'method', { Allow: 'POST' });
  // 같은 출처만: Origin 이 있으면 요청 주소의 출처와 같아야 한다(CORS 허용 헤더는 주지 않는다)
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return fail(403, 'origin');
  if (!/^application\/json\b/i.test(request.headers.get('Content-Type') || '')) return fail(415, 'type');
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail(413, 'size');
  let text = '';
  try { text = await request.text(); } catch (e) { return fail(400, 'body'); }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return fail(413, 'size');
  let data = null;
  try { data = JSON.parse(text); } catch (e) { return fail(400, 'body'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(400, 'body');
  // 필드 화이트리스트: title·from·body·honey 만, 모두 문자열
  const allowed = ['title', 'from', 'body', 'honey'];
  if (Object.keys(data).some((k) => !allowed.includes(k))) return fail(400, 'field');
  for (const k of allowed) if (data[k] != null && typeof data[k] !== 'string') return fail(400, 'field');
  const v = validateFeedback(data); // now 를 안 넘기므로 '너무 빠름' 검사는 화면(클라이언트) 몫
  if (v.silent) return json(200, { ok: true }); // 허니팟: 성공처럼 보이고 보내지 않는다
  if (!v.ok) return fail(400, 'invalid');
  if (!env || !env.WEB3FORMS_ACCESS_KEY) return fail(503, 'config');
  if (limited(request.headers.get('CF-Connecting-IP'), now)) return fail(429, 'rate', { 'Retry-After': '60' });
  const m = mailPreview(v.clean);
  try {
    const r = await fetchImpl(WEB3FORMS_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ access_key: env.WEB3FORMS_ACCESS_KEY, subject: m.subject, name: m.name, message: m.message }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) return fail(502, 'upstream');
  } catch (e) { return fail(502, 'upstream'); }
  return json(200, { ok: true });
}
