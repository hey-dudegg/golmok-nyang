// 골목 장면: 렌더러·카메라·빛·배경(골목·시장·공원)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { sunPosition } from '../core/time.js';
import { TAU, clamp, lerp, makeRng, smooth } from '../core/util.js';
import { LIGHT } from './shaders.js';
import { attachBackdrop } from './backdrop.js';
import { VIEW_MODES, buildAlley, buildMarket, buildPark, canvasTex, speckle } from './scene_themes.js';

// ───────────────────────── 골목 장면 ─────────────────────────


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
    this.controls.minDistance = 0.55; this.controls.maxDistance = 10.5; // D-42: 원경과 전경을 함께 보게 늘림
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
  build(theme, dong, seed, landmark) {
    this.clearEnv(); this.backdrop = null;
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

    if (theme === 'alley') buildAlley(this, E, r, dong, std, box, cyl);
    else if (theme === 'market') buildMarket(this, E, r, dong, std, box, cyl);
    else buildPark(this, E, r, dong, std, box, cyl);
    this.dongCode = dong.c; this.backdropTilt = (this.view || VIEW_MODES.B).tilt[theme] || 0;
    this.setBackdrop(landmark); // 명소 원경 (R-17): 테마(바닥·담) 위에 얹는다. 설계 17장 자리
  }
  // 명소 배경만 바꾼다(지역 장면은 그대로). sel: core/landmarks.js landmarkFor 결과, 없으면 배경 없음(기본 테마)
  setBackdrop(sel) { return attachBackdrop(this, sel); }
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
    this.lastLight = [fog, deg, date.getTime()];
    if (this.backdrop) this.backdrop.setLight(fog, deg, date.getTime()); // 원경 색조만 갱신(지오메트리는 그대로)
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
