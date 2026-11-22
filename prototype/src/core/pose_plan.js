// 자세 전환 계획 (M4-6, D-129): 몸 회전(roll/pitch)이 한계를 넘는 전환은 여러 단계로 나눈다.
// 눕는 쪽이면 다리를 먼저 접고(TUCK) 그 뒤에 몸을 단계별로 돌린다. 순수 계산이라 node 에서 시험한다.
export const BODY_KEYS = ['hp', 'hy', 'hr', 'cp', 'cy', 'cr'];
const FOLLOW_KEYS = ['np', 'ny', 'hdp', 'hdy', 'hdr']; // 목·머리는 몸 단계를 따라 같이 나눠 움직인다
const TAIL_KEYS = ['tb', 'tc', 'tcs', 'ts'];
export const ROT_LIMIT = 0.52; // 한 단계에서 허용하는 몸 회전(라디안, 약 30도)
export const STAGE_MIN = 0.42; // 단계마다 확보하는 최소 시간(초)
export const RISE_MAX = 1.0; // 이 안의 회전이면 다리를 접은 채 돌지 않고 한꺼번에 섞어 일어난다(옆으로 누운 자세는 제외)
export const FOLD_HOLD = 0.5; // 다리 접기 단계 시간
export const TUCK = { fls: 1.5, fle: -2.5, frs: 1.5, fre: -2.5, fsp: -0.1, hls: -1.55, hlk: 2.7, hrs: -1.55, hrk: 2.7, hsp: -0.1 };
const LOW = (p) => p.plant === 'none';

export function bodyDelta(a, b) { let m = 0; for (const k of BODY_KEYS) m = Math.max(m, Math.abs((a[k] || 0) - (b[k] || 0))); return m; }
const mix = (a, b, t) => a + (b - a) * t;

// from(현재 값)에서 to(목표)로 가는 단계들. [{T, hold}] — 마지막 단계의 T 는 to 그 자체(같은 객체)
export function planPose(from, to) {
  const d = bodyDelta(from, to);
  if (to.sink || (LOW(from) && !LOW(to) && d > ROT_LIMIT && d <= RISE_MAX)) return planSink(from, to, d); // 일어서기(식빵·웅크림 → 앉음)도 다리 펴기와 몸 올리기를 같이 섞는다(M20-3)
  if (d <= ROT_LIMIT) return [{ T: to, hold: 0 }];
  const fold = LOW(from) !== LOW(to) || LOW(to); // 눕는 자세가 낀 전환은 다리를 접은 채 몸을 돌린다
  const n = Math.max(Math.ceil(d / ROT_LIMIT), fold ? Math.ceil(tailDelta(from, to) / TAIL_LIMIT) : 1), hold = Math.max(STAGE_MIN, (d / n) / 1.2); // 접는 전환은 꼬리 변화량으로도 단계 수(M19-8)
  const out = [];
  if (fold && !LOW(from)) out.push({ T: { ...from, ...TUCK, plant: 'none' }, hold: FOLD_HOLD });
  for (let k = 1; k < n; k++) {
    const t = k / n, s = { ...to };
    for (const key of BODY_KEYS.concat(FOLLOW_KEYS)) s[key] = mix(from[key] || 0, to[key] || 0, t);
    // 꼬리도 몸 회전에 맞춰 나눈다(먼저 목표로 튀면 엉덩이 기울기와 어긋나 상자 벽 밖으로 샌다)
    if (fold) { Object.assign(s, TUCK); s.plant = 'none'; s.h = mix(from.h, to.h, t); for (const key of TAIL_KEYS) if (typeof to[key] === 'number' && typeof from[key] === 'number') s[key] = mix(from[key], to[key], t); } else { for (const key of Object.keys(to)) if (typeof to[key] === 'number' && typeof from[key] === 'number') s[key] = mix(from[key], to[key], t); }
    out.push({ T: s, hold });
  }
  out.push({ T: to, hold: 0 });
  return out;
}

// E1 가라앉기 전환: 다리를 접지 않고 발을 디딘 채 전 키를 섞어 내려간다. 앉음에서 오면 뒷다리 4키는 처음부터 목표값
const HIND_KEYS = ['hls', 'hlk', 'hrs', 'hrk'];
const TAIL_LIMIT = 0.55; // 가라앉기 한 단계에서 꼬리 키가 움직이는 상한(라디안). 꼬리 변화가 크면 단계 수를 늘린다
function tailDelta(a, b) { let m = 0; for (const k of TAIL_KEYS) if (typeof a[k] === 'number' && typeof b[k] === 'number') m = Math.max(m, Math.abs(a[k] - b[k])); return m; }
function planSink(from, to, d) {
  const n = Math.max(2, Math.ceil(d / ROT_LIMIT), Math.ceil(tailDelta(from, to) / TAIL_LIMIT)), hold = Math.max(STAGE_MIN, (d / n) / 1.2), out = [];
  for (let k = 1; k < n; k++) {
    const t = k / n, s = { ...to };
    for (const key of Object.keys(to)) if (typeof to[key] === 'number' && typeof from[key] === 'number') s[key] = mix(from[key], to[key], t);
    if (from.plant === 'sit') for (const key of HIND_KEYS) if (typeof to[key] === 'number') s[key] = to[key];
    s.plant = 'min'; out.push({ T: s, hold });
  }
  out.push({ T: to, hold: 0 });
  return out;
}

// 보간 속도 (agent 와 시험이 같이 쓴다)
export function blendRate(k, fast) { return fast ? 14 : k === 'eye' || k === 'mouth' ? 10 : k === 'puff' ? 3 : k === 'h' ? 5 : 4.2; }
export function blendPose(P, T, keys, dt, fast, damp) {
  for (const k of keys) { if (T[k] === undefined) continue; P[k] = damp(P[k], T[k], blendRate(k, fast), dt); }
}

// 현재 값 P 와 목표 큐. T 는 지금 향하는 단계, goal 은 최종 목표
export class PoseQueue {
  constructor(P) { this.P = P; this.T = { ...P }; this.goal = this.T; this.q = []; this.wait = 0; }
  set(to) {
    const st = planPose({ ...this.P, plant: this.goal.plant }, to); // E3: P.plant 는 안 바뀌므로 직전 목표의 plant 를 쓴다
    this.goal = to; this.T = st[0].T; this.wait = st[0].hold; this.q = st.slice(1);
  }
  tick(dt) {
    if (!this.q.length) return false;
    this.wait -= dt;
    if (this.wait > 0) return false;
    const s = this.q.shift(); this.T = s.T; this.wait = s.hold; return true;
  }
  snap() { this.q = []; this.T = this.goal; Object.assign(this.P, this.goal); }
}
