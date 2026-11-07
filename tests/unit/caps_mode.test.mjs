// Caps 모드 선택(설계 5-1·5-2) 단위 시험: 가짜 client·가짜 window 로 서버 없이. 사용: node --test tests/unit/
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { hostname: 'example.test' };
const { Caps, initCaps, SUPABASE_FAIL_NOTICE } = await import('../../prototype/src/adapters/caps.js');
const { LocalMock } = await import('../../prototype/src/adapters/local_mock.js');
LocalMock.room = () => ({ fake: 'room' }); LocalMock.lock = () => ({ fake: 'lock' }); // 진짜 모의 room 은 타이머·채널이 남아 시험이 끝나지 않는다
const { pickSupabaseConfig, ensureSession, loadFeatures, createUser } = await import('../../prototype/src/adapters/supabase.js');
const { SUPABASE_CONFIG, FEATURES_DEFAULT } = await import('../../prototype/src/config.js');

const CFG = { prod: { hosts: ['site.example'], url: 'https://x.invalid', key: 'k' }, test: { hosts: ['stg.example'], url: 'https://y.invalid', key: 'k2' } };
const fakeClient = (over = {}) => ({ auth: { getSession: async () => ({ data: { session: null } }), signInAnonymously: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }), ...over } });
const reset = () => Object.assign(Caps, { user: null, db: null, sample: null, downloads: null, uid: null, ready: false, shared: false, sampleOff: false, writeOff: false, mock: false, room: null, lock: null, mode: 'static', notice: '' });
beforeEach(reset);

test('config.js: 운영·테스트 호스트(D-81)와 공개 값만, 기능 스위치 기본값(D-82~84)', () => {
  assert.deepEqual(Object.keys(SUPABASE_CONFIG), ['prod', 'test']);
  assert.deepEqual(SUPABASE_CONFIG.prod.hosts, ['golmok-nyang.pages.dev']);
  assert.deepEqual(SUPABASE_CONFIG.test.hosts, ['test.golmok-nyang.pages.dev']);
  for (const c of Object.values(SUPABASE_CONFIG)) { assert.match(c.url, /^https:\/\/[a-z0-9]+\.supabase\.co$/); assert.match(c.key, /^sb_publishable_/); }
  assert.equal(pickSupabaseConfig(SUPABASE_CONFIG, 'localhost'), null); // 로컬 주소는 연결하지 않는다
  assert.deepEqual(FEATURES_DEFAULT, { login: false, board_write: false, names_anon: true });
});
test('주소로 운영/스테이징을 고르고 url·key 하나라도 비면 null', () => {
  assert.equal(pickSupabaseConfig(CFG, 'site.example').name, 'prod');
  assert.equal(pickSupabaseConfig(CFG, 'stg.example').url, 'https://y.invalid');
  assert.equal(pickSupabaseConfig(CFG, 'other.example'), null);
  assert.equal(pickSupabaseConfig({ a: { hosts: ['h'], url: 'u', key: '' } }, 'h'), null);
  assert.equal(pickSupabaseConfig({ a: { hosts: ['h'], url: '', key: 'k' } }, 'h'), null);
  assert.equal(pickSupabaseConfig(null, 'h'), null);
});
test('1순위: window.claude 가 있으면 아티팩트 (Supabase 설정이 맞아도)', async () => {
  const use = async (n) => (n === 'user' ? { id: async () => 'a1', can: async () => true } : null);
  let loaded = false;
  await initCaps({ win: { claude: { use } }, hostname: 'site.example', cfg: CFG, loadClient: async () => { loaded = true; } });
  assert.equal(Caps.mode, 'artifact'); assert.equal(Caps.uid, 'a1'); assert.equal(loaded, false);
});
test('2순위: 주소·키가 맞으면 supabase (익명 로그인 id)', async () => {
  await initCaps({ win: {}, hostname: 'site.example', cfg: CFG, loadClient: async () => fakeClient() });
  assert.equal(Caps.mode, 'supabase'); assert.equal(Caps.uid, 'u1'); assert.equal(Caps.ready, true); assert.equal(Caps.room, null); assert.equal(Caps.lock, null); assert.equal(Caps.notice, '');
});
test('기존 세션이 있으면 익명 로그인을 다시 하지 않는다', async () => {
  let called = 0;
  const c = fakeClient({ getSession: async () => ({ data: { session: { user: { id: 'old' } } } }), signInAnonymously: async () => { called++; } });
  assert.equal(await ensureSession(c), 'old'); assert.equal(called, 0);
});
test('3순위: 키가 비었으면 로컬 주소는 mock, 그 밖은 static (loadClient 호출 없음)', async () => {
  let loaded = false; const loadClient = async () => { loaded = true; };
  globalThis.location = { hostname: 'localhost' };
  await initCaps({ win: {}, hostname: 'localhost', cfg: SUPABASE_CONFIG, loadClient });
  assert.equal(Caps.mode, 'mock'); assert.equal(Caps.mock, true); assert.ok(Caps.room && Caps.lock);
  reset(); globalThis.location = { hostname: 'site.example' };
  await initCaps({ win: {}, hostname: 'site.example', cfg: SUPABASE_CONFIG, loadClient });
  assert.equal(Caps.mode, 'static'); assert.equal(Caps.mock, false); assert.equal(Caps.room, null); assert.equal(loaded, false);
  globalThis.location = { hostname: 'example.test' };
});
test('연결 실패(받기 실패·로그인 오류·세션 없음)는 체험 모드로 떨어지고 안내가 남는다', async () => {
  globalThis.location = { hostname: 'site.example' };
  const bad = [
    async () => { throw new Error('import'); },
    async () => fakeClient({ signInAnonymously: async () => ({ data: null, error: new Error('anon off') }) }),
    async () => fakeClient({ signInAnonymously: async () => ({ data: { session: null }, error: null }) }),
  ];
  for (const loadClient of bad) {
    reset();
    await initCaps({ win: {}, hostname: 'site.example', cfg: CFG, loadClient });
    assert.equal(Caps.mode, 'static'); assert.equal(Caps.db, null); assert.equal(Caps.uid, null); assert.equal(Caps.shared, false);
    assert.equal(Caps.notice, SUPABASE_FAIL_NOTICE); assert.equal(Caps.ready, true);
  }
  globalThis.location = { hostname: 'example.test' };
});

