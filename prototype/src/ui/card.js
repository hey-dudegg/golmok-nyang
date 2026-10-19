// 고양이 이름표(교감하기 탭)와 고양이 칩 목록
import { swatch } from '../core/format.js';
import { ageText, sexText, stageOf, traitTags } from '../core/genome.js';
import { EMO_LABEL, PET_PARTS, QUICK_WORDS, interpret } from '../core/touch_rules.js';
import { josa } from '../core/util.js';
import { gateNeedsMember } from '../state/gate.js';
import { Bonds } from '../state/members.js';
import { $, ICON, h } from './dom.js';
import { namesPanel, renderRanking } from './names_panel.js';

// ── 고양이 이름표 ──
export function renderCard(app) {
  const el = $('#card');
  const a = app.selected;
  if (!a) { el.hidden = true; return; }
  el.hidden = false;
  const g = a.cat.g, st = stageOf(g.months);
  const bond = Bonds.get(a.cat.id);
  const mom = a.cat.mother ? app.cats.find((c) => c.id === a.cat.mother) : null;
  const kids = app.cats.filter((c) => c.mother === a.cat.id);
  const metaBits = [g.patternLabel, ageText(g.months) + ' · ' + st.label, sexText(g)];
  if (g.tnr) metaBits.push('왼쪽 귀 끝 컷');
  const family = mom ? `엄마는 ${mom.name}` : kids.length ? `아기 ${kids.map((k) => k.name).join(', ')}의 엄마` : '';
  const head = h('div', { class: 'head' },
    h('div', { class: 'sw', style: `background:${swatch(g)}` }),
    h('div', {}, h('h2', { text: a.guest ? '손님 고양이 · ' + a.cat.name : a.cat.name }), h('div', { class: 'meta', text: metaBits.join(' · ') }), family ? h('div', { class: 'meta', text: family }) : null),
    h('button', { class: 'close', type: 'button', 'aria-label': '이름표 닫기', onclick: () => app.select(null) }),
  );
  head.querySelector('.close').innerHTML = ICON.close;
  const tags = h('div', { class: 'tags' }, ...traitTags(g.personality).map((t) => h('span', { class: 'tag', text: t })), bond.n ? h('span', { class: 'tag', text: bond.trust > 0.6 ? '나를 반겨 줌' : bond.trust > 0.3 ? '나를 알아봄' : '아직 낯섦' }) : null);
  const now = h('div', { class: 'now' }, h('span', { class: 'dot' }), h('span', { id: 'nowLabel', text: a.label || '' }));
  if (a.guest) { el.replaceChildren(head, h('div', { class: 'tags' }, ...traitTags(g.personality).map((t) => h('span', { class: 'tag', text: t }))), now, h('div', { class: 'note', text: '멀리서 놀러 온 손님이에요. 손님 고양이는 구경만 할 수 있어요.' })); return; }
  const thought = app.thought && app.thought.id === a.cat.id ? h('div', { class: 'thought' }, h('small', { text: '속마음' + (app.thought.emo ? ' · ' + (EMO_LABEL[app.thought.emo] || '') : '') + (app.thought.by === 'ai' ? ' · AI가 성격을 보고 고름' : '') }), app.thought.text) : null;
  const churuLocked = gateNeedsMember('churu');
  const petRow = h('div', { class: 'row' }, h('span', { class: 'lbl', text: '쓰다듬기' }), ...PET_PARTS.map(([k, l]) => h('button', { class: 'btn', type: 'button', text: l, disabled: app.busy, onclick: () => app.interact({ kind: 'pet', part: k }) })));
  const churu = h('button', { class: 'btn primary', type: 'button', disabled: app.busy, onclick: () => app.interact({ kind: 'churu' }) }); churu.innerHTML = ICON.churu + '츄르 주기';
  const input = h('input', { type: 'text', id: 'catword', maxlength: '40', placeholder: '고양이 말로 말 걸기', 'aria-label': '고양이 말' });
  const sayBtn = h('button', { class: 'btn', type: 'submit', text: '말하기', disabled: app.busy });
  const sayForm = h('form', { class: 'say', onsubmit: (e) => { e.preventDefault(); const v = input.value.trim(); if (!v) return; input.value = ''; app.interact({ kind: 'word', text: v, word: interpret(v) }); } }, input, sayBtn);
  const quick = h('div', { class: 'row' }, ...QUICK_WORDS.map((w) => h('button', { class: 'btn ghost', type: 'button', text: w, disabled: app.busy, onclick: () => app.interact({ kind: 'word', text: w, word: interpret(w) }) })));
  const acts = h('div', { class: 'acts' }, h('div', { class: 'row' }, churu), petRow, sayForm, quick);
  if (churuLocked) {
    const ll = h('div', { class: 'lockline' }); ll.innerHTML = ICON.lock; ll.append(' 츄르 주기는 이웃 등록 뒤에 할 수 있어요');
    acts.prepend(ll);
  }
  if (app.busy) acts.prepend(h('div', { class: 'lockline', text: josa(a.cat.name, '이', '가') + ' 어떻게 할지 고민 중…' }));
  const tab = app.cardTab || 'care';
  const tabs = h('div', { class: 'ctabs', role: 'tablist' },
    h('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'care' ? 'true' : 'false', text: '교감하기', onclick: () => { app.cardTab = 'care'; renderCard(app); } }),
    h('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'names' ? 'true' : 'false', text: '이름 짓기 · 랭킹', onclick: () => { app.cardTab = 'names'; renderCard(app); } }));
  const body = tab === 'care' ? [now, ...(thought ? [thought] : []), acts] : [namesPanel(app, a)];
  el.replaceChildren(head, tags, tabs, ...body);
  if (tab === 'names') renderRanking(app);
}
export function renderRoster(app) {
  const el = $('#roster');
  const here = app.agents.filter((a) => !a.hidden);
  el.replaceChildren(...here.map((a) => {
    const g = a.cat.g;
    const paw = h('span', { class: 'gt', 'aria-hidden': 'true' }); paw.innerHTML = ICON.paw;
    return h('button', { class: 'catchip' + (a.guest ? ' guest' : ''), type: 'button', 'aria-label': a.guest ? `손님 고양이 ${a.cat.name}` : null, 'aria-pressed': app.selected === a ? 'true' : 'false', onclick: () => app.select(a, true) },
      h('span', { class: 'sw', style: `background:${swatch(g)}` }), a.guest ? paw : null, h('span', { class: 'nm', text: a.cat.name }), h('small', { text: stageOf(g.months).label }));
  }));
}
