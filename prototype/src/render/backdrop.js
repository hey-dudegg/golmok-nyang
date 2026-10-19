// 명소 배경(원경) 만들기 (R-17, D-28): 부품 조합 -> 지오메트리 하나로 병합, 재질 하나, 그리기 1번
// 사진·이미지를 쓰지 않는다. 대기 원근(먼 것은 안개색 쪽으로)과 시즌·시간대 색조는 셰이더 uniform 만 바꾼다(지오메트리 재생성 없음)
import * as THREE from 'three';
import { SEASON_TINT, backdropVariant, landmarkSeed } from '../core/landmarks.js';
import { makeRng } from '../core/util.js';
import { BUILT_PARTS } from './backdrop_built.js';
import { NATURE_PARTS } from './backdrop_parts.js';
import { BASE, baseAt } from './backdrop_shapes.js';

export const PARTS = { ...NATURE_PARTS, ...BUILT_PARTS };

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 삼각형을 모으는 그릇. 모든 부품이 여기에 넣고 마지막에 BufferGeometry 하나가 된다
export class BackdropGeo {
  constructor() { this.pos = []; this.col = []; this.aux = []; }
  // g: three 지오메트리(넣은 뒤 버린다). o: { x,y,z, rx,ry,rz, sx,sy,sz, veg, glow, snow:[y0,y1], grad, flat }
  add(g, color, o = {}) {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0); _q.setFromEuler(_e);
    _m.compose(_v.set(o.x || 0, o.y || 0, o.z || 0), _q, _s.set(o.sx || 1, o.sy || 1, o.sz || 1));
    ng.applyMatrix4(_m);
    if (!o.flat) ng.computeVertexNormals();
    const p = ng.attributes.position.array, n = ng.attributes.normal && ng.attributes.normal.array;
    _c.set(color);
    let y0 = Infinity, y1 = -Infinity;
    if (o.grad) for (let i = 1; i < p.length; i += 3) { if (p[i] < y0) y0 = p[i]; if (p[i] > y1) y1 = p[i]; }
    const veg = o.veg || 0, glow = o.glow || 0, sn = o.snow;
    for (let i = 0; i < p.length; i += 3) {
      let k = 1;
      if (n && !o.flat) k = 0.7 + 0.22 * Math.max(n[i + 1], 0) + 0.12 * n[i] + 0.1 * Math.max(n[i + 2], 0);
      if (o.grad) k *= o.grad + (1 - o.grad) * (y1 > y0 ? (p[i + 1] - y0) / (y1 - y0) : 1);
      this.pos.push(p[i], p[i + 1], p[i + 2]);
      this.col.push(_c.r * k, _c.g * k, _c.b * k);
      this.aux.push(veg, sn ? sn[2] * ss(sn[0], sn[1], p[i + 1]) : 0, glow);
    }
    ng.dispose();
  }
  box(w, h, d, color, o) { this.add(new THREE.BoxGeometry(w, h, d), color, o); }
  cyl(rt, rb, h, color, o, seg = 8) { this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1), color, o); }
  sphere(r, color, o, ws = 10, hs = 6) { this.add(new THREE.SphereGeometry(r, ws, hs), color, o); }
  // 앞(+z)을 보는 평면 윤곽. pts = [[x,y], ...]
  shape(pts, z, color, o = {}) {
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    this.add(new THREE.ShapeGeometry(s), color, { ...o, z, flat: true });
  }
  // 두 점 사이 가는 막대(케이블·기둥)
  rod(ax, ay, az, bx, by, bz, t, color, o = {}) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1e-3;
    const g = new THREE.BoxGeometry(t, L, t);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
    const m = new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m); this.add(g, color, { ...o, flat: o.flat });
  }
  get tris() { return this.pos.length / 9; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('bcol', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aux', new THREE.Float32BufferAttribute(this.aux, 3));
    g.computeBoundingSphere();
    this.pos = this.col = this.aux = null;
    return g;
  }
}

const VERT = `attribute vec3 bcol; attribute vec3 aux; varying vec3 vC; varying vec3 vA; varying vec3 vW;
void main(){ vC = bcol; vA = aux; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG = `uniform vec3 uLight; uniform vec3 uHaze; uniform vec3 uVeg; uniform vec3 uGlowCol;
uniform float uVegAmt; uniform float uSnow; uniform float uGlow; uniform float uHazeK;
varying vec3 vC; varying vec3 vA; varying vec3 vW;
void main(){
  vec3 c = vC; float lum = dot(vC, vec3(0.3, 0.59, 0.11));
  c = mix(c, uVeg * (0.55 + 2.2 * lum), uVegAmt * vA.x);
  c = mix(c, vec3(0.80, 0.84, 0.90) * (0.75 + lum), uSnow * vA.y);
  c *= uLight;
  float d = length(vW - cameraPosition);
  float k = uHazeK * (0.18 + 0.82 * smoothstep(14.0, 60.0, d));
  k += (1.0 - smoothstep(0.0, 3.5, vW.y - 0.6)) * 0.12 * uHazeK;
  k = clamp(k, 0.0, 0.92);
  c = mix(c, uHaze, k);
  c += vA.z * uGlow * uGlowCol * (1.0 - 0.45 * k);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
function makeMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, fog: false,
    uniforms: {
      uLight: { value: new THREE.Color(1, 1, 1) }, uHaze: { value: new THREE.Color(0.6, 0.66, 0.74) }, uVeg: { value: new THREE.Color(0.3, 0.4, 0.2) },
      uGlowCol: { value: new THREE.Color(1.0, 0.78, 0.45) }, uVegAmt: { value: 0 }, uSnow: { value: 0 }, uGlow: { value: 0 }, uHazeK: { value: 0.5 },
    },
  });
}

