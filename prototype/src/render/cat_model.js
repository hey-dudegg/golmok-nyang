// 고양이 3D: 뼈대·자세 적용·털 지오메트리 병합·CatView (D-02)
import * as THREE from 'three';
import { TAU, clamp, damp, lerp, smooth } from '../core/util.js';
import { makeEyeMaterial, makeFurMaterial, makeSkinMaterial } from './shaders.js';

// M1-14: 터치 기기(폰)는 털 격자 밀도를 0.8배로 낮춰 가닥이 화소보다 작아져 생기는 지지직을 줄인다(근접 -13%, 중간 -16%, 외형 거의 같음).
// ?fur=old 면 전 기기 구 밀도(비교용), ?fur=low 면 PC도 낮은 밀도. 실기 비교 결정 후 스위치 삭제.
const FUR_DENSITY_K = (() => {
  const q = globalThis.location ? location.search : '';
  if (/[?&]fur=old/.test(q)) return 1;
  if (/[?&]fur=low/.test(q)) return 0.8;
  return globalThis.matchMedia && matchMedia('(pointer: coarse)').matches ? 0.8 : 1;
})();

// ───────────────────────── cat model (rig + merged fur geometry) ─────────────────────────
const PART = { hips: 0, chest: 1, neck: 2, head: 3, earL: 4, earR: 5, shL: 6, elL: 7, shR: 8, elR: 9, hipL: 10, knL: 11, hipR: 12, knR: 13, t0: 14 };
const TAIL_SEGS = 8;

// 표준(서 있는) 자세
export function standPose(dim) {
  return {
    h: dim.H, hp: 0, hr: 0, hy: 0, cp: 0, cy: 0, cr: 0, np: -0.05, ny: 0, hdp: 0.05, hdy: 0, hdr: 0,
    eL: 0, eR: 0, fls: 0, fle: 0, frs: 0, fre: 0, fsp: 0,
    hls: -0.28, hlk: 0.5, hrs: -0.28, hrk: 0.5, hsp: 0,
    tb: 0.55, tc: 0.12, ts: 0, tcs: 0, tw: 0.12, twf: 1.0,
    eye: 1, pupil: 0.55, mouth: 0, puff: 0, lift: 0,
  };
}

export function catDims(g) {
  const gr = g.growth; // 0 아기 → 1 성체
  const s = lerp(0.42, 1.0, Math.pow(gr, 0.8));
  const head = lerp(1.3, 1.0, gr) * g.body.headSize * 1.34;
  const leg = lerp(0.78, 1.0, gr) * g.body.legLen;
  const chub = g.body.chub * lerp(1.06, 1.0, gr);
  return {
    scale: s, head, leg, chub,
    ear: lerp(1.12, 1.0, gr) * g.body.earSize,
    tail: lerp(0.5, 1.0, gr) * g.body.tailLen,
    eye: lerp(1.2, 1.0, gr),
    face: g.body.faceWidth,
    fluff: lerp(1.3, 1.0, gr),
    H: 0.196 * leg + 0.024,
    lu: 0.092 * leg, ll: 0.086 * leg, hu: 0.085 * leg, hl: 0.104 * leg,
    seg: 0.034 * lerp(0.5, 1.0, gr) * g.body.tailLen / Math.max(0.5, lerp(0.5, 1.0, gr)),
  };
}

