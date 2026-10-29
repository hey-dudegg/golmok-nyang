// Supabase 연결 어댑터의 입구 (D-10, D-77·78, 설계 2차_연결_설계.md 5장). 이 파일은 M2-5a 범위: 설정 고르기·client 만들기·익명 세션.
// user·db 번역(createSupabaseCaps 의 본체)은 M2-5b·6a 에서 채운다. client 는 인자로 받아 시험에서 가짜를 넣는다.
// 방문자에게 보이는 공개 키만 다룬다. 관리자 키는 쓰지 않는다(D-11).

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

export function createSupabaseCaps(client, cfg) {
  // M2-5b·6a 에서 user·db 를 채운다. room·lock 은 M2-9 전까지 null(화면은 null 을 견딘다, D-79).
  return { user: null, db: null, room: null, lock: null };
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
