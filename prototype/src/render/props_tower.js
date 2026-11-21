// render/props_tower.js: 캣타워 그리기 (M8-2, 캣타워 설계 1.2·6장). 코드 도형만(D-01·13), 재질 3개(나무·삼줄·안쪽 어두운 색), 투명 없음
// 앞(+z)이 카메라 쪽. 칸(den) 위 판이 중단(mid, 윗면 y 0.36), 기둥 위 판이 상단(top, 윗면 y 0.72). 그룹은 env(E)에 들어가 clearEnv 가 dispose 한다.
import * as THREE from 'three';
import { TOWER } from '../core/props.js';
import { makeRng } from '../core/util.js';

function canvasMat(std, w, h, draw, rep) { // 작은 캔버스 질감 재질 (clearEnv 가 map 까지 dispose)
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]);
  return std({ map: t, roughness: 0.95 });
}
export function buildTower(p, std, ctx = {}) {
  const g = new THREE.Group(), d = p.dir || 1, r = makeRng('tower:' + p.id + ':' + Math.round(p.x * 100) + ':' + Math.round(p.z * 100));
  const wood = canvasMat(std, 128, 64, (c, w, h) => { c.fillStyle = '#b98d5b'; c.fillRect(0, 0, w, h); for (let i = 0; i < 26; i++) { c.strokeStyle = r() < 0.5 ? 'rgba(110,72,38,0.35)' : 'rgba(225,185,130,0.3)'; c.lineWidth = 1 + r() * 1.5; const y = r() * h; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + r() * 4 - 2, w * 0.7, y + r() * 4 - 2, w, y + r() * 3 - 1.5); c.stroke(); } });
  const rope = canvasMat(std, 64, 128, (c, w, h) => { c.fillStyle = '#cdb384'; c.fillRect(0, 0, w, h); c.fillStyle = '#9c8359'; for (let y = 0; y < h; y += 8) c.fillRect(0, y, w, 4); }, [1, 3]);
  const dark = std({ color: 0x2a1c12, roughness: 1 });
  const add = (geo, mat, x, y, z, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x * d, y, z); m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m; };
  const B = (a, b, c) => new THREE.BoxGeometry(a, b, c);
  const t = 0.03, dl = -0.20, dw = 0.55, dh = TOWER.midY - t, hd = TOWER.w / 2, ex = 0.09; // 칸: 가운데 x, 폭, 높이(지붕판 아래), 반깊이, 입구 반폭
  const x0 = dl - dw / 2 + t / 2, x1 = dl + dw / 2 - t / 2;
  add(B(dw, dh, t), wood, dl, dh / 2, -hd + t / 2); // 뒷벽
  add(B(t, dh, 2 * hd - 2 * t), wood, x0, dh / 2, 0); add(B(t, dh, 2 * hd - 2 * t), wood, x1, dh / 2, 0); // 좌·우 벽
  const jw = dw / 2 - ex, fy = 0.15; // 앞면: 입구 폭 0.20 x 높이 0.14 를 둔 기둥 둘 + 윗틀
  add(B(jw, fy, t), wood, dl - ex - jw / 2, fy / 2, hd - t / 2); add(B(jw, fy, t), wood, dl + ex + jw / 2, fy / 2, hd - t / 2);
  add(B(dw, dh - fy, t), wood, dl, fy + (dh - fy) / 2, hd - t / 2);
  const inner = add(new THREE.PlaneGeometry(dw - 2 * t, dh - 0.01), dark, dl, dh / 2, -hd + t + 0.002, false); inner.castShadow = false; // 안쪽 어두운 면(뒷벽 안)
  add(B(0.60, t, TOWER.w), wood, dl + 0.01, TOWER.midY - t / 2, 0); // 중단 판 (윗면 0.36)
  const cx = 0.25, cz = -0.05, seg = ctx.narrow ? 10 : 16, bot = 0.03, top = TOWER.topY - t;
  add(B(0.30, t, 0.30), wood, cx, t / 2, cz); // 받침
  add(new THREE.CylinderGeometry(0.05, 0.05, top - bot, seg), rope, cx, (top + bot) / 2, cz); // 기둥(삼줄)
  add(B(0.42, t, 0.38), wood, cx, TOWER.topY - t / 2, 0); // 상단 판 (윗면 0.72)
  g.position.set(p.x, 0, p.z); g.rotation.y = p.rot || 0;
  return g;
}
