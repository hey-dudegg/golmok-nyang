// 고양이 찾기 버튼 (D-68, M1-10): 고양이가 화면 가장자리 밖이면 나타나고, 누르면 카메라 목표점이 고양이 쪽으로 부드럽게 이동
import * as THREE from 'three';
import { BOUNDS } from '../core/behavior.js';
import { FIND, easeInOut, findTargets, shouldShow } from '../core/find_cat.js';
import { clamp } from '../core/util.js';
import { $ } from './dom.js';

export function initFindCat(app) {
  const btn = $('#findCat'); if (!btn) return;
  const v = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
  let shown = false, anim = null;
  const cats = () => findTargets(app.agents, app.selected); // 선택한 고양이가 있으면 그 고양이만 기준
  const pos = (a, out) => out.set(a.x, 0.16 * a.scale + 0.04, a.z);
  const setShown = (on) => { shown = on; btn.hidden = !on; };
  setShown(false);
  btn.addEventListener('click', () => {
    const list = cats(); if (!list.length) return;
    const T = app.s.controls.target;
    let a = list.length === 1 ? list[0] : null;
    if (!a) { let best = 1e9; for (const c of list) { const d = Math.hypot(c.x - T.x, c.z - T.z); if (d < best) { best = d; a = c; } } }
    from.copy(T); pos(a, to);
    to.x = clamp(to.x, BOUNDS.x0, BOUNDS.x1); to.z = clamp(to.z, BOUNDS.z0, BOUNDS.z1); // D-42 범위 안
    anim = { a, t: 0, last: from.clone() };
    app.camAnim = null;
  });
  app.s.controls.addEventListener('start', () => { anim = null; }); // 드래그하면 즉시 중단
  // 카메라 갱신 직전에 호출: 목표점과 카메라를 같은 만큼 옮겨 거리·회전각을 지킨다
  app.stepFindCat = (dt) => {
    if (!anim) return;
    anim.t = Math.min(1, anim.t + dt / (FIND.ms / 1000));
    pos(anim.a, to); to.x = clamp(to.x, BOUNDS.x0, BOUNDS.x1); to.z = clamp(to.z, BOUNDS.z0, BOUNDS.z1);
    const T = app.s.controls.target, e = easeInOut(anim.t);
    const nx = from.x + (to.x - from.x) * e, ny = from.y + (to.y - from.y) * e, nz = from.z + (to.z - from.z) * e;
    app.s.camera.position.x += nx - T.x; app.s.camera.position.y += ny - T.y; app.s.camera.position.z += nz - T.z;
    T.set(nx, ny, nz);
    if (anim.t >= 1) anim = null;
  };
  // 렌더 뒤에 호출: 투영해서 버튼 표시 판정 (6프레임마다)
  app.updateFindCat = () => {
    if ((app.frames || 0) % 6) return;
    const cam = app.s.camera, ndcs = [];
    for (const a of cats()) { pos(a, v).project(cam); ndcs.push({ x: v.x, y: v.y, z: v.z }); }
    const on = app.loaded !== false && shouldShow(ndcs, shown);
    if (on !== shown) setShown(on);
  };
}
