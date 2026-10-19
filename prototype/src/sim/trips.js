// 놀러가기 일정 인스턴스 (R-13, D-18·19). 계산은 core/trips.js
import { createTrips, tripConfig } from '../core/trips.js';
import { REGIONS } from '../adapters/regions_data.js';

// ───────────────────────── 놀러가기 · 싸움 · 서로 바라보기 (R-13, D-18, 설계 7장) ─────────────────────────
// 서버 없이 시각만으로 정해진다 (D-19). 30분 칸마다 (지역코드, 칸 번호) 난수로 "누가 어느 이웃으로 몇 시 몇 초에 얼마나(60~120초) 놀러 가는지"를 정하고,
// 같은 칸 안의 외출끼리 겹치면 정해진 순서로 한쪽을 취소한다. 어느 탭에서 계산해도 같은 결과이므로 탭끼리 통신하지 않는다.
// 시험용: ?admin&tripdur=12,14 로 외출 길이(초)를 줄여 볼 수 있다(어드민 주소에서만 열림) (일정이 바뀌므로 같은 주소끼리만 같은 결과)
const TRIP_DUR = (() => { const q = new URLSearchParams(location.search); if (!q.has('admin')) return [60, 120]; const v = (q.get('tripdur') || '').split(',').map(Number); return v.length === 2 && v[0] > 0 && v[1] >= v[0] ? v : [60, 120]; })();
export const TRIP = tripConfig(TRIP_DUR); // 설정값·이웃 표·일정 계산은 core/trips.js
export const unitName = (c) => { const u = REGIONS.byUnit.get(c); return u ? u.n : c; };
export const Trips = createTrips(TRIP, REGIONS);
