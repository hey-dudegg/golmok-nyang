// Cloudflare Turnstile 캡차 토큰 받기 (D-106). Supabase 대시보드에서 Captcha 를 켜면 익명 로그인에 토큰이 필요하다.
// 외부 스크립트(challenges.cloudflare.com)라 vendor 자체 호스팅(D-13·47)이 불가능하다. 사이트 키는 공개값이다(비밀 키는 Supabase 대시보드에만).
// 토큰은 로그·저장소에 남기지 않는다. 실패·시간 초과는 던진다(호출한 쪽이 연결 실패 경로로 처리).
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(win, doc) {
  if (win.turnstile) return Promise.resolve(win.turnstile);
  return new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = SRC; s.async = true;
    s.onload = () => (win.turnstile ? resolve(win.turnstile) : reject(new Error('turnstile 없음')));
    s.onerror = () => reject(new Error('turnstile 스크립트 실패'));
    doc.head.appendChild(s);
  });
}

// opts 는 시험용: { win, doc, timeoutMs }. 키가 비면 undefined(= 캡차 없이 로그인).
export async function getCaptchaToken(siteKey, opts = {}) {
  if (!siteKey) return undefined;
  const win = opts.win || (typeof window !== 'undefined' ? window : null);
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
  if (!win || !doc) throw new Error('turnstile 환경 없음');
  const ts = await loadScript(win, doc);
  const box = doc.createElement('div');
  box.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:9999';
  doc.body.appendChild(box);
  let id = null;
  const done = () => { try { if (id !== null) ts.remove(id); } catch (e) {} try { box.remove(); } catch (e) {} };
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('turnstile 시간 초과')), opts.timeoutMs || 15000);
      const fin = (f, v) => { clearTimeout(timer); f(v); };
      id = ts.render(box, {
        sitekey: siteKey, appearance: 'interaction-only', // 사람 확인이 필요할 때만 보인다
        callback: (t) => (t ? fin(resolve, t) : fin(reject, new Error('turnstile 토큰 없음'))),
        'error-callback': () => fin(reject, new Error('turnstile 오류')),
        'timeout-callback': () => fin(reject, new Error('turnstile 만료')),
      });
    });
  } finally { done(); }
}
