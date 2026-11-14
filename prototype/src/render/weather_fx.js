// 날씨 연출 (M3-e, 날씨_설계 3장): 하늘 섞기 값 + 비·눈 입자(그리기 1번씩, 위치는 셰이더) + 약한 천둥 번쩍임(D-98).
// createWeatherFx(scene, opt) → { set(wx), tick(dt, nowMs, region), cur, dispose() }. Scene3D 는 cur 를 읽어 빛을 섞는다.
import * as THREE from 'three';
import { makeRng } from '../core/util.js';

// 종류별 목표: g 회색 섞기, sun 해 빛 배수, haze 원경 배수, fog 안개 가까이(배수), br 밝기 가산(눈)
export const WX_FX = {
  clear:  { g: 0,    sun: 1,   haze: 1,    fog: 1,    br: 0,    rain: 0, snow: 0 },
  cloudy: { g: 0.35, sun: 0.6, haze: 1.35, fog: 1,    br: 0,    rain: 0, snow: 0 },
  fog:    { g: 0.5,  sun: 0.5, haze: 1.75, fog: 0.45, br: 0,    rain: 0, snow: 0 },
  rain:   { g: 0.35, sun: 0.3, haze: 1.5,  fog: 0.8,  br: 0,    rain: 1, snow: 0 },
  snow:   { g: 0.25, sun: 0.7, haze: 1.4,  fog: 0.8,  br: 0.06, rain: 0, snow: 1 },
  storm:  { g: 0.4,  sun: 0.28, haze: 1.6, fog: 0.7,  br: 0,    rain: 1.4, snow: 0 },
};
const FADE_S = 3; // 바뀔 때 섞는 시간
const BOX = { w: 7, d: 5, h: 4, cy: 2 };
export const FLASH = { max: 0.12, rise: 0.1, fall: 0.5, minGap: 45, slotMs: 30 * 60000, maxPerSlot: 20 };

// 칸 번호·지역으로 정하는 번쩍임 시각들(ms). 결정적 — 같은 칸이면 모두 같은 때. amt<0.3 이면 간격 2배
export function flashTimes(region, slot, amt) {
  const r = makeRng('flash:' + region + ':' + slot), out = [], k = amt < 0.3 ? 2 : 1;
  let t = r() * 90 * k;
  while (t * 1000 < FLASH.slotMs && out.length < FLASH.maxPerSlot) { out.push(slot * FLASH.slotMs + Math.round(t * 1000)); t += Math.max(FLASH.minGap, 60 + r() * 60) * k; }
  return out;
}
export function flashLevel(times, nowMs) { // 0~1: 올라감 rise 초, 내려감 fall 초
  for (const s of times) { const e = (nowMs - s) / 1000; if (e >= 0 && e < FLASH.rise + FLASH.fall) return e < FLASH.rise ? e / FLASH.rise : 1 - (e - FLASH.rise) / FLASH.fall; }
  return 0;
}

const RAIN_VS = `uniform float uT; uniform float uSlant; attribute vec3 aS; attribute float aEnd; varying float vA;
  void main(){ float H = ${BOX.h.toFixed(1)}; float y = mod(aS.y * H - uT * 7.5, H);
    vec3 p = vec3((aS.x - 0.5) * ${BOX.w.toFixed(1)}, y - ${(BOX.h - BOX.cy).toFixed(1)}, (aS.z - 0.5) * ${BOX.d.toFixed(1)});
    p.x += (y - H * 0.5) * uSlant; p += aEnd * vec3(uSlant, 1.0, 0.0) * 0.22; vA = 1.0 - aEnd * 0.8;
    gl_Position = projectionMatrix * viewMatrix * vec4(p + vec3(0.0, 0.0, 0.5), 1.0); }`;
const RAIN_FS = 'uniform vec3 uC; uniform float uO; varying float vA; void main(){ gl_FragColor = vec4(uC, uO * vA); }';
const SNOW_VS = `uniform float uT; uniform float uH; attribute vec3 aS; varying float vA;
  void main(){ float H = ${BOX.h.toFixed(1)}; float y = mod(aS.y * H - uT * (0.35 + aS.z * 0.4), H);
    vec3 p = vec3((aS.x - 0.5) * ${BOX.w.toFixed(1)} + sin(uT * 0.6 + aS.z * 20.0) * 0.18, y - ${(BOX.h - BOX.cy).toFixed(1)}, (aS.z - 0.5) * ${BOX.d.toFixed(1)});
    vec4 mv = viewMatrix * vec4(p + vec3(0.0, 0.0, 0.5), 1.0); gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.5, 0.035 * uH * (0.7 + aS.z * 0.6) / max(0.5, -mv.z)); vA = 1.0; }`;
