// core/log_rules.js: 로그 순수 규칙 (설계 로그_설계.md 3~5장, M10-1). 서버 log_write(M10-2)와 logger 어댑터(M10-3)가 같은 규칙을 따른다.
// 마스킹·허용 키·코드 사전·길이 상한·일별 해시. 어떤 입력도 던지지 않는다.
export const LOG_LEVELS = ['info', 'warn', 'error'];
export const LOG_CODES = {
  server: ['rpc_fail', 'rt_over_limit', 'db_timeout', 'daily_job_fail'],
  auth: ['login_fail', 'token_refresh_fail', 'provider_error'],
  privacy: ['pii_blocked', 'rls_denied', 'delete_req'],
  client: ['js_error', 'module_load_fail', 'webgl_fail'],
  content: ['post_reject', 'feedback_reject', 'name_reject'],
  admin: ['admin_action'],
};
export const LOG_PARTS = Object.keys(LOG_CODES);
export const CTX_KEYS = ['region', 'ev', 'n', 'ms', 'status', 'ua_class', 'file'];
export const MSG_MAX = 120;
export const CTX_MAX_BYTES = 300;
export const VER_MAX = 40;
export const MASK = '[x]';

// 순서가 중요: URL -> 파일 경로 -> 이메일 -> JWT -> IPv6 -> IPv4 -> 전화 -> 긴 토큰 -> 쿼리·해시 절단
const MASK_RES = [
  /https?:\/\/\S*/gi,
  /[A-Za-z]:\\\S*/g,
  /file:\S*/gi,
  /\/(Users|home)\/\S*/g,
  /\S*@\S*/g,
  /eyJ\S*/g,
  /(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{1,4}/gi,
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/g,
  /(?<![\w])\+?\d{2,4}[-. ]?\d{3,4}[-. ]?\d{4}(?![\w])/g,
  /[A-Za-z0-9_-]{20,}/g,
];
const CUT_RE = /[?#]\S+/g;

export function maskText(s) {
  let t = String(s == null ? '' : s);
  for (const re of MASK_RES) t = t.replace(re, MASK);
  return t.replace(CUT_RE, '');
}

export function clampText(s, max) {
  const a = Array.from(String(s == null ? '' : s));
  return a.length > max ? a.slice(0, max).join('') : a.join('');
}

export function cleanMsg(s) { return clampText(maskText(s), MSG_MAX); }

export function normPart(p) { return LOG_PARTS.includes(p) ? p : 'client'; }
export function normLevel(l) { return LOG_LEVELS.includes(l) ? l : 'info'; }
export function normCode(part, code) { return (LOG_CODES[part] || []).includes(code) ? code : 'other'; }

function utf8Len(s) { return Buffer_len(s); }
function Buffer_len(s) { return new TextEncoder().encode(s).length; }

// 허용 키만 남기고 값 마스킹. 숫자는 숫자로, 문자열은 마스킹·60자 상한. 300바이트 넘으면 뒤 키부터 버린다
export function cleanCtx(ctx) {
  const out = {};
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return out;
  for (const k of CTX_KEYS) {
    if (!(k in ctx)) continue;
    const v = ctx[k];
    if (typeof v === 'number') { if (Number.isFinite(v)) out[k] = v; }
    else if (typeof v === 'string') {
      if (k === 'ua_class') { if (v === 'mobile' || v === 'desktop') out[k] = v; }
      else out[k] = clampText(maskText(v), 60);
    }
    if (k in out && utf8Len(JSON.stringify(out)) > CTX_MAX_BYTES) { delete out[k]; break; }
  }
  return out;
}

// 레코드 전체 정리: ts·id·uh 는 서버가 채우므로 만들지 않는다
export function cleanLogRecord(r) {
  const x = r || {};
  const part = normPart(x.part);
  return { lvl: normLevel(x.lvl), part, code: normCode(part, x.code), msg: cleanMsg(x.msg), ctx: cleanCtx(x.ctx), ver: clampText(maskText(x.ver), VER_MAX) };
}

// 일별 해시 uh: 익명 id + 날짜(YYYY-MM-DD) -> 8자 hex. 결정적 순수 함수(FNV-1a 변형 2회), 원본 id는 반환값에서 복원 불가.
// 서버(md5 + 소금)와 값이 같을 필요 없다: 브라우저는 같은 날 묶음용으로만 쓴다.
export function dailyHash(anonId, dateStr) {
  const s = String(anonId == null ? '' : anonId) + '|' + String(dateStr == null ? '' : dateStr);
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0).toString(16).padStart(8, '0');
}