export function buildRig(dim) {
  const n = {};
  const mk = (name, parent, x, y, z) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); (parent || n.root).add(o); n[name] = o; return o; };
  n.root = new THREE.Object3D();
  mk('hips', null, 0, dim.H, -0.055);
  mk('chest', n.hips, 0, 0.006, 0.078);
  mk('neck', n.chest, 0, 0.04, 0.112);
  mk('head', n.neck, 0, 0.036, 0.046);
  n.head.scale.setScalar(dim.head);
  mk('earL', n.head, 0.044 * dim.face, 0.044, -0.01);
  mk('earR', n.head, -0.044 * dim.face, 0.044, -0.01);
  mk('shL', n.chest, 0.05 * dim.chub, -0.035, 0.065);
  mk('elL', n.shL, 0, -dim.lu, 0);
  mk('shR', n.chest, -0.05 * dim.chub, -0.035, 0.065);
  mk('elR', n.shR, 0, -dim.lu, 0);
  mk('hipL', n.hips, 0.048 * dim.chub, -0.025, -0.06);
  mk('knL', n.hipL, 0, -dim.hu, 0.03);
  mk('hipR', n.hips, -0.048 * dim.chub, -0.025, -0.06);
  mk('knR', n.hipR, 0, -dim.hu, 0.03);
  let prev = n.hips;
  for (let i = 0; i < TAIL_SEGS; i++) { mk('t' + i, prev, 0, i === 0 ? 0.04 : 0, i === 0 ? -0.15 : -dim.seg); prev = n['t' + i]; }
  n.list = ['hips', 'chest', 'neck', 'head', 'earL', 'earR', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'hipR', 'knR', ...Array.from({ length: TAIL_SEGS }, (_, i) => 't' + i)].map((k) => n[k]);
  return n;
}

export function applyPose(n, P, dim, t) {
  n.root.position.y = P.lift;
  n.hips.position.y = P.h;
  n.hips.rotation.set(P.hp, P.hy, P.hr, 'YXZ');
  n.chest.rotation.set(P.cp, P.cy, P.cr, 'YXZ');
  n.neck.rotation.set(P.np, P.ny * 0.4, 0, 'YXZ');
  n.head.rotation.set(P.hdp, P.hdy + P.ny * 0.6, P.hdr, 'YXZ');
  // 귀: 0=쫑긋, 1=납작(마징가 귀)
  n.earL.rotation.set(-0.12 - P.eL * 0.9, 0.25 + P.eL * 0.5, -0.32 - P.eL * 0.7, 'YXZ');
  n.earR.rotation.set(-0.12 - P.eR * 0.9, -0.25 - P.eR * 0.5, 0.32 + P.eR * 0.7, 'YXZ');
  n.shL.rotation.set(P.fls, 0, -P.fsp, 'XYZ'); n.elL.rotation.set(P.fle, 0, 0);
  n.shR.rotation.set(P.frs, 0, P.fsp, 'XYZ'); n.elR.rotation.set(P.fre, 0, 0);
  n.hipL.rotation.set(P.hls, 0, -P.hsp, 'XYZ'); n.knL.rotation.set(P.hlk, 0, 0);
  n.hipR.rotation.set(P.hrs, 0, P.hsp, 'XYZ'); n.knR.rotation.set(P.hrk, 0, 0);
  for (let i = 0; i < TAIL_SEGS; i++) {
    const k = i / (TAIL_SEGS - 1);
    const wave = Math.sin(t * P.twf * TAU - i * 0.55) * P.tw * (0.3 + k);
    const o = n['t' + i];
    if (i === 0) o.rotation.set(P.tb, P.ts + wave * 0.5, 0, 'YXZ');
    else o.rotation.set(P.tc, P.tcs + wave * 0.35, 0, 'YXZ');
  }
}

// ── 지오메트리 조각 ──
function ellipsoid(rx, ry, rz, ws, hs) { const big = Math.max(rx, ry, rz) > 0.03; ws = ws || (big ? 24 : 14); hs = hs || (big ? 16 : 10); const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); return g; }
function capsule(r, len, rs = 14) { return new THREE.CapsuleGeometry(r, len, 5, rs); }

