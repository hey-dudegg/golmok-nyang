// 캡쳐 그림 규격 (설계 2차_연결_표.md 2-4 2번): 긴 변 960px 이하, WebP(못 만들면 JPEG) 품질 0.8, 120KB 넘으면 품질을 낮춰 재시도,
// 그래도 넘으면 null(그림 없이 올림). 게시판 잠금 중(D-83)에는 화면에서 부르지 않는다. env 는 시험용 주입(기본은 브라우저).
export const CAPTURE = { MAX_SIDE: 960, MAX_BYTES: 120 * 1024, Q0: 0.8, QMIN: 0.4, QSTEP: 0.1 };

export function fitSize(w, h, max = CAPTURE.MAX_SIDE) {
  const s = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

const browserEnv = () => ({
  load: (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }),
  canvas(w, h, img) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); return c; },
  encode: (cv, type, q) => new Promise((res) => cv.toBlob((b) => res(b), type, q)),
});

// 돌려주는 값: { blob, type, ext } 또는 null
export async function packCapture(dataUrl, env = browserEnv()) {
  const img = await env.load(dataUrl);
  const { w, h } = fitSize(img.width, img.height);
  const cv = env.canvas(w, h, img);
  let type = 'image/webp', blob = await env.encode(cv, type, CAPTURE.Q0);
  if (!blob || blob.type !== type) { type = 'image/jpeg'; blob = await env.encode(cv, type, CAPTURE.Q0); } // 브라우저가 WebP 를 못 만들면(PNG 로 돌려줌) JPEG
  let q = CAPTURE.Q0;
  while (blob && blob.size > CAPTURE.MAX_BYTES && q - CAPTURE.QSTEP >= CAPTURE.QMIN - 1e-9) { q -= CAPTURE.QSTEP; blob = await env.encode(cv, type, q); }
  if (!blob || blob.type !== type || blob.size > CAPTURE.MAX_BYTES) return null;
  return { blob, type, ext: type === 'image/webp' ? 'webp' : 'jpg' };
}
