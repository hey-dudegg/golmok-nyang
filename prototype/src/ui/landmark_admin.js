// 어드민 '명소 미리보기' 구역 (R-17, 설계 18장): 지역·후보·주차·계절·시간대 고르기, 지금 명소 정보, 16곳 순회(구성 시간·FPS), 폴백 강제
import { activeCandidates, weekIndexKST } from '../core/landmarks.js';
import { sunPosition } from '../core/time.js';
import { LandmarkData } from '../adapters/landmarks_data.js';
import { REGIONS } from '../adapters/regions_data.js';
import { h } from './dom.js';

const KIND_KO = { tower: '탑', palace: '고궁', hanok: '한옥', fortress: '성곽', bridge: '다리', harbor: '항구', lighthouse: '등대', mountain: '산', island: '섬', falls: '폭포',
  field: '들판', market: '시장', skyline: '도심', temple: '사찰', park: '공원', lake: '호수', beach: '해변', hillvillage: '언덕 마을', forest: '숲' };
const SRC_KO = { dong: '동', sgg: '시군구', sido: '시/도', auto: '자동 지형', theme: '기본 테마(배경 없음)' };
// 오늘(KST) 중 해 고도가 target 도에 가장 가까운 시각 (오후 쪽). 해질녘 미리보기용
function timeForSun(d, target, fromH, toH) {
  const k = new Date(Date.now() + 9 * 3600000), day0 = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - 9 * 3600000;
  let best = day0 + fromH * 3600000, bd = 1e9;
  for (let t = day0 + fromH * 3600000; t <= day0 + toH * 3600000; t += 300000) { const a = sunPosition(new Date(t), d.lat, d.lng).alt * 180 / Math.PI, e = Math.abs(a - target); if (e < bd) { bd = e; best = t; } }
  return best;
}
const fpsOver = (ms) => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(n * 1000 / (performance.now() - t0)); }; requestAnimationFrame(f); });

