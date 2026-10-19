// 공유하기 시트 (R-11, D-17)
import { josa } from '../core/util.js';
import { SHARE_ENABLED } from '../state/gate.js';
import { $, ICON, copyText, h, openScrim, toast } from './dom.js';

// ── 공유하기 ──
const SHARE_ICON = {
  link: '<svg class="i" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  x: '<svg class="i" viewBox="0 0 24 24"><path d="M5 4l14 16M19 4L5 20"/></svg>',
  threads: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M15.2 12v1.2a2.3 2.3 0 0 0 4.6 0V12a7.8 7.8 0 1 0-3 6.2"/></svg>',
  kakao: ICON.chat,
  insta: '<svg class="i" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><path d="M16.8 7.2h.01"/></svg>',
};
function shareUrl(code) { try { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('r', code); return u.toString(); } catch (e) { return location.href; } }
export function openShare(app) {
  const d = app.dong, a = app.selected || (app.mascot && !app.mascot.hidden ? app.mascot : null);
  const url = shareUrl(d.c);
  const text = a ? `${d.n} 골목냥 ${josa(a.cat.name, "이", "가")} 지금 ${a.label} 🐈 골목냥에서 만나 보세요` : `${d.n} 골목냥을 만나 보세요 🐈`;
  const note = h('div', { class: 'note', hidden: true });
  const say = (t) => { note.hidden = false; note.textContent = t; };
  const open = (u) => { try { window.open(u, '_blank', 'noopener'); } catch (e) {} };
  // 글자 이름 없이 색 있는 동그란 버튼만 보인다. 이름은 aria-label·title로 유지 (기기 공유는 뺐다)
  const defs = [
    ['link', '링크 복사', async () => { if (await copyText(url)) toast('링크를 복사했어요'); else say('복사하지 못했어요. 아래 링크를 길게 눌러 복사해 주세요. ' + url); }],
    ['x', 'X', () => open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`)],
    ['threads', '스레드', () => open(`https://www.threads.net/intent/post?text=${encodeURIComponent(text + ' ' + url)}`)],
    ['kakao', '카카오톡', () => say('화면 확인용이에요. 배포 뒤 카카오 JavaScript SDK(Kakao.Share)로 이 자리에 연결돼요.')],
    ['insta', '인스타그램', async () => { await copyText(url); say('화면 확인용이에요. 휴대폰은 기기 공유 시트로 캡쳐 사진과 링크를 보내고, PC는 사진을 저장한 뒤 링크를 복사해 올려 주세요. (링크는 복사했어요)'); }],
  ];
  const grid = h('div', { class: 'sharegrid' }, ...defs.map(([k, label, fn]) => {
    const on = !!SHARE_ENABLED[k];
    const b = h('button', { class: 'sharebtn', type: 'button', 'data-ch': k, 'aria-label': on ? label : label + ' (배포 후 열려요)', 'aria-disabled': on ? 'false' : 'true', title: on ? label : label + ' · 배포 후 열려요',
      onclick: () => { if (!on) { toast('배포 후 열려요'); return; } fn(); } });
    b.innerHTML = SHARE_ICON[k];
    if (!on) { const l = h('span', { class: 'lockbadge', 'aria-hidden': 'true' }); l.innerHTML = ICON.lock; b.append(l); }
    return b;
  }));
  const close = openScrim(h('div', { class: 'sheet sharesheet' },
    h('div', { class: 'sharehead' }, h('h3', { text: '공유하기' }), h('button', { class: 'close btn ghost', type: 'button', 'aria-label': '닫기', onclick: () => close() })),
    grid, note), { center: true });
  const cb = $('.sharesheet .close'); if (cb) cb.innerHTML = ICON.close;
}