const EAR_CUT = 0.3; // 중성화 표식: 왼쪽 귀 끝 30%를 수평으로 자른다
function buildCatGeometry(g, dim, rig) {
  // 서 있는 자세로 rest 행렬 계산
  applyPose(rig, standPose(dim), dim, 0);
  rig.root.updateMatrixWorld(true);
  const restM = rig.list.map((o) => o.matrixWorld.clone());
  const pieces = [];
  const add = (part, geo, mat, opt) => { if (mat) geo.applyMatrix4(mat); pieces.push({ part, geo, ...opt }); };
  const M = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  const c = dim.chub, fl = g.furLen * dim.fluff;
  const tabbyBody = (p) => [p.z * 1.0, 1];

  // 몸통
  add(PART.hips, ellipsoid(0.084 * c, 0.092 * Math.sqrt(c), 0.13), M(0, 0.0, -0.02), { blend: { c: [0, 0, 0], axis: true, k: 0.55 },
    fur: () => 1.0 * fl, comb: () => [0, -0.5, -1.5], tab: (p, n) => [p.z, clamp(0.35 + n.y * 1.4, 0, 1)],
  });
  // 수컷 땅콩(고환): 꼬리 밑 엉덩이 뒤 아래에 작은 한 쌍. 4개월 전엔 없고 4~10개월에 0.4배에서 1배로 자란다. 암컷은 없다.
  if (g.sex === 'm' && g.months >= 4) {
    const nk = lerp(0.4, 1, clamp((g.months - 4) / 6, 0, 1)), sc = Math.sqrt(c);
    for (const sx of [1, -1]) add(PART.hips, ellipsoid(0.0155 * nk, 0.019 * nk, 0.0165 * nk, 14, 10), M(sx * 0.019, -0.052 * sc, -0.133), { fur: () => 0.45 * fl, comb: () => [0, -0.8, -0.3], tab: () => [0, 0], nut: true });
  }
  add(PART.chest, ellipsoid(0.086 * c, 0.096 * Math.sqrt(c), 0.115), M(0, -0.004, 0.025), { blend: { c: [0, -0.004, 0], axis: true, k: 0.55 },
    fur: (p, n) => (1.0 + clamp(-n.y, 0, 1) * 0.2 + clamp(n.z, 0, 1) * 0.15) * fl, comb: () => [0, -0.6, -1.4], tab: (p, n) => [p.z, clamp(0.35 + n.y * 1.4, 0, 1)],
  });
  // 목털(러프)
  add(PART.neck, ellipsoid(0.066 * c, 0.066, 0.062), M(0, -0.01, 0.0), {
    fur: (p, n) => (1.05 + clamp(n.z, 0, 1) * 0.25) * fl * (0.9 + g.fluff * 0.2), comb: () => [0, -1.0, -0.7], tab: (p) => [p.y * 1.3, 0.7],
  });
  // 머리
  const fw = dim.face;
  const eyeL = new THREE.Vector3(0.03 * fw, 0.004, 0.058), eyeR = new THREE.Vector3(-0.03 * fw, 0.004, 0.058);
  const headFur = (base) => (p, n) => {
    const de = Math.min(p.distanceTo(eyeL), p.distanceTo(eyeR));
    const front = clamp((n.z - 0.6) * 2.5, 0, 1);
    return base * fl * lerp(1, 0.75, front) * lerp(0.45, 1, smooth(clamp((de - 0.014) / 0.02, 0, 1)));
  };
  const headTab = (p, n) => {
    const top = clamp((n.y - 0.15) * 2.0, 0, 1) * clamp(n.z + 0.4, 0, 1);
    const side = clamp(Math.abs(n.x) - 0.6, 0, 1) * 1.2 * clamp(-n.z + 0.3, 0, 1);
    return [p.x * 1.6, clamp(top * 0.75 * clamp((n.z + 0.1) * 2.0, 0, 1) + side * 0.4, 0, 1)];
  };
  add(PART.head, ellipsoid(0.072 * fw, 0.066, 0.064), M(0, 0, 0), { blend: { c: [0, -0.008, 0], k: 0.8 }, fur: headFur(0.55), comb: (p, n) => [n.x * 0.4, 0.2, -1.2], tab: headTab, head: true });
  add(PART.head, ellipsoid(0.04, 0.034, 0.036), M(0.04 * fw, -0.02, 0.02), { blend: { c: [0, -0.008, 0], k: 0.8 }, fur: headFur(0.95 + g.fluff * 0.2), comb: () => [0.9, -0.8, -0.9], tab: headTab, head: true });
  add(PART.head, ellipsoid(0.04, 0.034, 0.036), M(-0.04 * fw, -0.02, 0.02), { blend: { c: [0, -0.008, 0], k: 0.8 }, fur: headFur(0.95 + g.fluff * 0.2), comb: () => [-0.9, -0.8, -0.9], tab: headTab, head: true });
  add(PART.head, ellipsoid(0.015, 0.012, 0.012), M(0.011, -0.018, 0.056), { blend: { c: [0, -0.008, 0], k: 0.65 }, fur: () => 0.3 * fl, comb: (p, n) => [n.x, -0.2, 0], tab: () => [0, 0], muzzle: true });
  add(PART.head, ellipsoid(0.015, 0.012, 0.012), M(-0.011, -0.018, 0.056), { blend: { c: [0, -0.008, 0], k: 0.65 }, fur: () => 0.3 * fl, comb: (p, n) => [n.x, -0.2, 0], tab: () => [0, 0], muzzle: true });
  add(PART.head, ellipsoid(0.012, 0.009, 0.01), M(0, -0.03, 0.048), { blend: { c: [0, -0.008, 0], k: 0.65 }, fur: () => 0.35 * fl, comb: () => [0, -0.6, 0], tab: () => [0, 0], muzzle: true });
  // 귀
  const earG = (cut) => { // cut: 끝을 수평으로 잘라 낸 비율(중성화 표식). 0이면 뾰족한 귀
    const e = cut ? new THREE.CylinderGeometry(0.028 * dim.ear * cut, 0.028 * dim.ear, 0.05 * dim.ear * (1 - cut), 18, 4) : new THREE.ConeGeometry(0.028 * dim.ear, 0.05 * dim.ear, 18, 4);
    if (cut) { e.translate(0, (-0.005 + 0.025 * (1 - cut)) * dim.ear, 0); } else e.translate(0, 0.02 * dim.ear, 0);
    e.scale(1, 1, 0.42); return e;
  };
  add(PART.earL, earG(g.tnr ? EAR_CUT : 0), null, { fur: (p, n) => 0.28 * fl * (n.z > 0.5 ? 0.3 : 1), comb: () => [0, 0.6, -0.2], tab: () => [0, 0], ear: true });
  add(PART.earR, earG(0), null, { fur: (p, n) => 0.28 * fl * (n.z > 0.5 ? 0.3 : 1), comb: () => [0, 0.6, -0.2], tab: () => [0, 0], ear: true });
  // 앞다리
  for (const [sh, el] of [[PART.shL, PART.elL], [PART.shR, PART.elR]]) {
    add(sh, capsule(0.027, dim.lu * 0.85), M(0, -dim.lu * 0.5, 0), { fur: () => 0.75 * fl, comb: () => [0, -0.8, -0.1], tab: (p) => [p.y * 1.2, 0.85], leg: true });
    add(el, capsule(0.021, dim.ll * 0.85), M(0, -dim.ll * 0.5, 0), { fur: () => 0.55 * fl, comb: () => [0, -0.8, 0], tab: (p) => [p.y * 1.2, 0.85], leg: true });
    add(el, ellipsoid(0.022, 0.014, 0.027), M(0, -dim.ll - 0.001, 0.008), { fur: () => 0.3 * fl, comb: () => [0, -0.3, 0.6], tab: () => [0, 0], paw: true });
  }
  // 뒷다리 (허벅지 + 정강이 + 발)
  for (const [hp, kn, sx] of [[PART.hipL, PART.knL, 1], [PART.hipR, PART.knR, -1]]) {
    add(hp, ellipsoid(0.044 * c, 0.07, 0.064), M(sx * 0.004, -0.03, 0.005), { fur: () => 0.9 * fl, comb: () => [0, -1.0, -0.9], tab: (p) => [p.y * 1.1, 0.9] });
    add(kn, capsule(0.02, dim.hl * 0.85), M(0, -dim.hl * 0.5, 0), { fur: () => 0.55 * fl, comb: () => [0, -0.7, -0.3], tab: (p) => [p.y * 1.2, 0.85], leg: true });
    add(kn, ellipsoid(0.021, 0.014, 0.03), M(0, -dim.hl - 0.002, 0.011), { fur: () => 0.38 * fl, comb: () => [0, -0.3, 0.6], tab: () => [0, 0], paw: true });
  }
  // 꼬리
  for (let i = 0; i < TAIL_SEGS; i++) {
    const k = i / (TAIL_SEGS - 1);
    const r = lerp(0.021, 0.015, k) * (i === TAIL_SEGS - 1 ? 0.9 : 1);
    add(PART.t0 + i, capsule(r, dim.seg * 0.9, 12), M(0, 0, -dim.seg * 0.5, Math.PI / 2, 0, 0), {
      fur: () => (1.2 + g.fluff * 0.3) * fl * (i === TAIL_SEGS - 1 ? 0.85 : 1), comb: () => [0, 0.05, -1.1], tab: (p) => [(i * dim.seg + (-p.z)) * 1.6, 1], tail: k,
    });
  }

  // ── 병합 + attribute 계산 ──
  let nv = 0, ni = 0;
  for (const pc of pieces) { nv += pc.geo.attributes.position.count; ni += pc.geo.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), rest = new Float32Array(nv * 3), restN = new Float32Array(nv * 3), comb = new Float32Array(nv * 3);
  const part = new Float32Array(nv), fur = new Float32Array(nv), wpot = new Float32Array(nv), tco = new Float32Array(nv * 2);
  const idx = new Uint32Array(ni);
  const P = new THREE.Vector3(), N = new THREE.Vector3(), R = new THREE.Vector3(), RN = new THREE.Vector3(), nm = new THREE.Matrix3();
  let vo = 0, io = 0;
  const hipsY = dim.H;
  for (const pc of pieces) {
    const gp = pc.geo.attributes.position, gn = pc.geo.attributes.normal, gi = pc.geo.index;
    const rm = restM[pc.part]; nm.getNormalMatrix(rm);
    for (let i = 0; i < gp.count; i++) {
      P.fromBufferAttribute(gp, i); N.fromBufferAttribute(gn, i).normalize();
      if (pc.blend) { const B = pc.blend; const dv = new THREE.Vector3(P.x - B.c[0], P.y - B.c[1], B.axis ? 0 : P.z - B.c[2]); if (dv.lengthSq() > 1e-10) N.lerp(dv.normalize(), B.k).normalize(); }
      R.copy(P).applyMatrix4(rm); RN.copy(N).applyMatrix3(nm).normalize();
      const o = vo + i;
      pos.set([P.x, P.y, P.z], o * 3); nor.set([N.x, N.y, N.z], o * 3);
      rest.set([R.x, R.y, R.z], o * 3); restN.set([RN.x, RN.y, RN.z], o * 3);
      part[o] = pc.part;
      fur[o] = pc.fur(P, N);
      const cb = pc.comb(P, N); comb.set(cb, o * 3);
      const tb = pc.tab(R, RN); tco[o * 2] = tb[0]; tco[o * 2 + 1] = tb[1];
      // 흰 털 잠재도: 배·가슴·턱·발이 높고 등·정수리가 낮음
      let w;
      if (pc.head) w = clamp(-RN.y * 0.9 + RN.z * 0.55 - 0.15 + (Math.abs(RN.x) < 0.35 && RN.z > 0.5 ? 0.25 - Math.abs(RN.x) * 0.5 : 0), 0, 1) * 0.92;
      else if (pc.muzzle) w = 0.97;
      else if (pc.ear) w = 0.02;
      else if (pc.paw) w = 0.99;
      else if (pc.nut) w = 0.12;
      else if (pc.leg) w = clamp(0.92 - (R.y / (hipsY * 0.75)) * 0.65, 0, 1) * (0.75 + 0.25 * clamp(RN.z, 0, 1));
      else if (pc.tail !== undefined) w = 0.05 + pc.tail * pc.tail * 0.35;
      else w = clamp(-RN.y * 0.85 + 0.42 + clamp(RN.z, 0, 1) * clamp(R.z - 0.02, 0, 0.2) * 3.0, 0, 1) * 0.97;
      wpot[o] = w;
    }
    for (let i = 0; i < gi.count; i++) idx[io + i] = gi.array[i] + vo;
    vo += gp.count; io += gi.count;
    pc.geo.dispose();
  }
  const base = new THREE.BufferGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('rest', new THREE.BufferAttribute(rest, 3));
  geo.setAttribute('restN', new THREE.BufferAttribute(restN, 3));
  geo.setAttribute('comb', new THREE.BufferAttribute(comb, 3));
  geo.setAttribute('part', new THREE.BufferAttribute(part, 1));
  geo.setAttribute('fur', new THREE.BufferAttribute(fur, 1));
  geo.setAttribute('wpot', new THREE.BufferAttribute(wpot, 1));
  geo.setAttribute('tcoord', new THREE.BufferAttribute(tco, 2));
  const MAXSH = 40;
  const sh = new Float32Array(MAXSH + 1); for (let i = 0; i <= MAXSH; i++) sh[i] = i;
  geo.setAttribute('shell', new THREE.InstancedBufferAttribute(sh, 1));
  base.dispose();
  return { geo, eyeL, eyeR };
}

