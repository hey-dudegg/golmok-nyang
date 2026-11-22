// 자세 사전 (standPose 대비 바꿀 값)
import { standPose } from './cat_model.js';

// ───────────────────────── 자세 사전 ─────────────────────────
// 각 자세는 standPose 대비 바꿀 값만. plant: 'all' | 'front' | 'hind' | 'min' | 'sit'(앞발 + 엉덩이 깔기) | 'none' (발을 땅에 붙일지)
export const POSES = {
  stand: (d) => ({ plant: 'all' }),
  sit: (d) => ({ plant: 'sit', hp: -0.62, cp: -0.42, np: 0.38, hdp: 0.5, fls: 1.04, fle: 0, frs: 1.04, fre: 0, fsp: 0.04,
    hls: -0.9, hlk: -1.4, hrs: -0.9, hrk: -1.4, hsp: 0.3, tb: 0.42, tc: -0.03, tcs: 0.3, ts: 0.3, tw: 0.04, twf: 0.6, rump: 0.07 }),
  loaf: (d) => ({ plant: 'none', sink: true, h: 0.088 * d.leg + 0.01, hp: 0.02, cp: -0.05, np: 0.1, hdp: 0.02, fls: 1.5, fle: -2.5, frs: 1.5, fre: -2.5, fsp: -0.1,
    hls: -1.55, hlk: 2.7, hrs: -1.55, hrk: 2.7, hsp: -0.1, tb: -0.15, tc: 0.0, tcs: 0.42, ts: 0.6, tw: 0.02, twf: 0.4, eye: 0.6 }),
  curl: (d) => ({ plant: 'none', h: 0.082 * d.leg + 0.008, hp: 0.04, hy: 0.32, cp: 0.08, cy: 0.5, cr: 0.1, np: 0.45, ny: 0.7, hdp: 0.35, hdr: 0.35,
    fls: 1.5, fle: -2.5, frs: 1.5, fre: -2.5, hls: -1.55, hlk: 2.7, hrs: -1.55, hrk: 2.7, tb: -0.1, tc: 0.0, tcs: 0.5, ts: 0.9, tw: 0.0, eye: 0, eL: 0.15, eR: 0.15 }),
  side: (d) => ({ plant: 'none', h: 0.072 * d.chub + 0.006, hr: 1.42, cr: 0.05, np: 0.0, ny: 0.0, hdp: 0.05, hdr: -0.55,
    fls: -0.55, fle: 0.35, frs: -0.25, fre: 0.5, fsp: -0.15, hls: 0.35, hlk: 0.25, hrs: 0.6, hrk: 0.15, hsp: -0.15, tb: -0.05, tc: 0.06, tcs: 0.12, tw: 0.05, twf: 0.5, eye: 0.0 }),
  belly: (d) => ({ plant: 'none', h: 0.078 * d.chub + 0.008, hr: 2.2, cr: 0.25, np: 0.8, hdp: 0.2, hdr: -1.1,
    fls: -1.2, fle: 1.9, frs: -1.0, fre: 1.8, fsp: 0.3, hls: -0.4, hlk: 0.6, hrs: -0.2, hrk: 0.5, hsp: 0.55, tb: -1.2, tc: 0.08, tcs: -0.5, tw: 0.08, twf: 0.8, eye: 0.85 }),
  // 햇볕 눕기: side 바탕으로 더 틀어 눕고 다리를 쭉 뻗음 (M19-2b)
  sun: (d) => ({ ...POSES.side(d), hr: 1.55, cr: 0.3, np: 0.12, hdp: 0.1, hdr: -0.4, fls: -0.9, fle: 0.25, frs: -0.6, fre: 0.45, hls: 0.55, hlk: 0.1, hrs: 0.8, hrk: 0.05, tb: -0.1, tcs: 0.05, tw: 0.03, twf: 0.3, eye: 0.15 }),
  stretch: (d) => ({ plant: 'min', hp: 0.18, cp: 0.36, np: -0.62, hdp: -0.32, fls: -1.6, fle: -0.15, frs: -1.6, fre: -0.15,
    hls: -0.42, hlk: 0.25, hrs: -0.42, hrk: 0.25, tb: 1.25, tc: 0.08, tw: 0.05, eye: 0.35, mouth: 0 }),
  crouch: (d) => ({ plant: 'all', hp: 0.0, cp: 0.04, np: 0.15, hdp: -0.12, fls: 0.95, fle: -1.75, frs: 0.95, fre: -1.75, fsp: 0.08,
    hls: -1.05, hlk: 1.75, hrs: -1.05, hrk: 1.75, hsp: 0.06, tb: -0.12, tc: 0.03, tw: 0.08, twf: 2.6, pupil: 0.95, eL: 0.05, eR: 0.05 }),
  // 꼬리 쫓기: crouch 바탕으로 몸을 C자로 굽혀 머리·꼬리를 마주 보게 (머리 +x, 꼬리 끝도 +x 라 ts·tcs 는 −) (M19-3)
  chase: (d) => ({ ...POSES.crouch(d), hy: 0.5, cy: 1.5, ny: 1.6, hdy: 0.5, hdp: 0.1, ts: -2.3, tcs: -0.1, tb: 0, tc: 0, tw: 0, eL: 0, eR: 0, pupil: 0.95 }),
  groom: (d) => ({ ...POSES.sit(d), fls: -0.5, fle: -1.25, ny: 0.15, np: 0.55, hdp: 0.62, hdr: 0.15, eye: 0.3 }),
  // 꾹꾹이: sit 바탕, 한쪽 앞발 들기 (행동에서 kneadL/kneadR 번갈아). 눈 반쯤 감음
  kneadL: (d) => { const s = POSES.sit(d); return { ...s, fls: s.fls - 0.16, fle: -0.45, np: 0.5, hdp: 0.5, eye: 0.4 }; },
  kneadR: (d) => { const s = POSES.sit(d); return { ...s, frs: s.frs - 0.16, fre: -0.45, np: 0.5, hdp: 0.5, eye: 0.4 }; },
  // 머리 박치기: 서서 몸 앞으로 기울이고 이마를 앞으로. 눈 감은 듯
  headBump: (d) => ({ plant: 'all', hp: 0.0, cp: 0.2, np: 0.35, hdp: 0.05, fls: 0.3, fle: -0.45, frs: 0.3, fre: -0.45,
    hls: -0.3, hlk: 0.45, hrs: -0.3, hrk: 0.45, tb: 0.55, tc: 0.05, tw: 0.1, twf: 1.0, eye: 0.3 }),
  hiss: (d) => ({ plant: 'all', hp: -0.28, cp: 0.34, np: 0.05, hdp: -0.05, fls: -0.08, fle: 0.02, frs: -0.08, fre: 0.02, fsp: 0.05,
    hls: 0.12, hlk: 0.0, hrs: 0.12, hrk: 0.0, hsp: 0.05, tb: 1.2, tc: -0.06, tw: 0.04, twf: 3.0, eL: 1, eR: 1, mouth: 1, puff: 1, pupil: 1, eye: 1 }),
  yawn: (d) => ({ ...POSES.sit(d), np: 0.1, hdp: -0.15, mouth: 1, eye: 0.08, eL: 0.35, eR: 0.35 }),
  eat: (d) => ({ plant: 'all', hp: 0.0, cp: 0.12, np: 0.55, hdp: 0.42, fls: 0.35, fle: -0.55, frs: 0.35, fre: -0.55, hls: -0.75, hlk: 1.15, hrs: -0.75, hrk: 1.15, tb: 0.3, tc: 0.1, tw: 0.15, twf: 1.2, eye: 0.55 }),
  alert: (d) => ({ ...POSES.sit(d), np: 0.25, hdp: 0.3, eL: 0, eR: 0, pupil: 0.7 }),
  greet: (d) => ({ plant: 'all', tb: 1.45, tc: -0.04, tw: 0.08, twf: 1.6, np: -0.12, hdp: -0.05 }),
};
export const PARAM_KEYS = Object.keys(standPose({ H: 0.2 }));
export function poseTarget(dim, name, extra) {
  const base = standPose(dim);
  const p = POSES[name] ? POSES[name](dim) : {};
  return Object.assign(base, { plant: 'all', rump: 0 }, p, extra || {});
}
