// 지역 고르기 시트 (D-05: 시/도 16곳만 활성, 시/군/구·행정동은 "준비 중"으로 보이기만)
import { regionFull, sggShort } from '../core/regions.js';
import { buildSidoMap } from '../core/sido_map.js';
import { REGIONS } from '../adapters/regions_data.js';
import { ICON, h, openScrim } from './dom.js';

export function openPicker(app) {
  const cur = app.dong;
  const units = REGIONS.units;
  let hot = REGIONS.sidoInfo.get(cur.c.slice(0, 2)) ? cur.c.slice(0, 2) : units[0].c.slice(0, 2);
  const q = h('input', { type: 'text', id: 'dongq', placeholder: '동·구 이름으로 찾기 · 예: 삼청동, 해운대, 성산', autocomplete: 'off' });
  const results = h('div', { class: 'results', role: 'listbox', 'aria-label': '시·도 목록과 검색 결과' });
  const soonHead = h('div', { class: 'soonhead' });
  const soonList = h('div', { class: 'soonlist', 'aria-label': '준비 중인 시·군·구' });
  const map = h('div', { class: 'mapbox' });
  const tip = h('div', { class: 'maptip', text: '' });
  const go = (u) => { close(); app.goDong(u); };
  const setHot = (c2) => {
    const s = REGIONS.sidoInfo.get(c2); if (!s) return;
    hot = c2;
    soonHead.textContent = `${s.n}의 시/군/구 ${s.sggs.size}곳 · 준비 중`;
    soonList.replaceChildren(...[...s.sggs].map((g) => h('button', { type: 'button', class: 'soon', disabled: true, title: '준비 중', text: sggShort(g) })));
  };
  const sidoBtn = (u) => {
    const c2 = u.c.slice(0, 2);
    return h('button', { type: 'button', class: u.c === cur.c ? 'on' : '', onclick: () => go(u), onpointerenter: () => setHot(c2), onfocus: () => setHot(c2) },
      h('span', { text: u.n }), h('small', { text: u.c === cur.c ? '지금 여기' : regionFull(u) }));
  };
  const listSidos = () => results.replaceChildren(...units.map(sidoBtn));
  const listSearch = (v) => {
    const nv = v.replace(/\s+/g, ''), out = new Map();
    for (const u of units) if ((u.sido + u.n).replace(/\s+/g, '').includes(nv)) out.set(u.c, h('button', { type: 'button', onclick: () => go(u), onpointerenter: () => setHot(u.c.slice(0, 2)) }, h('span', { text: u.n }), h('small', { text: '이 고양이 보러 가기' })));
    for (const d of REGIONS.search(v)) {
      const u = REGIONS.unitOf(d.c); if (!u || out.has(u.c)) continue;
      out.set(u.c, h('button', { type: 'button', onclick: () => go(u), onpointerenter: () => setHot(u.c.slice(0, 2)) }, h('span', { text: d.n }), h('small', { text: `→ ${u.n} 고양이` })));
    }
    results.replaceChildren(...(out.size ? [...out.values()] : [h('div', { class: 'empty', style: 'padding:18px', text: '맞는 곳이 없어요. 두 글자만 적어 보세요.' })]));
  };
  q.addEventListener('input', () => { const v = q.value.trim(); if (v) listSearch(v); else listSidos(); });
  const drawMap = () => {
    const M = buildSidoMap(REGIONS), NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${M.W} ${M.H}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '시·도 지도');
    units.forEach((u, i) => {
      const c2 = u.c.slice(0, 2), path = document.createElementNS(NS, 'path');
      path.setAttribute('d', M.paths.get(c2) || '');
      path.setAttribute('class', 'sido' + (u.c === cur.c ? ' cur' : ''));
      path.setAttribute('style', `--f:hsl(${(i * 137) % 360} 34% 72%)`);
      path.addEventListener('pointerenter', () => { tip.textContent = `${u.n} · 눌러서 이동`; setHot(c2); });
      path.addEventListener('click', () => go(u));
      const t = document.createElementNS(NS, 'title'); t.textContent = u.n; path.append(t);
      svg.append(path);
    });
    for (const u of units) {
      const pos = M.labels.get(u.c.slice(0, 2)); if (!pos) continue;
      const tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', pos[0]); tx.setAttribute('y', pos[1]); tx.setAttribute('class', 'mlabel'); tx.textContent = u.n; svg.append(tx);
    }
    map.replaceChildren(svg, tip);
    tip.textContent = `시/도 ${units.length}곳 — 눌러서 이동`;
  };
  const rnd = h('button', { class: 'btn ghost', type: 'button', onclick: () => go(units[Math.floor(Math.random() * units.length)]) });
  rnd.innerHTML = ICON.dice + '아무 지역이나';
  const sheet = h('div', { class: 'sheet picker' },
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', { text: '어느 지역 고양이를 볼까요?' }), rnd),
    h('p', { text: `전국 시/도 ${units.length}곳마다 마스코트 고양이가 한 마리씩 살아요. 시/군/구와 행정동은 준비 중이에요.` }),
    h('div', { class: 'pgrid' },
      h('div', { style: 'display:flex;flex-direction:column;gap:10px;min-width:0' }, h('div', { class: 'field' }, q), results, soonHead, soonList),
      map),
    h('p', { class: 'note', text: '경계: 행정동 2026.7.1 기준을 시/도로 합쳐 그림 (vuski/admdongkor, 통계청 SGIS · CC BY 4.0)' }),
  );
  const close = openScrim(sheet, { center: true });
  listSidos(); setHot(hot); drawMap();
  // 마우스를 올려 시/도가 바뀔 때마다 아래 시/군/구 목록 길이가 달라지면 시트 높이가 변하고, 그 바람에 마우스 아래 칸이 다른 지역으로 바뀌어
  // 시트가 커졌다 작아졌다 반복했다(hover가 목록을 바꾸고 목록이 높이를 바꾸는 되먹임). 16곳 중 가장 긴 목록의 높이를 미리 잡아 둔다
  const reserve = () => {
    const keep = hot; let mh = 0, hh = 0; soonList.style.height = ''; soonHead.style.minHeight = '';
    for (const u of units) { setHot(u.c.slice(0, 2)); mh = Math.max(mh, soonList.scrollHeight); hh = Math.max(hh, soonHead.offsetHeight); }
    soonList.style.height = mh + 'px'; soonHead.style.minHeight = hh + 'px'; setHot(keep);
  };
  reserve();
}