export function buildLandmarkSection(panel) {
  const app = panel.app;
  const opt = (v, t, sel) => h('option', { value: v, text: t, selected: sel || null });
  const region = h('select', { 'aria-label': '미리볼 지역', id: 'adLmRegion' }, ...REGIONS.units.map((u) => opt(u.c, u.n + ' ' + u.c, app.dong && u.c === app.dong.c)));
  const cand = h('select', { 'aria-label': '후보', id: 'adLmPick' });
  const week = h('input', { type: 'number', min: '-52', max: '52', value: '0', 'aria-label': '주차 오프셋', id: 'adLmWeek', style: 'width:4.5em' });
  const season = h('select', { 'aria-label': '계절', id: 'adLmSeason' }, opt('', '계절: 지금'), opt('spring', '봄'), opt('summer', '여름'), opt('autumn', '가을'), opt('winter', '겨울'));
  const tod = h('select', { 'aria-label': '시간대', id: 'adLmTime' }, opt('', '시간: 지금'), opt('day', '낮'), opt('dusk', '해질녘'), opt('night', '밤'));
  const view = h('select', { 'aria-label': '시야 방식', id: 'adLmView' }, opt('A', '시야 A 현재'), opt('B', '시야 B 담·건물 낮춤', true), opt('C', '시야 C 카메라 위로'));
  view.addEventListener('change', () => { app.setViewMode(view.value); apply(); });
  const none = h('input', { type: 'checkbox', id: 'adLmNone' }), hide = h('input', { type: 'checkbox', id: 'adLmHide' });
  const info = h('pre', { class: 'note adinfo', id: 'adLmInfo', style: 'white-space:pre-wrap' });
  const tour = h('div', { class: 'note adinfo', id: 'adLmTour', style: 'white-space:pre-wrap' });
  const fillCands = () => {
    const data = LandmarkData.get(), list = data ? activeCandidates(data.places[region.value]) : [];
    const keep = cand.value;
    cand.replaceChildren(opt('', '이번 주 순환'), ...list.map((p, i) => opt(String(i), (i + 1) + '. ' + p.name + (p.status === 'unverified' ? ' (미확인)' : ''))));
    if ([...cand.options].some((o) => o.value === keep)) cand.value = keep;
  };
  const hideFront = () => { const bd = app.s.backdrop && app.s.backdrop.mesh; app.s.env.children.forEach((o) => { if (o !== bd && o.position.z < -2.3) o.visible = !hide.checked; }); };
  const show = () => {
    const s = app.lmSel, bd = app.s.backdrop, p = s && s.place;
    const parts = s && s.parts ? s.parts.map((x) => x.type + (x.style || x.shape ? '(' + (x.style || x.shape) + ')' : '')).join(', ') : '-';
    info.textContent = [
      `이름: ${p && p.name ? p.name : '(없음)'}  출처: ${SRC_KO[s ? s.source : 'theme']}${s && s.inherited ? ' · 상속' : ''}`,
      `유형: ${p && p.kind ? p.kind + ' ' + (KIND_KO[p.kind] || '') : '-'}  상태: ${p && p.status ? p.status : '-'}  신뢰도: ${p && p.confidence ? p.confidence : '-'}`,
      `후보 ${s && s.candidates ? s.candidates.length : 0}곳 중 ${s && s.index >= 0 ? s.index + 1 : '-'}번 · 주차 ${s ? s.week : '-'} (지금 ${weekIndexKST(Date.now())})`,
      `부품: ${parts}`,
      `구성 ${bd ? bd.ms.toFixed(1) + 'ms · 삼각형 ' + bd.tris : '배경 없음'} · 변주 ${bd && bd.variant ? bd.variant.season + '/' + bd.variant.phase + '/' + bd.variant.weather : '-'}`,
      `자료 ${LandmarkData.failed ? '불러오기 실패' : LandmarkData.bytes ? (LandmarkData.bytes / 1024).toFixed(1) + 'KB · ' + LandmarkData.loadMs.toFixed(0) + 'ms' : '받는 중'}${LandmarkData.errors.length ? ' · 검증 경고 ' + LandmarkData.errors.length : ''}${LandmarkData.forceNone ? ' · 폴백 강제 중' : ''}`,
    ].join('\n');
  };
  const apply = () => {
    if (!app.dong || app.dong.c !== region.value) app.visit(region.value);
    LandmarkData.forceNone = none.checked;
    app.lmPreview = { weekOffset: +week.value || 0, ...(cand.value !== '' ? { pick: +cand.value } : {}) };
    app.s.backdropOverride = { season: season.value || null };
    const d = app.dong;
    app.previewTime = tod.value === 'day' ? timeForSun(d, 60, 9, 15) : tod.value === 'dusk' ? timeForSun(d, 1.5, 14, 21) : tod.value === 'night' ? timeForSun(d, -25, 19, 24) : null;
    app.refreshBackdrop(true); app.updateClock(); hideFront(); show();
  };
  region.addEventListener('change', () => { cand.value = ''; fillCands(); apply(); });
  for (const el of [cand, week, season, tod, none]) el.addEventListener('change', apply);
  hide.addEventListener('change', () => { hideFront(); });
  let touring = false;
  const tourBtn = h('button', { type: 'button', class: 'btn ghost adbtn', id: 'adLmTourBtn', text: '16곳 순회 재생', onclick: async () => {
    if (touring) { touring = false; return; }
    touring = true; tourBtn.textContent = '순회 멈추기';
    const rows = [];
    for (const u of REGIONS.units) {
      if (!touring) break;
      region.value = u.c; fillCands(); cand.value = '';
      const t0 = performance.now(); apply(); const loadMs = performance.now() - t0;
      const fps = await fpsOver(1500);
      const bd = app.s.backdrop;
      rows.push(`${u.n} ${app.lmSel && app.lmSel.place && app.lmSel.place.name ? app.lmSel.place.name : '(배경 없음)'} · 전환 ${loadMs.toFixed(0)}ms(배경 ${bd ? bd.ms.toFixed(1) : '-'}ms) · ${fps.toFixed(0)}fps`);
      tour.textContent = rows.join('\n');
    }
    touring = false; tourBtn.textContent = '16곳 순회 재생';
  } });
  LandmarkData.load().then(() => { fillCands(); show(); });
  fillCands(); setTimeout(show, 0);
  panel.lmShow = show;
  return h('div', {},
    h('div', { class: 'note', text: '저장하지 않는 미리보기예요. 새로고침하면 이번 주 명소로 돌아와요.' }),
    h('div', { class: 'adrow2' }, region, cand),
    h('div', { class: 'adrow2' }, h('label', { text: '주차 ' }, week), season, tod),
    h('div', { class: 'adrow2' }, view, h('small', { text: '비교용(저장 안 함, 일반 화면은 B)' })),
    h('div', { class: 'adrow2' }, h('label', {}, none, ' 폴백 강제(자료 없음)'), h('label', {}, hide, ' 가리는 건물 숨김')),
    info, h('div', { class: 'adrow2' }, tourBtn), tour);
}
