// render/props.js: 오브젝트(자동차) 그리기 (M3-6 O1, 설계 5.4). 코드 도형만(D-01·13), 창은 불투명 어두운 색(투명 정렬 문제 회피)
// scene.build 가 테마 빌더 다음에 buildPropsFor 를 부른다. 그룹을 env(E)에 넣으므로 clearEnv 가 dispose 한다(누수 없음).
import * as THREE from 'three';
import { CAR, CRATE, PROP_KINDS, PROPS, WALL, propsEnter } from '../core/props.js';
import { makeRng } from '../core/util.js';
import { wallTex } from './scene_themes.js';

export function buildCar(p, std) {
  const g = new THREE.Group(), d = p.dir || 1, { l, w, bottom, hoodY, roofY } = CAR;
  const body = std({ color: p.color, roughness: 0.55, metalness: 0.15 }), glass = std({ color: 0x1b2430, roughness: 0.25, metalness: 0.3 });
  const tail = std({ color: 0xc8312b, emissive: 0x7a1410, emissiveIntensity: 0.5, roughness: 0.5 });
  const dark = std({ color: 0x1d1d20, roughness: 0.9 }), lamp = std({ color: 0xfff2c8, emissive: 0xffe9a8, emissiveIntensity: 0.6, roughness: 0.4 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x * d, y, z); m.rotation.set(rx, ry, rz * d); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const B = (a, b, c) => new THREE.BoxGeometry(a, b, c);
  add(B(l, hoodY - bottom, w), body, 0, (hoodY + bottom) / 2, 0); // 차체 (아래 0.20 은 비워 둠 = 차 밑 틈, 윗면 0.58 = 본네트·트렁크)
  const cabLen = CAR.cabin, cx = -l / 2 + CAR.trunk + cabLen / 2, ch = roofY - hoodY, roofLen = cabLen - 0.5;
  const F = (bl, tl, bw, tw, h) => { const geo = new THREE.BoxGeometry(1, h, 1), q = geo.attributes.position; // 위로 좁아지는 사다리꼴 기둥(앞뒤·좌우 테이퍼)
    for (let i = 0; i < q.count; i++) { const t = q.getY(i) / h + 0.5; q.setXYZ(i, q.getX(i) * (bl + (tl - bl) * t), q.getY(i), q.getZ(i) * (bw + (tw - bw) * t)); }
    geo.computeVertexNormals(); return geo; };
  add(F(cabLen - 0.04, roofLen + 0.02, w * 0.9, w * 0.66, ch), glass, cx, hoodY + ch / 2, 0); // 그린하우스(창): 앞유리·뒷유리·옆창이 모두 기운다 (D-128)
  add(F(roofLen + 0.06, roofLen - 0.02, w * 0.68, w * 0.62, 0.05), body, cx, roofY - 0.025, 0); // 지붕판
  add(F(cabLen - 0.5, roofLen + 0.04, w * 0.9, w * 0.66, 0.05), body, cx, hoodY + 0.025, 0); // 벨트라인(창 아래 띠)
  add(B(0.08, 0.1, w + 0.02), dark, l / 2 + 0.02, bottom + 0.08, 0); // 앞 범퍼
  add(B(0.08, 0.1, w + 0.02), dark, -l / 2 - 0.02, bottom + 0.08, 0); // 뒤 범퍼
  for (const z of [-0.28, 0.28]) add(B(0.04, 0.08, 0.16), lamp, l / 2 + 0.01, hoodY - 0.1, z); // 헤드램프
  for (const z of [-0.3, 0.3]) add(B(0.04, 0.07, 0.18), tail, -l / 2 - 0.01, hoodY - 0.1, z); // 후미등
  const wr = CAR.wheelR, wg = new THREE.CylinderGeometry(wr, wr, 0.14, 16), ag = new THREE.CylinderGeometry(wr + 0.045, wr + 0.045, 0.03, 16);
  for (const x of [l / 2 - 0.62, -l / 2 + 0.62]) for (const sz of [-1, 1]) {
    add(ag, dark, x, wr, sz * (w / 2 + 0.005), Math.PI / 2); // 바퀴 아치(차체 옆면의 어두운 홈)
    add(B(wr * 2 + 0.1, 0.05, w + 0.01), body, x, wr + wr + 0.03, 0); // 아치 위 덮개(바퀴 위를 감싸는 펜더)
    add(wg, dark, x, wr, sz * (w / 2 - 0.05), Math.PI / 2); }
  g.position.set(p.x, 0, p.z); g.rotation.y = p.rot || 0;
  return g;
}
// 낮은 담 (M5-1): 몸통 상자 + 갓돌 상자. 몸통 질감은 뒷담 wallTex(골목) 일부를 잘라 쓴다(12m 폭 중 1.8m, 위쪽 0.8m)
export function buildLowWall(p, std, ctx) {
  const g = new THREE.Group(), { l, w, h, cap } = WALL;
  const tex = wallTex(ctx.S, makeRng('lowwall:' + ctx.dong.c + ':' + p.id), ctx.dong, 'alley'), r = makeRng('lowwall:cut:' + ctx.dong.c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(l / 12, h / 2.1); tex.offset.set(r.range(0, 1 - l / 12), 1 - h / 2.1);
  const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.set(0, y, 0); m.castShadow = m.receiveShadow = true; g.add(m); };
  add(new THREE.BoxGeometry(l, h - cap, w), std({ map: tex }), (h - cap) / 2);
  add(new THREE.BoxGeometry(l + 0.06, cap, w + 0.05), std({ color: 0x9a948a, roughness: 0.95 }), h - cap / 2); // 갓돌(살짝 튀어나옴)
  g.position.set(p.x, 0, p.z); g.rotation.y = p.rot || 0;
  return g;
}
// 종이 상자 (M5-2): 윗면 열린 4면 + 얇은 바닥(고양이 발이 y 0 이라 바닥은 0.004 평면) + 윗테두리·테이프. 색은 지역 시드로 판지 3색
export function buildCrate(p, std) {
  const g = new THREE.Group(), { l, w, h, t } = CRATE, r = makeRng('crate:' + p.id + ':' + Math.round(p.x * 100) + ':' + Math.round(p.z * 100));
  const col = [0xb88a5a, 0xa87a4c, 0xc49a6a][r.int(0, 2)], card = std({ color: col, roughness: 0.95 }), inner = std({ color: 0x6b4a2c, roughness: 1 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const B = (a, b, c) => new THREE.BoxGeometry(a, b, c);
  add(B(l, h, t), card, 0, h / 2, w / 2 - t / 2); add(B(l, h, t), card, 0, h / 2, -w / 2 + t / 2); // 앞(+z)·뒤 벽
  add(B(t, h, w - 2 * t), card, l / 2 - t / 2, h / 2, 0); add(B(t, h, w - 2 * t), card, -l / 2 + t / 2, h / 2, 0); // 좌·우 벽
  add(new THREE.PlaneGeometry(l - 2 * t, w - 2 * t), inner, 0, 0.004, 0).rotation.x = -Math.PI / 2; // 속바닥(어두움)
  add(B(l + 0.01, 0.05, 0.004), std({ color: 0xd9c9a3, roughness: 0.8 }), 0, h * 0.62, w / 2 + 0.001); // 앞면 테이프 띠
  g.position.set(p.x, 0, p.z); g.rotation.y = p.rot || 0;
  return g;
}
const BUILDERS = { car: buildCar, lowwall: buildLowWall, crate: buildCrate };

// 장면에 오브젝트를 놓는다. 스위치가 꺼져 있으면 아무것도 하지 않는다. 충돌용 사각형을 S.obstacles 에 더한다
export function buildPropsFor(S, E, theme, dong, std) {
  const layout = propsEnter(theme, dong.c, S.obstacles);
  for (const p of layout) {
    const g = BUILDERS[p.kind](p, std, { S, dong }); g.userData.propId = p.id; E.add(g);
    const K = PROP_KINDS[p.kind];
    S.obstacles.push({ id: p.id, x: p.x, z: p.z, hx: K.hx, hz: K.hz, rot: p.rot || 0 });
  }
  return PROPS.layout;
}
