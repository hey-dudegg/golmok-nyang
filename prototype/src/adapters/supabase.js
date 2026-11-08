// Supabase 연결 어댑터의 입구 (D-10, D-77·78, 설계 2차_연결_설계.md 5장). 설정 고르기·client 만들기·익명 세션(M2-5a), user·features(M2-5b).
// db(표 번역)는 supabase_db.js(M2-6a). client 는 인자로 받아 시험에서 가짜를 넣는다. 로그인·가입·탈퇴는 보류(D-82).
// 방문자에게 보이는 공개 키만 다룬다. 관리자 키는 쓰지 않는다(D-11).
import { FEATURES_DEFAULT } from '../config.js';
import { createDb } from './supabase_db.js';
import { createRoom, createLock } from './supabase_room.js';

// 접속 주소에 맞는 항목을 고른다. url·key 가 둘 다 있어야 한다. 없으면 null(= 연결하지 않음).
export function pickSupabaseConfig(cfg, hostname) {
  for (const k of Object.keys(cfg || {})) {
    const c = cfg[k];
    if (c && Array.isArray(c.hosts) && c.hosts.includes(hostname) && c.url && c.key) return { name: k, url: c.url, key: c.key };
  }
  return null;
}

// vendor 의 supabase-js 를 import map 이름으로 받는다(D-78). 못 받으면 던진다.
export async function loadSupabaseClient(cfg) {
  const { createClient } = await import('supabase-js');
  return createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
}

// 시작 때 app_config.features 1회 읽기(설계 2-1). 못 읽거나 모양이 틀리면 기본값. 불린 키만 덮어쓴다.
export async function loadFeatures(client) {
  const out = { ...FEATURES_DEFAULT };
  try {
    const r = await client.from('app_config').select('value').eq('key', 'features').maybeSingle();
    const v = r && !r.error && r.data && r.data.value;
    if (v && typeof v === 'object') for (const k of Object.keys(out)) if (typeof v[k] === 'boolean') out[k] = v[k];
  } catch (e) {}
  return out;
}

// user: 서버 권한 규칙(2-1 can_post·can_name)과 같은 판정. 화면 표시용이고 방어는 서버다. features 는 읽은 값을 넘긴다.
export function createUser(client, features) {
  const me = async () => { const g = await client.auth.getSession(); return (g && g.data && g.data.session && g.data.session.user) || null; };
  const anon = (u) => !u || u.is_anonymous !== false; // 모르면 익명 취급(안전 쪽)
  let member = null; // 회원 여부(익명이면 항상 false). 로그인 보류 중에는 호출해도 false
  const isMember = async () => {
    const u = await me();
    if (anon(u)) return false;
    if (member === null) { try { const r = await client.rpc('is_member'); member = !!(r && !r.error && r.data); } catch (e) { member = false; } }
    return member;
  };
  return {
    id: async () => { const u = await me(); return u ? u.id : null; },
    isAnonymous: async () => anon(await me()),
    isOwner: async () => { try { const r = await client.rpc('is_admin'); return !!(r && !r.error && r.data === true); } catch (e) { return false; } },
    can: async (what) => {
      if (what === 'post') return !!features.board_write && await isMember();
      if (what === 'name') return !!features.names_anon || await isMember();
      return true;
    },
    // 세션이 바뀔 때마다 f({ id, anonymous }). 돌려주는 함수를 부르면 구독 해제
    onChange(f) {
      const r = client.auth.onAuthStateChange && client.auth.onAuthStateChange((ev, session) => {
        member = null; const u = session && session.user;
        try { f({ id: u ? u.id : null, anonymous: anon(u) }); } catch (e) {}
      });
      const sub = r && r.data && r.data.subscription;
      return () => { try { sub && sub.unsubscribe(); } catch (e) {} };
    },
  };
}

export function createSupabaseCaps(client, cfg, features = { ...FEATURES_DEFAULT }, dbOpts = {}, roomOpts = {}) {
  // room·lock: 실시간 사람 수·홍보(supabase_room.js, D-79). roomOpts 는 시험용
  return { user: createUser(client, features), db: createDb(client, dbOpts), room: createRoom(client, roomOpts), lock: createLock(client), features };
}

// 익명 세션 확보. 이미 세션이 있으면 그대로 쓰고, 없으면 익명 로그인. 실패하면 던진다.
export async function ensureSession(client) {
  const got = await client.auth.getSession();
  let session = got && got.data && got.data.session;
  if (!session) {
    const r = await client.auth.signInAnonymously();
    if (r && r.error) throw r.error;
    session = r && r.data && r.data.session;
  }
  const id = session && session.user && session.user.id;
  if (!id) throw new Error('no session');
  return id;
}