const fq = (res) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => res }) }) }) });
test('features: 읽으면 덮어쓰고, 오류·예외·이상한 모양이면 기본값', async () => {
  assert.deepEqual(await loadFeatures(fq({ data: { value: { login: true, board_write: true, names_anon: false } }, error: null })), { login: true, board_write: true, names_anon: false });
  assert.deepEqual(await loadFeatures(fq({ data: { value: { board_write: true, names_anon: 'x' } }, error: null })), { login: false, board_write: true, names_anon: true });
  assert.deepEqual(await loadFeatures(fq({ data: null, error: new Error('x') })), FEATURES_DEFAULT);
  assert.deepEqual(await loadFeatures({ from: () => { throw new Error('net'); } }), FEATURES_DEFAULT);
});
test('Caps.features: supabase 모드에서 읽은 값, 실패 시 기본값', async () => {
  const c = { ...fakeClient({ getSession: async () => ({ data: { session: { user: { id: 'u1', is_anonymous: true } } } }) }), ...fq({ data: { value: { names_anon: false } }, error: null }) };
  await initCaps({ win: {}, hostname: 'site.example', cfg: CFG, loadClient: async () => c });
  assert.equal(Caps.features.names_anon, false); assert.equal(Caps.user.constructor, Object); assert.equal(await Caps.user.id(), 'u1');
});
const userClient = (u, over = {}) => ({ auth: { getSession: async () => ({ data: { session: u ? { user: u } : null } }) }, rpc: async (n) => ({ data: n === 'is_admin' ? false : false, error: null }), ...over });
test('user.can: 익명은 글 불가·이름 허용(기본), names_anon=false 면 이름도 불가, 익명 판정', async () => {
  const u = createUser(userClient({ id: 'a', is_anonymous: true }), { ...FEATURES_DEFAULT });
  assert.equal(await u.id(), 'a'); assert.equal(await u.isAnonymous(), true);
  assert.equal(await u.can('post'), false); assert.equal(await u.can('name'), true);
  assert.equal(await u.isOwner(), false);
  const off = createUser(userClient({ id: 'a', is_anonymous: true }), { login: true, board_write: true, names_anon: false });
  assert.equal(await off.can('post'), false); assert.equal(await off.can('name'), false);
  const none = createUser(userClient(null), { ...FEATURES_DEFAULT });
  assert.equal(await none.id(), null); assert.equal(await none.isAnonymous(), true);
});
test('user.can: 회원(로그인 재개 값)은 글 가능, 스위치가 꺼져 있으면 불가. isOwner 는 rpc 결과', async () => {
  const mem = userClient({ id: 'm', is_anonymous: false }, { rpc: async (n) => ({ data: true, error: null }) });
  assert.equal(await createUser(mem, { login: true, board_write: true, names_anon: false }).can('post'), true);
  assert.equal(await createUser(mem, { ...FEATURES_DEFAULT }).can('post'), false);
  assert.equal(await createUser(mem, { ...FEATURES_DEFAULT }).isOwner(), true);
  assert.equal(await createUser(userClient({ id: 'm', is_anonymous: false }, { rpc: async () => ({ data: null, error: new Error('x') }) }), { ...FEATURES_DEFAULT }).isOwner(), false);
});
test('user.onChange: 세션 변경을 알리고 해제할 수 있다', async () => {
  let cb, unsub = 0;
  const c = userClient(null, { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: (f) => { cb = f; return { data: { subscription: { unsubscribe: () => { unsub++; } } } }; } } });
  const got = []; const off = createUser(c, FEATURES_DEFAULT).onChange((x) => got.push(x));
  cb('SIGNED_IN', { user: { id: 'z', is_anonymous: true } }); off();
  assert.deepEqual(got, [{ id: 'z', anonymous: true }]); assert.equal(unsub, 1);
});
test('LocalMock.user: 익명·이름 허용·글쓰기 잠김', async () => {
  const u = LocalMock.user();
  assert.equal(await u.isAnonymous(), true); assert.equal(await u.can('post'), false); assert.equal(await u.can('name'), true); assert.equal(typeof u.onChange(() => {}), 'function');
});
