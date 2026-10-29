// 고양이 찾기 판정 (D-68, M1-10). 순수 계산: 화면 좌표(NDC)로 투영된 점이 가장자리 여백 밖인지.
export const FIND = { margin: 0.15, hyst: 0.03, ms: 500 }; // 여백 15%, 깜빡임 막는 되돌림 폭, 이동 시간

// ndc: {x, y, z} (three 의 project() 결과). z>1 이면 카메라 뒤/먼 쪽 → 화면 밖.
export function isOutside(ndc, wasShown = false, margin = FIND.margin, hyst = FIND.hyst) {
  if (!ndc || !(ndc.z <= 1)) return true;
  let lim = 1 - 2 * margin; // 여백 15% = NDC 폭의 30%
  if (wasShown) lim -= 2 * hyst; // 이미 버튼이 떠 있으면 조금 더 안쪽으로 들어와야 숨긴다
  return Math.abs(ndc.x) > lim || Math.abs(ndc.y) > lim;
}
// 모든 고양이가 밖이면 버튼을 보인다 (한 마리라도 안에 있으면 숨김)
export function shouldShow(ndcs, wasShown = false) {
  if (!ndcs.length) return false;
  return ndcs.every((n) => isOutside(n, wasShown));
}
// 이동 진행: t(0..1) 를 ease 한 값
export const easeInOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// 기준 고양이: 선택한 고양이가 있으면 그 고양이만, 없으면 보이는 고양이 전부 (D-68 보완)
export function findTargets(agents, selected) {
  const live = agents.filter((a) => !a.hidden);
  return selected && !selected.hidden && live.includes(selected) ? [selected] : live;
}
