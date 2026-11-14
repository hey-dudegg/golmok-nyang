// render/props.js: 오브젝트(자동차) 그리기 (M3-6 O1, 설계 5.4). 코드 도형만(D-01·13), 창은 불투명 어두운 색(투명 정렬 문제 회피)
// scene.build 가 테마 빌더 다음에 buildPropsFor 를 부른다. 그룹을 env(E)에 넣으므로 clearEnv 가 dispose 한다(누수 없음).
import * as THREE from 'three';
import { CAR, PROP_KINDS, PROPS, propsEnter } from '../core/props.js';

function buildCar(p, std) {
  const g = new THREE.Group(), d = p.dir || 1, { l, w, bottom, hoodY, roofY } = CAR;
  const body = std({ color: p.color, roughness: 0.55, metalness: 0.15 }), glass = std({ color: 0x1b2430, roughness: 0.25, metalness: 0.3 });
  const dark = std({ color: 0x1d1d20, roughness: 0.9 }), lamp = std({ color: 0xfff2c8, emissive: 0xffe9a8, emissiveIntensity: 0.6, roughness: 0.4 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x * d, y, z); m.rotation.set(rx, ry, rz * d); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const B = (a, b, c) => new THREE.BoxGeometry(a, b, c);
  add(B(l, hoodY - bottom, w), body, 0, (hoodY + bottom) / 2, 0); // 차체 (아래 0.20 은 비워 둠 = 차 밑 틈, 윗면 0.42 = 본네트·트렁크)
  const cabLen = CAR.cabin, cx = -l / 2 + CAR.trunk + cabLen / 2, ch = roofY - hoodY;
  add(B(cabLen, ch, w * 0.9), body, cx, hoodY + ch / 2, 0); // 캐빈
  add(B(cabLen - 0.24, ch * 0.55, w * 0.9 + 0.01), glass, cx, hoodY + ch * 0.58, 0); // 옆 창
  add(B(0.05, ch * 0.62, w * 0.78), glass, cx + cabLen / 2 + 0.03, hoodY + ch * 0.5, 0, 0, 0, 0.5); // 앞유리 (기울임)
  add(B(0.05, ch * 0.5, w * 0.7), glass, cx - cabLen / 2 - 0.02, hoodY + ch * 0.5, 0, 0, 0, -0.35); // 뒷유리
  add(B(0.08, 0.1, w + 0.02), dark, l / 2 + 0.02, bottom + 0.08, 0); // 앞 범퍼
  add(B(0.08, 0.1, w + 0.02), dark, -l / 2 - 0.02, bottom + 0.08, 0); // 뒤 범퍼
  for (const z of [-0.28, 0.28]) add(B(0.04, 0.08, 0.16), lamp, l / 2 + 0.01, hoodY - 0.07, z); // 헤드램프
  const wg = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 14);
  for (const x of [l / 2 - 0.5, -l / 2 + 0.5]) for (const z of [-0.4, 0.4]) add(wg, dark, x, 0.15, z, Math.PI / 2);
  g.position.set(p.x, 0, p.z); g.rotation.y = p.rot || 0;
  return g;
}
const BUILDERS = { car: buildCar };

// 장면에 오브젝트를 놓는다. 스위치가 꺼져 있으면 아무것도 하지 않는다. 충돌용 사각형을 S.obstacles 에 더한다
export function buildPropsFor(S, E, theme, dong, std) {
  const layout = propsEnter(theme, dong.c, S.obstacles);
  for (const p of layout) {
    const g = BUILDERS[p.kind](p, std); g.userData.propId = p.id; E.add(g);
    const K = PROP_KINDS[p.kind];
    S.obstacles.push({ id: p.id, x: p.x, z: p.z, hx: K.hx, hz: K.hz, rot: p.rot || 0 });
  }
  return PROPS.layout;
}
