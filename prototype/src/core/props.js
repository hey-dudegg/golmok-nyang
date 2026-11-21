// core/props.js: 오브젝트(자동차) 정의·배치·지점 좌표·점유 (M3-6 O1, 설계 docs/design/오브젝트_상호작용_설계.md 2장)
// core 규칙: three·DOM 없음. 기능 스위치(PROPS.on)는 개발 중 꺼짐 (D-120): 꺼져 있으면 배치는 항상 빈 배열이라 기존 화면·행동이 그대로다.
import { makeRng } from './util.js';
import { BOUNDS } from './behavior.js';

// ── 차 크기 상수 (D-128: 소형 세단 비율. 전체 길이 3.0m 유지, 보닛 0.85 + 캐빈 1.3 + 트렁크 0.85. 이 값만 바꾸면 지점이 따라간다) ──
export const CAR_HOOD_LEN = 0.85; // 보닛 길이(m). 성체 몸길이 약 0.4m 가 엎드려 앞유리 앞에 들어간다
export const CAR = { hood: CAR_HOOD_LEN, cabin: 1.3, trunk: 0.85, w: 0.9, bottom: 0.2, hoodY: 0.58, roofY: 0.90, wheelR: 0.19 };
CAR.l = CAR.hood + CAR.cabin + CAR.trunk; // 차 전체 길이(m)

// 낮은 담 크기 상수 (M5-1): 상자 본체 + 갓돌. 높이 0.80 은 새끼가 못 오르고 성체는 한 번 도약해 오르는 높이
export const WALL = { l: 1.8, w: 0.22, h: 0.80, cap: 0.05 };

// 종류표: 지점 pos·approach 는 오브젝트 로컬 [x(길이, 앞이 +), z(폭, +가 카메라 쪽)]. dir=-1 이면 x 를 뒤집는다(앞이 -x)
export const PROP_KINDS = {
  car: { label: '자동차', size: { l: CAR.l, w: CAR.w, h: CAR.roofY }, hx: CAR.l / 2, hz: CAR.w / 2, themes: ['alley'],
    slots: [
      { id: 'hood', mode: 'on', action: 'hoodLoaf', pos: [CAR.l / 2 - CAR.hood / 2, 0], y: CAR.hoodY, poses: ['lie'], cap: 1, inset: 0.12,
        approach: [CAR.l / 2 - CAR.hood / 2, CAR.w / 2 + 0.17], shade: 0, warm: 0.8, tag: 'rest', shadowMax: 0.3 },
      { id: 'under', mode: 'under', action: 'underHide', pos: [0, 0.12], y: 0, poses: ['hideLow', 'peek'], cap: 1, clear: CAR.bottom,
        approach: [0, CAR.w / 2 + 0.17], shade: 0.7, warm: 0.2, tag: 'hide' },
    ] },
  // 낮은 담: 위(top) 두 곳 + 뒤 그늘(behind, 지점만 정의하고 행동은 아직 없음). 앞뒤·좌우 대칭이라 dir 은 쓰지 않는다
  lowwall: { label: '낮은 담', size: { l: WALL.l, w: WALL.w, h: WALL.h }, hx: WALL.l / 2, hz: WALL.w / 2, themes: ['alley', 'market', 'park'],
    slots: [
      { id: 'top0', mode: 'on', action: 'wallLoaf', pos: [-0.45, 0], y: WALL.h, poses: ['lie'], cap: 1, inset: 0.1,
        approach: [-0.45, WALL.w / 2 + 0.17], shade: 0, warm: 0.5, tag: 'perch', shadowMax: 0.2 },
      { id: 'top1', mode: 'on', action: 'wallLoaf', pos: [0.45, 0], y: WALL.h, poses: ['lie'], cap: 1, inset: 0.1,
        approach: [0.45, WALL.w / 2 + 0.17], shade: 0, warm: 0.5, tag: 'perch', shadowMax: 0.2 },
      { id: 'behind', mode: 'beside', action: null, pos: [0, -0.3], y: 0, poses: ['loaf'], cap: 1, approach: [0, WALL.w / 2 + 0.17], shade: 0.6, warm: 0.2, tag: 'rest' },
    ] },
};
// 종이 상자 (M5-2): 윗면 열린 상자. 벽 0.28 은 앉은 성체의 귀·머리만 보이는 높이. in 지점은 바닥(y 0)에 앉는다(높이 변화는 도약뿐이라 y 를 올리지 않음)
export const CRATE = { l: 0.55, w: 0.45, h: 0.28, t: 0.02 };
PROP_KINDS.crate = { label: '종이 상자', size: { l: CRATE.l, w: CRATE.w, h: CRATE.h }, hx: CRATE.l / 2, hz: CRATE.w / 2, themes: ['alley', 'market', 'park'],
  slots: [
    { id: 'in', mode: 'in', action: 'crateSit', pos: [0, 0.0], y: 0, poses: ['sit', 'loaf'], cap: 1, rest: 'sit', approach: [0, CRATE.w / 2 + 0.17], shade: 0.2, warm: 0.4, tag: 'hide' },
  ] };
