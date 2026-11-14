// 날씨 연결 (M3-d·e): 시/도 그래프로 Wx 를 켜고, 지역·시각이 바뀔 때 장면(scene)과 패널(panel)에 알린다.
import { REGIONS } from '../adapters/regions_data.js';
import { Wx } from '../state/weather.js';
import { Clock } from '../state/clock.js';
import { $ } from '../ui/dom.js';
import { renderWxPanel } from '../ui/wx_panel.js';

// 시/도 이웃: 중심 좌표가 가까운 3곳(서로 이어지게). 경계 자료에 이웃 표가 없어 거리로 근사한다.
export function sidoGraph(sidoInfo) {
  const cs = new Map();
  for (const s of sidoInfo.values()) if (s.dongs.length) cs.set(s.c, { lat: s.dongs.reduce((t, d) => t + d.lat, 0) / s.dongs.length, lng: s.dongs.reduce((t, d) => t + d.lng, 0) / s.dongs.length });
  const near = new Map([...cs.keys()].map((a) => [a, new Set()]));
  const d2 = (a, b) => (cs.get(a).lat - cs.get(b).lat) ** 2 + (cs.get(a).lng - cs.get(b).lng) ** 2;
  for (const a of cs.keys()) for (const b of [...cs.keys()].filter((x) => x !== a).sort((x, y) => d2(a, x) - d2(a, y) || (x < y ? -1 : 1)).slice(0, 3)) { near.get(a).add(b); near.get(b).add(a); }
  return { ids: () => [...cs.keys()], neighbors: (id) => [...(near.get(id) || [])].sort(), center: (id) => cs.get(id) || null };
}
const idOf = (app) => (app.dong ? String(app.dong.c).slice(0, 2) : '');

export const WxUI = {
  init(app) {
    try { Wx.setGraph(sidoGraph(REGIONS.sidoInfo)); } catch (e) { /* 그래프 없이 코드순 빌림 */ }
    Wx.on(() => { try { app.updateClock(); } catch (e) { /* 화면 오류가 받기를 막지 않게 */ } });
    Clock.wxSrc = (cat, ms) => { const id = idOf(app), wx = id ? Wx.at(id, ms) : null; return wx ? { wx, theme: app.theme } : null; }; // 세계 시계가 지금 장면의 날씨·테마를 읽는 입구 (M3-f)
    Wx.start();
  },
  scene(app) { // setTime 앞에서: 지금 지역·시각의 날씨를 장면에 (값이 없으면 null)
    const id = idOf(app);
    app.s.setWeather(id ? Wx.at(id, app.clockMs()) : null, app.dong && app.dong.c);
  },
  panel(app) { // setTime 뒤에서: isNight 가 새 값
    renderWxPanel($('#pWx'), Wx.get(idOf(app)), app.s.isNight);
  },
};
