// 두 고양이가 만나는 동안의 단계표(Encounter): 싸움·어울리기·서로 바라보기 (설계 7장)
import { BOUNDS } from '../core/behavior.js';
import { TAU, clamp, makeRng } from '../core/util.js';
import { TRIP } from './trips.js';

// 두 마리가 만나는 동안의 단계표. 시각(초)만으로 어느 단계인지 정해지고, 두 고양이는 그 단계표를 따라 움직인다.
// 서로 바라보기: 만나는 내내 두 마리의 시선(lookAt)을 상대 머리에 묶고, 단계마다 몸 방향(yaw)과 떨어진 거리를 정한다.
export class Encounter {
  constructor(app, trip, host, guest, o = {}) {
    this.app = app; this.trip = trip; this.host = host; this.guest = guest; this.kind = trip.kind;
    this.dur = (trip.t1 - trip.t0) / 1000; this.t = 0; this.wall = !o.manual; this.paused = false; this.stepMode = !!o.stepMode; this.done = false;
    this.build();
    this.ph = this.phases[0];
    host.enc = guest.enc = this; host.ext = guest.ext = true; host._ph = guest._ph = null;
    host.steps = []; host.step = null; host.move = null; host.arrived = true; host.jump = null; host.lookAtYou = 0; host.v.root.position.y = 0;
    guest.x = this.edge.x; guest.z = this.edge.z;
    guest.yaw = guest.yawTarget = Math.atan2(this.M.x - guest.x, this.M.z - guest.z);
    guest.setPose('stand'); Object.assign(guest.P, guest.T);
  }
  build() {
    const E = this, H = this.host, G = this.guest, W = H.world, r = makeRng('enc:' + this.trip.id), B = 0.3 * (H.scale + G.scale);
    this.B = B;
    const narrow = innerWidth <= 720;
    let M = { x: 0, z: 0 }, u = { x: 1, z: 0 };
    for (let i = 0; i < 40; i++) { // 만나는 자리(M)와 두 마리를 잇는 축(u): 옆에서 보이도록 가로로 두고, 장애물이 없는 곳
      const th = r.range(-0.3, 0.3) + (r.chance(0.5) ? 0 : Math.PI), uu = { x: Math.cos(th), z: Math.sin(th) };
      const m = { x: r.range(-1, 1) * (narrow ? 0.3 : 0.9), z: r.range(-0.5, 0.45) };
      if ([-0.9, 0, 0.9].every((k) => !W.blocked(m.x + uu.x * B * k, m.z + uu.z * B * k, 0.2))) { M = m; u = uu; break; }
    }
    this.M = M; this.u = u;
    const side = u.x >= 0 ? 1 : -1;
    this.edge = { x: side > 0 ? BOUNDS.x1 - 0.03 : BOUNDS.x0 + 0.03, z: clamp(M.z + r.range(-0.15, 0.15), BOUNDS.z0 + 0.25, BOUNDS.z1 - 0.2) };
    // 중심 c에서 축 uu 방향으로 sep(몸길이 단위, 1 = 코끼리 닿는 거리)만큼 떨어진 두 마리의 자리
    const at = (c, uu, sep, role) => ({ x: c.x + (role === 'host' ? -1 : 1) * uu.x * sep * B / 2, z: c.z + (role === 'host' ? -1 : 1) * uu.z * sep * B / 2 });
    const sc = (a) => a.p.bold + 0.5 * a.p.grumpy + r.range(-0.25, 0.25);
    const hostWins = sc(H) >= sc(G);
    this.winner = hostWins ? 'host' : 'guest'; this.loser = hostWins ? 'guest' : 'host';
    const ph = [];
    const add = (id, name, w, o2) => ph.push({ id, name, w, ...o2 });
    const fight = this.kind === 'fight';
    add('enter', '손님이 들어옴', 0, {
      fixed: TRIP.ENTER, pos: (role) => at(M, u, fight ? 1.7 : 1.5, role), speed: { host: 1.0, guest: 1.8 },
      pose: (role) => (fight ? (role === 'host' ? ['alert', { pupil: 0.85 }] : ['stand', { pupil: 0.8 }]) : ['greet']),
      label: { host: fight ? '낯선 고양이를 경계하는 중' : '손님을 맞는 중', guest: '낯선 골목을 구경하며 들어오는 중' },
    });
    let endC = M; // 마지막 단계들의 중심
    if (fight) {
      // 진 쪽이 달아날 곳: 이긴 쪽의 반대 방향으로 멀리, 장애물이 없는 자리
      const lp = at(M, u, 1.1, this.loser), wp = at(M, u, 1.1, this.winner), away = Math.atan2(lp.z - wp.z, lp.x - wp.x);
      let P = null;
      for (let i = 0; i < 14 && !P; i++) {
        const ang = away + r.range(-0.9, 0.9), d = r.range(1.3, 2.0);
        const q = { x: clamp(lp.x + Math.cos(ang) * d, BOUNDS.x0 + 0.3, BOUNDS.x1 - 0.3), z: clamp(lp.z + Math.sin(ang) * d, BOUNDS.z0 + 0.3, BOUNDS.z1 - 0.2) };
        if (!W.blocked(q.x, q.z, 0.25)) P = q;
      }
      this.fleeTo = P || { x: clamp(lp.x + Math.cos(away) * 0.8, BOUNDS.x0 + 0.3, BOUNDS.x1 - 0.3), z: clamp(lp.z + Math.sin(away) * 0.5, BOUNDS.z0 + 0.3, BOUNDS.z1 - 0.2) };
      add('glare', '노려보기', 0.2, { pos: (role) => at(M, u, 1.5, role), speed: 0.6,
        pose: ['crouch', { pupil: 1, eL: 0.85, eR: 0.85, puff: 0.55, tb: 1.25, twf: 2.2, tw: 0.2 }],
        label: '귀를 젖히고 노려보는 중', fx: (a, tl) => { a.ov.hdp = Math.sin(tl * 1.6) * 0.02; },
        says: [[0.8, 'host', '으르릉…'], [2.6, 'guest', '…']] });
      add('side', '옆으로 몸 세우기', 0.14, { pos: (role) => at(M, u, 1.3, role), speed: 0.5,
        pose: ['hiss', { mouth: 0 }], label: '털을 세우고 몸을 옆으로 세우는 중',
        yaw: (a, o, role) => a.yawTo(o) + (role === 'host' ? 1 : -1) * Math.PI / 2, fx: (a, tl) => { a.ov.hr = Math.sin(tl * 2) * 0.04; } });
      add('cry', '울음소리', 0.12, { pos: (role) => at(M, u, 1.15, role), speed: 0.5,
        pose: ['hiss', {}], label: '긴 울음소리를 내는 중', fx: (a, tl) => { a.ov.mouth = -0.45 * (0.5 + 0.5 * Math.sin(tl * 7)); },
        says: [[0.3, 'host', '라오오- 니겅니겅니겅'], [2.6, 'guest', '캬아아악!']] });
      add('swat', '앞발 치기', 0.2, { pos: (role) => at(M, u, 1.1, role), speed: 0.5,
        pose: ['groom', { fls: -1.1, fle: -0.2, eL: 0.6, eR: 0.6, eye: 1, hdp: 0.2, np: 0.2, pupil: 1, puff: 0.4 }], label: '앞발을 휘두르는 중',
        fx: (a, tl, role) => { const k = (tl * 0.9 + (role === 'guest' ? 0.5 : 0)) % 1; a.ov.fls = Math.sin(tl * 22) * 0.35 * (k < 0.4 ? 1 : 0.1); },
        says: [[0.2, 'host', '냥!'], [1.4, 'guest', '캭!'], [3.0, 'host', '냥냥!']] });
      add('chase', '추격', 0.2, {
        pos: (role, _E, tl) => {
          if (role === E.loser) return tl < 0.4 ? null : E.fleeTo;
          const l = E[E.loser], c = E[E.winner], dx = c.x - l.x, dz = c.z - l.z, d = Math.hypot(dx, dz) || 1, stop = 0.8 * B;
          return d <= stop ? null : { x: l.x + dx / d * stop, z: l.z + dz / d * stop };
        },
        speed: { [this.loser]: 3.1, [this.winner]: 2.4 },
        pose: (role) => (role === E.loser ? ['crouch', { pupil: 0.9, eL: 0.6, eR: 0.6 }] : ['alert', { pupil: 0.8 }]),
        label: { [this.winner]: '쫓아가는 중', [this.loser]: '도망치는 중' },
        says: [[0.2, this.loser, '!']] });
      add('retreat', '한쪽이 물러남', 0.14, { pos: null,
        pose: (role) => (role === E.loser ? ['loaf', { eL: 0.5, eR: 0.5, pupil: 0.9 }] : ['sit', { puff: 0.2, pupil: 0.7 }]),
        label: { [this.winner]: '으스대는 중', [this.loser]: '움츠러든 중' },
        yaw: (a, o, role) => (role === E.loser ? a.yawTo(o) + Math.PI * 0.55 : a.yawTo(o)), // 진 쪽은 몸은 돌려도 고개는 돌아본다
        says: [[1.0, this.winner, '흥']] });
    } else {
      add('sniff', '코인사', 0.22, { pos: (role) => at(M, u, 1.0, role), speed: 0.5,
        pose: ['greet', { np: 0.25, hdp: 0.2 }], label: '코를 맞대고 인사하는 중', fx: (a, tl) => { a.ov.hdp = Math.sin(tl * 3) * 0.03; },
        says: [[0.8, 'host', '냥'], [2.0, 'guest', '먀']] });
      // 나란히 걷기: 세 곳을 차례로 지나며 두 마리가 옆에 붙어 걷는다
      const wps = []; let cur = M;
      for (let k = 0; k < 3; k++) {
        let q = null;
        for (let i = 0; i < 14 && !q; i++) {
          const ang = r.range(0, TAU), d = r.range(0.6, 0.9);
          const c = { x: clamp(cur.x + Math.cos(ang) * d, BOUNDS.x0 + 0.5, BOUNDS.x1 - 0.5), z: clamp(cur.z + Math.sin(ang) * d * 0.7, BOUNDS.z0 + 0.4, BOUNDS.z1 - 0.3) };
          if (!W.blocked(c.x, c.z, 0.3)) q = c;
        }
        q = q || cur; wps.push(q); cur = q;
      }
      endC = wps[2];
      add('walk', '나란히 걷기', 0.3, {
        pos: (role, _E, tl, p) => {
          const seg = clamp(Math.floor(tl / (p.dur / 3)), 0, 2), p0 = seg === 0 ? M : wps[seg - 1], p1 = wps[seg];
          const dx = p1.x - p0.x, dz = p1.z - p0.z, d = Math.hypot(dx, dz) || 1, off = (role === 'host' ? -1 : 1) * 0.32 * B;
          return { x: p1.x - dz / d * off, z: p1.z + dx / d * off };
        },
        speed: 0.9, label: '나란히 걷는 중' });
      add('groom', '서로 그루밍', 0.24, { pos: (role) => at(endC, u, 1.0, role), speed: 0.6, pose: ['groom', {}], label: '서로 털을 핥아 주는 중',
        fx: (a, tl, role, _E, p) => {
          if ((tl < p.dur / 2) === (role === 'host')) { a.ov.hdp = Math.sin(tl * 9) * 0.09; a.ov.fle = Math.sin(tl * 9) * 0.12; a.ov.mouth = 0.12 + Math.sin(tl * 9) * 0.1; }
          else { a.ov.fls = 1.5; a.ov.fle = 1.25; a.ov.hdr = 0.2; a.ov.eye = -0.25; } // 받는 쪽은 앞발을 내리고 눈을 가늘게
        } });
      const n = { x: -u.z, z: u.x }; if (n.z < 0) { n.x = -n.x; n.z = -n.z; } // 식빵은 같은 쪽(화면 앞쪽)을 보고 나란히
      add('loaf', '나란히 식빵', 0.2, { pos: (role) => at(endC, u, 0.75, role), speed: 0.6, pose: ['loaf', {}], label: '나란히 식빵을 굽는 중',
        yaw: () => Math.atan2(n.x, n.z), says: [[2.0, 'host', '그르릉']] });
    }
    add('leave', '손님이 돌아감', 0, {
      fixed: TRIP.LEAVE, pos: (role) => (role === 'guest' ? { x: this.edge.x, z: this.edge.z } : null), speed: 1.7,
      pose: (role) => (fight && role === E.loser ? ['loaf', { eL: 0.4, eR: 0.4, pupil: 0.8 }] : ['sit']),
      label: { host: '떠나는 손님을 지켜보는 중', guest: '자기 동네로 돌아가는 중' },
      yaw: (a, o, role) => (fight && role === 'host' && E.loser === 'host' ? a.yawTo(o) + Math.PI * 0.55 : a.yawTo(o)),
    });
    // 단계 길이: 들어옴·돌아감은 고정, 나머지는 남은 시간을 가중치대로 나눔
    const mid = Math.max(10, this.dur - TRIP.ENTER - TRIP.LEAVE), sw = ph.reduce((s, p) => s + (p.fixed ? 0 : p.w), 0);
    let t = 0;
    for (const p of ph) { p.dur = p.fixed || (p.w / sw) * mid; p.t0 = t; t += p.dur; p.t1 = t; }
    this.phases = ph; this.total = t;
  }
  phaseAt(t) { const ps = this.phases; for (const p of ps) if (t < p.t1) return p; return ps[ps.length - 1]; }
  // 매 프레임 (앱이 부름). wall이면 시계(지금 - 시작)를 따르고, manual이면 dt만큼 흘러가며 멈춤·다음 단계가 된다.
  step(dt) {
    if (this.done) return;
    const target = this.wall ? (Date.now() - this.trip.t0) / 1000 : this.paused ? this.t : this.t + dt;
    if (target - this.t > 1.2) this.ffTo(target); else this.t = target;
    const ph = this.phaseAt(this.t);
    if (this.stepMode && !this.wall && !this.paused && ph !== this.ph && this.t < this.dur) { this.paused = true; this.t = ph.t0 + 0.001; } // 단계가 바뀌는 곳에서 멈춤
    this.ph = this.phaseAt(this.t);
    if (this.t >= this.dur) this.finish();
  }
  ffTo(target) { // 화면 없이 빨리 감기 (중간에 들어온 사람도 같은 자리에서 시작)
    const a = this.host, b = this.guest; a.sim = b.sim = true;
    target = Math.min(target, this.dur);
    while (this.t < target - 1e-6) { const d = Math.min(0.1, target - this.t); this.t += d; this.ph = this.phaseAt(this.t); a.update(d); b.update(d); }
    a.sim = b.sim = false;
  }
  nextPhase() { // 다음 단계 시작으로 건너뛰기 (멈춘 채로)
    this.wall = false; const i = this.phases.indexOf(this.phaseAt(this.t)), nx = this.phases[Math.min(i + 1, this.phases.length - 1)];
    this.t = nx.t0 + 0.001; this.ph = nx; this.paused = true;
  }
  finish() { if (this.done) return; this.done = true; this.app.endEnc(this); }
}
