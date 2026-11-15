// core/props.js: 오브젝트(자동차) 정의·배치·지점 좌표·점유 (M3-6 O1, 설계 docs/design/오브젝트_상호작용_설계.md 2장)
// core 규칙: three·DOM 없음. 기능 스위치(PROPS.on)는 개발 중 꺼짐 (D-120): 꺼져 있으면 배치는 항상 빈 배열이라 기존 화면·행동이 그대로다.
import { makeRng } from './util.js';

// ── 차 크기 상수 (D-128: 소형 세단 비율. 전체 길이 3.0m 유지, 보닛 0.85 + 캐빈 1.3 + 트렁크 0.85. 이 값만 바꾸면 지점이 따라간다) ──
export const CAR_HOOD_LEN = 0.85; // 보닛 길이(m). 성체 몸길이 약 0.4m 가 엎드려 앞유리 앞에 들어간다
export const CAR = { hood: CAR_HOOD_LEN, cabin: 1.3, trunk: 0.85, w: 0.9, bottom: 0.2, hoodY: 0.58, roofY: 0.90, wheelR: 0.19 };
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

// ── 간섭 검사 (M4-7, R-24): 오브젝트끼리 겹치지 않는다. 모양은 원 {x,z,r} 또는 회전 직사각형 {x,z,hx,hz,rot}, 담(wall)은 건너뛴다 ──
export const OBJ_GAP = 0.15; // 오브젝트 사이 최소 간격(m)
export const CAR_FOOT = { hx: CAR.l / 2 + 0.06, hz: CAR.w / 2 + 0.02 }; // 차 외곽(범퍼·바퀴 돌출 포함). 충돌용 hx·hz 와 따로 둔다
export const footOf = (kind) => (kind === 'car' ? CAR_FOOT : PROP_KINDS[kind]);
const toLocal = (o, x, z) => { const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0), dx = x - o.x, dz = z - o.z; return [dx * c - dz * s, dx * s + dz * c]; };
// 두 모양이 gap 안으로 가까우면 true
export function shapesOverlap(a, b, gap = OBJ_GAP) {
  if (a.wall || b.wall) return false;
  const ra = a.hx === undefined, rb = b.hx === undefined;
  if (ra && rb) return Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r + gap;
  if (ra || rb) { // 원 대 직사각형: 가장 가까운 점까지 거리
    const c = ra ? a : b, q = ra ? b : a, [lx, lz] = toLocal(q, c.x, c.z);
    return Math.hypot(lx - Math.max(-q.hx, Math.min(q.hx, lx)), lz - Math.max(-q.hz, Math.min(q.hz, lz))) < c.r + gap;
  }
  const ax = (o) => { const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0); return [[c, -s], [s, c]]; }; // 분리축 시험(SAT), a 쪽을 gap 만큼 키운다
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [ux, uz] of [...ax(a), ...ax(b)]) {
    const pr = (o) => { const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0); return o.hx * Math.abs(c * ux - s * uz) + o.hz * Math.abs(s * ux + c * uz); };
    if (Math.abs(dx * ux + dz * uz) >= pr(a) + pr(b) + gap) return false;
  }
  return true;
}
export const isFree = (me, obstacles, gap = OBJ_GAP) => !obstacles.some((o) => shapesOverlap(me, o, gap));
// 원하는 자리(x, z)에서 가장 가까운 빈 자리 (결정적: 격자 0.05m, 거리 순·같으면 x 작은 쪽). 범위 밖이거나 없으면 null
export function nearestFree(me, obstacles, x, z, box = { x0: -2.55, x1: 2.55, z0: -1.55, z1: 0.6 }, step = 0.05) {
  const t = (px, pz) => isFree({ ...me, x: px, z: pz }, obstacles);
  if (x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1 && t(x, z)) return { x, z };
  let best = null, bd = Infinity;
  for (let px = box.x0; px <= box.x1 + 1e-9; px += step) for (let pz = box.z0; pz <= box.z1 + 1e-9; pz += step) {
    const d = Math.hypot(px - x, pz - z); if (d < bd - 1e-9 && t(px, pz)) { bd = d; best = { x: px, z: pz }; }
  }
  return best;
}
// 배치 (결정적): 같은 지역 코드면 같은 결과 (D-19). 명소는 쓰지 않는다 (D-26)
// 처음 고른 자리가 막히면 가장 가까운 빈 자리로 옮긴다(없으면 건너뜀). 시험용 force 는 그 자리 그대로(겹침 허용)
export function layoutFor({ theme, code, obstacles = [], force }) {
  const kind = PROP_KINDS.car, r = makeRng('props:' + ((force && force.code) || code));
  if (!force && (!kind.themes.includes(theme) || r() >= 0.6)) return [];
  const dir = force && force.dir ? force.dir : r.chance(0.5) ? 1 : -1;
  let x = force && force.x !== undefined ? force.x : r.range(-1.0, 1.0), z = force && force.z !== undefined ? force.z : r.range(-1.3, -1.05);
  const color = CAR_COLORS[r.int(0, CAR_COLORS.length - 1)];
  if (!(force && force.x !== undefined && force.z !== undefined)) {
    const f = nearestFree({ ...CAR_FOOT, rot: 0 }, obstacles, x, z, { x0: -1.0 + 0, x1: 1.0, z0: -1.3, z1: 0.0 });
    if (!f && !force) return [];
    if (f) ({ x, z } = f);
  }
  return [{ id: 'car0', kind: 'car', x, z, rot: 0, dir, color }];
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
