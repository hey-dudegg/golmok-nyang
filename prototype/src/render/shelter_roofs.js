// render/shelter_roofs.js: 비 피할 자리의 처마·간이 지붕 (M3-f, 날씨_설계 4-1). 자리 좌표는 core/weather_rules.js SHELTER.
// 비·폭풍일 때만 보이는 그룹으로 돌려준다(scene.js가 켜고 끈다). 시장은 scene_themes.js 의 줄무늬 차양이 이미 그 자리라 비어 있다.
import * as THREE from 'three';
import { SHELTER_ROOFS as ROOFS } from '../core/weather_rules.js';

export function buildShelterRoofs(E, theme, std) {
  const g = new THREE.Group();
  for (const R of ROOFS[theme] || []) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(R.w, 0.05, R.d), std({ color: R.col, roughness: 0.7, metalness: theme === 'alley' ? 0.4 : 0 }));
    m.position.set(R.x, R.y, R.z); m.rotation.x = R.tilt; m.castShadow = true; g.add(m);
    if (R.post !== undefined) for (const dx of [-R.w / 2 + 0.06, R.w / 2 - 0.06]) { // 뒤쪽 기둥 (고양이 걷는 자리 밖)
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, R.y + 0.1, 8), std({ color: '#55534f' })); p.position.set(R.x + dx, (R.y + 0.1) / 2, R.post); p.castShadow = true; g.add(p);
    }
  }
  E.add(g);
  return g;
}
