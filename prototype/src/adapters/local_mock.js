// 로컬 모의 어댑터 (D-21): window.claude 가 없는 로컬 시험 환경에서 사용자·room·lock 을 흉내 낸다

// 로컬 모의 어댑터 (D-21): window.claude가 없는 로컬 시험 환경에서만. 사용자 흉내(어드민 판별) + room(사람 수·순간 메시지) + lock(먼저 잡은 한 명).
// 탭끼리는 BroadcastChannel로 이야기한다. 잠금은 localStorage의 한 칸(탭 사이 거의 동시에 눌러도 한 명만 남게 쓴 뒤 다시 읽어 확인).
// 게시판·이웃 데이터(db)는 지금처럼 브라우저 localStorage로 대신한다.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', ''];
export const LocalMock = {
  usable: () => LOCAL_HOSTS.includes(location.hostname),
  user: () => ({ id: async () => null, isOwner: async () => true, can: async () => true }),
  // room: join(이름) 한 곳에 들어가 있고, count(이름)으로 그 곳 사람 수(나 포함), send/on으로 모든 탭에 순간 메시지
  room() {
    const id = 'p' + Math.random().toString(36).slice(2, 9), peers = new Map(), handlers = [], countFns = [];
    let ch = null, name = null, timer = null;
    try { ch = new BroadcastChannel('golmok-room'); } catch (e) {}
    const sweep = () => { const t = Date.now(); for (const [k, v] of peers) if (t - v.at > 7000) peers.delete(k); };
    const beat = () => { if (ch) try { ch.postMessage({ t: 'hb', id, r: name }); } catch (e) {} };
    const changed = () => { sweep(); const n = R.count(); for (const f of countFns) f(n); };
    const R = {
      id, live: !!ch,
      join(n) { name = n; beat(); changed(); },
      count(n = name) { sweep(); let c = n === name ? 1 : 0; for (const v of peers.values()) if (v.r === n) c++; return c; },
      onCount(f) { countFns.push(f); },
      send(kind, data) { if (ch) try { ch.postMessage({ t: 'msg', id, kind, data }); } catch (e) {} },
      on(f) { handlers.push(f); },
    };
    if (ch) {
      ch.onmessage = (ev) => {
        const m = ev.data || {};
        if (m.id === id) return;
        if (m.t === 'hb') { const known = peers.has(m.id); peers.set(m.id, { r: m.r, at: Date.now() }); if (!known) beat(); changed(); }
        else if (m.t === 'bye') { peers.delete(m.id); changed(); }
        else if (m.t === 'msg') for (const f of handlers) f(m.kind, m.data, m.id);
      };
      timer = setInterval(() => { beat(); changed(); }, 2500);
      addEventListener('pagehide', () => { try { ch.postMessage({ t: 'bye', id }); } catch (e) {} clearInterval(timer); });
    }
    return R;
  },
  // lock: acquire(키, {holder, ttlMs}) -> 성공하면 true. 이미 다른 사람이 잡고 있으면(만료 전) false
  lock() {
    const k = (key) => 'golmok:lock:' + key;
    const read = (key) => { try { return JSON.parse(localStorage.getItem(k(key)) || 'null'); } catch (e) { return null; } };
    return {
      // 읽기-확인-쓰기를 한 덩어리로 묶는다: Web Locks(같은 출처의 모든 탭이 차례로 지나감)를 쓰고, 없는 환경이면 쓴 뒤 다시 읽는 옛 방식으로 되돌아간다
      acquire(key, { holder, ttlMs }) {
        const attempt = () => {
          const now = Date.now(), cur = read(key);
          if (cur && cur.until > now) return false;
          try { localStorage.setItem(k(key), JSON.stringify({ holder, until: now + ttlMs })); } catch (e) { return true; }
          return true;
        };
        if (navigator.locks && typeof navigator.locks.request === 'function') return navigator.locks.request('golmok-lock:' + key, () => attempt()).catch(() => { const ok = attempt(); const a = read(key); return ok && !!a && a.holder === holder; });
        const ok = attempt(), after = read(key);
        return Promise.resolve(ok && !!after && after.holder === holder);
      },
      peek: (key) => { const c = read(key); return c && c.until > Date.now() ? c : null; },
      clear(key) { try { localStorage.removeItem(k(key)); } catch (e) {} },
    };
  },
};