// 캣타워 (M8-1, 캣타워_설계 1장): 바닥 칸(den) + 칸 지붕 중단(mid 0.36m) + 기둥 위 상단(top 0.72m). 앞(+z)이 카메라 쪽, 세 지점의 접근점은 칸 입구 앞 한 곳.
export const TOWER = { l: 0.95, w: 0.56, h: 0.75, midY: 0.36, topY: 0.72 };
PROP_KINDS.tower = { label: '캣타워', size: { l: TOWER.l, w: TOWER.w, h: TOWER.h }, hx: TOWER.l / 2, hz: TOWER.w / 2, themes: ['park', 'alley'],
  slots: [
    { id: 'den', mode: 'in', action: 'towerDen', pos: [-0.20, 0.0], y: 0, poses: ['loaf', 'hideLow', 'peek'], cap: 1, rest: 'loaf', clear: 0.30, approach: [-0.20, 0.40], shade: 0.7, warm: 0.6, tag: 'hide' },
    { id: 'mid', mode: 'on', action: 'towerLie', pos: [-0.20, 0], y: TOWER.midY, poses: ['lie'], cap: 1, inset: 0.10, approach: [-0.20, 0.40], shade: 0, warm: 0.6, tag: 'rest', shadowMax: 0.22 },
    { id: 'top', mode: 'on', action: 'towerLookout', pos: [0.25, 0], y: TOWER.topY, poses: ['sit', 'lie'], cap: 1, inset: 0.08, via: ['mid'], approach: [-0.20, 0.40], shade: 0, warm: 0.5, tag: 'perch', shadowMax: 0.18 },
  ] };
export const TOWER_KEYS = new Set(['towerDen', 'towerLie', 'towerLookout']); // 같은 오브젝트 묶음: 최근 3개 행동 안에 하나만 (3.3)
export const PROP_ACTION_KEYS = new Set(['hoodLoaf', 'underHide', 'wallLoaf', 'crateSit', 'giftPeek', 'giftSniff', ...TOWER_KEYS]);
export const PROP_COOLDOWN = 90; // 같은 고양이·같은 지점 재진입 쿨다운(초, 4A-2)

