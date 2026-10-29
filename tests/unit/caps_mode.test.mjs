// Caps 모드 선택(설계 5-1·5-2) 단위 시험: 가짜 client·가짜 window 로 서버 없이. 사용: node --test tests/unit/
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { hostname: 'example.test' };
const { Caps, initCaps, SUPABASE_FAIL_NOTICE } = await import('../../prototype/src/adapters/caps.js');
const { LocalMock } = await import('../../prototype/src/adapters/local_mock.js');
LocalMock.room = () => ({ fake: 'room' }); LocalMock.lock = () => ({ fake: 'lock' }); // 진짜 모의 room 은 타이머·채널이 남아 시험이 끝나지 않는다
const { pickSupabaseConfig, ensureSession } = await import('../../prototype/src/adapters/supabase.js');
const { SUPABASE_CONFIG } = await import('../../prototype/src/config.js');

const CFG = { prod: { hosts: ['site.example'], url: 'https://x.invalid', key: 'k' }, staging: { hosts: ['stg.example'], url: 'https://y.invalid', key: 'k2' } };
const fakeClient = (over = {}) => ({ auth: { getSession: async () => ({ data: { session: null } }), signInAnonymously: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }), ...over } });
const reset = () => Object.assign(Caps, { user: null, db: null, sample: null, downloads: null, uid: null, ready: false, shared: false, sampleOff: false, writeOff: false, mock: false, room: null, lock: null, mode: 'static', notice: '' });
beforeEach(reset);

test('config.js 기본값은 키가 비어 있어 어떤 주소와도 연결하지 않는다', () => {
  for (const c of Object.values(SUPABASE_CONFIG)) assert.equal(c.url, '') , assert.equal(c.key, '');
  assert.equal(pickSupabaseConfig(SUPABASE_CONFIG, 'localhost'), null);
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
