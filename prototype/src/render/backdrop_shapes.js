// 명소 배경 공통 모양(바닥 높이·지붕·정자·석탑·나무). backdrop_parts.js·backdrop_built.js 가 쓴다 (R-17)
import * as THREE from 'three';
import { lerp } from '../core/util.js';

export const BASE = { tilt: 0 }; // 테마별 들어 올림(buildBackdrop 이 정한다)
export const baseAt = (z) => 0.5 + (-9 - z) * 0.09 + BASE.tilt * (7.3 - z); // z=-9: 0.5, z=-16: 1.13, z=-26: 2.03, z=-38: 3.11
export const Y = (p, z) => baseAt(z) + (p.y || 0);

// 한옥·고궁 지붕 앞모습(처마 끝이 들린 오목한 사다리꼴)
export function roof(G, cx, y, w, H, z, color, o = {}) {
  const pts = [], tip = H * 0.16, rw = w * 0.27;
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([lerp(cx - w / 2, cx - rw, t), y + tip + (H - tip) * Math.pow(t, 1.7)]); }
  for (let i = 0; i <= 6; i++) { const t = 1 - i / 6; pts.push([lerp(cx + w / 2, cx + rw, t), y + tip + (H - tip) * Math.pow(t, 1.7)]); }
  pts.push([cx + w / 2 - w * 0.07, y], [cx - w / 2 + w * 0.07, y]);
  G.shape(pts, z, color, o);
}
export function pavilion(G, cx, y, w, H, z, o = {}) { // 기단 + 기둥 + 지붕 (정자·누각·문루)
  const roofC = o.roof || '#3d4248';
  G.box(w * 0.8, H * 0.12, w * 0.45, o.base || '#8d8a80', { x: cx, y: y + H * 0.06, z });
  for (const f of [-0.33, -0.11, 0.11, 0.33]) G.box(H * 0.05, H * 0.42, H * 0.05, o.col || '#7a3b2c', { x: cx + w * f, y: y + H * 0.33, z: z + w * 0.12 });
  roof(G, cx, y + H * 0.52, w, H * 0.48, z + w * 0.13, roofC);
}
export function stonePagoda(G, cx, y, H, z, floors, color = '#a29d92') {
  const s = H / (floors * 0.62 + 0.9);
  G.box(s * 1.5, s * 0.35, s * 1.5, color, { x: cx, y: y + s * 0.17, z });
  let yy = y + s * 0.35;
  for (let i = 0; i < floors; i++) {
    const k = 1 - i * 0.09, bh = (i === 0 ? s * 0.55 : s * 0.22) * k;
    G.box(s * 0.7 * k, bh, s * 0.7 * k, color, { x: cx, y: yy + bh / 2, z }); yy += bh;
    roof(G, cx, yy, s * 1.45 * k, s * 0.2, z + s * 0.4, color, { grad: 0.85 }); G.box(s * 1.3 * k, s * 0.08, s * 1.2 * k, color, { x: cx, y: yy + s * 0.04, z }); yy += s * 0.2;
  }
  G.cyl(s * 0.04, s * 0.06, s * 0.5, '#7d786e', { x: cx, y: yy + s * 0.25, z });
}
export function tree(G, x, y, z, H, style, r, color) {
  const trunk = '#4f4034';
  if (style === 'pine') {
    G.cyl(H * 0.03, H * 0.05, H * 0.75, trunk, { x, y: y + H * 0.37, z, rz: r.range(-0.15, 0.15) });
    for (let k = 0; k < 3; k++) G.sphere(H * r.range(0.22, 0.32), color || '#2f4a2c', { x: x + r.range(-0.2, 0.2) * H, y: y + H * (0.62 + k * 0.13), z, sy: 0.38, veg: 1 }, 8, 4);
  } else if (style === 'bamboo') {
    G.cyl(H * 0.012, H * 0.016, H, color || '#5f7d3a', { x, y: y + H / 2, z, rz: r.range(-0.05, 0.05), veg: 0.6 }, 5);
    G.sphere(H * 0.07, '#4c6e30', { x: x + r.range(-0.04, 0.04) * H, y: y + H * 0.86, z, sy: 3.2, veg: 0.7 }, 6, 4);
  } else if (style === 'reed') {
    for (let k = 0; k < 3; k++) { const a = (k - 1) * 0.28 + r.range(-0.1, 0.1); G.add(new THREE.ConeGeometry(H * 0.035, H, 3), color || '#a88f58', { x: x + Math.sin(a) * H * 0.45, y: y + H * 0.48, z, rz: -a, veg: 0.3 }); } // 가는 줄기 세 가닥
    G.sphere(H * 0.09, '#d8c8a0', { x: x + r.range(-0.1, 0.1) * H, y: y + H * 0.98, z, sy: 2.2, sx: 0.8, rz: r.range(-0.4, 0.4) }, 6, 4); // 이삭
  } else if (style === 'metasequoia') {
    G.cyl(H * 0.02, H * 0.03, H * 0.3, trunk, { x, y: y + H * 0.15, z });
    G.add(new THREE.ConeGeometry(H * 0.14, H * 0.9, 6), color || '#4a5a32', { x, y: y + H * 0.55, z, veg: 1 });
  } else if (style === 'bigtree') {
    G.cyl(H * 0.06, H * 0.1, H * 0.5, trunk, { x, y: y + H * 0.25, z });
    for (let k = 0; k < 9; k++) G.sphere(H * r.range(0.22, 0.32), color || '#3d5a30', { x: x + r.range(-0.6, 0.6) * H, y: y + H * r.range(0.5, 0.82), z: z + r.range(-0.2, 0.2) * H, sy: 0.7, veg: 1 }, 8, 5);
  } else {
    G.cyl(H * 0.04, H * 0.05, H * 0.5, trunk, { x, y: y + H * 0.25, z });
    G.sphere(H * 0.3, color || '#3f5f34', { x, y: y + H * 0.7, z, sy: 0.9, veg: 1 }, 8, 5);
  }
}