const SNOW_FS = 'uniform vec3 uC; uniform float uO; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uC, uO * smoothstep(0.5, 0.2, d)); }';

export function createWeatherFx(scene, opt = {}) {
  const touch = opt.touch != null ? opt.touch : (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
  const reduced = opt.reduced != null ? opt.reduced : (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const flashOn = opt.flash !== false && !reduced;
  const cap = { rain: touch ? 500 : 1200, snow: touch ? 250 : 600 };
  const mk = (n, lines) => {
    const r = makeRng('wxfx:' + (lines ? 'r' : 's')), pos = new Float32Array(n * (lines ? 2 : 1) * 3), end = new Float32Array(n * (lines ? 2 : 1));
    for (let i = 0; i < n; i++) { const x = r(), y = r(), z = r(); for (let k = 0; k < (lines ? 2 : 1); k++) { const o = (i * (lines ? 2 : 1) + k); pos.set([x, y, z], o * 3); end[o] = k; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos.length), 3)); g.setAttribute('aS', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    return g;
  };
  const un = { uT: { value: 0 }, uC: { value: new THREE.Color(0xdfe8f2) }, uSlant: { value: 0.12 }, uH: { value: 800 } };
  const mat = (vs, fs) => new THREE.ShaderMaterial({ uniforms: { ...un, uO: { value: 0 } }, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, fog: false });
  const rain = new THREE.LineSegments(mk(cap.rain, true), mat(RAIN_VS, RAIN_FS));
  const snow = new THREE.Points(mk(cap.snow, false), mat(SNOW_VS, SNOW_FS));
  for (const o of [rain, snow]) { o.frustumCulled = false; o.visible = false; o.renderOrder = 20; scene.add(o); }
  const slow = reduced ? 0.5 : 1, pk = reduced ? 0.3 : 1;
  const cur = { ...WX_FX.clear, flash: 0, kind: 'clear' };
  let tgt = WX_FX.clear, amt = 0, kind = 'clear', t = 0, dirty = false, slotKey = '', times = [];
  const NUM = ['g', 'sun', 'haze', 'fog', 'br', 'rain', 'snow'];
  return {
    cur,
    get dirty() { return dirty; },
    set(wx) { // wx: { kind, amt } | null (null 이면 맑음)
      kind = wx && WX_FX[wx.kind] ? wx.kind : 'clear'; amt = wx ? Number(wx.amt) || 0 : 0; tgt = WX_FX[kind]; cur.kind = kind;
    },
    tick(dt, nowMs, region) {
      dirty = false; t += dt * slow;
      const k = Math.min(1, dt / FADE_S * 1.2), before = NUM.map((n) => cur[n]);
      for (const n of NUM) { cur[n] += (tgt[n] - cur[n]) * k; if (Math.abs(tgt[n] - cur[n]) < 0.002) cur[n] = tgt[n]; }
      if (NUM.some((n, i) => before[i] !== cur[n])) dirty = true;
      // 번쩍임: 천둥 종류일 때만. 탭 숨김·reduced-motion·flash=0 이면 끈다
      let f = 0;
      if (flashOn && kind === 'storm' && !(typeof document !== 'undefined' && document.hidden)) {
        const slot = Math.floor(nowMs / FLASH.slotMs), key = region + ':' + slot + ':' + (amt < 0.3);
        if (key !== slotKey) { slotKey = key; times = flashTimes(region, slot, amt); }
        f = flashLevel(times, nowMs);
      }
      if (f !== cur.flash) { cur.flash = f; dirty = true; }
      const nr = Math.round(cap.rain * Math.max(0.3, amt) * pk * Math.min(1, cur.rain)), ns = Math.round(cap.snow * Math.max(0.3, amt) * pk * Math.min(1, cur.snow));
      rain.visible = cur.rain > 0.01 && nr > 0; snow.visible = cur.snow > 0.01 && ns > 0;
      rain.geometry.setDrawRange(0, nr * 2); snow.geometry.setDrawRange(0, ns);
      un.uT.value = t; if (opt.height) un.uH.value = opt.height();
      rain.material.uniforms.uO.value = Math.min(1, cur.rain) * 0.4; snow.material.uniforms.uO.value = Math.min(1, cur.snow) * 0.85;
      if (opt.tint) un.uC.value.copy(opt.tint());
      return dirty;
    },
    dispose() { for (const o of [rain, snow]) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); } },
  };
}
