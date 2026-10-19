// 런타임 기능 어댑터 Caps (D-10): window.claude(user·db·sample·downloads)가 있으면 그것, 없으면 로컬 모의(D-21)
import { LocalMock } from './local_mock.js';

// ───────────────────────── 회원 · 저장소 · AI (런타임 기능, 없으면 이 브라우저 안에서 체험) ─────────────────────────
export const Caps = { user: null, db: null, sample: null, downloads: null, uid: null, ready: false, shared: false, sampleOff: false, writeOff: false, mock: false, room: null, lock: null };
export async function initCaps() {
  if (!window.claude || typeof window.claude.use !== 'function') {
    if (LocalMock.usable()) { Caps.user = LocalMock.user(); Caps.mock = true; Caps.room = LocalMock.room(); Caps.lock = LocalMock.lock(); }
    Caps.ready = true; return;
  }
  const get = (n) => window.claude.use(n).catch(() => null);
  const [user, db, sample, downloads] = await Promise.all([get('user'), get('db'), get('sample'), get('downloads')]);
  Object.assign(Caps, { user, db, sample, downloads });
  if (user) { try { Caps.uid = await user.id(); } catch (e) {} }
  if (db && !Caps.uid) Caps.db = null; // 개인 기록이 없는 보기에서는 이 브라우저 체험 모드
  Caps.shared = !!Caps.db;
  if (user && Caps.db) { try { const can = await user.can('data.write'); if (can === false) Caps.writeOff = true; } catch (e) {} }
  Caps.ready = true;
}
