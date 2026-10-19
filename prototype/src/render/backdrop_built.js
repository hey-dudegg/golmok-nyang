// 명소 배경 구조물 부품(타워·지붕선·성벽·빌딩·다리·등대·사찰·항구·언덕 마을) (R-17, 후보표 부록 B)
import * as THREE from 'three';
import { lerp } from '../core/util.js';
import { Y, baseAt, pavilion, roof, stonePagoda, tree } from './backdrop_shapes.js';

export const BUILT_PARTS = {  // 3 타워: 언덕 + 몸통 + 전망 구 + 안테나
  tower(G, p, r) {
    const z = p.z ?? -16, x = p.x ?? 0, H = p.h ?? 3, base = p.base ?? 0, st = p.style || 'needle', col = p.color || '#e8e6e0';
    let y = Y(p, z);
    if (base > 0) { G.sphere(1, p.color2 || '#4b6440', { x, y: y - base * 0.15, z: z - 0.5, sx: base * 2.6, sy: base * 1.1, sz: base * 1.2, veg: 1 }, 16, 8); y += base * 0.92; }
    if (st === 'nseoul') {
      G.cyl(H * 0.035, H * 0.055, H * 0.56, col, { x, y: y + H * 0.28, z }, 10);
      G.cyl(H * 0.11, H * 0.07, H * 0.035, col, { x, y: y + H * 0.56, z }, 16);
      G.cyl(H * 0.09, H * 0.1, H * 0.09, '#4a5868', { x, y: y + H * 0.62, z, glow: 0.9 }, 16);
      G.cyl(H * 0.1, H * 0.1, H * 0.03, col, { x, y: y + H * 0.68, z }, 16);
      G.cyl(H * 0.045, H * 0.05, H * 0.05, col, { x, y: y + H * 0.72, z }, 10);
      G.cyl(H * 0.012, H * 0.022, H * 0.28, '#d8d4cc', { x, y: y + H * 0.86, z }, 6);
      G.cyl(H * 0.03, H * 0.03, H * 0.015, '#c03a2a', { x, y: y + H * 0.84, z }, 8);
      G.sphere(H * 0.012, '#ff6a50', { x, y: y + H, z, glow: 1 }, 6, 4);
    } else if (st === 'expo') { // 가는 세 기둥 + 위쪽 구 + 고리 + 첨탑
      for (let i = 0; i < 3; i++) { const a = i * 2.09; G.rod(x + Math.cos(a) * H * 0.08, y, z + Math.sin(a) * H * 0.08, x + Math.cos(a + 0.6) * H * 0.02, y + H * 0.7, z + Math.sin(a + 0.6) * H * 0.02, H * 0.03, col); }
      G.sphere(H * 0.1, '#9fb0c0', { x, y: y + H * 0.66, z, glow: 0.7 }, 14, 10);
      G.add(new THREE.TorusGeometry(H * 0.14, H * 0.012, 6, 24), col, { x, y: y + H * 0.66, z, rx: 1.2 });
      G.add(new THREE.ConeGeometry(H * 0.025, H * 0.3, 6), col, { x, y: y + H * 0.85, z });
    } else { // needle / eighty3
      const pod = st === 'eighty3' ? 0.66 : 0.6;
      G.cyl(H * 0.04, H * 0.07, H * pod, col, { x, y: y + H * pod / 2, z }, 10);
      G.cyl(H * 0.1, H * 0.08, H * 0.05, col, { x, y: y + H * pod, z }, 14);
      G.cyl(H * 0.085, H * 0.085, H * (st === 'eighty3' ? 0.12 : 0.07), '#56606c', { x, y: y + H * (pod + 0.07), z, glow: 0.9 }, 14);
      G.cyl(H * 0.09, H * 0.06, H * 0.03, col, { x, y: y + H * (pod + 0.14), z }, 14);
      G.cyl(H * 0.012, H * 0.02, H * (0.98 - pod - 0.15), col, { x, y: y + H * (pod + 0.15 + (0.98 - pod - 0.15) / 2), z }, 6);
      G.sphere(H * 0.012, '#ff6a50', { x, y: y + H, z, glow: 1 }, 6, 4);
      if (st === 'eighty3') { // 아래 놀이공원 관람차
        const R = H * 0.17, wx = x + H * 0.32, wy = y - base * 0.2 + R + H * 0.03;
        G.add(new THREE.TorusGeometry(R, H * 0.008, 4, 28), '#c9cdd4', { x: wx, y: wy, z: z + 0.6, glow: 0.4 });
        for (let i = 0; i < 6; i++) { const a = i * 0.52; G.rod(wx - Math.cos(a) * R, wy - Math.sin(a) * R, z + 0.6, wx + Math.cos(a) * R, wy + Math.sin(a) * R, z + 0.6, H * 0.006, '#c9cdd4'); }
        G.rod(wx, wy, z + 0.6, wx - R * 0.6, wy - R - H * 0.03, z + 0.6, H * 0.01, '#8a8e94'); G.rod(wx, wy, z + 0.6, wx + R * 0.6, wy - R - H * 0.03, z + 0.6, H * 0.01, '#8a8e94');
      }
    }
  },
  // 4 지붕선: 한옥 마을·고궁·정자·시장 아케이드·초가
  roofline(G, p, r) {
    const z = p.z ?? -15, x0 = p.x ?? 0, y0 = Y(p, z), w = p.w ?? 16, H = p.h ?? 1.5, n = p.count ?? 5, st = p.style || 'hanok', rows = p.rows ?? 1;
    const roofC = p.color || (st === 'thatch' ? '#a88c5a' : '#3b4046'), wallC = p.color2 || '#e2dccd';
    if (st === 'palace') { // 2단 기단 위 겹처마 큰 전각 + 양옆 작은 전각, 뒤로 회랑
      const cw = w * 0.42;
      G.box(cw * 1.15, H * 0.16, cw * 0.45, '#b9b3a5', { x: x0, y: y0 + H * 0.08, z });
      G.box(cw * 0.95, H * 0.14, cw * 0.38, '#c7c1b3', { x: x0, y: y0 + H * 0.23, z });
      G.box(cw * 0.7, H * 0.32, cw * 0.28, '#8e3d2e', { x: x0, y: y0 + H * 0.46, z });
      roof(G, x0, y0 + H * 0.55, cw * 1.02, H * 0.22, z + cw * 0.2, roofC);
      G.box(cw * 0.55, H * 0.12, cw * 0.2, '#8e3d2e', { x: x0, y: y0 + H * 0.8, z: z - 0.05 });
      roof(G, x0, y0 + H * 0.8, cw * 0.82, H * 0.26, z + cw * 0.21, roofC);
      for (const s of [-1, 1]) for (let i = 1; i < Math.max(2, n); i++) { const sx = x0 + s * (cw * 0.55 + i * w * 0.14); G.box(w * 0.12, H * 0.22, 0.4, '#8e3d2e', { x: sx, y: y0 + H * 0.11, z: z + 0.6 }); roof(G, sx, y0 + H * 0.2, w * 0.16, H * 0.15, z + 0.85, roofC); }
      G.box(w * 1.1, H * 0.18, 0.2, '#b7a99a', { x: x0, y: y0 + H * 0.09, z: z + 1.6 });
      return;
    }
    if (st === 'arcade') { // 시장: 길고 낮은 반원 지붕들 + 간판 띠
      for (let i = 0; i < n; i++) {
        const x = x0 - w / 2 + (i + 0.5) * w / n, d = r.range(0.7, 1.1);
        G.box(w / n * 0.96, H * 0.45, d * 2, '#bdb3a2', { x, y: y0 + H * 0.22, z: z - i % 2 * 0.4 });
        G.add(new THREE.CylinderGeometry(H * 0.42, H * 0.42, w / n * 0.98, 10, 1, false, 0, Math.PI), r.pick(['#5d8fb0', '#7aa28a', '#c9b06a', '#8fa4b8']), { x, y: y0 + H * 0.45, z: z - i % 2 * 0.4, rz: Math.PI / 2, ry: 0, sx: 1, sy: 1, sz: d * 1.6 });
        G.box(w / n * 0.9, H * 0.12, 0.05, r.pick(['#c84a3a', '#e0a33a', '#3a7ac0', '#3a9a6a']), { x, y: y0 + H * 0.38, z: z + d + 0.05 - i % 2 * 0.4, glow: 0.5 });
      }
      return;
    }
    if (st === 'pavilion') { for (let i = 0; i < n; i++) pavilion(G, x0 + (n === 1 ? 0 : -w / 2 + w * i / (n - 1)), y0, H * 1.3, H, z, { roof: roofC }); return; }
    for (let row = 0; row < rows; row++) {
      const yy = y0 + row * H * 0.42, zz = z - row * 0.7, k = n - row;
      for (let i = 0; i < k; i++) {
        const x = x0 - w / 2 + (i + 0.5 + (row % 2) * 0.4) * w / n + r.range(-0.15, 0.15) * w / n, hw = w / n * r.range(0.8, 1.05);
        G.box(hw * 0.72, H * 0.4, 0.5, wallC, { x, y: yy + H * 0.2, z: zz });
        if (st === 'thatch') G.add(new THREE.SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), roofC, { x, y: yy + H * 0.36, z: zz, sx: hw * 0.47, sy: H * 0.3, sz: 0.42, veg: 0.2 }); // 낮고 둥근 초가 지붕(반구)
        else roof(G, x, yy + H * 0.38, hw * 1.05, H * 0.42, zz + 0.3, roofC);
        if (r.chance(0.3)) G.box(hw * 0.12, H * 0.1, 0.02, '#e8c27a', { x: x + r.range(-0.15, 0.15) * hw, y: yy + H * 0.2, z: zz + 0.27, glow: 0.8 });
      }
    }
  },
  // 5 성벽: 굽이치는 성곽 + 성가퀴 + 문루
  wall(G, p, r) {
    const z = p.z ?? -15, x0 = p.x ?? 0, w = p.w ?? 24, H = p.h ?? 1, gates = p.gates ?? 2, cv = p.curve ?? 1, col = p.color || '#a49e90';
    const seg = Math.max(10, Math.round(w / 0.8)), sw = w / seg;
    const at = (t) => [x0 - w / 2 + w * t, Y(p, z) + cv * 0.5 * (Math.sin(t * 5.2 + 0.7) * 0.6 + Math.sin(t * 11.3) * 0.25) + cv * 0.4, z + Math.sin(t * 4.1) * cv * 0.8];
    for (let i = 0; i < seg; i++) {
      const [x, y, zz] = at((i + 0.5) / seg), [x2, y2] = at((i + 1.5) / seg);
      G.box(sw * 1.05, H, 0.45, col, { x, y: y + H / 2, z: zz, rz: Math.atan2(y2 - y, x2 - x) * 0.5 });
      G.box(sw * 0.45, H * 0.22, 0.47, '#8e887c', { x: x - sw * 0.2, y: y + H + H * 0.11, z: zz });
    }
    // 성벽이 올라앉은 언덕: 성벽 높이를 따라가는 윤곽(양 끝은 낮게) 하나를 성벽 뒤에 세운다
    const hill = [[x0 - w * 0.75, Y(p, z) - 0.8]];
    for (let i = 0; i <= 40; i++) { const t = i / 40, u = -0.25 + t * 1.5, e = Math.min(1, Math.max(0, Math.min(u + 0.25, 1.25 - u) / 0.25)); const yy = at(Math.min(1, Math.max(0, u)))[1]; hill.push([x0 - w / 2 + w * u, lerp(Y(p, z) - 0.2, yy + 0.08 + 0.12 * Math.sin(u * 23), e)]); }
    hill.push([x0 + w * 0.75, Y(p, z) - 0.8]);
    G.shape(hill, z - 1.1, p.color2 || '#5c7150', { grad: 0.75, veg: 0.8 });
    for (let g = 0; g < gates; g++) { const [x, y, zz] = at((g + 0.5) / gates * 0.85 + 0.07); G.box(H * 1.6, H * 1.25, 0.8, col, { x, y: y + H * 0.4, z: zz + 0.1 }); pavilion(G, x, y + H * 1.0, H * 2.0, H * 1.25, zz + 0.2); }
  },
  // 6 빌딩군: 직육면체 + 밤 창 불빛 띠
  buildings(G, p, r) {
    const z = p.z ?? -18, x0 = p.x ?? 0, y0 = Y(p, z), w = p.w ?? 30, n = p.count ?? 14, H = p.h ?? 5, hmin = p.hmin ?? H * 0.35, st = p.style || 'mid', glow = p.glow ?? 1;
    if (st === 'long') { // 낮고 아주 긴 건물이 굽이쳐 이어짐 + 옥상 정원
      const seg = n;
      for (let i = 0; i < seg; i++) {
        const t = i / seg, x = x0 - w / 2 + w * (t + 0.5 / seg), zz = z + Math.sin(t * 6.3) * 1.6 - Math.abs(Math.sin(t * 3.1)) * 1.2, hh = H * (0.75 + 0.25 * Math.sin(t * 9));
        G.box(w / seg * 1.04, hh, 1.0, p.color || '#c9ccc8', { x, y: y0 + hh / 2, z: zz, ry: Math.cos(t * 6.3) * 0.35 });
        G.box(w / seg * 1.0, H * 0.12, 1.0, '#5f7d48', { x, y: y0 + hh + H * 0.05, z: zz, ry: Math.cos(t * 6.3) * 0.35, veg: 1 });
        G.box(w / seg * 0.9, hh * 0.1, 0.02, '#e9d6a0', { x, y: y0 + hh * 0.55, z: zz + 0.52, ry: Math.cos(t * 6.3) * 0.35, glow: glow * 0.7 });
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, mid = 1 - Math.abs(t - 0.5) * (st === 'apt' ? 0.3 : 1.1);
      const hh = st === 'apt' ? H * r.range(0.85, 1) : Math.max(hmin, H * mid * r.range(0.55, 1.05));
      const bw = (st === 'apt' ? w / n * 0.8 : w / n * r.range(0.55, 0.9)), x = x0 - w / 2 + w * t + r.range(-0.2, 0.2) * w / n, zz = z + r.range(-1.2, 1.2);
      const c = p.color || (st === 'glass' || st === 'tall' ? r.pick(['#7b8a9a', '#8796a6', '#6d7d8f', '#9aa6b2']) : r.pick(['#a9a59c', '#b9b2a6', '#9da3a8', '#c3bdb0']));
      G.box(bw, hh, bw * 0.7, c, { x, y: y0 + hh / 2, z: zz });
      if (st === 'glass' && r.chance(0.4)) G.add(new THREE.ConeGeometry(bw * 0.6, hh * 0.15, 4), c, { x, y: y0 + hh + hh * 0.075, z: zz, ry: 0.785 });
      if (glow) for (let k = 1, m = Math.max(1, Math.floor(hh / 0.55)); k < m; k++) if (r.chance(0.65)) G.box(bw * 0.86, hh / m * 0.35, 0.02, '#3c4652', { x, y: y0 + k * hh / m, z: zz + bw * 0.35 + 0.01, glow: glow * r.range(0.4, 1) });
    }
  },
  // 7 다리: 현수교·사장교·원형 보행교·트러스·아치
  bridge(G, p, r) {
    const z = p.z ?? -18, x0 = p.x ?? 0, y0 = Y(p, z), w = p.w ?? 30, H = p.h ?? 3, st = p.style || 'suspension', col = p.color || '#cfd2d4', decks = p.decks ?? 1;
    const dh = H * 0.24, dt = Math.max(0.08, H * 0.035);
    if (st === 'ring') { // 고리 모양 보행교: 납작한 원 두 겹(바닥·지붕) + 기둥
      const R = w / 2;
      G.add(new THREE.TorusGeometry(R, H * 0.06, 4, 48), col, { x: x0, y: y0 + H * 0.35, z: z - R * 0.3, rx: Math.PI / 2 - 0.45, sy: 0.6 });
      G.add(new THREE.TorusGeometry(R, H * 0.09, 4, 48), '#e9ecee', { x: x0, y: y0 + H * 0.62, z: z - R * 0.3, rx: Math.PI / 2 - 0.45, sy: 0.6, glow: 0.5 });
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, x = x0 + Math.cos(a) * R, zz = z - R * 0.3 + Math.sin(a) * R * 0.6; G.box(H * 0.04, H * 0.62, H * 0.04, '#9aa0a4', { x, y: y0 + H * 0.31, z: zz }); }
      return;
    }
    for (let d = 0; d < decks; d++) G.box(w, dt, 0.5, col, { x: x0, y: y0 + dh + d * dt * 2.2, z, glow: d === decks - 1 ? 0.35 : 0 });
    const piers = Math.round(w / 3);
    for (let i = 0; i <= piers; i++) G.box(dt * 0.9, dh, dt * 0.9, '#9a9c9a', { x: x0 - w / 2 + w * i / piers, y: y0 + dh / 2, z });
    const top = dh + decks * dt * 2.2;
    if (st === 'truss') {
      const m = Math.round(w / 0.9);
      for (let i = 0; i < m; i++) { const xa = x0 - w / 2 + w * i / m, xb = xa + w / m; G.rod(xa, y0 + top, z, xb, y0 + top + H * 0.22, z, dt * 0.4, '#6a6e72'); G.rod(xb, y0 + top + H * 0.22, z, xb, y0 + top, z, dt * 0.4, '#6a6e72'); }
      G.box(w, dt * 0.5, 0.4, '#6a6e72', { x: x0, y: y0 + top + H * 0.22, z });
      return;
    }
    if (st === 'arch') { for (let i = 0; i < 24; i++) { const a = i / 24, b = (i + 1) / 24, ya = Math.sin(a * Math.PI) * H * 0.6, yb = Math.sin(b * Math.PI) * H * 0.6; G.rod(x0 - w * 0.3 + w * 0.6 * a, y0 + top + ya, z, x0 - w * 0.3 + w * 0.6 * b, y0 + top + yb, z, dt * 0.6, col); } return; }
    const nt = p.towers ?? 2, tx = [];
    for (let i = 0; i < nt; i++) tx.push(x0 + (nt === 1 ? 0 : (i / (nt - 1) - 0.5) * w * (st === 'cable' ? 0.16 : 0.36)));
    for (const x of tx) { // 주탑: 두 다리 + 가로보 (사장교는 A자)
      const lean = st === 'cable' ? H * 0.06 : 0;
      for (const s of [-1, 1]) G.rod(x + s * (H * 0.06 + lean), y0, z + s * 0.12, x + s * H * 0.03, y0 + H, z + s * 0.12, dt * 0.9, col);
      for (const k of [0.55, 0.92]) G.box(H * 0.14, dt * 0.7, 0.3, col, { x, y: y0 + H * k, z });
      G.sphere(dt * 0.4, '#ff7a5a', { x, y: y0 + H + dt, z, glow: 1 }, 6, 4);
    }
    const deckY = y0 + top, cab = (ax, ay, bx, by, sag) => { // 늘어진 케이블 + 행어
      const m = 16;
      for (let i = 0; i < m; i++) {
        const a = i / m, b = (i + 1) / m, ya = lerp(ay, by, a) - sag * 4 * a * (1 - a), yb = lerp(ay, by, b) - sag * 4 * b * (1 - b);
        G.rod(lerp(ax, bx, a), ya, z + 0.02, lerp(ax, bx, b), yb, z + 0.02, dt * 0.35, col, { glow: 0.9 });
        if (i) G.rod(lerp(ax, bx, a), ya, z + 0.02, lerp(ax, bx, a), deckY, z + 0.02, dt * 0.15, col);
      }
    };
    if (st === 'cable') { for (const x of tx) for (let i = 1; i <= 7; i++) for (const s of [-1, 1]) G.rod(x, y0 + H * (0.95 - i * 0.025), z, x + s * i * w * 0.035, deckY, z, dt * 0.18, col, { glow: 0.6 }); return; }
    const L = tx[0], R = tx[tx.length - 1], Ty = y0 + H;
    cab(L, Ty, R, Ty, (Ty - deckY) * 0.82);
    cab(x0 - w / 2, deckY + dt, L, Ty, (Ty - deckY) * 0.2); cab(R, Ty, x0 + w / 2, deckY + dt, (Ty - deckY) * 0.2);
  },
  // 9 등대(곶 바위 위)
  lighthouse(G, p, r) {
    const z = p.z ?? -16, x = p.x ?? 0, H = p.h ?? 2.2, base = p.base ?? 0.6, st = p.style || 'white';
    let y = Y(p, z);
    if (base > 0) { G.sphere(1, '#6e6a5e', { x, y: y - base * 0.2, z, sx: base * 2.4, sy: base, sz: base * 1.3, veg: 0.4 }, 12, 6); y += base * 0.75; }
    const col = st === 'red' ? '#c8483a' : '#f0eee8', k = st === 'tall' ? 0.06 : 0.09;
    G.cyl(H * k * 0.75, H * k, H * 0.72, col, { x, y: y + H * 0.36, z }, 12);
    G.cyl(H * k * 1.25, H * k * 1.25, H * 0.03, '#4b4f54', { x, y: y + H * 0.73, z }, 12);
    G.cyl(H * k * 0.7, H * k * 0.7, H * 0.12, '#f5e2a0', { x, y: y + H * 0.8, z, glow: 1 }, 10);
    G.add(new THREE.ConeGeometry(H * k * 0.95, H * 0.14, 10), st === 'red' ? '#8e2e26' : '#c33a2e', { x, y: y + H * 0.93, z });
  },
  // 11 사찰·석탑
  temple(G, p, r) {
    const z = p.z ?? -15, x = p.x ?? 0, y = Y(p, z), H = p.h ?? 3, st = p.style || 'pagoda', fl = p.floors ?? 5;
    if (st === 'stone') { stonePagoda(G, x, y, H, z, fl, p.color || '#a6a196'); return; }
    if (st === 'hall') { // 돌 축대 + 계단 + 큰 전각 + 양옆 석탑
      G.box(H * 2.6, H * 0.3, 0.8, '#a39a88', { x, y: y + H * 0.15, z });
      for (let i = 0; i < 4; i++) G.box(H * 0.28, H * 0.075 * (i + 1), 0.25, '#b4ab98', { x: x - H * 0.6, y: y + H * 0.0375 * (i + 1), z: z + 0.5 - i * 0.12 });
      G.box(H * 1.1, H * 0.28, 0.6, '#8e3d2e', { x, y: y + H * 0.44, z: z - 0.1 });
      roof(G, x, y + H * 0.55, H * 1.6, H * 0.32, z + 0.3, p.color || '#3d4248');
      stonePagoda(G, x - H * 1.0, y + H * 0.3, H * 0.55, z + 0.3, 3); stonePagoda(G, x + H * 1.0, y + H * 0.3, H * 0.55, z + 0.3, 3);
      return;
    }
    // 다층 목탑: 층마다 몸통 + 지붕, 위로 갈수록 작게 + 상륜
    const s = H / (fl * 0.85 + 0.8);
    G.box(s * 1.8, s * 0.3, s * 1.6, '#a39a88', { x, y: y + s * 0.15, z });
    let yy = y + s * 0.3;
    for (let i = 0; i < fl; i++) { const k = 1 - i * 0.1; G.box(s * 1.1 * k, s * 0.5, s, '#8e3d2e', { x, y: yy + s * 0.25, z }); roof(G, x, yy + s * 0.45, s * 1.9 * k, s * 0.38, z + s * 0.5, p.color || '#3d4248'); yy += s * 0.82; }
    G.cyl(s * 0.04, s * 0.06, s * 0.9, '#6d675e', { x, y: yy + s * 0.4, z });
  },
  // 12 항구: 방파제 + 크레인 + 배 + (관람차)
  harbor(G, p, r) {
    const z = p.z ?? -16, x0 = p.x ?? 0, y0 = Y(p, z), w = p.w ?? 20, H = p.h ?? 3;
    if (p.breakwater ?? 1) { G.box(w * 0.7, 0.25, 0.5, '#8d8b84', { x: x0 - w * 0.1, y: y0 + 0.05, z: z + 2 }); G.cyl(0.12, 0.14, 0.9, '#d84a3a', { x: x0 + w * 0.25, y: y0 + 0.6, z: z + 2 }, 8); G.sphere(0.07, '#ff8a6a', { x: x0 + w * 0.25, y: y0 + 1.08, z: z + 2, glow: 1 }); }
    for (let i = 0; i < (p.cranes ?? 3); i++) {
      const x = x0 + w * 0.15 + i * w * 0.12, c = i % 2 ? '#c8463a' : '#d8a03a';
      for (const s of [-1, 1]) G.box(0.08, H * 0.7, 0.08, c, { x: x + s * H * 0.12, y: y0 + H * 0.35, z: z - 1.5 });
      G.box(H * 0.32, 0.1, 0.12, c, { x, y: y0 + H * 0.7, z: z - 1.5 }); G.box(H * 0.55, 0.07, 0.1, c, { x: x - H * 0.08, y: y0 + H * 0.62, z: z - 1.5, rz: 0.12 });
    }
    for (let i = 0; i < (p.boats ?? 4); i++) {
      const x = x0 - w * 0.4 + r.range(0, w * 0.6), zz = z + r.range(0.5, 3), bl = r.range(0.6, 1.3), yb = baseAt(zz);
      G.box(bl, 0.18, 0.3, r.pick(['#e9e6de', '#3a6a9a', '#c8463a']), { x, y: yb + 0.1, z: zz }); G.box(bl * 0.35, 0.2, 0.25, '#f0eee8', { x: x - bl * 0.15, y: yb + 0.28, z: zz, glow: 0.3 });
    }
    if (p.wheel) {
      const R = H * 0.42, wx = x0 - w * 0.25, wy = y0 + R + 0.25;
      G.add(new THREE.TorusGeometry(R, 0.05, 4, 32), '#e9e3d8', { x: wx, y: wy, z: z - 0.5, glow: 0.6 });
      for (let i = 0; i < 8; i++) { const a = i * 0.785; G.rod(wx, wy, z - 0.5, wx + Math.cos(a) * R, wy + Math.sin(a) * R, z - 0.5, 0.03, '#e9e3d8'); G.box(0.14, 0.14, 0.14, r.pick(['#d84a3a', '#3a8ad8', '#e8c03a']), { x: wx + Math.cos(a) * R, y: wy + Math.sin(a) * R - 0.08, z: z - 0.45, glow: 0.4 }); }
      G.rod(wx, wy, z - 0.5, wx - R * 0.5, y0, z - 0.5, 0.07, '#9a9690'); G.rod(wx, wy, z - 0.5, wx + R * 0.5, y0, z - 0.5, 0.07, '#9a9690');
    }
  },
  // 14 언덕 마을: 비탈을 따라 계단처럼 쌓인 작은 집들
  village(G, p, r) {
    const z = p.z ?? -16, x0 = p.x ?? 0, w = p.w ?? 12, H = p.h ?? 3, rows = p.rows ?? 5, cols = p.cols ?? 8, st = p.style || 'colorful';
    const walls = st === 'colorful' ? ['#e7b0a0', '#a8c8e0', '#f0d890', '#b8dcb0', '#d8b8e0', '#f4efe6', '#8fb8d8'] : ['#f2efe8', '#ece4d6', '#f6f2ea'];
    const y0 = Y(p, z);
    for (let row = 0; row < rows; row++) {
      const yy = y0 + row * H / rows, zz = z - row * 0.55, n = cols - (row % 2), span = w * (1 - row * 0.08);
      for (let i = 0; i < n; i++) {
        const x = x0 - span / 2 + span * (i + 0.5) / n + r.range(-0.1, 0.1), bw = span / n * r.range(0.7, 0.92), bh = H / rows * r.range(0.8, 1.2);
        G.box(bw, bh, 0.5, r.pick(walls), { x, y: yy + bh / 2, z: zz });
        if (st === 'orange') G.add(new THREE.CylinderGeometry(bw * 0.62, bw * 0.62, 0.55, 3, 1), '#d0602e', { x, y: yy + bh + bw * 0.25, z: zz, rx: Math.PI / 2, rz: Math.PI / 2, sy: 1, sx: 0.65 });
        else G.box(bw * 1.04, bh * 0.1, 0.52, r.pick(['#5a8ab0', '#c8584a', '#6a9a6a', '#d8a84a']), { x, y: yy + bh, z: zz });
        if (r.chance(0.45)) G.box(bw * 0.25, bh * 0.25, 0.02, '#e8c27a', { x: x + r.range(-0.2, 0.2) * bw, y: yy + bh * 0.5, z: zz + 0.26, glow: 0.9 });
      }
    }
  },
};
