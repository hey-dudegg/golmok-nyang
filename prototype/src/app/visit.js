// App 의 놀러가기 부분 (M0-3, 설계 7장): 자리 비움·손님·만남·표지판·시선 선. main.js 가 App.prototype 에 붙인다
import * as THREE from 'three';
import { BOUNDS, STEP } from '../core/behavior.js';
import { clamp, makeRng } from '../core/util.js';
import { Clock } from '../state/clock.js';
import { CatView } from '../render/cat_model.js';
import { CatAgent } from '../sim/agent.js';
import { Encounter } from '../sim/encounter.js';
import { TRIP, Trips } from '../sim/trips.js';
import { renderRoster } from '../ui/card.js';
import { toast } from '../ui/dom.js';

export class AppVisit {
  // ── 놀러가기 (M0-3, 설계 7장): 자리 비움 · 손님 · 만남 ──
  resetVisit() { this.enc = null; this.away = null; this.forced = null; this.done = new Set(); this.hideSign(); this.clearGaze(); }
  // 지금 이 지역에서 일어나는 일: 어드민이 강제로 만든 것이 있으면 그것, 없으면 세계 시계 일정
  tripState(now) {
    const f = this.forced;
    if (f) {
      if (f.type === 'visit') return { away: null, host: f.trip };
      if (now < f.trip.t1) return { away: f.type === 'away' ? f.trip : null, host: null };
      this.forced = null;
    }
    return Trips.at(this.dong.c, now);
  }
  tripTick(now, init) {
    const m = this.mascot; if (!m || !this.dong) return;
    const st = this.tripState(now);
    if (st.away) {
      if (!this.away || this.away.id !== st.away.id) this.beginAway(st.away, now, init);
      else if (!m.hidden && (now - st.away.t0) / 1000 >= TRIP.WALKOUT) this.hideMascot();
    } else if (this.away) this.endAway(now);
    if (st.host && !this.enc && !this.done.has(st.host.id) && !m.hidden && now < st.host.t1 - 500) this.beginEnc(st.host, now);
  }
  beginAway(trip, now, instant) {
    const m = this.mascot; this.away = trip;
    if (this.enc) this.abortEnc();
    if (this.selected === m) this.select(null);
    if (instant || (now - trip.t0) / 1000 >= TRIP.WALKOUT) this.hideMascot();
    else { // 가장자리로 걸어 나간다
      m.ext = true; m.step = null; m.jump = null; m.lookAtYou = 0; m.lookAt = null; m.label = '인근 지역으로 놀러 가는 중';
      // 화면 중앙에서 출발해도 WALKOUT 안에 가장자리에 닿도록, 남은 시간으로 속도를 정한다(방향 전환·감속 여유 1.7초)
      const ex = m.x >= 0 ? BOUNDS.x1 - 0.03 : BOUNDS.x0 + 0.03, left = Math.max(1.5, TRIP.WALKOUT - Math.max(0, (now - trip.t0) / 1000) - 1.7);
      const sp = clamp(Math.abs(ex - m.x) / (left * 0.26 * (0.65 + 0.35 * m.scale)), 1.7, 3.2);
      m.steps = [STEP.walk(ex, m.z, sp, { timeout: 8 })];
    }
    this.refreshFab();
  }
  hideMascot() {
    const m = this.mascot; m.hidden = true; m.ext = true; m.v.root.visible = false;
    if (this.selected === m) this.select(null);
    this.showSign(); renderRoster(this); this.refreshFab();
    if (!this.camAnim) { // 표지판이 보이도록 기본 구도로 물러난다
      const cam = this.s.camera.position, s = this.sign.position, to = new THREE.Vector3(s.x * 0.5, 0.95, s.z + (innerWidth <= 720 ? 3.0 : 3.4));
      if (cam.distanceTo(to) > 0.3) this.camAnim = { from: cam.clone(), to, t: 0 };
    }
  }
  endAway(now) {
    const m = this.mascot, trip = this.away, was = m.hidden; this.away = null; this.hideSign();
    m.ext = false; m.hidden = false; m.v.root.visible = true; m.steps = []; m.step = null; m.move = null; m.arrived = true; m.jump = null;
    if (was) { // 화면 가장자리에서 걸어 들어온다
      const r = makeRng('ret:' + trip.id), side = r.chance(0.5) ? 1 : -1;
      m.x = side > 0 ? BOUNDS.x1 - 0.03 : BOUNDS.x0 + 0.03; m.z = r.range(-0.5, 0.5);
      m.yaw = m.yawTarget = Math.atan2(-m.x, -m.z * 0.2); m.setPose('stand'); Object.assign(m.P, m.T);
    }
    m.beginEntry(Clock.entryAt(m.cat, now).entry, true);
    renderRoster(this); this.refreshFab();
  }
  makeGuest(trip) {
    const cat = Trips.cat(trip.from, trip.t0); cat.geo = { lat: this.dong.lat, lng: this.dong.lng };
    const v = new CatView(cat.g, this.shells); this.s.scene.add(v.root);
    const a = new CatAgent(cat, v, this.world, makeRng(cat.id + ':g:' + trip.id));
    a.guest = true; a.ext = true; a.label = '손님 고양이';
    this.views.push(v); this.agents.push(a);
    return a;
  }
  beginEnc(trip, now) {
    const host = this.mascot, guest = this.makeGuest(trip), f = this.forced;
    const E = new Encounter(this, trip, host, guest, { manual: !!(f && f.type === 'visit' && f.step), stepMode: !!(f && f.step) });
    this.enc = E;
    const el = Math.min(E.dur, (now - trip.t0) / 1000);
    if (el > 0.05) E.ffTo(el); // 중간에 들어왔으면 그 지점부터
    renderRoster(this);
    if (innerWidth <= 720 && !this.selected) { // 휴대폰은 화면이 좁아서 두 마리가 보이게 조금 물러난다
      const cam = this.s.camera.position, T = this.s.controls.target, dir = cam.clone().sub(T), len = dir.length();
      if (len < 4.4) this.camAnim = { from: cam.clone(), to: T.clone().addScaledVector(dir.normalize(), 4.7), t: 0 };
    }
  }
  endEnc(E) {
    const host = E.host, guest = E.guest;
    host.enc = null; host.ext = false; host._ph = null; host.lookAt = null; host.steps = []; host.step = null; host.move = null; host.arrived = true;
    host.beginEntry(Clock.entryAt(host.cat, Date.now()).entry, true);
    this.removeAgent(guest);
    if (this.enc === E) this.enc = null;
    this.done.add(E.trip.id);
    if (this.forced && this.forced.type === 'visit' && this.forced.trip.id === E.trip.id) this.forced = null;
    this.clearGaze(); renderRoster(this);
  }
  abortEnc() { const E = this.enc; if (E) { E.done = true; this.endEnc(E); } }
  removeAgent(a) {
    if (this.selected === a) this.select(null);
    this.s.scene.remove(a.v.root); a.v.dispose();
    const vi = this.views.indexOf(a.v); if (vi >= 0) this.views.splice(vi, 1);
    const ai = this.agents.indexOf(a); if (ai >= 0) this.agents.splice(ai, 1);
    this.bubbles = this.bubbles.filter((b) => { if (b.a === a) { b.el.remove(); return false; } return true; });
  }
  // 어드민 시험: 지금 손님이 오게 / 지금 내 마스코트를 내보내기 / 바로 돌아오기
  forceVisit(from, kind, step) {
    if (from === this.dong.c) return toast('손님이 올 다른 지역을 골라 주세요');
    const now = Date.now();
    if (this.enc) this.abortEnc();
    this.forced = { type: 'visit', step: !!step, trip: Trips.make(from, this.dong.c, now, 90, kind, 'f' + now) };
    this.tripTick(now);
  }
  forceAway() {
    const now = Date.now(); if (this.enc) this.abortEnc();
    this.forced = { type: 'away', trip: Trips.make(this.dong.c, Trips.neighbors(this.dong.c)[0] || '11', now, 90, 'fight', 'f' + now) };
    this.tripTick(now);
  }
  returnNow() { const now = Date.now(); if (this.away) { this.forced = { type: 'none', trip: { t1: now + 120000 } }; this.tripTick(now); } }
  // 자리 비운 지역의 표지판 (행선지는 쓰지 않는다)
  makeSign() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 280; const x = c.getContext('2d');
    x.fillStyle = '#b98a55'; x.fillRect(0, 0, 512, 280);
    for (let i = 0; i < 9; i++) { x.fillStyle = i % 2 ? 'rgba(90,55,25,0.10)' : 'rgba(255,230,190,0.10)'; x.fillRect(0, i * 31, 512, 31); }
    x.strokeStyle = '#6b4a2b'; x.lineWidth = 14; x.strokeRect(7, 7, 498, 266);
    x.fillStyle = '#3a2410'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '700 62px "Gowun Batang","Noto Serif KR",serif'; x.fillText('인근 지역 놀러감', 256, 108);
    x.font = '400 40px "Gowun Dodum","Noto Sans KR",sans-serif'; x.fillText('곧 돌아와요', 256, 200);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: '#7a5532', roughness: 0.95 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.26, 10), wood); post.position.y = 0.13;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.022), wood); board.position.y = 0.34;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.5 }));
    face.position.set(0, 0.34, 0.0125);
    for (const m of [post, board]) m.castShadow = true;
    g.add(post, board, face); g.name = 'awaySign';
    return g;
  }
  showSign() {
    if (!this.sign) this.sign = this.makeSign();
    const p = [[0, -0.1], [0.45, -0.05], [-0.45, -0.05], [0, 0.3], [0.8, 0.1], [-0.8, 0.1]].find(([x, z]) => !this.blocked(x, z, 0.2)) || [0, 0];
    this.sign.position.set(p[0], 0, p[1]); this.s.scene.add(this.sign);
  }
  hideSign() { if (this.sign && this.sign.parent) this.sign.parent.remove(this.sign); }
  visitFrame() {
    if (this.sign && this.sign.parent) { const c = this.s.camera.position; this.sign.rotation.y = Math.atan2(c.x - this.sign.position.x, c.z - this.sign.position.z); }
    this.updateGaze();
  }
  // 어드민: 두 고양이의 시선을 선으로 보기. 흰 선 = 상대 머리까지의 이상적인 방향, 주황 선 = 머리가 실제로 향한 방향
  updateGaze() {
    const E = this.enc;
    if (!this.gaze || !E || E.done) { this.clearGaze(); return; }
    if (!this.gazeG) {
      const g = new THREE.Group();
      for (const col of ['#ffffff', '#ff8a1f', '#ffffff', '#ff8a1f']) {
        const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: true }));
        ln.renderOrder = 20; ln.frustumCulled = false; g.add(ln);
      }
      this.gazeG = g; this.s.scene.add(g);
    }
    const q = new THREE.Quaternion(), ang = [];
    [[E.host, E.guest], [E.guest, E.host]].forEach(([a, b], i) => {
      const pa = a.headPt().clone(), pb = b.headPt().clone(), d = pa.distanceTo(pb) || 0.1;
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(a.v.rig.head.getWorldQuaternion(q)).normalize();
      const set = (ln, p0, p1) => { const at = ln.geometry.attributes.position; at.setXYZ(0, p0.x, p0.y, p0.z); at.setXYZ(1, p1.x, p1.y, p1.z); at.needsUpdate = true; };
      set(this.gazeG.children[i * 2], pa, pb); set(this.gazeG.children[i * 2 + 1], pa, pa.clone().addScaledVector(fwd, d));
      ang.push(Math.round(fwd.angleTo(pb.clone().sub(pa).normalize()) * 180 / Math.PI));
    });
    this.gazeAng = ang;
  }
  clearGaze() { if (this.gazeG) { this.s.scene.remove(this.gazeG); this.gazeG.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.gazeG = null; } this.gazeAng = null; }
}