// ── 고양이 한 마리 (3D) ──
export class CatView {
  constructor(genome, shells) {
    this.g = genome;
    this.dim = catDims(genome);
    this.rig = buildRig(this.dim);
    const { geo, eyeL, eyeR } = buildCatGeometry(genome, this.dim, this.rig);
    this.sp = { pos: geo.attributes.position.array, part: geo.attributes.part.array }; // 바닥 검사용 피부 정점 (전부)
    this.minPart = new Float32Array(24);
    this.mat = makeFurMaterial(genome, shells);
    const u = this.mat.uniforms;
    const C = genome.colors;
    u.colBase.value.set(C.base); u.colStripe.value.set(C.stripe); u.colPatch.value.set(C.patch); u.colWhite.value.set(C.white);
    u.stripeAmt.value = genome.stripeAmt; u.stripeFreq.value = genome.stripeFreq;
    u.patchAmt.value = genome.patchAmt; u.patchScale.value = genome.patchScale; u.mottle.value = genome.mottle;
    u.whiteAmt.value = genome.whiteAmt; u.whiteNoise.value = genome.whiteNoise; u.seed.value = genome.seedF;
    u.furLen.value = 0.026; u.tipLight.value = genome.tipLight;
    u.density.value = 620 * FUR_DENSITY_K / Math.sqrt(this.dim.scale);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.setShells(shells);
    this.root = new THREE.Group();
    this.root.add(this.rig.root);
    this.rig.root.add(this.mesh);
    this.rig.root.scale.setScalar(this.dim.scale);
    // 눈
    const er = 0.0192 * this.dim.eye;
    const eyeGeo = new THREE.SphereGeometry(er, 24, 16);
    this.eyeMat = makeEyeMaterial(genome.eye[0], genome.eye[1], genome.seedF);
    this.eyeMatR = genome.eye[2] ? makeEyeMaterial(genome.eye[2], genome.eye[3], genome.seedF + 1) : this.eyeMat;
    this.eyes = [];
    for (const [p, s, m] of [[eyeL, 1, this.eyeMat], [eyeR, -1, this.eyeMatR]]) {
      const e = new THREE.Mesh(eyeGeo, m);
      const ep = p.clone(); ep.z -= er * 0.42 - 0.002; ep.y += 0.002 * (this.dim.eye - 1);
      e.position.copy(ep); e.rotation.set(-0.02, s * 0.2, 0);
      e.scale.set(1.0, 0.94, 0.6);
      this.rig.head.add(e); this.eyes.push(e);
    }
    // 코
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.0068, 14, 10), makeSkinMaterial(genome.nose, 0.6));
    nose.scale.set(1.15, 0.72, 0.75); nose.position.set(0, -0.005, 0.0695);
    this.rig.head.add(nose); this.nose = nose;
    // 입 (하품·하악질 때만 보임)
    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 10), makeSkinMaterial('#5a1f26', 0.2));
    this.mouth.position.set(0, -0.028, 0.06); this.mouth.scale.set(1, 0.05, 0.7);
    this.rig.head.add(this.mouth);
    // 귓속
    const inner = makeSkinMaterial(genome.earInner, 0.1);
    for (const en of [this.rig.earL, this.rig.earR]) {
      const D = this.dim.ear, cutE = genome.tnr && en === this.rig.earL; // 잘린 귀는 귓속도 같은 높이에서 끝난다
      const ig = cutE ? new THREE.CylinderGeometry(0.0057 * D, 0.021 * D, 0.0315 * D, 14, 1, true, -Math.PI / 2, Math.PI) : new THREE.ConeGeometry(0.021 * D, 0.044 * D, 14, 1, true, -Math.PI / 2, Math.PI);
      ig.translate(0, cutE ? 0.01375 * D : 0.02 * D, 0); ig.scale(1, 1, 0.4);
      const im = new THREE.Mesh(ig, inner); im.position.z = 0.0062;
      en.add(im);
    }
    // 수염
    const wpts = [];
    for (const s of [1, -1]) for (let k = 0; k < 3; k++) {
      const y0 = -0.017 - k * 0.0045, x0 = s * 0.018;
      wpts.push(x0, y0, 0.07, s * 0.085, y0 + 0.012 - k * 0.014, 0.05 - k * 0.006);
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wpts, 3));
    this.whiskers = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0xf4f0ea, transparent: true, opacity: 0.75 }));
    this.rig.head.add(this.whiskers);
    // 그림자 (blob)
    this.shadow = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.004;
    this.shadow.scale.set(0.5 * this.dim.scale, 0.75 * this.dim.scale, 1);
    this.root.add(this.shadow);
    this.pose = standPose(this.dim);
    this.tmp = new THREE.Matrix4();
    this.inv = new THREE.Matrix4();
  }
  setShells(n) {
    this.mesh.geometry.instanceCount = n + 1;
    this.mat.uniforms.shellCount.value = n;
  }
  pawY(node, len, dz) {
    const v = this._pv || (this._pv = new THREE.Vector3());
    v.set(0, -len - 0.013, dz).applyMatrix4(node.matrixWorld).applyMatrix4(this.inv);
    return v.y;
  }
  // 현재 뼈대 자세에서 피부 정점의 가장 낮은 y (몸 좌표, 바닥 보정 전). 부위별 최저는 this.minPart
  lowest() {
    const B = this.mat.uniforms.bones.value, L = this.rig.list, mp = this.minPart;
    for (let i = 0; i < L.length; i++) { B[i].multiplyMatrices(this.inv, L[i].matrixWorld); mp[i] = 9; }
    const { pos, part } = this.sp;
    for (let i = 0, n = part.length; i < n; i++) {
      const e = B[part[i]].elements, y = e[1] * pos[i * 3] + e[5] * pos[i * 3 + 1] + e[9] * pos[i * 3 + 2] + e[13];
      if (y < mp[part[i]]) mp[part[i]] = y;
    }
    let m = 9; for (let i = 0; i < L.length; i++) if (mp[i] < m) m = mp[i];
    return m;
  }
  // 앉기: 엉덩이를 깔고 앉도록 몸통 기울기(hp)를 체형마다 맞춘다. 앞발이 바닥에 닿은 채 엉덩이 아래가 바닥을 뚫지 않는 가장 큰 기울기를 이분법으로 찾는다.
  solveSit(P, t) {
    const Q = this._Q || (this._Q = {}); Object.assign(Q, P);
    const R = this.rig, d = this.dim;
    const g = (hp) => {
      Q.hp = hp; Q.cp = P.cp - (hp - P.hp); // 가슴 이하는 세운 채로 두고 엉덩이만 눕힌다
      applyPose(R, Q, d, t); this.root.updateMatrixWorld(true); this.lowest();
      const f = Math.min(this.pawY(R.elL, d.ll, 0.008), this.pawY(R.elR, d.ll, 0.008));
      return this.minPart[0] - f; // 앞발을 바닥에 맞춘 뒤 엉덩이 최저 높이
    };
    let hp = P.hp;
    if (g(hp) < 0) { let lo = hp, hi = 0.2; for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (g(mid) < 0) lo = mid; else hi = mid; } hp = hi; }
    Q.hp = hp; Q.cp = P.cp - (hp - P.hp); applyPose(R, Q, d, t); this.root.updateMatrixWorld(true);
  }
  update(t, dt) {
    const P = this.pose;
    applyPose(this.rig, P, this.dim, t);
    this.root.updateMatrixWorld(true);
    this.inv.copy(this.rig.root.matrixWorld).invert();
    const mode = this.plant || 'all';
    if (mode === 'sit' && this.ground !== false) this.solveSit(P, t);
    let shift = 0, low = 0;
    const net = this.ground !== false; // 바닥 안전망 (시험에서 false로 끄고 전후 비교)
    if (net) low = this.lowest(); // 현재 자세에서 가장 낮은 피부 정점 (몸 기준 y)
    if (mode !== 'none') {
      const d = this.dim, R = this.rig;
      const f = Math.min(this.pawY(R.elL, d.ll, 0.008), this.pawY(R.elR, d.ll, 0.008));
      const hnd = Math.min(this.pawY(R.knL, d.hl, 0.011), this.pawY(R.knR, d.hl, 0.011));
      shift = mode === 'front' || mode === 'sit' ? -f : mode === 'hind' ? -hnd : mode === 'min' ? -Math.min(f, hnd) : -(f + hnd) / 2;
    } else if (net) shift = -GROUND_SINK - low; // 눕는 자세는 높이 상수 대신 가장 낮은 곳이 바닥에 닿게
    this.hOff = dt ? damp(this.hOff || 0, shift, 14, dt) : shift;
    // 안전망: 머리·귀·가슴·엉덩이·발·꼬리 어디도 바닥 아래로 내려가지 않게 올린다
    const extra = net ? Math.max(0, -GROUND_SINK - (low + this.hOff)) : 0;
    this.hFinal = this.hOff + extra;
    if (Math.abs(this.hFinal) > 1e-5) { R_shift(this.rig, this.hFinal); this.root.updateMatrixWorld(true); }
    const B = this.mat.uniforms.bones.value;
    for (let i = 0; i < this.rig.list.length; i++) B[i].multiplyMatrices(this.inv, this.rig.list[i].matrixWorld);
    this.mat.uniforms.furPuff.value = P.puff;
    const eo = clamp(P.eye, 0.04, 1);
    for (const e of this.eyes) e.scale.y = 0.94 * eo;
    this.eyeMat.uniforms.pupil.value = P.pupil; this.eyeMatR.uniforms.pupil.value = P.pupil;
    this.mouth.scale.y = 0.05 + P.mouth * 0.75;
    this.mouth.position.y = -0.028 - P.mouth * 0.006;
    // 그림자: 몸통 아래 + 높이에 따라 옅게
    this.rig.hips.getWorldPosition(this._v || (this._v = new THREE.Vector3()));
    this.root.worldToLocal(this._v);
    this.shadow.position.x = this._v.x * 0.6; this.shadow.position.z = this._v.z * 0.7 + 0.02 * this.dim.scale;
    const lift = P.lift;
    this.shadow.material.opacity = 0.55;
    const ss = this.dim.scale * (1 + Math.abs(P.hr) * 0.35) / (1 + lift * 4);
    this.shadow.scale.set(0.55 * ss, 0.95 * ss, 1);
  }
  dispose() {
    this.mesh.geometry.dispose(); this.mat.dispose(); this.eyeMat.dispose();
    this.root.traverse((o) => { if (o.geometry && o.geometry !== SHADOW_GEO) o.geometry.dispose(); });
  }
}

export const GROUND_SINK = 0.005; // 털이 눌리는 정도: 피부가 이만큼까지는 바닥에 파묻혀도 된다
function R_shift(rig, dy) { rig.hips.position.y += dy; }
const SHADOW_GEO = new THREE.CircleGeometry(0.5, 32);
const SHADOW_MAT = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.55 });
})();
