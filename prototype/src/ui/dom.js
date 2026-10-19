// 화면 공통: DOM 도우미($·$$·h), 아이콘, 토스트, 시트(scrim), 글 복사

export const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
// ───────────────────────── 화면 UI ─────────────────────────
export const ICON = {
  close: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  lock: '<svg class="i" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  hand: '<svg class="i" viewBox="0 0 24 24"><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V12m0-2.5a1.5 1.5 0 0 1 3 0V15c0 4-3 7-7 7h-1c-2.5 0-4-1-5.3-3L4 15a1.6 1.6 0 0 1 2.5-2l1.5 1.5"/></svg>',
  churu: '<svg class="i" viewBox="0 0 24 24"><path d="M7 3h10l-1 4H8z"/><path d="M8 7l1.2 13.5a1 1 0 0 0 1 .9h3.6a1 1 0 0 0 1-.9L16 7"/><path d="M10 12h4"/></svg>',
  thumbUp: '<svg class="i" viewBox="0 0 24 24"><path d="M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2.2 2.6L12.6 10H19a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17.8 20H7"/></svg>',
  thumbDown: '<svg class="i" viewBox="0 0 24 24"><path d="M7 13V4H4v9zM7 13l4 7c1.5 0 2.5-1 2.2-2.6L12.6 14H19a2 2 0 0 0 2-2.4l-1.2-6A2 2 0 0 0 17.8 4H7"/></svg>',
  paw: '<svg class="i" viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><ellipse cx="12" cy="16.5" rx="4.6" ry="3.8"/><ellipse cx="5.6" cy="11" rx="1.9" ry="2.5"/><ellipse cx="9.4" cy="6.6" rx="1.9" ry="2.6"/><ellipse cx="14.6" cy="6.6" rx="1.9" ry="2.6"/><ellipse cx="18.4" cy="11" rx="1.9" ry="2.5"/></svg>',
  flag: '<svg class="i" viewBox="0 0 24 24"><path d="M6 21V4M6 4h11l-2 4 2 4H6"/></svg>',
  heart: '<svg class="i" viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  heartF: '<svg class="i" viewBox="0 0 24 24" style="fill:currentColor"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  chat: '<svg class="i" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  pin: '<svg class="i" viewBox="0 0 24 24"><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></svg>',
  dice: '<svg class="i" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/></svg>',
  cat: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 30l-2-16 10 8h20l10-8-2 16c2 4 3 7 3 11 0 10-9 15-21 15S11 51 11 41c0-4 1-7 3-11z"/><path d="M25 38h.01M39 38h.01M30 44l2 2 2-2"/></svg>',
};
export function toast(msg, ms = 2600) {
  const t = h('div', { class: 'toast', role: 'status', text: msg });
  document.body.append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, ms);
  setTimeout(() => t.remove(), ms + 500);
}
export function openScrim(content, { center = false, onClose } = {}) {
  const s = h('div', { class: 'scrim' + (center ? ' center' : ''), role: 'dialog', 'aria-modal': 'true' }, content);
  const close = () => { s.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  s.addEventListener('pointerdown', (e) => { if (e.target === s) close(); });
  document.addEventListener('keydown', esc);
  document.body.append(s);
  const f = s.querySelector('input,textarea,button'); if (f) setTimeout(() => f.focus(), 30);
  return close;
}
export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
  try { const ta = h('textarea', { style: 'position:fixed;opacity:0;left:-999px' }); ta.value = t; document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
}
