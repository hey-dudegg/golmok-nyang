// core/time.js: 서비스 시간 상수와 해의 위치 (원래 30_genome·50_scene 구역, D-33 단계 2)
// core 규칙: three·DOM·window·전역 app 에 닿지 않는다. 다른 core 모듈만 import 한다(순환 금지).
export const DAY = 86400000;
export const EPOCH = Date.UTC(2026, 8, 1, -9); // 2026-09-01 00:00 KST
export const TIME_SCALE = 7; // 서비스 시간 = 실제의 7배
export function sunPosition(date, lat, lng) {
  const rad = Math.PI / 180;
  const d = (date.getTime() / DAY) - 10957.5; // days since J2000
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const RA = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const GMST = (18.697374558 + 24.06570982441908 * d) % 24;
  const LST = (GMST * 15 + lng) * rad;
  const HA = LST - RA;
  const alt = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(HA));
  const az = Math.atan2(-Math.sin(HA), Math.tan(dec) * Math.cos(lat * rad) - Math.sin(lat * rad) * Math.cos(HA));
  return { alt, az };
}
