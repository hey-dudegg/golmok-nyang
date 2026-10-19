// 앱 조립 (App). 모듈을 불러 붙이고 시험용 window.__* 노출을 한곳에서 한다. 진입은 index.html 의 로더
import * as THREE from 'three';
import { ACTIONS, BOUNDS, REACTIONS, STEP } from './core/behavior.js';
import { dongPopulation, makeGenome, makePersonality } from './core/genome.js';
import { NAME_RULE } from './core/name_rules.js';
import { RECIPE_SAMPLES, RLIM, RV, parseRecipeText, recipePrompt, validateRecipe } from './core/recipe_rules.js';
import { THEME_LABEL, sggShort, themeFor } from './core/regions.js';
import { sunPosition } from './core/time.js';
import { EMO_POL, REACT_META, THOUGHTS, TOUCH_TYPES, petPolarityWeights, resolveRule, ruleReaction, touchType } from './core/touch_rules.js';
import { clamp, damp, makeRng, smooth } from './core/util.js';
import { initCaps } from './adapters/caps.js';
import { RecipeStore } from './adapters/recipe_store.js';
import { REGIONS } from './adapters/regions_data.js';
import { store } from './adapters/store.js';
import { Board } from './state/board.js';
import { Clock } from './state/clock.js';
import { Admin, adminPowers, gateNeedsMember, isMemberNow } from './state/gate.js';
import { Bonds, Member } from './state/members.js';
import { Names } from './state/names.js';
import { Recipes } from './state/recipes.js';
import { CatView, GROUND_SINK, applyPose, buildRig, catDims } from './render/cat_model.js';
import { POSES, poseTarget } from './render/poses.js';
import { Scene3D } from './render/scene.js';
import { CatAgent } from './sim/agent.js';
import { TRIP, Trips } from './sim/trips.js';
import { AdminPanel } from './ui/admin_panel.js';
import { renderBoard } from './ui/board.js';
import { renderCard, renderRoster } from './ui/card.js';
import { $, ICON, h, toast } from './ui/dom.js';
import { renderRanking } from './ui/names_panel.js';
import { openPicker } from './ui/picker.js';
import { openFeedback } from './ui/feedback.js';
import { openShare } from './ui/share.js';
import { openSignup, requireGate } from './ui/signup.js';
import { Live, Promo } from './ui/together.js';
import { AppInteract } from './app/interact.js';
import { AppVisit } from './app/visit.js';

