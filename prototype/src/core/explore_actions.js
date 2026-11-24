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
  const sx = Math.sign(nx), sz = Math.sign(nz); // da·db: 모서리에서 두 변을 따라 몸 쪽으로 가는 단위 방향(월드)
  return { x: clamp(p.x + nx * c + nz * s, BOUNDS.x0, BOUNDS.x1), z: clamp(p.z - nx * s + nz * c, BOUNDS.z0, BOUNDS.z1), da: { x: -sx * c, z: sx * s }, db: { x: -sz * s, z: -sz * c } };
}
const freeSpot = (a, r) => { // 오브젝트가 없는 자리(햇볕 자리)
  for (let i = 0; i < 12; i++) { const p = a.randomPoint(r, 2.0); if (!liveProps().some((o) => rectHit({ ...footOf(o.kind), x: o.x, z: o.z, rot: o.rot }, p.x, p.z, 0.3))) return p; }
  return null;
};
// 뺨 비비기 한 번: 모서리 쪽으로 천천히 전진하며 머리를 옆으로 기울이고 문지른다
// moveTo 의 speed 는 배율(실속 ≈ 0.26×(0.65+0.35×scale)×speed m/s)이라, dur 의 k 비율 안에 (x,z)에 닿을 배율을 구한다 (M19-8)
const spdFor = (a, x, z, dur, k) => Math.max(0.3, Math.hypot(x - a.x, z - a.z) / (dur * k * 0.26 * (0.65 + 0.35 * (a.scale || 1))));
const rubStep = (x, z, dur, sgn) => ({ start(a) { this.t = 0; a.moveTo(x, z, spdFor(a, x, z, dur, 0.6), { keepPose: true, timeout: dur + 1 }); }, tick(a, dt) { this.t += dt; const k = Math.sin(Math.min(1, this.t / dur) * Math.PI); a.ov.hdr = 0.42 * sgn * k; a.ov.hy = Math.sin(this.t * 7) * 0.1 * k; a.ov.hdp = 0.1 * k; return this.t >= dur; } });
// 옆구리 지나가기(M19-4): 모서리 q 에서 s 로 0.35 m/s 로 걸으며 몸통·꼬리를 모서리 쪽으로 기울여 스친다. k=sin(π·진행률)
const flankStep = (x, z, dur, sg) => ({ start(a) { this.t = 0; a.setPose('stand', { tb: 1.3, tc: -0.12, eye: 0.4 }); a.moveTo(x, z, spdFor(a, x, z, dur, 0.6), { keepPose: true, timeout: dur + 1 }); }, tick(a, dt) { this.t += dt; const k = Math.sin(Math.min(1, this.t / dur) * Math.PI); a.ov.hr = 0.12 * sg * k; a.ov.cy = -0.3 * sg * k; a.ov.hdr = 0.3 * sg * k; a.ov.ts = 0.4 * sg; return this.t >= dur; } });
// 박치기 한 번: 이마를 모서리로 밀어 넣는다(hdp·np 만, 좌우 흔들기 없음)
const bumpStep = (x, z, dur, o = {}) => ({ start(a) { this.t = 0; a.moveTo(x, z, spdFor(a, x, z, dur, 0.6), { keepPose: true, timeout: dur + 1, ...o }); }, tick(a, dt) { this.t += dt; const k = Math.sin(Math.min(1, this.t / dur) * Math.PI); a.ov.hdp = 0.12 * k; a.ov.np = 0.1 * k; return this.t >= dur; } });
// 꼬리 쫓기 회전: sg 방향(+ 면 yaw 증가), 종종걸음 φ = 회전각×4, 휘두르기 시각 sw 마다 머리 쪽 앞발 0.3초 (M19-3)
const spinStep = (turns, spd, sg = 1, sw = []) => ({ start(a) { this.left = turns * Math.PI * 2; this.rot = 0; this.t = 0; }, tick(a, dt) { this.t += dt; const d = Math.min(this.left, spd * dt); a.yaw += sg * d; a.yawTarget = a.yaw; this.left -= d; this.rot += d; const s = 0.3 * Math.sin(this.rot * 4); a.ov.fls = s; a.ov.hrs = s; a.ov.frs = -s; a.ov.hls = -s;
  for (const w of sw) { const u = this.t - w; if (u >= 0 && u < 0.3) a.ov[sg > 0 ? 'fls' : 'frs'] += -0.7 * (u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.18); } return this.left <= 0; } });