// 명소 고르기 결과(sel, core/landmarks.js landmarkFor) -> 배경 손잡이. 부품이 없으면 null
export function buildBackdrop(sel, opts = {}) {
  if (!sel || !sel.parts || !sel.parts.length) return null;
  BASE.tilt = opts.tilt || 0;
  try { return makeBackdrop(sel); } finally { BASE.tilt = 0; }
}
function makeBackdrop(sel) {
  const t0 = performance.now();
  const G = new BackdropGeo(), seed = landmarkSeed(sel);
  // 담 너머 땅(원경 바닥): 물 부품이 덮지 않는 자리. 뒤로 갈수록 살짝 높아져 지평선이 생울타리 위로 보인다
  const hasWater = sel.parts.some((p) => p.type === 'water');
  const land = hasWater ? '#6f7a62' : '#66735a';
  G.shape([[-46, -0.5], [46, -0.5], [46, baseAt(-9)], [-46, baseAt(-9)]], -8.6, land, { grad: 0.8 });
  const g0 = new THREE.PlaneGeometry(92, 31, 1, 1); g0.rotateX(-Math.PI / 2); g0.translate(0, 0, -24.5);
  const pa = g0.attributes.position; for (let i = 0; i < pa.count; i++) pa.setY(i, baseAt(pa.getZ(i)) - 0.05);
  G.add(g0, land, { flat: true, veg: 0.5 });
  sel.parts.forEach((pt, i) => { const fn = PARTS[pt.type]; if (fn) fn(G, pt, makeRng(seed + ':' + i)); });
  const tris = G.tris;
  const mesh = new THREE.Mesh(G.build(), makeMaterial());
  mesh.name = 'backdrop'; mesh.castShadow = mesh.receiveShadow = false; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  const ms = performance.now() - t0;
  const handle = {
    mesh, sel, tris, ms, code: '', override: {},
    // fog: 장면 안개색(THREE.Color), sunDeg: 해 고도(도), nowMs: 시계
    setLight(fog, sunDeg, nowMs) {
      const ov = handle.override || {};
      const v = backdropVariant(handle.code, nowMs, ov.sunDeg != null ? ov.sunDeg : sunDeg);
      const tint = (ov.season && SEASON_TINT[ov.season]) || v.tint;
      const u = mesh.material.uniforms, L = v.light;
      handle.variant = { season: ov.season || v.season, weather: v.weather.kind, phase: L.phase };
      u.uLight.value.setRGB(0.2, 0.24, 0.38).lerp(_c.setRGB(1, 1, 1), L.day).lerp(_c.setRGB(1.05, 0.72, 0.52), L.gold * 0.55);
      u.uHaze.value.copy(fog);
      u.uHazeK.value = Math.min(0.9, (0.34 + 0.1 * (1 - L.day)) * v.weather.haze);
      u.uVeg.value.setRGB(tint.veg[0], tint.veg[1], tint.veg[2]); u.uVegAmt.value = tint.vegAmt; u.uSnow.value = tint.snow;
      u.uGlow.value = L.lights * 1.1;
    },
    dispose() { if (mesh.parent) mesh.parent.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); },
  };
  return handle;
}

// Scene3D 에 배경을 붙인다(이전 배경은 dispose). 환경 묶음(env)에 넣으므로 지역을 옮길 때 clearEnv 도 함께 정리한다
export function attachBackdrop(S, sel) {
  if (S.backdrop) { S.backdrop.dispose(); S.backdrop = null; }
  let bd = null;
  try { bd = buildBackdrop(sel, { tilt: S.backdropTilt }); } catch (e) { console.warn('명소 배경을 만들지 못해 기본 배경으로 보여요:', e && e.message); }
  if (!bd) return null;
  bd.code = S.dongCode || '';
  if (S.backdropOverride) bd.override = S.backdropOverride;
  S.env.add(bd.mesh); S.backdrop = bd;
  if (S.lastLight) bd.setLight(...S.lastLight);
  return bd;
}
