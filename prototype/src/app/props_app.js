// app/props_app.js: 오브젝트 기능 스위치·표시·제거 (M3-6 O1, D-120). App 의 부분으로 main.js 가 붙인다
// 스위치는 개발 중 꺼짐. 켜는 길: 시험 주소(localhost·127.0.0.1)의 ?props=1, 또는 어드민 '오브젝트' 구역. 출시 때 기본 켬으로 바꾼다.
import * as THREE from 'three';
import { HOP, PS, registerPropActions, resetSlot } from '../core/prop_actions.js';
import { ACTIONS } from '../core/behavior.js';
import { GIFT, PROPS, giftWorld, slotWorld, PROP_KINDS, propClaim, propOccupant, propSlots } from '../core/props.js';
import { isTestHost } from '../core/test_host.js';
import { Clock } from '../state/clock.js';
import { registerPropPoses } from '../render/poses_prop.js';
import { addGift, disposeGroup, giftPop } from '../render/props.js';
import { Box } from '../state/box.js';

const stdMat = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o }); // scene.js 의 std 와 같은 재질

export function setPropsSwitch(on) { PROPS.on = !!on; registerPropActions(PROPS.on); registerPropPoses(PROPS.on); Clock.cache.clear(); }
if (isTestHost(location.hostname) && new URLSearchParams(location.search).get('props') === '1') setPropsSwitch(true);

export class AppProps {
  // 켜기/끄기 + 장면 다시 짓기. force: 시험용 고정 배치 { x, z, dir, code }
  propsSet(on, force) {
    setPropsSwitch(on); PROPS.force = on && force ? force : null;
    if (this.dong) this.goDong(this.dong, undefined, { nosave: true });
  }
  // 오브젝트가 사라질 때(R-06 상자 만료 등): 위·안에 있는 고양이가 먼저 나온 뒤 지운다 (공중·바닥에 박히지 않게)
  propsRemove(id) {
    const pr = PROPS.layout.find((p) => p.id === id); if (pr) pr.gone = true; // 사라지는 중: 새 행동의 후보·진입에서 빠진다
    for (const a of this.agents) if (a.slot && a.slot.S.prop.id === id) { a.isReaction = true; a.steps = [PS.dismount(true)]; a.step = null; a.move = null; a.arrived = true; }
    (this._propsPend || (this._propsPend = [])).push({ id, t0: performance.now() });
    if (!this._propsTimer) this._propsTimer = setInterval(() => this.propsRemoveTick(), 100);
  }
  propsRemoveTick() {
    const left = [];
    for (const q of this._propsPend || []) {
      if (this.agents.some((a) => a.slot && a.slot.S.prop.id === q.id)) { left.push(q); continue; }
      const g = this.s.env.children.find((c) => c.userData.propId === q.id);
      if (g && g.userData.gift) { // 선물 상자: 고양이가 다 나온 뒤 0.3초 줄어들며 사라지고 형상·재질을 해제 (M6-5)
        if (!q.pop) { q.pop = true; this.s.obstacles = this.s.obstacles.filter((o) => o.id !== q.id); giftPop(g, -1, () => { this.s.env.remove(g); disposeGroup(g); PROPS.layout = PROPS.layout.filter((p) => p.id !== q.id); q.done = true; this.lastPropRemove = { id: q.id, delayMs: performance.now() - q.t0 }; }); }
        if (!q.done) left.push(q); continue;
      }
      if (g) { this.s.env.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      this.s.obstacles = this.s.obstacles.filter((o) => o.id !== q.id); PROPS.layout = PROPS.layout.filter((p) => p.id !== q.id);
      this.lastPropRemove = { id: q.id, delayMs: performance.now() - q.t0 };
    }
    this._propsPend = left;
    if (!left.length && this._propsTimer) { clearInterval(this._propsTimer); this._propsTimer = null; }
  }
  // ── 선물 상자 (M6-5, 상자_놓기_설계 5장): Box(state)의 변화를 장면·행동 입력에 연결한다. 켜는 곳은 main.start ──
  giftInit() {
    const raw = () => { const p = PROPS.layout.find((q) => q.id === GIFT.id && !q.gone); return p ? { placed: p.placed, until: p.until, spot: p, id: p.boxId } : null; };
    PROPS.boxSrc = () => Box.get(); Clock.giftSrc = raw; // 일정 계산의 입력: 상자 있음 = placed <= 결정 시각 < until (D-19)
    Object.defineProperty(this.world, 'gift', { configurable: true, get() { const g = raw(), n = Box.now(); return g && n >= g.placed && n < g.until ? { ...g, age: n - g.placed, first: false } : null; } });
    Box.on((b, why) => this.giftSync(b, why));
  }
  giftSync(box, why) {
    if (why === 'region' || !this.s || !this.dong) return; // 지역이 바뀌면 장면을 다시 짓고 buildPropsFor 가 놓는다
    const cur = PROPS.layout.find((q) => q.id === GIFT.id && !q.gone);
    if (cur && box && cur.boxId === box.id) { cur.until = box.until; Clock.cache.clear(); return; }
    if (cur) { this.propsRemove(cur.id); Clock.cache.clear(); }
    this.giftTry(0);
  }
  // 놓기: 지난 상자가 다 지워질 때까지, 그 자리에 고양이가 서 있으면 (최대 4초) 기다렸다가 놓는다 (밀려나 순간이동하지 않게)
  giftTry(waited) {
    clearTimeout(this._giftT); this._giftT = null;
    const box = Box.get(); if (!box || !this.s || !this.dong) return;
    if (PROPS.layout.some((q) => q.id === GIFT.id)) { this._giftT = setTimeout(() => this.giftTry(waited), 250); return; } // 지우는 중이면 끝나길 기다림
    const gw = giftWorld(box, this.dong.c, this.s.obstacles, PROPS.layout); if (!gw) return;
    if (waited < 4000 && this.agents.some((a) => !a.hidden && Math.hypot(a.x - gw.x, a.z - gw.z) < 0.5)) { this._giftT = setTimeout(() => this.giftTry(waited + 250), 250); return; }
    addGift(this.s, this.s.env, gw, stdMat, true); Clock.cache.clear();
  }
  // 지점 표시: 접근점 파랑 / 지점 초록 / 점유 빨강 (어드민, 7장)
  propsMarks(show) {
    if (this._propsMarks) { this.s.env.remove(this._propsMarks); this._propsMarks = null; }
    if (!show) return;
    const g = this._propsMarks = new THREE.Group(), sp = (c, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); g.add(m); };
    for (const p of PROPS.layout) for (const s of PROP_KINDS[p.kind].slots) { const w = slotWorld(p, s); sp(0x3b82f6, w.ax, 0.05, w.az); sp(propOccupant(w.key) ? 0xef4444 : 0x22c55e, w.x, w.y + 0.08, w.z); }
    this.s.env.add(g);
  }
}
// 시험용 노출 (localhost·127.0.0.1 에서만, 보안 J-6)
if (isTestHost(location.hostname)) window.__props = { Box, PROPS, PS, resetSlot, PROP_KINDS, HOP, propClaim, propOccupant, propSlots, ACTIONS, Clock };
