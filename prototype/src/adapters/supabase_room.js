// Supabase 실시간 room·lock (D-79, 설계 2차_연결_실시간.md 8-5). LocalMock 의 room·lock 과 같은 모양.
// room: 채널 하나 gn:site(비공개). Presence 로 사람 수(지역 코드만 싣는다 - uid·닉네임 없음), 홍보 수신은 같은 채널의 broadcast 'promo'.
// lock: 클라이언트는 broadcast 를 보낼 수 없다. rpc promo_claim 이 서버에서 판정하고 이긴 경우에만 서버가 내보낸다.
// client 는 인자로 받아 시험에서 가짜를 넣는다. 보이는 동안만 접속한다(60초 넘게 숨겨지면 해제, 다시 보이면 재가입).
const TOPIC = 'gn:site';

// opts(시험용): { doc, hideMs, id, setTimer, clearTimer }
export function createRoom(client, opts = {}) {
  const doc = 'doc' in opts ? opts.doc : (typeof document !== 'undefined' ? document : null);
  const hideMs = opts.hideMs == null ? 60000 : opts.hideMs;
  const setT = opts.setTimer || ((f, ms) => setTimeout(f, ms)), clearT = opts.clearTimer || ((t) => clearTimeout(t));
  const id = opts.id || 'p' + Math.random().toString(36).slice(2, 9);
  const handlers = [], countFns = [];
  let ch = null, region = null, live = false, hideTimer = null, wanted = false;

  const notify = () => { for (const f of countFns) { try { f(R.count()); } catch (e) {} } };
  const track = () => { if (ch && live && region) try { ch.track({ r: region }); } catch (e) {} };
  const connect = () => {
    if (ch) return;
    const c = client.channel(TOPIC, { config: { private: true, presence: { key: id } } });
    ch = c;
    c.on('presence', { event: 'sync' }, () => { if (ch === c) notify(); });
    c.on('broadcast', { event: 'promo' }, (m) => { if (ch === c) for (const f of handlers) { try { f('promo', m && m.payload, null); } catch (e) {} } });
    c.subscribe((status) => {
      if (ch !== c) return;
      const was = live; live = status === 'SUBSCRIBED';
      if (live) track();
      if (was !== live || live) notify();
    });
  };
  const disconnect = () => {
    const c = ch; ch = null; const was = live; live = false;
    if (c) { try { c.untrack(); } catch (e) {} try { client.removeChannel(c); } catch (e) {} }
    if (was) notify();
  };
  const R = {
    id,
    get live() { return live; },
    join(name) { region = name; wanted = true; if (!ch) connect(); else track(); notify(); },
    // n 의 사람 수(나 포함). '*' = 사이트 전체. 연결 전에는 내 지역이면 나 한 명
    count(n = region) {
      if (!ch || !live) return n === region ? 1 : 0;
      let st = {}; try { st = ch.presenceState() || {}; } catch (e) {}
      const keys = Object.keys(st);
      if (n === '*') return Math.max(keys.length, 1);
      let c = 0, me = false;
      for (const k of keys) { const metas = st[k] || []; const m = metas[metas.length - 1]; if (k === id) me = true; if (m && m.r === n) c++; }
      return c + (n === region && !me ? 1 : 0);
    },
    onCount(f) { countFns.push(f); },
    send() {}, // Supabase 모드에서는 서버만 보낸다
    on(f) { handlers.push(f); },
  };
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') { if (wanted && !hideTimer) hideTimer = setT(() => { hideTimer = null; disconnect(); }, hideMs); }
      else { if (hideTimer) { clearT(hideTimer); hideTimer = null; } if (wanted && !ch) connect(); }
    });
  }
  return R;
}

// 오류 객체: new Error(code) 에 .code. 코드: rate_limit·blocked·bad_text·auth·network
const fail = (code) => { const e = new Error(code); e.code = code; return e; };
export function createLock(client) {
  return {
    async acquire(key, { data } = {}) {
      let r; try { r = await client.rpc('promo_claim', { p_code: data && data.code, p_name: data && data.name }); } catch (e) { throw fail('network'); }
      if (!r || r.error || !r.data || typeof r.data !== 'object') throw fail('network');
      if (r.data.ok === true) { if (r.data.sent === false) throw fail('not_sent'); return true; } // 잠금은 잡혔지만 서버가 못 내보냄(D-93)
      if (r.data.code === 'busy') return false;
      throw fail(typeof r.data.code === 'string' ? r.data.code : 'network');
    },
    peek: () => null,
    async clear() { try { await client.rpc('promo_clear'); } catch (e) {} },
  };
}
