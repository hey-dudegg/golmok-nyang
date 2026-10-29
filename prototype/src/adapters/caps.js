// 런타임 기능 어댑터 Caps (D-10): window.claude(user·db·sample·downloads)가 있으면 그것, 없으면 Supabase(설정이 맞을 때), 없으면 로컬 모의(D-21)
import { Feedback } from './feedback.js';
import { LocalMock } from './local_mock.js';
import { SUPABASE_CONFIG } from '../config.js';
import { pickSupabaseConfig, loadSupabaseClient, createSupabaseCaps, ensureSession } from './supabase.js';

// ───────────────────────── 회원 · 저장소 · AI (런타임 기능, 없으면 이 브라우저 안에서 체험) ─────────────────────────
// mode: 'artifact' | 'supabase' | 'mock' | 'static' (설계 5-1). notice: 화면이 한 번 보여 줄 안내(연결 실패 등, 없으면 '')
export const Caps = { user: null, db: null, sample: null, downloads: null, uid: null, ready: false, shared: false, sampleOff: false, writeOff: false, mock: false, room: null, lock: null, mode: 'static', notice: '', feedback: Feedback }; // feedback: 의견 보내기(R-16). 전송 방법은 어댑터 안에서 고른다
export const SUPABASE_FAIL_NOTICE = '지금은 서버에 연결되지 않아 이 기기에만 저장돼요';

// opts 는 시험용: { win, hostname, cfg, loadClient }
export async function initCaps(opts = {}) {
  const win = 'win' in opts ? opts.win : (typeof window !== 'undefined' ? window : null);
  if (!win || !win.claude || typeof win.claude.use !== 'function') {
    const host = 'hostname' in opts ? opts.hostname : (typeof location !== 'undefined' ? location.hostname : '');
    const sb = pickSupabaseConfig('cfg' in opts ? opts.cfg : SUPABASE_CONFIG, host);
    if (sb) {
      Caps.mode = 'supabase';
      try {
        const client = await (opts.loadClient || loadSupabaseClient)(sb);
        Caps.uid = await ensureSession(client);
        const c = createSupabaseCaps(client, sb);
        Object.assign(Caps, { user: c.user, db: c.db, room: c.room, lock: c.lock });
        Caps.shared = !!Caps.db;
      } catch (e) { // 못 받았거나 로그인·첫 읽기 실패: 이 브라우저 체험 모드로 (설계 5-2)
        Caps.mode = 'static'; Caps.uid = null; Caps.user = null; Caps.db = null; Caps.shared = false; Caps.notice = SUPABASE_FAIL_NOTICE;
        if (LocalMock.usable()) { Caps.mock = true; Caps.mode = 'mock'; Caps.user = LocalMock.user(); Caps.room = LocalMock.room(); Caps.lock = LocalMock.lock(); }
      }
      Caps.ready = true; return;
    }
    if (LocalMock.usable()) { Caps.user = LocalMock.user(); Caps.mock = true; Caps.mode = 'mock'; Caps.room = LocalMock.room(); Caps.lock = LocalMock.lock(); }
    Caps.ready = true; return;
  }
  Caps.mode = 'artifact';
  const get = (n) => win.claude.use(n).catch(() => null);
  const [user, db, sample, downloads] = await Promise.all([get('user'), get('db'), get('sample'), get('downloads')]);
  Object.assign(Caps, { user, db, sample, downloads });
  if (user) { try { Caps.uid = await user.id(); } catch (e) {} }
  if (db && !Caps.uid) Caps.db = null; // 개인 기록이 없는 보기에서는 이 브라우저 체험 모드
  Caps.shared = !!Caps.db;
  if (user && Caps.db) { try { const can = await user.can('data.write'); if (can === false) Caps.writeOff = true; } catch (e) {} }
  Caps.ready = true;
}
