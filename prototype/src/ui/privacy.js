// 개인정보 안내 팝업과 첫 방문 알림줄 (M1-4). 글은 모두 h()의 text 로 넣는다(innerHTML 금지)
import { PRIVACY_NOTICE, PRIVACY_SECTIONS, PRIVACY_VERSION } from '../core/privacy_text.js';
import { store } from '../adapters/store.js';
import { h, openScrim } from './dom.js';
import { openFeedback } from './feedback.js';

let closeOpen = null;

export function openPrivacy(app, opts = {}) {
  if (closeOpen) return closeOpen;
  const opener = opts.opener || document.activeElement;
  let close;
  const body = PRIVACY_SECTIONS.map((s) => h('section', { class: 'pv-sec' },
    h('h4', { text: s.title }),
    ...s.lines.map((t) => h('p', { text: t })),
    s.action === 'feedback' ? h('button', { type: 'button', class: 'btn ghost pv-fb', text: '의견 보내기 열기', onclick: () => { close(); openFeedback(app, { opener }); } }) : null));
  const closeBtn = h('button', { type: 'button', class: 'btn ghost pv-close', text: '닫기', onclick: () => close() });
  const sheet = h('div', { class: 'sheet pvsheet', tabindex: '-1' },
    h('div', { class: 'pv-head' }, h('h3', { text: '개인정보 안내' }), closeBtn),
    h('p', { class: 'pv-date', text: '마지막 수정: ' + PRIVACY_VERSION }),
    h('div', { class: 'pv-body' }, ...body));
  close = openScrim(sheet, { center: true, onClose: () => { closeOpen = null; if (opener && opener.focus && document.contains(opener)) opener.focus(); } });
  closeOpen = close;
  return close;
}

// 안내 버전을 본 적 없을 때만 한 번 띄운다. [알겠어요]나 안내 열기 뒤로는 같은 버전에서 다시 뜨지 않는다.
export function showPrivacyBanner(app) {
  if (store.get('privacy_seen', '') === PRIVACY_VERSION) return;
  try { if (localStorage.getItem('golmok_nobanner')) return; } catch (e) {} // 시험용 끄기
  const bar = h('div', { class: 'pv-banner', role: 'region', 'aria-label': '개인정보 안내' },
    h('span', { text: PRIVACY_NOTICE.long + ' ' }),
    h('button', { type: 'button', class: 'pv-link', text: PRIVACY_NOTICE.link, onclick: (e) => openPrivacy(app, { opener: e.currentTarget }) }),
    h('button', { type: 'button', class: 'btn primary pv-ok', text: PRIVACY_NOTICE.ok, onclick: () => { store.set('privacy_seen', PRIVACY_VERSION); bar.remove(); } }));
  document.body.append(bar);
}
