// 골목 장면: 렌더러·카메라·빛·배경(골목·시장·공원)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { sunPosition } from '../core/time.js';
import { TAU, clamp, lerp, makeRng, smooth } from '../core/util.js';
import { LIGHT } from './shaders.js';

// ───────────────────────── 골목 장면 ─────────────────────────


function canvasTex(w, hgt, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  const x = c.getContext('2d'); draw(x, w, hgt);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function speckle(x, w, hgt, n, colors, rmax, r) {
  for (let i = 0; i < n; i++) { x.fillStyle = colors[i % colors.length]; x.globalAlpha = 0.05 + r() * 0.12; const s = 1 + r() * rmax; x.fillRect(r() * w, r() * hgt, s, s); }
  x.globalAlpha = 1;
}

export class Scene3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 60);
    this.camera.position.set(0.0, 1.0, 3.9);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.28, -0.25);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.55; this.controls.maxDistance = 7.5;
    this.controls.maxPolarAngle = 1.5; this.controls.minPolarAngle = 0.35;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.6; this.controls.zoomSpeed = 0.8;
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 5; sc.bottom = -5; sc.near = 0.5; sc.far = 30;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd0e8, 0x5a5048, 0.9); this.scene.add(this.hemi);
    this.lamp = new THREE.PointLight(0xffb070, 0, 9, 1.6); this.scene.add(this.lamp);
    this.scene.fog = new THREE.Fog(0x9fb0c4, 9, 28);
    this.env = new THREE.Group(); this.scene.add(this.env);
    this.obstacles = [];
    this.sky = this.makeSky(); this.scene.add(this.sky);
  }
  makeSky() {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: LIGHT.sunDir, sunCol: { value: new THREE.Color() }, night: { value: 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vD;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        void main(){ float y = max(vD.y, 0.0); vec3 c = mix(hor, top, pow(y, 0.55));
          float s = max(dot(vD, sunDir), 0.0); c += sunCol * (pow(s, 12.0) * 0.35 + pow(s, 300.0) * 0.8);
          vec3 q = floor(vD * 220.0); float st = step(0.9975, h(q)) * night * smoothstep(0.05, 0.4, vD.y); c += vec3(st);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const s = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), m);
    return s;
  }
  resize(w, hgt, pr) {
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, hgt, false);
    this.camera.aspect = w / hgt; this.camera.updateProjectionMatrix();
  }
  clearEnv() {
    this.env.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); } });
    this.scene.remove(this.env); this.env = new THREE.Group(); this.scene.add(this.env); this.obstacles = [];
  }
  build(theme, dong, seed) {
    this.clearEnv();
    this.theme = theme;
    const r = makeRng(seed);
    const E = this.env;
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
    const box = (w, hh, d, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; E.add(m); return m; };
    const cyl = (rt, rb, hh, mat, x, y, z, seg = 20) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, hh, seg), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; E.add(m); return m; };
    // 바닥
    const grass = theme === 'park';
    const groundTex = canvasTex(1024, 1024, (x, w, hh) => {
      if (grass) {
        x.fillStyle = '#6f7d4a'; x.fillRect(0, 0, w, hh);
        speckle(x, w, hh, 26000, ['#5b6a3a', '#87935a', '#4d5a33', '#9a9a5a'], 3, r);
        x.fillStyle = '#b9a98a'; x.globalAlpha = 0.9; x.fillRect(0, hh * 0.62, w, hh * 0.16); x.globalAlpha = 1; // 흙길
        speckle(x, 0, 0, 0, ['#000'], 1, r);
      } else {
        x.fillStyle = '#8d8a85'; x.fillRect(0, 0, w, hh);
        speckle(x, w, hh, 30000, ['#6e6b67', '#a6a39e', '#7d7a74', '#5d5a56'], 3, r);
        x.strokeStyle = 'rgba(40,38,36,0.16)'; x.lineWidth = 1.5;
        for (let i = 0; i < 9; i++) { x.beginPath(); let px = r() * w, py = r() * hh; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 90; py += (r() - 0.5) * 90; x.lineTo(px, py); } x.stroke(); }
        for (let i = 0; i < 5; i++) { const cx = r() * w, cy = r() * hh; for (let k = 0; k < 14; k++) { x.fillStyle = 'rgba(55,52,50,0.035)'; x.beginPath(); x.ellipse(cx + (r() - 0.5) * 50, cy + (r() - 0.5) * 30, 10 + r() * 30, 6 + r() * 18, r() * 3, 0, TAU); x.fill(); } }
      }
    }, [3, 2]);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), std({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; E.add(ground);
    // 은행잎 (10~11월)
    const month = new Date().getMonth();
    const leafN = month >= 9 && month <= 10 ? 260 : month === 8 ? 60 : 20;
    const leafGeo = new THREE.CircleGeometry(0.035, 6, 0, Math.PI * 0.9);
    const leaves = new THREE.InstancedMesh(leafGeo, std({ color: 0xffffff, side: THREE.DoubleSide }), leafN);
    const lm = new THREE.Matrix4(), lq = new THREE.Quaternion(), lc = new THREE.Color();
    for (let i = 0; i < leafN; i++) {
      const lx = r.range(-4.5, 4.5), lz = r.range(-1.8, 2.5);
      lq.setFromEuler(new THREE.Euler(-Math.PI / 2 + r.range(-0.2, 0.2), 0, r() * TAU));
      lm.compose(new THREE.Vector3(lx, 0.003 + i * 0.00001, lz), lq, new THREE.Vector3(1, 1, 1).multiplyScalar(r.range(0.7, 1.2)));
      leaves.setMatrixAt(i, lm);
      leaves.setColorAt(i, lc.set(r.pick(['#e8b931', '#f0c94a', '#d9a21f', '#c98a2a', '#e6c25a'])));
    }
    leaves.receiveShadow = true; E.add(leaves);

    if (theme === 'alley') this.buildAlley(E, r, dong, std, box, cyl);
    else if (theme === 'market') this.buildMarket(E, r, dong, std, box, cyl);
    else this.buildPark(E, r, dong, std, box, cyl);
  }
  wallTex(r, dong, kind) {
    return canvasTex(2048, 512, (x, w, hh) => {
      const ts = w / 12; // 1m 당 픽셀 (벽 12m)
      if (kind === 'alley') {
        const segs = [];
        let px = 0;
        while (px < w) { const sw = ts * r.range(1.6, 3.4); segs.push([px, Math.min(sw, w - px), r.pick(['plaster', 'brick', 'tile', 'plaster'])]); px += sw; }
        for (const [sx, sw, k] of segs) {
          if (k === 'brick') {
            x.fillStyle = '#9b4e37'; x.fillRect(sx, 0, sw, hh);
            const bw = ts * 0.21, bh = ts * 0.065;
            for (let y = 0, row = 0; y < hh; y += bh, row++) for (let bx = sx - (row % 2) * bw / 2; bx < sx + sw; bx += bw) {
              x.fillStyle = `hsl(${12 + r() * 10},${38 + r() * 14}%,${30 + r() * 12}%)`; x.fillRect(Math.max(bx, sx) + 1, y + 1, Math.min(bw - 2, sx + sw - bx), bh - 2);
            }
          } else if (k === 'tile') {
            x.fillStyle = '#d9cdb8'; x.fillRect(sx, 0, sw, hh);
            const tw = ts * 0.1;
            for (let y = 0; y < hh; y += tw * 0.5) for (let bx = sx; bx < sx + sw; bx += tw) { x.fillStyle = `hsl(${30 + r() * 12},${18 + r() * 8}%,${72 + r() * 10}%)`; x.fillRect(bx + 1, y + 1, Math.min(tw - 2, sx + sw - bx - 1), tw * 0.5 - 2); }
          } else {
            x.fillStyle = r.pick(['#d9d1c1', '#e2d8c6', '#cfd3cb', '#e3d2bd', '#d6c9b9']); x.fillRect(sx, 0, sw, hh);
            speckle(x, 0, 0, 0, ['#000'], 1, r);
            for (let i = 0; i < 1800; i++) { x.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'; x.fillRect(sx + r() * sw, r() * hh, 2, 2); }
          }
          // 빗물 얼룩
          const grd = x.createLinearGradient(0, 0, 0, hh); grd.addColorStop(0, 'rgba(40,40,30,0.18)'); grd.addColorStop(0.25, 'rgba(40,40,30,0)'); grd.addColorStop(0.85, 'rgba(40,50,30,0)'); grd.addColorStop(1, 'rgba(50,60,35,0.35)');
          x.fillStyle = grd; x.fillRect(sx, 0, sw, hh);
          x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(sx + sw - 2, 0, 2, hh);
        }
        // 담장 위 갓돌
        x.fillStyle = '#8f8a82'; x.fillRect(0, 0, w, 10);
      } else if (kind === 'market') {
        x.fillStyle = '#c2b8a6'; x.fillRect(0, 0, w, hh);
        for (let i = 0; i < 2000; i++) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(r() * w, r() * hh, 2, 2); }
        // 셔터
        for (let i = 0; i < 5; i++) {
          const sx = i * w / 5 + ts * 0.2, sw = w / 5 - ts * 0.4;
          x.fillStyle = '#3c3a38'; x.fillRect(sx, hh * 0.32, sw, hh * 0.68);
          x.fillStyle = r() < 0.5 ? '#a9aeb2' : '#8f969c'; x.fillRect(sx + 4, hh * 0.32 + 4, sw - 8, hh * 0.68);
          for (let y = hh * 0.32; y < hh; y += 9) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(sx + 4, y, sw - 8, 2); }
        }
      } else {
        x.fillStyle = '#4f6a3a'; x.fillRect(0, 0, w, hh);
      }
    });
  }
  addressPlate(E, dong, x, y, z) {
    // 파란 도로명주소판 느낌의 동네 표지
    const t = canvasTex(512, 160, (c, w, hh) => {
      c.fillStyle = '#1f3d78'; c.beginPath(); c.roundRect(0, 0, w, hh, 18); c.fill();
      c.strokeStyle = '#e9eef7'; c.lineWidth = 5; c.beginPath(); c.roundRect(10, 10, w - 20, hh - 20, 12); c.stroke();
      c.fillStyle = '#fff'; c.font = '600 64px "Noto Sans KR","Apple SD Gothic Neo",sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'center';
      c.fillText(dong.n, w / 2, hh * 0.44);
      c.font = '400 26px "Noto Sans KR",sans-serif'; c.fillStyle = '#c9d6ee'; c.fillText((dong.sgg || dong.sido) + ' · ' + dong.c, w / 2, hh * 0.8);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.194), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
    m.position.set(x, y, z); E.add(m);
  }
  buildAlley(E, r, dong, std, box, cyl) {
    const wall = box(12, 2.1, 0.25, std({ map: this.wallTex(r, dong, 'alley') }), 0, 1.05, -2.0);
    this.obstacles.push({ x: 0, z: -2.0, wall: true });
    // 집 (담 뒤로 보이는 2층 다세대 느낌)
    const houseCols = ['#d7c3a8', '#c7b39b', '#cfc9bf', '#b9a58e'];
    for (let i = -2; i <= 2; i++) {
      const hw = r.range(2.2, 2.8), hh = r.range(3.2, 4.6);
      box(hw, hh, 2.5, std({ color: r.pick(houseCols) }), i * 2.6 + r.range(-0.3, 0.3), hh / 2, -3.6);
      // 창문
      for (let k = 0; k < 2; k++) box(0.7, 0.55, 0.05, std({ color: '#2b3540', roughness: 0.3, metalness: 0.2 }), i * 2.6 + (k ? 0.55 : -0.55), hh - 0.9, -2.33);
    }
    // 파란 철대문
    const gx = r.pick([-1.6, 1.2, 2.2]);
    const gateTex = canvasTex(256, 400, (x, w, hh) => {
      x.fillStyle = '#2d5d9a'; x.fillRect(0, 0, w, hh);
      x.strokeStyle = '#1f4677'; x.lineWidth = 6; x.strokeRect(6, 6, w - 12, hh - 12); x.beginPath(); x.moveTo(w / 2, 6); x.lineTo(w / 2, hh - 6); x.stroke();
      for (const px of [16, w / 2 + 10]) { x.strokeStyle = '#3a6fb0'; x.lineWidth = 3; x.strokeRect(px, 22, w / 2 - 26, hh * 0.32); x.strokeRect(px, hh * 0.42, w / 2 - 26, hh * 0.5); }
      x.fillStyle = '#c9a54a'; x.fillRect(w / 2 - 22, hh * 0.5, 8, 26);
      for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${120 + Math.random() * 60},${60 + Math.random() * 30},30,${0.12 + Math.random() * 0.2})`; x.fillRect(Math.random() * w, hh * (0.75 + Math.random() * 0.25), 2 + Math.random() * 4, 2 + Math.random() * 3); }
    });
    box(1.15, 1.85, 0.06, std({ map: gateTex, roughness: 0.55, metalness: 0.25 }), gx, 0.93, -1.86);
    box(1.32, 0.12, 0.2, std({ color: '#7a756e' }), gx, 1.92, -1.87);
    box(0.08, 1.95, 0.18, std({ color: '#7a756e' }), gx - 0.62, 0.97, -1.87); box(0.08, 1.95, 0.18, std({ color: '#7a756e' }), gx + 0.62, 0.97, -1.87);
    this.addressPlate(E, dong, gx - 1.05, 1.45, -1.865);
    // 노란 가스관 + 계량기, 주차금지 표지
    const gasY = 1.62, gasM = std({ color: '#e2b322', roughness: 0.5, metalness: 0.2 });
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 7.5, 10), gasM); pipe.rotation.z = Math.PI / 2; pipe.position.set(-1.6, gasY, -1.84); pipe.castShadow = true; E.add(pipe);
    const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.75, 10), gasM); drop.position.set(-0.3, gasY - 0.37, -1.84); E.add(drop);
    box(0.2, 0.26, 0.13, std({ color: '#d8d6d0', roughness: 0.6 }), -0.3, gasY - 0.85, -1.81);
    const signT = canvasTex(256, 192, (x, w, hh) => { x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, w, hh); x.strokeStyle = '#c3302a'; x.lineWidth = 10; x.strokeRect(8, 8, w - 16, hh - 16); x.fillStyle = '#c3302a'; x.font = '700 64px "Noto Sans KR",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('주차금지', w / 2, hh * 0.42); x.font = '500 22px "Noto Sans KR",sans-serif'; x.fillStyle = '#333'; x.fillText('차고 앞 · 고양이 낮잠 구역', w / 2, hh * 0.76); });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.345), std({ map: signT, roughness: 0.7 })); sign.position.set(gx > 0 ? 0.55 : -0.2, 1.05, -1.865); E.add(sign);
    // 스티로폼 화분들 (파·고추)
    const sx0 = gx > 0 ? -2.4 : 0.6;
    for (let i = 0; i < 4; i++) {
      const bx = sx0 + i * 0.5 + r.range(-0.05, 0.05);
      box(0.44, 0.26, 0.34, std({ color: '#eceae4', roughness: 1 }), bx, 0.13, -1.66);
      const green = std({ color: r.pick(['#4f7a32', '#5d8a3a', '#3f6a2a']) });
      for (let k = 0; k < 7; k++) { const lf = new THREE.Mesh(new THREE.ConeGeometry(0.02, r.range(0.18, 0.38), 5), green); lf.position.set(bx + r.range(-0.15, 0.15), 0.3 + 0.09, -1.66 + r.range(-0.1, 0.1)); lf.rotation.set(r.range(-0.3, 0.3), 0, r.range(-0.3, 0.3)); lf.castShadow = true; E.add(lf); }
      if (r.chance(0.5)) for (let k = 0; k < 4; k++) { const pp = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), std({ color: '#c62a1e', roughness: 0.4 })); pp.position.set(bx + r.range(-0.12, 0.12), 0.36, -1.62 + r.range(-0.08, 0.08)); E.add(pp); }
      this.obstacles.push({ x: bx, z: -1.66, r: 0.3 });
    }
    // 빨간 고무대야
    const tx = sx0 + 2.3;
    const tub = cyl(0.36, 0.28, 0.24, std({ color: '#c8322b', roughness: 0.6 }), tx, 0.12, -1.45, 28);
    this.obstacles.push({ x: tx, z: -1.45, r: 0.45 });
    // 전봇대 + 가로등
    const px = -3.3;
    cyl(0.13, 0.15, 6.5, std({ color: '#9a978f' }), px, 3.25, -1.55);
    box(0.06, 0.06, 1.0, std({ color: '#5d5b57', metalness: 0.4 }), px, 3.0, -1.1);
    const lampHead = box(0.28, 0.07, 0.18, std({ color: '#3d3c3a', metalness: 0.3 }), px, 2.95, -0.62);
    this.lampBulb = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), new THREE.MeshBasicMaterial({ color: 0xfff0d0 }));
    this.lampBulb.rotation.x = Math.PI / 2; this.lampBulb.position.set(px, 2.91, -0.62); E.add(this.lampBulb);
    this.lampAt = new THREE.Vector3(px, 2.85, -0.62);
    // 전선
    const wires = new THREE.BufferGeometry();
    const wp = []; for (let k = 0; k < 3; k++) { const y = 5.8 - k * 0.25; for (let i = 0; i < 20; i++) { const t0 = i / 20, t1 = (i + 1) / 20; const xx = (t) => lerp(px, 6, t), yy = (t) => y - Math.sin(t * Math.PI) * 0.5; wp.push(xx(t0), yy(t0), -1.55 - k * 0.1, xx(t1), yy(t1), -1.55 - k * 0.1); } }
    wires.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    E.add(new THREE.LineSegments(wires, new THREE.LineBasicMaterial({ color: 0x222222 })));
    this.obstacles.push({ x: px, z: -1.55, r: 0.3 });
    // 파란 플라스틱 의자
    const chx = gx > 0 ? -1.0 : 2.6;
    const chm = std({ color: '#2d7fc1', roughness: 0.5 });
    box(0.42, 0.04, 0.42, chm, chx, 0.44, -1.35, 0.3);
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) { const lg = box(0.035, 0.44, 0.035, chm, chx + dx * Math.cos(0.3) + dz * Math.sin(0.3), 0.22, -1.35 - dx * Math.sin(0.3) + dz * Math.cos(0.3)); }
    const bk = box(0.42, 0.4, 0.04, chm, chx - 0.2 * Math.sin(0.3), 0.66, -1.35 - 0.2 * Math.cos(0.3), 0.3);
    this.obstacles.push({ x: chx, z: -1.35, r: 0.35 });
    // 종이 상자
    const cbx = r.range(1.6, 2.6) * (gx > 0 ? -1 : 1) * 0.5 + 2.2;
    box(0.5, 0.32, 0.4, std({ color: '#b98d5c' }), 2.75, 0.16, -0.95, 0.4);
    this.obstacles.push({ x: 2.75, z: -0.95, r: 0.38 });
  }
  buildMarket(E, r, dong, std, box, cyl) {
    box(12, 2.6, 0.25, std({ map: this.wallTex(r, dong, 'market') }), 0, 1.3, -2.0);
    this.obstacles.push({ x: 0, z: -2.0, wall: true });
    box(12, 3, 2.5, std({ color: '#cbbfae' }), 0, 4.1, -3.2);
    // 줄무늬 차양 + 간판
    const stripes = (c1, c2) => canvasTex(256, 64, (x, w, hh) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? c1 : c2; x.fillRect(i * w / 8, 0, w / 8, hh); } });
    const names = ['상회', '수산', '청과', '방앗간', '떡집', '건어물'];
    for (let i = 0; i < 5; i++) {
      const sx = -4.8 + i * 2.4;
      const [c1, c2] = r.pick([['#d23c34', '#f2ede4'], ['#2f6db3', '#f2ede4'], ['#2f8a55', '#f2ede4'], ['#e0a12a', '#f2ede4']]);
      const aw = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 0.9), std({ map: stripes(c1, c2) }));
      aw.position.set(sx, 2.15, -1.5); aw.rotation.x = 0.28; aw.castShadow = true; E.add(aw);
      const sign = canvasTex(512, 96, (x, w, hh) => { x.fillStyle = '#f4efe2'; x.fillRect(0, 0, w, hh); x.fillStyle = c1; x.font = '700 58px "Noto Sans KR",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(dong.n.replace(/[0-9]+.*$/, '').slice(0, 3) + ' ' + names[i % names.length], w / 2, hh / 2 + 2); });
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.38), std({ map: sign }));
      sg.position.set(sx, 2.45, -1.86); E.add(sg);
      // 좌판 + 바구니
      if (i % 2 === 0) {
        box(1.4, 0.5, 0.6, std({ color: '#7a5a3a' }), sx, 0.25, -1.45);
        for (let k = 0; k < 5; k++) {
          const bc = r.pick(['#d94a2a', '#e8a12a', '#6aa13a', '#a83a5a', '#e6c84a']);
          const bk = cyl(0.12, 0.09, 0.08, std({ color: '#c8a46a' }), sx - 0.55 + k * 0.28, 0.54, -1.45, 14);
          for (let m = 0; m < 4; m++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), std({ color: bc, roughness: 0.5 })); f.position.set(sx - 0.55 + k * 0.28 + r.range(-0.05, 0.05), 0.6, -1.45 + r.range(-0.05, 0.05)); f.castShadow = true; E.add(f); }
        }
        this.obstacles.push({ x: sx - 0.4, z: -1.45, r: 0.45 }, { x: sx + 0.4, z: -1.45, r: 0.45 });
      } else {
        for (let k = 0; k < 3; k++) { const st = cyl(0.15, 0.15, 0.42, std({ color: r.pick(['#d23c34', '#2f6db3', '#e0a12a']), roughness: 0.5 }), sx - 0.4 + k * 0.4, 0.21, -1.3 + r.range(-0.1, 0.1), 16); this.obstacles.push({ x: sx - 0.4 + k * 0.4, z: -1.3, r: 0.22 }); }
      }
    }
    this.addressPlate(E, dong, 3.6, 1.0, -1.86);
    const px = -3.3;
    cyl(0.07, 0.08, 3.2, std({ color: '#55534f', metalness: 0.4 }), px, 1.6, -1.2);
    box(0.3, 0.08, 0.2, std({ color: '#3d3c3a' }), px, 3.2, -1.05);
    this.lampBulb = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.14), new THREE.MeshBasicMaterial({ color: 0xfff0d0 }));
    this.lampBulb.rotation.x = Math.PI / 2; this.lampBulb.position.set(px, 3.15, -1.05); E.add(this.lampBulb);
    this.lampAt = new THREE.Vector3(px, 3.0, -1.0);
    this.obstacles.push({ x: px, z: -1.2, r: 0.2 });
  }
  buildPark(E, r, dong, std, box, cyl) {
    // 생울타리 + 나무
    for (let i = -6; i <= 6; i++) { const hm = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), std({ color: r.pick(['#3f5a2e', '#4a6634', '#36502a']) })); hm.scale.set(1.2, 0.8, 0.8); hm.position.set(i * 0.95, 0.45, -2.1); hm.castShadow = hm.receiveShadow = true; E.add(hm); }
    this.obstacles.push({ x: 0, z: -2.0, wall: true });
    for (let i = 0; i < 6; i++) {
      const tx = -5 + i * 2 + r.range(-0.4, 0.4), tz = -3.2 + r.range(-0.5, 0.5);
      cyl(0.12, 0.17, 2.4, std({ color: '#5a4636' }), tx, 1.2, tz, 10);
      const fc = r.pick(['#e2b33a', '#d9822f', '#c9572c', '#e8c24e', '#8a9a3a']);
      for (let k = 0; k < 4; k++) { const fo = new THREE.Mesh(new THREE.IcosahedronGeometry(r.range(0.7, 1.0), 1), std({ color: fc, flatShading: true })); fo.position.set(tx + r.range(-0.5, 0.5), 2.7 + r.range(-0.3, 0.5), tz + r.range(-0.4, 0.4)); fo.castShadow = true; E.add(fo); }
    }
    // 벤치
    const wood = std({ color: '#8a5d3a' }), iron = std({ color: '#2e2e2e', metalness: 0.5, roughness: 0.5 });
    const bx = r.pick([-1.8, 1.6]);
    for (let k = 0; k < 4; k++) box(1.6, 0.03, 0.09, wood, bx, 0.45, -1.35 + k * 0.1);
    for (let k = 0; k < 3; k++) box(1.6, 0.09, 0.03, wood, bx, 0.62 + k * 0.12, -1.55);
    for (const dx of [-0.7, 0.7]) box(0.05, 0.45, 0.45, iron, bx + dx, 0.22, -1.3);
    this.obstacles.push({ x: bx - 0.5, z: -1.3, r: 0.35 }, { x: bx + 0.5, z: -1.3, r: 0.35 });
    this.addressPlate(E, dong, -bx * 0.8, 0.95, -1.62);
    box(0.06, 0.95, 0.06, std({ color: '#55534f' }), -bx * 0.8, 0.47, -1.68);
    // 가로등
    const px = -3.2;
    cyl(0.06, 0.08, 3.4, iron, px, 1.7, -1.0);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff0d0 }));
    globe.position.set(px, 3.5, -1.0); E.add(globe); this.lampBulb = globe;
    this.lampAt = new THREE.Vector3(px, 3.4, -1.0);
    this.obstacles.push({ x: px, z: -1.0, r: 0.2 });
  }
  // 실제 시각·위치에 맞춘 빛
  setTime(date, lat, lng) {
    const { alt, az } = sunPosition(date, lat, lng);
    const deg = alt * 180 / Math.PI;
    const day = smooth(clamp((deg + 4) / 14, 0, 1));
    const gold = clamp(1 - Math.abs(deg - 4) / 14, 0, 1) * day;
    this.isNight = deg < -3;
    this.dayAmt = day;
    // 고양이 무대가 남쪽(+z)을 보게: 태양 방위 → 장면 방향
    const sa = Math.max(alt, 0.12);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(sa), Math.sin(sa), Math.cos(az) * Math.cos(sa) * 0.6 + 0.45).normalize();
    if (deg < -3) dir.set(-0.35, 0.8, 0.45).normalize(); // 달빛
    const sunCol = new THREE.Color('#ffffff').lerp(new THREE.Color('#ffd2a0'), smooth(clamp(1 - (deg - 3) / 25, 0, 1)));
    const moon = new THREE.Color('#5d6f9a');
    const sc = sunCol.clone().multiplyScalar(lerp(0, 1.35, day)).add(moon.clone().multiplyScalar(0.28 * (1 - day)));
    const skyTop = new THREE.Color('#0c1630').lerp(new THREE.Color('#5f8fcf'), day);
    const hor = new THREE.Color('#1c2440').lerp(new THREE.Color('#b8cde0'), day).lerp(new THREE.Color('#f0b088'), gold * 0.7);
    this.sky.material.uniforms.top.value.copy(skyTop);
    this.sky.material.uniforms.hor.value.copy(hor);
    this.sky.material.uniforms.sunCol.value.copy(sunCol).multiplyScalar(day);
    this.sky.material.uniforms.night.value = 1 - day;
    LIGHT.sunDir.value.copy(dir);
    this.sun.position.copy(dir).multiplyScalar(14); this.sun.target.position.set(0, 0, -0.5);
    this.sun.color.copy(sunCol); this.sun.intensity = lerp(0.18, 2.2, day);
    if (deg < -3) this.sun.color.copy(moon);
    this.hemi.color.copy(new THREE.Color('#2a3558').lerp(new THREE.Color('#c4d6ee'), day));
    this.hemi.groundColor.copy(new THREE.Color('#151518').lerp(new THREE.Color('#6a5e52'), day));
    this.hemi.intensity = lerp(0.55, 1.0, day);
    LIGHT.sunCol.value.copy(sc);
    LIGHT.skyCol.value.copy(new THREE.Color('#1b2340').lerp(new THREE.Color('#8a9cb6'), day));
    LIGHT.gndCol.value.copy(new THREE.Color('#0d0d10').lerp(new THREE.Color('#4a423a'), day));
    const lampOn = 1 - smooth(clamp((deg + 2) / 8, 0, 1));
    this.lampOn = lampOn;
    LIGHT.lampOn.value = lampOn * 2.6;
    if (this.lampAt) { LIGHT.lampPos.value.copy(this.lampAt); this.lamp.position.copy(this.lampAt); }
    this.lamp.intensity = lampOn * 9;
    if (this.lampBulb) this.lampBulb.material.color.set(lampOn > 0.3 ? 0xffe2a8 : 0x9a9a92);
    const fog = hor.clone().lerp(skyTop, 0.2);
    this.scene.fog.color.copy(fog); LIGHT.fogCol.value.copy(fog);
    this.scene.background = fog;
    LIGHT.exposure.value = 1.0;
    this.renderer.toneMappingExposure = 1;
  }
  groundPick(ndcX, ndcY) {
    const rc = this._rc || (this._rc = new THREE.Raycaster());
    rc.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const t = -rc.ray.origin.y / rc.ray.direction.y;
    if (t < 0) return null;
    return rc.ray.origin.clone().addScaledVector(rc.ray.direction, t);
  }
}