// 전역 상태: 지금 장면의 배치와 점유 (장면은 한 번에 하나라 모듈 단위로 둔다. 순수 상태라 node 시험 가능)
export const PROPS = { on: false, layout: [], force: null, claims: new Map(), boxSrc: null }; // boxSrc: () => 지금 보는 지역의 상자|null (app 이 state/box 를 연결, 층 규칙상 render 는 state 를 못 본다)

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
export function nearestFree(me, obstacles, x, z, box = { x0: -2.55, x1: 2.55, z0: -1.55, z1: 0.6 }, step = 0.05, gap = OBJ_GAP, ok = null) { // ok(px, pz): 추가 조건(없으면 생략)
  const t = (px, pz) => isFree({ ...me, x: px, z: pz }, obstacles, gap) && (!ok || ok(px, pz));
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
  const cars = carLayout({ theme, code, obstacles, force }), obs = [...obstacles];
  for (const c of cars) obs.push({ ...CAR_FOOT, x: c.x, z: c.z, rot: c.rot });
  // 골목은 차가 있으면 담을 생략한다(차가 뒷줄을 차지해 둘이 붙어 보임). 시험이 담 위치를 직접 지정(force.wall)하면 그대로 놓는다
  const walls = theme === 'alley' && cars.length && !(force && force.wall) ? [] : wallLayout({ theme, code, obstacles: obs, force });
  for (const w of walls) obs.push({ ...PROP_KINDS.lowwall, x: w.x, z: w.z, rot: w.rot });
  // 상자는 낮은 담 앞 접근점(wallLoaf 지점의 approach) 반경 CRATE_KEEP 안에 두지 않는다 (M5-4). 점 장애물은 원 r + OBJ_GAP 이라 r 에서 간격을 뺀다
  for (const w of walls) for (const s of PROP_KINDS.lowwall.slots) if (s.action === 'wallLoaf') { const q = slotWorld(w, s); obs.push({ x: q.ax, z: q.az, r: CRATE_KEEP - OBJ_GAP }); }
  const crates = crateLayout({ theme, code, obstacles: obs, force });
  for (const c of crates) obs.push({ ...PROP_KINDS.crate, x: c.x, z: c.z, rot: c.rot });
  return [...cars, ...walls, ...crates, ...towerLayout({ theme, code, obstacles: obs, force, cars, walls, crates })];
}
// 캣타워 (M8-1, 설계 2장): 맨 끝에 별도 난수로 놓아 기존 차·담·상자 배치는 그대로. 공원 70%, 골목 25%(차 없을 때만), 시장 0. 뒷줄 z -1.3~-0.7, x -1.6~1.6
// 담 접근점·상자 접근점 둘레 TOWER_KEEP 과 캣타워 자신의 접근점 둘레는 비워 둔다. force.tower = { x, z } 면 그 자리 그대로, 차 고정(force.x·z) 시험은 놓지 않는다
export const TOWER_KEEP = 0.2;
const TOWER_BOX = { x0: -1.6, x1: 1.6, z0: -1.3, z1: -0.7 };
function towerLayout({ theme, code, obstacles, force, cars, walls, crates }) {
  const kind = PROP_KINDS.tower, r = makeRng('props:tower:' + ((force && force.code) || code));
  const ft = force && force.tower && typeof force.tower === 'object' ? force.tower : null;
  if (ft) return [{ id: 'tower0', kind: 'tower', x: ft.x, z: ft.z, rot: 0, dir: 1 }];
  if (force && force.x !== undefined && force.z !== undefined) return [];
  if (!kind.themes.includes(theme) || r() >= (theme === 'park' ? 0.7 : 0.25) || (theme === 'alley' && cars.length)) return [];
  const x = r.range(TOWER_BOX.x0, TOWER_BOX.x1), z = r.range(TOWER_BOX.z0, TOWER_BOX.z1), obs = [...obstacles], keep = { r: TOWER_KEEP - OBJ_GAP };
  for (const c of crates) for (const s of PROP_KINDS.crate.slots) { const q = slotWorld(c, s); obs.push({ ...keep, x: q.ax, z: q.az }); }
  const okAp = (px, pz) => { // 자신의 접근점: 무대 안, 둘레 TOWER_KEEP 에 다른 것이 없다
    const q = slotWorld({ x: px, z: pz, rot: 0, dir: 1 }, kind.slots[0]);
    return q.ax >= BOUNDS.x0 && q.ax <= BOUNDS.x1 && q.az <= BOUNDS.z1 && isFree({ ...keep, x: q.ax, z: q.az }, obs, OBJ_GAP);
  };
  const wc = walls.length ? walls[0].x : 0;
  // 공원은 담 중심과 반대쪽 반을 먼저 시도
  const left = { ...TOWER_BOX, x1: 0 }, right = { ...TOWER_BOX, x0: 0 }, order = wc > 0 ? [left, right] : [right, left], tryBoxes = theme === 'park' && walls.length ? [...order, TOWER_BOX] : [TOWER_BOX];
  for (const box of tryBoxes) {
    const f = nearestFree({ hx: kind.hx, hz: kind.hz, rot: 0 }, obs, Math.max(box.x0, Math.min(box.x1, x)), z, box, 0.05, OBJ_GAP, okAp);
    if (f) return [{ id: 'tower0', kind: 'tower', x: f.x, z: f.z, rot: 0, dir: 1 }];
  }
  return [];
}
// 종이 상자 (M5-2): 차·담과 별도 난수라 기존 배치는 그대로. 골목 1~2, 시장 2~3, 공원 1. 바닥 z -1.2~-0.2 안, 앞 접근점이 무대 안
// force: 차 위치를 못 박은 시험은 상자를 놓지 않고(force.crate = { x, z } 일 때만 그 자리 그대로), 어드민 다시 배치(code)는 항상 놓는다
export const CRATE_KEEP = 0.2; // 상자와 담 접근점 사이 최소 거리(m)
const CRATE_BOX = { x0: -2.1, x1: 2.1, z0: -1.25, z1: -0.1 };
function crateLayout({ theme, code, obstacles, force }) {
  const kind = PROP_KINDS.crate, r = makeRng('props:crate:' + ((force && force.code) || code));
  const fixed = !!(force && force.x !== undefined && force.z !== undefined), fc = force && force.crate && typeof force.crate === 'object' ? force.crate : null;
  if (fc) return [{ id: 'crate0', kind: 'crate', x: fc.x, z: fc.z, rot: 0, dir: 1 }];
  if (fixed || !kind.themes.includes(theme)) return [];
  const n = theme === 'market' ? r.int(2, 3) : theme === 'park' ? 1 : r.int(1, 2), out = [], obs = [...obstacles];
  for (let i = 0; i < n; i++) {
    const x = r.range(CRATE_BOX.x0, CRATE_BOX.x1), z = r.range(CRATE_BOX.z0, CRATE_BOX.z1);
    const f = nearestFree({ hx: kind.hx, hz: kind.hz, rot: 0 }, obs, x, z, CRATE_BOX);
    if (f) { out.push({ id: 'crate' + out.length, kind: 'crate', x: f.x, z: f.z, rot: 0, dir: 1 }); obs.push({ ...kind, x: f.x, z: f.z, rot: 0 }); }
  }
  return out;
}
function carLayout({ theme, code, obstacles, force }) {
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
// 낮은 담 (M5-1): 차와 별도 난수라 차 배치는 그대로. 알레이·시장 50%, 공원 100%. 뒷담 가까이 z -1.4~-0.9, 화면 안 x -1.6~1.6, 차 풋프린트와도 간격을 지킨다
// 시험용 force: 차 위치(x, z)를 못 박은 시험은 담을 놓지 않고(force.wall 이 있을 때만 { x, z } 그대로 놓음), 어드민 다시 배치(code 만)는 테마 확률 없이 항상 놓는다
// 시장은 가판(원 반지름 0.45, 뒷줄 z -1.45)이 z -1.0 까지 차지해 뒷줄에는 못 놓는다: 가판 앞 z -0.5 까지 허용(가판과 0.3m 간격을 두려면 z -0.59 이상이 필요)
// 시장은 담 앞 접근점(0.28m)이 가판에 막히지 않게 담과 가판 사이를 0.3m 이상 둔다 (M5-4)
const WALL_GAP_MARKET = 0.3;
const WALL_BOX = { x0: -1.6, x1: 1.6, z0: -1.4, z1: -0.9 }, WALL_BOX_MARKET = { ...WALL_BOX, z1: -0.5 };
function wallLayout({ theme, code, obstacles, force }) {
  const kind = PROP_KINDS.lowwall, r = makeRng('props:wall:' + ((force && force.code) || code));
  const fixed = !!(force && force.x !== undefined && force.z !== undefined);
  const fw = force && force.wall && typeof force.wall === 'object' ? force.wall : null;
  if (force ? (fixed && !force.wall) : (!kind.themes.includes(theme) || r() >= (theme === 'park' ? 1 : 0.5))) return [];
  let x = r.range(WALL_BOX.x0, WALL_BOX.x1), z = r.range(WALL_BOX.z0, WALL_BOX.z1);
  if (fw) return [{ id: 'wall0', kind: 'lowwall', x: fw.x, z: fw.z, rot: 0, dir: 1 }];
  const f = nearestFree({ hx: kind.hx, hz: kind.hz, rot: 0 }, obstacles, x, z, theme === 'market' ? WALL_BOX_MARKET : WALL_BOX, 0.05, theme === 'market' ? WALL_GAP_MARKET : OBJ_GAP);
  if (!f && !force) return [];
  if (f) ({ x, z } = f);
  return [{ id: 'wall0', kind: 'lowwall', x, z, rot: 0, dir: 1 }];
}
// 선물 상자 자리 (M6-2, 상자_놓기_설계 5-1): 같은 code·seed 면 모든 화면이 같은 자리(결정적). 기본 화면 안 x -1.2~1.2, z 0~0.8, 통로 0.5m, 접근점은 BOUNDS 안. 20번 시도해 없으면 null
// obstacles: 점·직사각형 장애물, props: 배치된 오브젝트({ kind, x, z, rot }) 목록
export const GIFT_BOX = { x0: -1.2, x1: 1.2, z0: 0, z1: 0.8 };
export const GIFT_GAP = 0.5;
// 기본 카메라(main.js 와 같은 값: 위치 (0,0.95,3.4), 타깃 = 고양이가 원점일 때 (0,0.24,-0.2), 세로 시야각 36도)에서 상자 8꼭짓점이 화면 안인지 (M6-9). 가장 좁은 화면 390/800 기준으로 자리를 정한다
export const GIFT_CAM = { pos: [0, 0.95, 3.4], tgt: [0, 0.24, -0.2], fov: 36, aspect: 390 / 800 };
export function giftInView(x, z, aspect = GIFT_CAM.aspect) {
  const P = GIFT_CAM.pos, T = GIFT_CAM.tgt, th = Math.tan(GIFT_CAM.fov * Math.PI / 360);
  const f = [T[0] - P[0], T[1] - P[1], T[2] - P[2]], fl = Math.hypot(...f); for (let i = 0; i < 3; i++) f[i] /= fl;
  let rx = -f[2], rz = f[0]; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl; // right = f × up(0,1,0), 수평
  const up = [-rz * f[1], rz * f[0] - rx * f[2], rx * f[1]]; // right × f
  for (const dx of [-CRATE.l / 2, CRATE.l / 2]) for (const dz of [-CRATE.w / 2, CRATE.w / 2]) for (const y of [0, CRATE.h]) {
    const d = [x + dx - P[0], y - P[1], z + dz - P[2]], dep = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    if (dep <= 0.05) return false;
    if (Math.abs((d[0] * rx + d[2] * rz) / dep / (th * aspect)) > 1 || Math.abs((d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / dep / th) > 1) return false;
  }
  return true;
}
// 이 z 에서 상자 중심이 화면 안에 들 수 있는 |x| 최댓값 (이분법, 최대 GIFT_BOX.x1). 안 되면 -1
export function giftXMax(z, aspect = GIFT_CAM.aspect) {
  if (!giftInView(0, z, aspect)) return -1;
  let lo = 0, hi = GIFT_BOX.x1; if (giftInView(hi, z, aspect)) return hi;
  for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (giftInView(m, z, aspect)) lo = m; else hi = m; }
  return lo;
}
// 단계별 찾기: 첫 단계(통로 0.5m, z 0~0.8)가 우선이고, 자리가 없으면 더 먼 쪽(z -0.5~) → 통로 0.3m → 오브젝트 최소 간격 순 (M6-9)
const GIFT_STAGES = [{ z0: 0, z1: 0.8, gap: GIFT_GAP }, { z0: -0.5, z1: 0.8, gap: GIFT_GAP }, { z0: -0.5, z1: 0.8, gap: 0.3 }, { z0: -0.5, z1: 0.8, gap: OBJ_GAP }];
export function giftSpot({ code, seed, obstacles = [], props = [] }) {
  const kind = PROP_KINDS.crate, r = makeRng('gift:' + code + ':' + seed);
  const obs = [...obstacles, ...props.filter((p) => p && footOf(p.kind)).map((p) => ({ ...footOf(p.kind), x: p.x, z: p.z, rot: p.rot || 0 }))];
  for (const p of props) if (p && p.kind === 'tower') { const q = slotWorld(p, PROP_KINDS.tower.slots[0]); obs.push({ x: q.ax, z: q.az, r: TOWER_KEEP - OBJ_GAP }); } // 캣타워 접근점 둘레 0.2m (M8-1)
  for (const st of GIFT_STAGES) for (let i = 0; i < 20; i++) {
    const z = r.range(st.z0, st.z1), xm = giftXMax(z);
    if (xm < 0) continue;
    const x = r.range(-xm, xm), az = z + kind.slots[0].approach[1];
    if (az > BOUNDS.z1 || x < BOUNDS.x0 || x > BOUNDS.x1) continue;
    if (isFree({ hx: kind.hx, hz: kind.hz, rot: 0, x, z }, obs, st.gap)) return { kind: 'crate', look: 'gift', x, z, rot: 0, seed };
  }
  return null;
}
// 상자 한 개(Box.get() 모양)를 이 장면의 오브젝트로: 자리가 없으면 null (패널 문구로만 존재). id 'gift0', 행동 배수는 GIFT
export const GIFT = { mult: 2.5, multNew: 4, newMs: 15 * 60000, id: 'gift0' }; // crateSit 배수(처음 15분은 4)
export function giftWorld(box, code, obstacles = [], props = []) {
  if (!box || !Number.isFinite(box.until)) return null;
  const s = giftSpot({ code, seed: box.seed, obstacles, props });
  return s && { ...s, id: GIFT.id, placed: box.placed, until: box.until, boxId: box.id };
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
  for (const p of PROPS.layout) if (!p.gone) for (const s of PROP_KINDS[p.kind].slots) if (s.action === action) out.push(slotWorld(p, s)); // 사라지는 중(gone)인 오브젝트는 새로 고르지 않는다
  return out;
}
// 세계 시계 일정의 자리: 지점 접근점 (스위치 꺼짐·지점 없음이면 null)
export function propHome(action) {
  if (!PROPS.on || !PROP_ACTION_KEYS.has(action)) return null;
  const gift = action === 'giftPeek' || action === 'giftSniff'; // 선물 상자 행동은 상자 지점(crateSit)의 gift 쪽 접근점에서 시작
  const s = propSlots(gift ? 'crateSit' : action).filter((q) => !gift || q.prop.look === 'gift')[0];
  return s ? { x: s.ax, z: s.az } : null;
}
// 점유 (cap 은 지점 정의, O1 은 모두 1)
export const propClaim = (key, a) => { const c = PROPS.claims.get(key); if (c && c !== a) return false; PROPS.claims.set(key, a); return true; };
export const propRelease = (key, a) => { if (PROPS.claims.get(key) === a) PROPS.claims.delete(key); };
export const propOccupant = (key) => PROPS.claims.get(key) || null;
