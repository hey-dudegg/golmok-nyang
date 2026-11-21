// 로그 어댑터 Caps.log (설계 로그_설계.md 5장, L-3, D-10·11). 모의/정적은 메모리 링버퍼(console 미사용, 비전송), 실전은 rpc('log_write', {p: rec}).
// 앱에 예외를 던지지 않는다: 전송 실패·잘못된 입력은 조용히 버리고 재시도 없음. 같은 code+msg 는 1분에 1번, 세션(탭) 상한 30건.
// 실전 전송엔 uh·ts·id 를 넣지 않는다(서버가 계산). 모의 버퍼에만 uh = dailyHash(id, 오늘).
import { cleanLogRecord, dailyHash } from '../core/log_rules.js';

export const LOG_DEDUP_MS = 60000;
export const LOG_SESSION_MAX = 30;
export const LOG_RING_MAX = 50;

// mode: 'supabase' 면 전송, 그 밖은 모의(버퍼만). opts: { client, anonId, ver, now(ms), dedupMs, max, ring }
export function createLogger(mode, opts = {}) {
  const live = mode === 'supabase' && !!(opts.client && typeof opts.client.rpc === 'function');
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
  const dedupMs = opts.dedupMs ?? LOG_DEDUP_MS, max = opts.max ?? LOG_SESSION_MAX, ring = opts.ring ?? LOG_RING_MAX;
  const buf = [], seen = new Map();
  let count = 0;
  const today = () => new Date(now()).toISOString().slice(0, 10);
  function write(lvl, part, code, msg, ctx) {
    try {
      const rec = cleanLogRecord({ lvl, part, code, msg, ctx, ver: opts.ver });
      const t = now(), key = rec.part + '/' + rec.code + '/' + rec.msg;
      if (count >= max) return false;
      const last = seen.get(key);
      if (last !== undefined && t - last < dedupMs) return false;
      seen.set(key, t); count++;
      if (seen.size > 200) seen.delete(seen.keys().next().value);
      if (live) {
        try { Promise.resolve(opts.client.rpc('log_write', { p: rec })).catch(() => {}); } catch (e) {} // 실패 무시
      } else { buf.push({ ...rec, ...(opts.anonId != null ? { uh: dailyHash(opts.anonId, today()) } : {}), ts: t }); if (buf.length > ring) buf.shift(); }
      return true;
    } catch (e) { return false; }
  }
  const lv = (l) => (part, code, msg, ctx) => write(l, part, code, msg, ctx);
  return { mock: !live, write, info: lv('info'), warn: lv('warn'), error: lv('error'), buffer: () => buf.slice(), clear: () => { buf.length = 0; seen.clear(); count = 0; } };
}