const kin = (a, o) => o.cat.mother === a.cat.id || a.cat.mother === o.cat.id; // hissAt 과 같은 가족 조건
const crabStep = (ang, d, sp) => STEP.call((a) => a.moveTo(a.x + Math.sin(ang) * d, a.z + Math.cos(ang) * d, sp, { keepPose: 'arch', crab: true }));
const sideLegs = { fsp: [[0, 0.06], [0.25, 0.16], [0.5, 0.06]], hsp: [[0, 0.16], [0.25, 0.06], [0.5, 0.16]] }; // 옆걸음 발 벌림 번갈아
function archThreat(a, r, o) {
  const sg = r.chance(0.5) ? 1 : -1, away = () => a.yawTo(o) + Math.PI, hiss = r.chance(0.3 + a.p.grumpy * 0.5);
  const dist = r.range(0.3, 0.45), toward = a.p.bold > 0.6;
  const s = [STEP.call((a) => { a.yawTarget = a.yawTo(o) + sg * Math.PI / 2; a.lookAt = o; }), STEP.track('arch', 0.8, null, { puff: [[0, 0.4], [0.3, 0]] }),
    STEP.call((a) => { const d = toward ? Math.min(dist, Math.max(0, Math.hypot(o.x - a.x, o.z - a.z) - 0.6)) : dist, g = toward ? away() + Math.PI : away(); a.moveTo(a.x + Math.sin(g) * d, a.z + Math.cos(g) * d, 0.35, { keepPose: 'arch', crab: true }); }),
    STEP.track('arch', r.range(1.8, 2.6), null, sideLegs, { period: 0.5 })];
  if (hiss) s.push(STEP.call((a) => a.say('하악!')), STEP.pose('hiss', 1.2));
  s.push(STEP.call((a) => { a.lookAt = null; }), STEP.call((a) => a.moveTo(a.x + Math.sin(away()) * 0.8, a.z + Math.cos(away()) * 0.8, 1.1)), STEP.wait(0.8), STEP.pose('sit', 2, { eL: 0.4, eR: 0.4, puff: 0.3 }));
  return s;
}
function archPlay(a, r) { // 새끼 놀이형: 좌우 번갈아 2회 뒤 웅크림, 50% 로 질주
  const y = r.range(-Math.PI, Math.PI), s = [STEP.call((a) => { a.yawTarget = y; }), STEP.track('arch', 0.8, null, { puff: [[0, 0.4], [0.3, 0]] })];
  for (let i = 0; i < 2; i++) s.push(crabStep(y + Math.PI / 2 * (i ? -1 : 1), 0.25, 0.6), STEP.track('arch', 1.0, null, sideLegs, { period: 0.5 }));
  s.push(STEP.pose('crouch', 0.6)); if (r.chance(0.5)) s.push(...ACTIONS.zoom.steps(a, r)); return s;
}
export const EXPLORE_ACTIONS = {
  sunbathe: { label: '햇볕 쬐며 눕기', score: (a) => 0.01 + a.world.day * 0.12 + (1 - a.E) * 0.03,
    steps: (a, r) => { const p = freeSpot(a, r); const hold = r.range(18, 40), sg = (a) => { if (r() < 0.003) a.slowBlink(); };
      const ex = []; for (let i = r.chance(0.5) ? 2 : 1; i > 0; i--) { const t0 = r.range(2, Math.max(3, hold - 3)); ex.push(t0); } // 기지개 시각(M19-2b)
      const cv = (t0, v) => [[0, 0], [t0, 0], [t0 + 0.8, v], [t0 + 2.0, 0]], fl = [], hl = []; for (const t0 of ex.sort((x, y) => x - y)) { fl.push(...cv(t0, -0.35)); hl.push(...cv(t0, 0.25)); }
      const mono = (kf) => { const o = []; for (const k of kf) if (!o.length || k[0] > o[o.length - 1][0]) o.push(k); return o; };
      return [...(p ? [STEP.walk(p.x, p.z, 0.8)] : []), STEP.pose('loaf', 1.5), STEP.pose('sun', 1.5), STEP.track('sun', hold, null, { fls: mono(fl), frs: mono(fl), hls: mono(hl), hrs: mono(hl) }, { fx: sg }), STEP.pose('loaf', 1.5)]; } },
  sniffProp: { label: '물건 냄새 맡기', score: (a) => (nearProp(a) ? 0.08 + a.p.bold * 0.02 : 0),
    steps: (a, r) => { const o = nearProp(a); if (!o) return [STEP.wait(0.1)]; const p = edgePoint(o, a, 0.3, false);
      return [STEP.walk(p.x, p.z, 0.7), STEP.call((a) => { a.yawTarget = a.yawTo(o); }), STEP.face(Math.atan2(o.x - p.x, o.z - p.z)),
        STEP.pose('crouch', r.range(2.2, 3.6), { np: 0.1, hdp: -0.05 }, (a, t) => { a.ov.hdp = Math.sin(t * 16) * 0.025; }), STEP.pose('sit', 1.6)]; } },
  cheekRub: { label: '모서리에 뺨 비비기', score: (a) => 0.07 + a.p.social * 0.03,
    steps: (a, r) => { const o = nearProp(a); let p, q;
      if (o) { p = edgePoint(o, a, 0.28, true); q = edgePoint(o, a, 0.12, true); } else { const sx = a.x < 0 ? BOUNDS.x0 + 0.3 : BOUNDS.x1 - 0.3; p = { x: sx, z: BOUNDS.z0 + 0.3 }; q = { x: sx + (sx < 0 ? -0.12 : 0.12), z: BOUNDS.z0 + 0.15 }; }
      const n = r.int(2, 3), s = [STEP.walk(p.x, p.z, 0.8), STEP.face(Math.atan2(q.x - p.x, q.z - p.z)), STEP.pose('stand', 0.4, { eye: 0.4 })];
      for (let i = 0; i < n; i++) {
        const sgn = i % 2 ? -1 : 1, d = q.da && (i % 2 ? q.db : q.da);
        s.push(rubStep(q.x, q.z, 0.9, sgn));
        if (d && o) { const sx = q.x + d.x * 0.35, sz = q.z + d.z * 0.35, sg = Math.sign(d.x * (o.z - q.z) - d.z * (o.x - q.x)) || 1; s.push(flankStep(sx, sz, 1.0, sg), STEP.face(Math.atan2(q.x - sx, q.z - sz)), STEP.pose('stand', 0.5, { eye: 0.4 })); }
        else s.push(rubStep(p.x, p.z, 0.7, sgn));
      }
      s.push(STEP.pose('sit', 1.8, { eye: 0.5 })); return s; } },
  knead: { label: '꾹꾹이', score: (a) => 0.06 + ((1 - a.p.energy) * 0.5 + a.p.social * 0.5) * 0.03,
    steps: (a, r) => { const n = r.int(6, 12), s = [STEP.pose('sit', 0.6)]; let sg;
      for (let i = 0, d; i < n; i++) { d = r.range(0.38, 0.48), sg = i % 2 ? 1 : -1; s.push(STEP.track(i % 2 ? 'kneadR' : 'kneadL', d, null, { cr: [[0, 0], [0.15, 0.04 * sg], [d, 0]], cp: [[0, 0], [0.15, 0.03], [d, 0]] })); } // 누름: 디딘 발 쪽으로 살짝 실림
      s.push(STEP.pose(r.chance(0.5) ? 'loaf' : 'sit', r.range(1.5, 3))); return s; } },
  headBump: { label: '모서리에 머리 박치기', score: (a) => (nearProp(a) ? 0.06 + a.p.social * 0.03 : 0),
    steps: (a, r) => { const o = nearProp(a); if (!o) return [STEP.wait(0.1)]; const p = edgePoint(o, a, 0.28, true), q = edgePoint(o, a, 0.12, true), n = r.int(2, 3);
      const s = [STEP.walk(p.x, p.z, 0.8), STEP.face(Math.atan2(q.x - p.x, q.z - p.z)), STEP.pose('headBump', 0.4)];
      for (let i = 0; i < n; i++) s.push(bumpStep(q.x, q.z, 0.5), bumpStep(p.x, p.z, 0.6, { back: true }));
      s.push(STEP.pose('sit', 1.8, { eye: 0.5 })); return s; } },
  tailChase: { label: '꼬리 쫓기', score: (a) => (a.kitten ? 0.08 + a.p.playful * 0.04 : 0),
    steps: (a, r) => { const sg = r.chance(0.5) ? 1 : -1, turns = r.range(2, 4), spd = r.range(5, 7), sw = []; for (let x = r.range(0.8, 1.3); x < turns * 6.2832 / spd; x += r.range(0.8, 1.3)) sw.push(x); return [STEP.pose('chase', 0.6, sg > 0 ? null : { hy: -0.5, cy: -1.5, ny: -1.6, hdy: -0.5, ts: 2.3, tcs: 0.1 }), spinStep(turns, spd, sg, sw), STEP.pose('stand', 0.4), STEP.pose('sit', r.range(1.5, 2.5))]; } },
  archSide: { label: '등 세우고 옆걸음', score: (a) => { const o = a.nearestCat(1.2); if (o && !kin(a, o)) return (a.p.bold * 0.5 + a.p.grumpy * 0.4) * 0.5; return a.kitten ? a.p.playful * 0.15 : 0; }, // 이웃 있으면 위협형, 없으면 새끼 놀이형 (M23-4b)
    steps: (a, r) => { const o = a.nearestCat(1.2); return o && !kin(a, o) ? archThreat(a, r, o) : archPlay(a, r); } },
};
Object.assign(ACTIONS, EXPLORE_ACTIONS);
