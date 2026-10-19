// 명소 배경 자연 부품(능선·바위·수면·섬·식생·절벽) (R-17, 후보표 부록 B). 각 부품은 (G: BackdropGeo, p: 부품 자료, r: 결정적 난수)
// 좌표: 담(z=-2) 뒤 원경. 바닥은 뒤로 갈수록 높아진다(baseAt). z=-16 에서 높이 3 이면 기본 카메라 화면 위쪽 약 8도
import * as THREE from 'three';
import { lerp } from '../core/util.js';
import { Y, baseAt, pavilion, roof, stonePagoda, tree } from './backdrop_shapes.js';

export const NATURE_PARTS = {  // 1 능선: 평면 윤곽 한 겹 (여러 겹은 자료에서 z 를 달리해 여러 개)
  ridge(G, p, r) {
    const w = p.w ?? 70, H = p.h ?? 3, z = p.z ?? -26, x0 = p.x ?? 0, y0 = Y(p, z), shape = p.shape || 'round', n = 72;
    const pk = Math.max(1, p.peaks ?? 4), cs = [];
    for (let i = 0; i < pk; i++) cs.push([(i + 0.5) / pk + r.range(-0.3, 0.3) / pk, i === Math.floor(pk / 2) ? 1 : r.range(0.5, 0.9), (0.55 / pk) * r.range(0.8, 1.5)]);
    const f = (t) => {
      if (shape === 'shield') { const u = (t - 0.5) / 0.45, d = Math.max(0, 1 - u * u); return Math.min(0.92, Math.pow(d, 0.95)) - 0.05 * Math.exp(-(((t - 0.5) / 0.035) ** 2)) + 0.12 * Math.exp(-(((t - 0.2) / 0.025) ** 2)) + 0.08 * Math.exp(-(((t - 0.78) / 0.02) ** 2)); }
      if (shape === 'twin') return 0.22 + 0.06 * Math.sin(t * 9) + Math.max(0, 1 - Math.abs(t - 0.46) / 0.035) ** 0.6 * 0.78 + Math.max(0, 1 - Math.abs(t - 0.545) / 0.03) ** 0.6 * 0.68;
      if (shape === 'flat') return 0.35 + 0.08 * Math.sin(t * 13 + 1) + 0.05 * Math.sin(t * 31);
      let v = 0.12;
      for (const [c, a, s] of cs) v = Math.max(v, shape === 'sharp' ? a * Math.max(0, 1 - Math.abs(t - c) / (s * 1.2)) : a * Math.exp(-(((t - c) / s) ** 2)));
      return v;
    };
    const pts = [[x0 - w / 2, y0 - 1.2]];
    for (let i = 0; i <= n; i++) { const t = i / n; const rough = shape === 'sharp' ? (r() - 0.5) * 0.09 : (r() - 0.5) * 0.02; const edge = Math.min(1, t / 0.1, (1 - t) / 0.1); pts.push([x0 - w / 2 + w * t, y0 + H * Math.max(0.03, (f(t) + rough) * (0.25 + 0.75 * edge))]); } // 양 끝은 낮게 (좁은 산이 칼로 자른 듯 보이지 않게)
    pts.push([x0 + w / 2, y0 - 1.2]);
    const snow = p.snow ?? (H >= 3 ? 0.8 : 0);
    G.shape(pts, z, p.color || '#5b6b70', { grad: 0.72, veg: 0.55, snow: snow ? [y0 + H * 0.55, y0 + H * 0.9, snow] : null });
  },
  // 2 바위 봉우리·기둥
  rocks(G, p, r) {
    const z = p.z ?? -18, x0 = p.x ?? 0, y0 = Y(p, z), H = p.h ?? 2.5, w = p.w ?? 4, n = p.count ?? 5, st = p.style || 'spire', col = p.color || '#8b8a84';
    if (st === 'hand') { // 바다에서 솟은 큰 손 조형 (단순화: 손바닥 + 손가락 다섯)
      const s = H / 2.2;
      G.box(s * 0.75, s * 1.0, s * 0.22, col, { x: x0, y: y0 + s * 0.5, z, rz: 0.08 });
      [[-0.27, 0.62, 0.04], [-0.09, 0.72, 0.0], [0.09, 0.68, -0.03], [0.26, 0.55, -0.08]].forEach(([fx, fl, a]) => G.cyl(s * 0.08, s * 0.1, s * fl, col, { x: x0 + s * fx + s * 0.06, y: y0 + s * (1.0 + fl / 2) - s * 0.04, z, rz: a }, 7));
      G.cyl(s * 0.08, s * 0.1, s * 0.55, col, { x: x0 - s * 0.5, y: y0 + s * 0.75, z, rz: 0.75 }, 7);
      return;
    }
    if (st === 'pair') { // 바닷가 두 바위섬, 꼭대기에 소나무
      [[0, 1, 1], [w * 0.45, 0.62, 0.7]].forEach(([dx, k, ww]) => {
        const hh = H * k; G.cyl(ww * 0.55, ww * 0.75, hh, col, { x: x0 + dx, y: y0 + hh / 2 - 0.2, z, grad: 0.7 }, 9); G.sphere(ww * 0.58, col, { x: x0 + dx, y: y0 + hh - 0.2, z, sy: 0.5 }, 9, 5);
        for (let i = 0; i < 3; i++) tree(G, x0 + dx + r.range(-0.3, 0.3) * ww, y0 + hh - 0.05, z, hh * 0.32, 'pine', r);
      });
      return;
    }
    if (st === 'triple') { // 강 가운데 세 봉우리
      [[-w * 0.36, 0.62], [0, 1], [w * 0.3, 0.55]].forEach(([dx, k]) => { const hh = H * k; G.add(new THREE.ConeGeometry(hh * 0.45, hh, 7), col, { x: x0 + dx, y: y0 + hh / 2 - 0.1, z, grad: 0.7 }); });
      pavilion(G, x0, y0 + H * 0.55, H * 0.32, H * 0.3, z + 0.25);
      return;
    }
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1), hh = H * (st === 'columns' ? r.range(0.55, 1) : (1 - Math.abs(t - 0.5) * 0.9) * r.range(0.7, 1.05));
      const x = x0 - w / 2 + w * t + r.range(-0.1, 0.1) * w / n;
      if (st === 'columns') G.cyl(w / n * 0.55, w / n * 0.58, hh, col, { x, y: y0 + hh / 2, z: z + r.range(-0.2, 0.2), grad: 0.65 }, 6);
      else { G.sphere(w / n * 0.9, col, { x, y: y0 + hh * 0.5, z, sx: 1, sy: hh / (w / n * 0.9) * 0.55, sz: 0.7, grad: 0.7 }, 8, 6); }
    }
  },
  // 8 수면: 앞(담 너머)에서 지평선까지 기운 판 + 파도 줄 + 해안선
  water(G, p, r) {
    const st = p.style || 'sea', z0 = Math.max(p.z ?? -9.2, -30), z1 = Math.max(-38.5, z0 - (p.depth ?? 40)), w = p.w ?? 92, x0 = p.x ?? 0;
    const col = p.color || (st === 'lake' ? '#5a7f86' : st === 'river' ? '#62848a' : '#4f7690');
    const g = new THREE.PlaneGeometry(w, z0 - z1, 1, 8); g.rotateX(-Math.PI / 2); g.translate(x0, 0, (z0 + z1) / 2);
    const pa = g.attributes.position; for (let i = 0; i < pa.count; i++) pa.setY(i, baseAt(pa.getZ(i)) + 0.02);
    G.add(g, col, { flat: true });
    G.shape([[x0 - w / 2, baseAt(z0) + 0.02], [x0 + w / 2, baseAt(z0) + 0.02], [x0 + w / 2, baseAt(z0) - 1.2], [x0 - w / 2, baseAt(z0) - 1.2]], z0, p.color2 || '#6c7a66');
    const nw = p.waves ?? (st === 'sea' ? 6 : 2);
    for (let i = 0; i < nw; i++) {
      const zz = lerp(z0 - 1, z1 + 4, (i + r()) / Math.max(1, nw)), ww = r.range(3, 10);
      G.box(ww, 0.01, 0.06, '#c9d8e0', { x: x0 + r.range(-w * 0.35, w * 0.35), y: baseAt(zz) + 0.04, z: zz });
    }
  },
  // 10 섬·바위섬
  islands(G, p, r) {
    const z = p.z ?? -20, x0 = p.x ?? 0, y0 = Y(p, z), w = p.w ?? 30, n = p.count ?? 4, H = p.h ?? 2, sh = p.shape || 'dome', spread = p.spread ?? w;
    if (sh === 'crater') { // 바다로 튀어나온 분화구 절벽 + 위 풀밭 + 낮은 목
      const R = w / 2;
      G.cyl(R * 0.8, R, H, '#7a6a5a', { x: x0, y: y0 + H / 2 - 0.15, z, grad: 0.6 }, 22);
      for (let i = 0; i < 14; i++) { const a = -0.3 - i / 13 * 2.5; G.box(R * 0.14, H * r.range(0.7, 0.98), 0.1, '#5e5144', { x: x0 + Math.cos(a) * R * 0.9, y: y0 + H * 0.42, z: z - Math.sin(a) * R * 0.9, ry: -a + Math.PI / 2 }); }
      G.cyl(R * 0.82, R * 0.8, H * 0.06, '#6f8a4a', { x: x0, y: y0 + H - 0.12, z, veg: 1 }, 22);
      G.sphere(R * 1.4, '#6f8a4a', { x: x0 + R * 1.7, y: y0 - 0.1, z: z + R * 0.5, sy: 0.12, sz: 0.5, veg: 1 }, 12, 4);
      return;
    }
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1), x = x0 - spread / 2 + spread * t + r.range(-0.08, 0.08) * spread / n, zz = n === 1 ? z : z - r.range(0, 6), hh = H * r.range(0.45, 1) * (i === Math.floor(n / 2) ? 1.2 : 1), ww = (w / n) * r.range(0.6, 1.1);
      const yb = baseAt(zz) + (p.y || 0);
      if (sh === 'rock') G.add(new THREE.ConeGeometry(ww * 0.4, hh, 6), '#77746c', { x, y: yb + hh / 2 - 0.1, z: zz });
      else G.sphere(ww * 0.5, sh === 'forest' ? '#3f5e36' : '#55704a', { x, y: yb - 0.08, z: zz, sy: hh / (ww * 0.5), sz: 0.6, veg: 1, grad: 0.7 }, 12, 6);
      if (sh === 'forest') for (let k = 0; k < 5; k++) tree(G, x + r.range(-0.3, 0.3) * ww, yb + hh * 0.6, zz + 0.3, hh * 0.5, 'round', r, '#35532f');
    }
  },
  // 13 식생 군: 소나무·대숲·갈대·메타세쿼이아·둥근 나무·큰 고목
  trees(G, p, r) {
    const z = p.z ?? -14, x0 = p.x ?? 0, w = p.w ?? 20, n = p.count ?? 20, H = p.h ?? 2, st = p.style || 'round';
    if (st === 'reed') G.box(w, 0.1, 3, '#a8915a', { x: x0, y: Y(p, z) + 0.03, z: z - 1, veg: 0.3 });
    for (let i = 0; i < n; i++) {
      const x = st === 'bigtree' && n === 1 ? x0 : x0 - w / 2 + w * (i + r()) / n, zz = z - r.range(0, st === 'reed' ? 2.5 : 1.5), hh = H * r.range(0.75, 1.1);
      tree(G, x, baseAt(zz) + (p.y || 0) - 0.05, zz, hh, st, r, p.color);
    }
  },
  // 15 폭포·절벽: 층진 사암·폭포 흰 줄·주상절리 면
  cliff(G, p, r) {
    const z = p.z ?? -16, x0 = p.x ?? 0, y0 = Y(p, z), w = p.w ?? 8, H = p.h ?? 2.5, st = p.style || 'layered';
    if (st === 'columns') { const n = Math.round(w / 0.3); for (let i = 0; i < n; i++) { const hh = H * r.range(0.75, 1); G.cyl(0.17, 0.17, hh, i % 2 ? '#4e4c4a' : '#5c5a56', { x: x0 - w / 2 + w * i / n, y: y0 + hh / 2, z: z + r.range(-0.1, 0.1) }, 6); } return; }
    if (st === 'layered') { // 층진 사암 곶: 납작한 타원 층을 겹쳐 둥근 바위 덩어리 (한쪽 끝이 높은 머리 모양)
      const L = 10;
      for (let i = 0; i < L; i++) {
        const t = i / L, k = Math.sqrt(1 - t * t * 0.92), c = i % 3 === 0 ? '#9a6450' : i % 3 === 1 ? '#b98a6c' : '#a8765c';
        G.sphere(1, c, { x: x0 + w * 0.22 * t + r.range(-0.08, 0.08), y: y0 + H * t - 0.15, z, sx: w * 0.5 * k, sy: H / L * 0.9, sz: 1.3 * k }, 14, 5);
      }
      G.sphere(1, '#8d5a48', { x: x0 + w * 0.36, y: y0 + H * 0.75, z: z + 0.2, sx: w * 0.13, sy: H * 0.32, sz: 0.6 }, 10, 6); // 머리 쪽 솟은 바위
    } else for (let i = 0; i < 4; i++) {
      const lh = H / 4, c = r.pick(['#5d5a52', '#686458', '#55524a']), k = 1 - i * 0.04;
      G.box(w * k * r.range(0.9, 1.0), lh * 1.02, 1.2 - i * 0.05, c, { x: x0 + r.range(-0.15, 0.15), y: y0 + lh * (i + 0.5), z: z - i * 0.06 });
    }
    if (st === 'falls') { G.box(w * 0.08, H * 0.98, 0.05, '#eef4f6', { x: x0 + w * 0.1, y: y0 + H * 0.49, z: z + 0.62 }); G.sphere(w * 0.12, '#e8eef0', { x: x0 + w * 0.1, y: y0 + 0.1, z: z + 0.7, sy: 0.4 }); }

  },

};
