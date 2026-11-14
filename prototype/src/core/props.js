// core/props.js: 오브젝트(자동차) 정의·배치·지점 좌표·점유 (M3-6 O1, 설계 docs/design/오브젝트_상호작용_설계.md 2장)
// core 규칙: three·DOM 없음. 기능 스위치(PROPS.on)는 개발 중 꺼짐 (D-120): 꺼져 있으면 배치는 항상 빈 배열이라 기존 화면·행동이 그대로다.
import { makeRng } from './util.js';

// ── 차 크기 상수 (D-115 임시: 본네트 길이 ≈ 고양이 몸길이 4배. 시연 뒤 확정, 이 값 하나만 바꾸면 차 전체 길이·지점이 따라간다) ──
export const CAR_HOOD_LEN = 1.6; // 본네트 길이(m). 성체 몸길이 약 0.4m x 4
export const CAR = { hood: CAR_HOOD_LEN, cabin: 1.0, trunk: 0.4, w: 0.9, bottom: 0.2, hoodY: 0.42, roofY: 0.78 };
CAR.l = CAR.hood + CAR.cabin + CAR.trunk; // 차 전체 길이(m)

// 종류표: 지점 pos·approach 는 오브젝트 로컬 [x(길이, 앞이 +), z(폭, +가 카메라 쪽)]. dir=-1 이면 x 를 뒤집는다(앞이 -x)
export const PROP_KINDS = {
  car: { label: '자동차', size: { l: CAR.l, w: CAR.w, h: CAR.roofY }, hx: CAR.l / 2, hz: CAR.w / 2, themes: ['alley'],
    slots: [
      { id: 'hood', mode: 'on', action: 'hoodLoaf', pos: [CAR.l / 2 - CAR.hood / 2, 0], y: CAR.hoodY, poses: ['lie'], cap: 1, inset: 0.12,
        approach: [CAR.l / 2 - CAR.hood / 2, CAR.w / 2 + 0.17], shade: 0, warm: 0.8, tag: 'rest', shadowMax: 0.3 },
      { id: 'under', mode: 'under', action: 'underHide', pos: [0, 0.12], y: 0, poses: ['hideLow', 'peek'], cap: 1, clear: CAR.bottom,
        approach: [0, CAR.w / 2 + 0.17], shade: 0.7, warm: 0.2, tag: 'hide' },
    ] },
};
export const PROP_ACTION_KEYS = new Set(['hoodLoaf', 'underHide']);
export const PROP_COOLDOWN = 90; // 같은 고양이·같은 지점 재진입 쿨다운(초, 4A-2)

// 전역 상태: 지금 장면의 배치와 점유 (장면은 한 번에 하나라 모듈 단위로 둔다. 순수 상태라 node 시험 가능)
export const PROPS = { on: false, layout: [], force: null, claims: new Map() };

const rot = (p, lx, lz) => { const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0); return [p.x + lx * c + lz * s, p.z - lx * s + lz * c]; };
// 지점의 월드 좌표: { x, z, y, ax, az(접근점), key, yaw }
export function slotWorld(prop, slot) {
  const d = prop.dir || 1, [x, z] = rot(prop, slot.pos[0] * d, slot.pos[1]), [ax, az] = rot(prop, slot.approach[0] * d, slot.approach[1]);
  return { x, z, y: slot.y, ax, az, key: prop.id + ':' + slot.id, yaw: 0, prop, slot };
}
// 직사각형 장애물(월드)에서 점 밀어내기. 안이면 { x, z } 새 위치, 밖이면 null (m: 여유)
export function rectPush(o, x, z, m) {
  const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0), dx = x - o.x, dz = z - o.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c, ex = o.hx + m, ez = o.hz + m;
  if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) return null;
  let nx = lx, nz = lz;
  if (ex - Math.abs(lx) < ez - Math.abs(lz)) nx = Math.sign(lx || 1) * ex; else nz = Math.sign(lz || 1) * ez;
  return { x: o.x + nx * c + nz * s, z: o.z - nx * s + nz * c };
}
export const rectHit = (o, x, z, m) => !!rectPush(o, x, z, m);

const CAR_COLORS = [0x8d949b, 0xe6e4de, 0xb23a3a, 0x2c3d63, 0x86a85a]; // 회색·흰·빨강·남색·연두
// 배치 (결정적): 같은 지역 코드면 같은 결과 (D-19). 명소는 쓰지 않는다 (D-26)
export function layoutFor({ theme, code, obstacles = [], force }) {
  const kind = PROP_KINDS.car, r = makeRng('props:' + ((force && force.code) || code));
  if (!force && (!kind.themes.includes(theme) || r() >= 0.6)) return [];
  const dir = force && force.dir ? force.dir : r.chance(0.5) ? 1 : -1;
  for (let i = 0; i < 20; i++) {
    const x = force && force.x !== undefined ? force.x : r.range(-1.0, 1.0), z = force && force.z !== undefined ? force.z : r.range(-1.3, -1.05);
    const me = { x, z, hx: kind.hx, hz: kind.hz, rot: 0 };
    const bad = obstacles.some((o) => !o.wall && (o.hx !== undefined ? false : o.r !== undefined && rectHit(me, o.x, o.z, o.r + 0.3)));
    if (!bad || force) return [{ id: 'car0', kind: 'car', x, z, rot: 0, dir, color: CAR_COLORS[r.int(0, CAR_COLORS.length - 1)] }];
  }
  return [];
}
// 장면을 지을 때 부른다: 스위치가 꺼져 있으면 항상 빈 배열
export function propsEnter(theme, code, obstacles) {
  PROPS.claims.clear();
  PROPS.layout = PROPS.on ? layoutFor({ theme, code, obstacles, force: PROPS.force }) : [];
  return PROPS.layout;
}
// 행동 키에 맞는 지점들 (월드 좌표 포함)
export function propSlots(action) {
  const out = [];
  for (const p of PROPS.layout) for (const s of PROP_KINDS[p.kind].slots) if (s.action === action) out.push(slotWorld(p, s));
  return out;
}
// 세계 시계 일정의 자리: 지점 접근점 (스위치 꺼짐·지점 없음이면 null)
export function propHome(action) {
  if (!PROPS.on || !PROP_ACTION_KEYS.has(action)) return null;
  const s = propSlots(action)[0];
  return s ? { x: s.ax, z: s.az } : null;
}
// 점유 (cap 은 지점 정의, O1 은 모두 1)
export const propClaim = (key, a) => { const c = PROPS.claims.get(key); if (c && c !== a) return false; PROPS.claims.set(key, a); return true; };
export const propRelease = (key, a) => { if (PROPS.claims.get(key) === a) PROPS.claims.delete(key); };
export const propOccupant = (key) => PROPS.claims.get(key) || null;
