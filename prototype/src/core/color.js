// core/color.js: 색 섞기 (D-33 단계 2). three.js 0.160 의 new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString() 과
// 같은 계산을 three 없이 한다: sRGB 16진 -> 선형(작업 색공간)으로 바꿔 섞고 -> 다시 sRGB 로 반올림.
// (three 의 기본값 ColorManagement.enabled = true, 작업 색공간 LinearSRGB 기준. 시험: tests/unit/core.test.js 기준값 비교)
import { clamp } from './util.js';

const toLinear = (c) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
const toSRGB = (c) => (c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055);
// '#rrggbb' 두 색을 t(0~1)만큼 섞은 '#rrggbb'
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  let out = 0;
  for (const sh of [16, 8, 0]) {
    const x = toLinear(((pa >> sh) & 255) / 255), y = toLinear(((pb >> sh) & 255) / 255);
    out = out * 256 + Math.round(clamp(toSRGB(x + (y - x) * t) * 255, 0, 255));
  }
  return '#' + ('000000' + out.toString(16)).slice(-6);
}
