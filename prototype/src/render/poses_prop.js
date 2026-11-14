// 오브젝트 행동용 자세 (M3-6 O1): 엎드리기(lie)·납작 숨기(hideLow)·빼꼼(peek). 기능 스위치가 켜질 때만 POSES 에 더한다 (꺼짐 = 기존 기준값 그대로)
import { POSES } from './poses.js';

export const PROP_POSES = {
  // 스핑크스: 앞발을 앞으로 뻗고 뒷다리는 접음, 고개를 든다 (loaf 는 앞발을 접음)
  lie: (d) => ({ plant: 'none', h: 0.088 * d.leg + 0.01, hp: 0.02, cp: -0.12, np: -0.22, hdp: 0.0, fls: 0.45, fle: -2.0, frs: 0.45, fre: -2.0, fsp: 0.12,
    hls: -1.55, hlk: 2.7, hrs: -1.55, hrk: 2.7, hsp: -0.1, tb: -0.15, tc: 0.0, tcs: 0.42, ts: 0.6, tw: 0.04, twf: 0.5, eye: 0.7 }),
  // 가장 낮은 자세: 배를 바닥에 대고 귀를 눕힘, 눈동자 큼 (차 밑 틈 0.20m 검증 기준)
  hideLow: (d) => ({ plant: 'none', h: 0.05 * d.leg + 0.004, hp: 0.0, cp: 0.3, np: 0.7, hdp: 0.45, fls: 1.5, fle: -2.5, frs: 1.5, fre: -2.5, fsp: -0.1,
    hls: -1.55, hlk: 2.7, hrs: -1.55, hrk: 2.7, hsp: -0.1, tb: -0.2, tc: 0.0, tcs: 0.5, ts: 0.9, tw: 0.0, eL: 1, eR: 1, pupil: 1, eye: 0.95 }),
  // 머리만 내밀기: 몸은 낮게 두고 목을 올려 귀를 세움
  peek: (d) => ({ plant: 'none', h: 0.052 * d.leg + 0.004, hp: 0.0, cp: 0.26, np: 0.55, hdp: 0.33, fls: 1.5, fle: -2.5, frs: 1.5, fre: -2.5, fsp: -0.1,
    hls: -1.55, hlk: 2.7, hrs: -1.55, hrk: 2.7, hsp: -0.1, tb: -0.2, tc: 0.0, tcs: 0.5, ts: 0.9, tw: 0.0, eL: 0.1, eR: 0.1, pupil: 0.85, eye: 1 }),
};
export function registerPropPoses(on) {
  if (on) Object.assign(POSES, PROP_POSES); else for (const k of Object.keys(PROP_POSES)) delete POSES[k];
}