// ───────────────────────── 앱 ─────────────────────────
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const TEST = (() => { const q = new URLSearchParams(location.search); return { still: +q.get('still') || 0, pr: +q.get('pr') || 0, shells: +q.get('shells') || 0, dt: +q.get('dt') || 0, hour: q.get('hour') }; })();
class App {
  constructor() {
    this.canvas = $('#c3d');
    this.s = new Scene3D(this.canvas);
    this.agents = []; this.cats = []; this.views = [];
    this.selected = null; this.busy = false; this.thought = null;
    this.shells = TEST.shells || (IS_TOUCH || Math.min(innerWidth, innerHeight) < 700 ? 16 : 28);
    this.ft = []; this.bubbles = [];
    this.camAnim = null;
    const app = this;
    this.world = {
      agents: this.agents, night: 0, day: 1, camPos: new THREE.Vector3(),
      youPoint() { return app.youPoint(); },
      blocked: (x, z, r) => this.blocked(x, z, r),
      resolve: (a, x, z) => this.resolve(a, x, z),
      say: (a, text) => this.say(a, text),
      dropBubble: (a) => this.dropBubble(a),
      onLabel: (a, override) => { if (a === this.selected) { const n = $('#nowLabel'); if (n) n.textContent = override || a.label; } },
    };
    this.rng = makeRng(Date.now() >>> 0);
  }
  async start() {
    const resize = () => { const pr = TEST.pr || Math.min(devicePixelRatio || 1, 1.75); this.s.resize(innerWidth, innerHeight, pr); };
    addEventListener('resize', resize); resize();
    this.bindInput();
    $('#btnMove').addEventListener('click', () => openPicker(this));
    $('#btnBoard').addEventListener('click', () => this.openBoard());
    $('#btnMember').addEventListener('click', () => { if (isMemberNow() && Member.me) toast(`${Member.me.nick}님은 이미 골목 이웃이에요`); else if (adminPowers()) toast('어드민은 가입 없이 모든 기능을 쓸 수 있어요'); else if (isMemberNow()) toast('회원 화면을 시험 중이에요'); else openSignup(this, '골목 이웃이 되어 주세요'); });
    $('#btnFeedback').addEventListener('click', (e) => requireGate(this, 'feedback', '의견은 이웃 등록 뒤에 보낼 수 있어요', () => openFeedback(this, { opener: e.currentTarget })));
    $('#capture').addEventListener('click', () => this.capture());
    $('#share').addEventListener('click', () => requireGate(this, 'share', '공유는 이웃 등록 뒤에 할 수 있어요', () => openShare(this)));
    $('#promo').addEventListener('click', () => requireGate(this, 'promo', '구경 오세요 홍보는 이웃 등록 뒤에 할 수 있어요', () => Promo.press(this)));
    Member.on(() => { this.renderMember(); renderCard(this); });
    Member.onJoined(() => renderCard(this));
    Board.on(() => renderBoard(this));
    Names.on(() => this.applyNames());
    // 첫 동네
    const hashCode = (location.hash || '').replace('#', ''), qCode = new URLSearchParams(location.search).get('r') || ''; // 공유 링크 ?r=시도코드 (R-11)
    const linked = REGIONS.unitOf(hashCode) || REGIONS.unitOf(qCode); // 링크로 연 세션은 그 지역만 보여 주고, 저장된 기본 지역은 사용자가 직접 바꿀 때만 바꾼다
    const first = linked || REGIONS.unitOf(store.get('region', '') || store.get('dong', '')) || REGIONS.unitOf('11') || REGIONS.units[0];
    this.goDong(first, undefined, { nosave: !!linked });
    this.renderMember();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    initCaps().then(async () => { await Member.load(); await Bonds.load(); await Recipes.init(); Board.start(); if (this.dong) Names.watch(this.dong.c, true); this.renderMember(); renderCard(this); Live.init(this); await AdminPanel.init(this); });
    setInterval(() => this.updateClock(), 30000);
    addEventListener('hashchange', () => { const d = REGIONS.unitOf(location.hash.replace('#', '')); if (d && d !== this.dong) this.goDong(d); });
  }
  updateCensus() {
    const m = this.mascot; if (!m) return;
    const top = Names.top();
    $('#census').textContent = `${THEME_LABEL[this.theme]} · 이 지역 마스코트 ${m.cat.name}` + (top ? ` (이웃 투표 1위)` : '');
  }
  applyNames() {
    const m = this.mascot; if (!m) return;
    const top = Names.top();
    const nm = top ? top.name : m.cat.defaultName;
    if (nm !== m.cat.name) { m.cat.name = nm; if (top) m.say(nm + '…?'); }
    this.updateCensus(); renderRoster(this);
    if (this.cardTab === 'names' && $('#rankList') && document.activeElement && document.activeElement.id === 'nameDraft') { renderRanking(this); const h2 = $('#card h2'); if (h2 && this.selected) h2.textContent = this.selected.cat.name; }
    else renderCard(this);
  }
  renderMember() {
    const b = $('#btnMember');
    if (Admin.active && Admin.view === 'guest') { b.classList.add('cta'); b.textContent = '이웃 등록 (비회원 화면)'; }
    else if (Member.me) { b.classList.remove('cta'); b.textContent = Member.me.nick + ' 님'; }
    else if (Admin.active && Admin.view === 'member') { b.classList.remove('cta'); b.textContent = '회원 화면'; }
    else if (Admin.active) { b.classList.remove('cta'); b.textContent = '어드민'; }
    else { b.classList.add('cta'); b.textContent = '이웃 등록'; }
    this.refreshFab();
  }
  // 회원 전용 버튼에는 작은 자물쇠 (설정표 GATE를 따른다)
  refreshFab() {
    const b = $('#promo'); if (!b) return;
    const locked = gateNeedsMember('promo'), bd = b.querySelector('.lockbadge');
    if (locked && !bd) { const s = h('span', { class: 'lockbadge', 'aria-hidden': 'true' }); s.innerHTML = ICON.lock; b.append(s); }
    else if (!locked && bd) bd.remove();
    b.disabled = !!this.away; // 자리 비운 동안은 홍보 버튼이 꺼진다 (설계 7장)
    b.setAttribute('aria-label', '구경 오세요 홍보하기' + (this.away ? ' (고양이가 놀러 가서 잠시 꺼짐)' : locked ? ' (이웃 등록 필요)' : ''));
    const sh = $('#share'); if (sh) sh.title = gateNeedsMember('share') ? '공유하기 (이웃 등록 필요)' : '공유하기';
  }
  // ── 동네 이동 ──
  goDong(d, focusCatId, opts) {
    this.dong = d; if (!(opts && opts.nosave)) store.set('region', d.c); if (Live.app) Live.setRegion(d.c);
    try { history.replaceState(null, '', '#' + d.c); } catch (e) {}
    $('#pUp').textContent = d.level === 'sido' ? '대한민국' : d.sido + (d.level === 'sgg' ? '' : ' ' + sggShort(d.sgg));
    $('#pDong').textContent = d.level === 'sido' ? d.sido : d.n; $('#pCode').textContent = ({ sido: '시/도 ', sgg: '시/군/구 ' }[d.level] || '행정동 ') + d.c;
    this.theme = themeFor(d);
    this.resetVisit();
    this.s.build(this.theme, d, 'scene:' + d.c);
    this.updateClock();
    for (const v of this.views) { this.s.scene.remove(v.root); v.dispose(); }
    this.views = []; this.agents.length = 0; this.bubbles.forEach((b) => b.el.remove()); this.bubbles = [];
    this.cats = dongPopulation(d);
    const nowMs = this.clockMs();
    for (const c of this.cats) {
      c.geo = { lat: d.lat, lng: d.lng };
      const v = new CatView(c.g, this.shells);
      this.s.scene.add(v.root);
      const a = new CatAgent(c, v, this.world, makeRng(c.id + ':' + Date.now()));
      a.enterClock(nowMs); // 세계 시계 (D-19): 지금 시각의 행동·자리에서 이어 시작
      this.views.push(v); this.agents.push(a);
      a.update(0.016);
    }
    this.mascot = this.agents[0];
    this.selected = null; this.thought = null; this.cardTab = 'care';
    this.updateCensus();
    renderRoster(this); renderCard(this);
    Names.watch(d.c);
    this.s.camera.position.set(0.0, 0.95, 3.4); this.s.controls.target.set(this.mascot.x * 0.5, 0.24, this.mascot.z * 0.5 - 0.2);
    this.tripTick(nowMs, true); // 놀러가기 (M0-3): 지금 시각에 자리를 비웠거나 손님이 와 있으면 그 지점부터 이어 보여 준다
    const narrow = innerWidth <= 720;
    if (focusCatId || !narrow) setTimeout(() => { if (this.mascot && !this.mascot.hidden && this.dong === d) this.select(this.mascot, true); }, focusCatId ? 300 : 1400);
    if (this.boardOpen) renderBoard(this);
  }
  clockMs() { return Date.now(); }
  visit(code, catId) {
    const d = REGIONS.unitOf(code); if (!d) return toast('그 지역을 찾지 못했어요');
    this.boardOpen = false; renderBoard(this);
    this.goDong(d, catId);
  }
  updateClock() {
    const now = TEST.hour != null ? new Date(Date.UTC(2026, 9, 10, +TEST.hour - 9, 0)) : new Date();
    this.s.setTime(now, this.dong.lat, this.dong.lng);
    this.world.night = this.s.isNight ? 1 : 0; this.world.day = this.s.dayAmt;
    const kst = new Date(now.getTime() + 9 * 3600000);
    const hh = kst.getUTCHours(), mm = kst.getUTCMinutes();
    const { alt } = sunPosition(now, this.dong.lat, this.dong.lng); const deg = alt * 180 / Math.PI;
    let label = '낮', col = '#e9b949';
    if (deg > 12) label = hh < 11 ? '아침' : hh < 15 ? '한낮' : '오후';
    else if (deg > 0) { label = hh < 12 ? '해 뜰 녘' : '해질녘'; col = '#e58a4a'; }
    else if (deg > -6) { label = '어스름'; col = '#8a6fae'; }
    else { label = hh >= 3 && hh < 6 ? '새벽' : '밤'; col = '#5d74b8'; }
    $('#clockT').textContent = `${hh < 12 ? '오전' : '오후'} ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')}`;
    $('#clockL').textContent = label; $('#clockDot').style.background = col;
  }
  // ── 세계 규칙 ──
  blocked(x, z, r) {
    if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return true;
    for (const o of this.s.obstacles) { if (o.wall) { if (z < o.z + 0.3 + r) return true; } else if (Math.hypot(x - o.x, z - o.z) < o.r + r * 0.5) return true; }
    return false;
  }
  resolve(a, x, z) {
    let stuck = false;
    for (const o of this.s.obstacles) {
      if (o.wall) { if (z < o.z + 0.32) z = o.z + 0.32; continue; }
      const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), m = o.r + 0.08;
      if (d < m) { x = o.x + (dx / (d || 1)) * m; z = o.z + (dz / (d || 1)) * m; stuck = true; }
    }
    for (const o of this.agents) {
      if (o === a || o.hidden) continue;
      const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), m = 0.17 * (a.scale + o.scale);
      if (d < m && d > 1e-4) { x += (dx / d) * (m - d) * 0.5; z += (dz / d) * (m - d) * 0.5; }
    }
    x = clamp(x, BOUNDS.x0, BOUNDS.x1); z = clamp(z, BOUNDS.z0, BOUNDS.z1);
    return { x, z, stuck };
  }
  youPoint() {
    const c = this.s.camera.position, t = this.s.controls.target;
    const dx = t.x - c.x, dz = t.z - c.z, L = Math.hypot(dx, dz) || 1;
    const k = clamp(L * 0.42, 0.3, 1.4);
    return { x: clamp(c.x + dx / L * k, BOUNDS.x0, BOUNDS.x1), z: clamp(c.z + dz / L * k, BOUNDS.z0, BOUNDS.z1), y: 0 };
  }
  // ── 입력 ──
  bindInput() {
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved < 7 && performance.now() - down.t < 500) this.pick(e.clientX, e.clientY);
      down = null;
    });
    this.s.controls.addEventListener('start', () => { this.camAnim = null; });
  }
  pick(px, py) {
    let best = null, bd = 1e9;
    const v = new THREE.Vector3();
    for (const a of this.agents) {
      if (a.hidden) continue;
      a.v.rig.chest.getWorldPosition(v); v.project(this.s.camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
      const dist = this.s.camera.position.distanceTo(a.v.root.position);
      const rad = 70 * a.scale / Math.max(dist, 0.4) * 2.2 + 18;
      const d = Math.hypot(sx - px, sy - py);
      if (d < rad && d < bd) { bd = d; best = a; }
    }
    if (best) this.select(best, true);
  }
  select(a, focus) {
    this.selected = a;
    if (this.thought && (!a || this.thought.id !== a.cat.id)) this.thought = null;
    renderCard(this); renderRoster(this);
    if (a && focus) {
      const cam = this.s.camera.position, c = new THREE.Vector3(a.x, 0, a.z);
      const dir = new THREE.Vector3(cam.x - c.x, 0, cam.z - c.z); if (dir.length() < 0.01) dir.set(0, 0, 1); dir.normalize();
      if (dir.z < 0.2) { dir.z = 0.6; dir.normalize(); }
      const dist = 1.05 + a.scale * 0.55;
      this.camAnim = { from: cam.clone(), to: c.clone().addScaledVector(dir, dist).setY(0.38 + 0.28 * a.scale), t: 0 };
    }
  }
  openBoard() { this.boardOpen = true; renderBoard(this); }
  // ── 매 프레임 ──
  frame(now) {
    if (TEST.still && this.frames >= TEST.still) { window.__still = true; return; }
    this.frames = (this.frames || 0) + 1;
    requestAnimationFrame((t) => this.frame(t));
    const dt = TEST.dt || Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.world.camPos.copy(this.s.camera.position);
    if (this.enc) this.enc.step(dt * (this.speed || 1)); // 만남 단계표를 먼저 흘려 두 마리가 같은 단계를 보게 한다
    for (const a of this.agents.slice()) if (!a.hidden) a.update(dt * (this.speed || 1));
    if (now - (this.tripAt || 0) > 250) { this.tripAt = now; this.tripTick(Date.now()); } // 실제 시계 기준 0.25초마다
    this.visitFrame(dt);
    // 카메라
    if (this.camAnim) {
      const A = this.camAnim; A.t = Math.min(1, A.t + dt / 1.1);
      this.s.camera.position.lerpVectors(A.from, A.to, smooth(A.t));
      if (A.t >= 1) this.camAnim = null;
    }
    if (this.selected) {
      const a = this.selected, T = this.s.controls.target;
      T.x = damp(T.x, a.x, 3, dt); T.z = damp(T.z, a.z, 3, dt); T.y = damp(T.y, 0.16 * a.scale + 0.04, 3, dt);
    } else if (this.away && this.mascot.hidden && this.sign) {
      const T = this.s.controls.target, s = this.sign.position;
      T.x = damp(T.x, s.x, 3, dt); T.z = damp(T.z, s.z - 0.1, 3, dt); T.y = damp(T.y, 0.26, 3, dt);
    } else if (this.enc && !this.enc.done) { // 선택한 고양이가 없으면 두 마리의 가운데를 비춘다
      const E = this.enc, T = this.s.controls.target;
      T.x = damp(T.x, (E.host.x + E.guest.x) / 2, 2, dt); T.z = damp(T.z, (E.host.z + E.guest.z) / 2 - 0.1, 2, dt); T.y = damp(T.y, 0.2, 2, dt);
    }
    this.s.controls.update();
    // 이름표가 열리면 장면을 옆(데스크톱)이나 위(휴대폰)로 살짝 밀어 고양이가 가려지지 않게
    const narrow = innerWidth <= 720;
    const card = $('#card');
    const wantX = this.selected && !narrow ? Math.min(190, innerWidth * 0.16) : 0;
    const wantY = this.selected && narrow && card && !card.hidden ? Math.min(card.offsetHeight * 0.55, innerHeight * 0.26) : 0;
    this.vox = damp(this.vox || 0, wantX, 5, dt); this.voy = damp(this.voy || 0, wantY, 5, dt);
    const cam = this.s.camera;
    if (Math.abs(this.vox) > 0.5 || Math.abs(this.voy) > 0.5) cam.setViewOffset(innerWidth, innerHeight, this.vox, this.voy, innerWidth, innerHeight);
    else if (cam.view && cam.view.enabled) cam.clearViewOffset();
    this.s.renderer.render(this.s.scene, cam);
    // 말풍선
    const v = new THREE.Vector3();
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]; b.t -= dt;
      if (b.t < 0 || !this.agents.includes(b.a)) { b.el.remove(); this.bubbles.splice(i, 1); continue; }
      b.a.v.rig.head.getWorldPosition(v); v.y += 0.11 * b.a.scale; v.project(this.s.camera);
      b.el.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px'; b.el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
      b.el.style.opacity = b.t < 0.4 ? String(b.t / 0.4) : '1';
      b.el.hidden = v.z > 1;
    }
    // 품질 자동 조절
    this.ft.push(dt);
    if (this.ft.length >= 90) {
      const avg = this.ft.reduce((s, x) => s + x, 0) / this.ft.length; this.ft = [];
      let n = this.shells;
      if (avg > 0.028 && n > 6) n = Math.max(6, n - 4);
      else if (avg < 0.0135 && n < 36 && !this.capped) n += 2;
      if (avg > 0.02 && n > this.shells) this.capped = true;
      if (TEST.shells) n = this.shells;
      if (n !== this.shells) { this.shells = n; for (const vv of this.views) vv.setShells(n); }
    }
    if (!this.loaded) { this.loaded = true; const l = $('#loading'); setTimeout(() => { l.style.opacity = '0'; setTimeout(() => l.remove(), 700); }, 150); }
  }
}
// 나눈 부분(놀러가기·교감)을 App 에 붙인다. 메서드 속성(열거 안 됨)을 그대로 옮겨 class 안에 있던 것과 같게 한다
for (const Part of [AppVisit, AppInteract]) for (const k of Object.getOwnPropertyNames(Part.prototype)) if (k !== 'constructor') Object.defineProperty(App.prototype, k, Object.getOwnPropertyDescriptor(Part.prototype, k));
Recipes.notify = (msg) => toast(msg);
const app = new App();
window.__app = app; if (new URLSearchParams(location.search).has('admin')) { window.__trips = Trips; window.__TRIP = TRIP; window.__inter = { Names, NAME_RULE, dongPopulation, resolveRule, ruleReaction, REACT_META, THOUGHTS, EMO_POL, TOUCH_TYPES, touchType, petPolarityWeights, makeGenome, makeRng, REACTIONS, makePersonality }; window.__recipe = { validateRecipe, parseRecipeText, Recipes, RecipeStore, recipePrompt, RV, RLIM, RECIPE_SAMPLES, ACTIONS, Clock, STEP }; window.__pose = { CatView, makeGenome, makeRng, POSES, poseTarget, catDims, buildRig, applyPose, GROUND_SINK }; } // 시험용 노출은 ?admin일 때만
window.__advance = (n) => { TEST.still = (app.frames || 0) + n; window.__still = false; app.last = performance.now(); requestAnimationFrame((t) => app.frame(t)); };
app.start();
