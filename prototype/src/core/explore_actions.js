// core/explore_actions.js: 햇볕·냄새·뺨 비비기·꼬리 쫓기 (M12-2, R-02 ★2차). 새 자세·오브젝트 없이 기존 자세·오버레이·STEP 조합만.
// behavior.js 는 props.js 를 가져올 수 없어(순환) 따로 둔다. 불러오는 순간 ACTIONS 표에 들어간다(clock.js 가 가져옴). 점수는 낮게, 감정 편향은 clock.js EMO_BIAS.
import { ACTIONS, BOUNDS, STEP } from './behavior.js';
import { PROPS, PROP_KINDS, footOf, rectHit } from './props.js';
import { clamp } from './util.js';

const liveProps = () => PROPS.layout.filter((p) => !p.gone && PROP_KINDS[p.kind]);
const nearProp = (a) => { let best = null, bd = 1e9; for (const p of liveProps()) { const d = Math.hypot(p.x - (a.x || 0), p.z - (a.z || 0)); if (d < bd) { bd = d; best = p; } } return best; };
// 오브젝트 바깥 둘레의 점(월드). corner 이면 가까운 모서리 바깥, 아니면 가까운 변 바깥 (m: 간격)
function edgePoint(p, a, m, corner) {
  const f = footOf(p.kind), c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0), dx = (a.x || 0) - p.x, dz = (a.z || 0) - p.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c, ex = f.hx + m, ez = f.hz + m;
  let nx, nz;
  if (corner) { nx = Math.sign(lx || 1) * ex; nz = Math.sign(lz || 1) * ez; }
  else if (Math.abs(lx) / ex > Math.abs(lz) / ez) { nx = Math.sign(lx || 1) * ex; nz = clamp(lz, -f.hz, f.hz); } else { nz = Math.sign(lz || 1) * ez; nx = clamp(lx, -f.hx, f.hx); }
  return { x: clamp(p.x + nx * c + nz * s, BOUNDS.x0, BOUNDS.x1), z: clamp(p.z - nx * s + nz * c, BOUNDS.z0, BOUNDS.z1) };
}
const freeSpot = (a, r) => { // 오브젝트가 없는 자리(햇볕 자리)
  for (let i = 0; i < 12; i++) { const p = a.randomPoint(r, 2.0); if (!liveProps().some((o) => rectHit({ ...footOf(o.kind), x: o.x, z: o.z, rot: o.rot }, p.x, p.z, 0.3))) return p; }
  return null;
};
// 뺨 비비기 한 번: 모서리 쪽으로 천천히 전진하며 머리를 옆으로 기울이고 문지른다
const rubStep = (x, z, dur, sgn) => ({ start(a) { this.t = 0; a.moveTo(x, z, 0.3, { keepPose: true, timeout: dur + 1 }); }, tick(a, dt) { this.t += dt; const k = Math.sin(Math.min(1, this.t / dur) * Math.PI); a.ov.hdr = 0.42 * sgn * k; a.ov.hy = Math.sin(this.t * 7) * 0.1 * k; a.ov.hdp = 0.1 * k; return this.t >= dur; } });
const spinStep = (turns, spd) => ({ start(a) { this.left = turns * Math.PI * 2; }, tick(a, dt) { const d = Math.min(this.left, spd * dt); a.yaw += d; a.yawTarget = a.yaw; this.left -= d; a.ov.tw = 0.5; a.ov.twf = 6; return this.left <= 0; } });

export const EXPLORE_ACTIONS = {
  sunbathe: { label: '햇볕 쬐며 눕기', score: (a) => 0.01 + a.world.day * 0.12 + (1 - a.E) * 0.03,
    steps: (a, r) => { const p = freeSpot(a, r); if (!p) return [STEP.pose('loaf', r.range(8, 14))];
      return [STEP.walk(p.x, p.z, 0.8), STEP.pose('loaf', 2), STEP.pose(r.chance(0.5) ? 'side' : 'loaf', r.range(18, 40), null, (a, t) => { if (r() < 0.003) a.slowBlink(); }), STEP.pose('loaf', 1.5)]; } },
  sniffProp: { label: '물건 냄새 맡기', score: (a) => (nearProp(a) ? 0.08 + a.p.bold * 0.02 : 0),
    steps: (a, r) => { const o = nearProp(a); if (!o) return [STEP.wait(0.1)]; const p = edgePoint(o, a, 0.3, false);
      return [STEP.walk(p.x, p.z, 0.7), STEP.call((a) => { a.yawTarget = a.yawTo(o); }), STEP.face(Math.atan2(o.x - p.x, o.z - p.z)),
        STEP.pose('crouch', r.range(2.2, 3.6), { np: 0.1, hdp: -0.05 }, (a, t) => { a.ov.hdp = Math.sin(t * 16) * 0.025; }), STEP.pose('sit', 1.6)]; } },
  cheekRub: { label: '모서리에 뺨 비비기', score: (a) => 0.07 + a.p.social * 0.03,
    steps: (a, r) => { const o = nearProp(a); let p, q;
      if (o) { p = edgePoint(o, a, 0.28, true); q = edgePoint(o, a, 0.12, true); } else { const sx = a.x < 0 ? BOUNDS.x0 + 0.3 : BOUNDS.x1 - 0.3; p = { x: sx, z: BOUNDS.z0 + 0.3 }; q = { x: sx + (sx < 0 ? -0.12 : 0.12), z: BOUNDS.z0 + 0.15 }; }
      const n = r.int(2, 3), s = [STEP.walk(p.x, p.z, 0.8), STEP.face(Math.atan2(q.x - p.x, q.z - p.z)), STEP.pose('stand', 0.4, { eye: 0.4 })];
      for (let i = 0; i < n; i++) s.push(rubStep(q.x, q.z, 0.9, i % 2 ? -1 : 1), rubStep(p.x, p.z, 0.7, i % 2 ? -1 : 1));
      s.push(STEP.pose('sit', 1.8, { eye: 0.5 })); return s; } },
  tailChase: { label: '꼬리 쫓기', score: (a) => (a.kitten ? 0.08 + a.p.playful * 0.04 : 0),
    steps: (a, r) => [STEP.pose(r.chance(0.5) ? 'stand' : 'crouch', 0.5), spinStep(r.range(2, 4), r.range(5, 7)), STEP.pose('stand', 0.4), STEP.pose('sit', r.range(1.5, 2.5))] },
};
Object.assign(ACTIONS, EXPLORE_ACTIONS);
