// app/props_app.js: 오브젝트 기능 스위치·표시·제거 (M3-6 O1, D-120). App 의 부분으로 main.js 가 붙인다
// 스위치는 개발 중 꺼짐. 켜는 길: 시험 주소(localhost·127.0.0.1)의 ?props=1, 또는 어드민 '오브젝트' 구역. 출시 때 기본 켬으로 바꾼다.
import * as THREE from 'three';
import { HOP, PS, registerPropActions, resetSlot } from '../core/prop_actions.js';
import { ACTIONS } from '../core/behavior.js';
import { PROPS, slotWorld, PROP_KINDS, propClaim, propOccupant, propSlots } from '../core/props.js';
import { isTestHost } from '../core/test_host.js';
import { Clock } from '../state/clock.js';
import { registerPropPoses } from '../render/poses_prop.js';

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
    for (const a of this.agents) if (a.slot && a.slot.S.prop.id === id) { a.isReaction = true; a.steps = [PS.dismount(true)]; a.step = null; a.move = null; a.arrived = true; }
    (this._propsPend || (this._propsPend = [])).push({ id, t0: performance.now() });
    if (!this._propsTimer) this._propsTimer = setInterval(() => this.propsRemoveTick(), 100);
  }
  propsRemoveTick() {
    const left = [];
    for (const q of this._propsPend || []) {
      if (this.agents.some((a) => a.slot && a.slot.S.prop.id === q.id)) { left.push(q); continue; }
      const g = this.s.env.children.find((c) => c.userData.propId === q.id);
      if (g) { this.s.env.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      this.s.obstacles = this.s.obstacles.filter((o) => o.id !== q.id); PROPS.layout = PROPS.layout.filter((p) => p.id !== q.id);
      this.lastPropRemove = { id: q.id, delayMs: performance.now() - q.t0 };
    }
    this._propsPend = left;
    if (!left.length && this._propsTimer) { clearInterval(this._propsTimer); this._propsTimer = null; }
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
if (isTestHost(location.hostname)) window.__props = { PROPS, PS, resetSlot, PROP_KINDS, HOP, propClaim, propOccupant, propSlots, ACTIONS, Clock };
