// 캡쳐 시트·글쓰기·자유게시판
import { timeAgo } from '../core/format.js';
import { josa } from '../core/util.js';
import { Caps } from '../adapters/caps.js';
import { REGIONS } from '../adapters/regions_data.js';
import { Board } from '../state/board.js';
import { nickOf } from '../state/gate.js';
import { $, ICON, h, openScrim, toast } from './dom.js';
import { requireGate } from './signup.js';

// ── 캡쳐 ──
// data: 주소를 fetch 하면 CSP connect-src 'self' 에 막히므로 직접 Blob 으로 만든다 (보안 J-3)
function dataUrlToBlob(u) {
  const i = u.indexOf(','), bin = atob(u.slice(i + 1)), bytes = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  return new Blob([bytes], { type: u.slice(5, u.indexOf(';')) || 'image/png' });
}

export function openCapture(app, dataUrl, meta) {
  const img = h('img', { class: 'shot', src: dataUrl, alt: `${meta.catName || '골목'} 캡쳐 사진` });
  const saveBtn = h('button', { class: 'btn', type: 'button', text: '내 기기에 저장' });
  const postBtn = h('button', { class: 'btn primary', type: 'button', text: '게시판에 올리기' });
  const hint = h('div', { class: 'note', hidden: true });
  saveBtn.addEventListener('click', async () => {
    const fname = `골목냥_${meta.dongName}_${meta.catName || '골목'}.png`.replace(/\s+/g, '');
    if (Caps.downloads) {
      try { const blob = dataUrlToBlob(dataUrl); await Caps.downloads.save({ filename: fname, data: blob }); toast('저장했어요'); }
      catch (e) { if (e && e.code !== 'declined') { hint.hidden = false; hint.textContent = '여기서는 바로 저장할 수 없어요. 사진을 길게 누르거나 우클릭해서 저장해 주세요.'; } }
    } else { hint.hidden = false; hint.textContent = '사진을 길게 누르거나 우클릭해서 저장해 주세요.'; }
  });
  postBtn.addEventListener('click', () => { close(); requireGate(app, 'board_write', '게시판에 올리려면 이웃 등록이 필요해요', () => openCompose(app, dataUrl, meta)); });
  const sheet = h('div', { class: 'sheet' },
    h('h3', { text: meta.catName ? `${meta.catName}, 찰칵` : '골목 풍경, 찰칵' }),
    img, hint,
    h('div', { class: 'foot' }, h('button', { class: 'btn ghost', type: 'button', text: '닫기', onclick: () => close() }), saveBtn, postBtn));
  const close = openScrim(sheet, { center: true });
}
function openCompose(app, dataUrl, meta) {
  const ta = h('textarea', { id: 'postText', maxlength: '400', placeholder: `${meta.catName ? josa(meta.catName, '이', '가') + ' ' : ''}오늘 뭐 했는지 적어 주세요` });
  const err = h('div', { class: 'err', role: 'alert' });
  const send = h('button', { class: 'btn primary', type: 'submit', text: '올리기' });
  const form = h('form', { class: 'sheet' },
    h('h3', { text: '자유게시판에 올리기' }),
    h('img', { class: 'shot', src: dataUrl, alt: '올릴 사진' }),
    h('div', { class: 'tags' }, h('span', { class: 'tag', text: meta.dongName }), meta.catName ? h('span', { class: 'tag', text: meta.catName }) : null),
    h('div', { class: 'field' }, h('label', { for: 'postText', text: '한마디' }), ta), err,
    h('div', { class: 'foot' }, h('button', { class: 'btn ghost', type: 'button', text: '취소', onclick: () => close() }), send));
  const close = openScrim(form, { center: true });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    send.disabled = true; send.textContent = '올리는 중…';
    try {
      const small = await shrinkImage(dataUrl, 880, 190000);
      await Board.add({ uid: Caps.uid || 'local', nick: nickOf(), text: ta.value.trim(), img: small, createdAt: Date.now(),
        dong: { c: app.dong.c, n: app.dong.n, sgg: app.dong.sgg || '', sido: app.dong.sido }, cat: meta.catId ? { id: meta.catId, name: meta.catName, pattern: meta.pattern } : null, likes: {}, comments: {} });
      close(); toast('게시판에 올렸어요'); app.openBoard();
    } catch (ex) {
      send.disabled = false; send.textContent = '올리기';
      err.textContent = ex && ex.code === 'quota_exceeded' ? '게시판 저장 공간이 꽉 찼어요. 운영자가 정리할 때까지 기다려 주세요.' : ex && ex.code === 'invalid_argument' ? '이 링크에서는 글을 쓸 수 없어요 (보기 전용).' : '올리지 못했어요. 잠시 뒤 다시 눌러 주세요.';
    }
  });
}
async function shrinkImage(dataUrl, maxW, maxBytes) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const s = Math.min(1, maxW / img.width);
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  let q = 0.82, out = c.toDataURL('image/jpeg', q);
  while (out.length > maxBytes && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
  return out;
}

// 글에 적힌 위치를 지금 활성 단위 이름으로 (옛 동 단위 글도 시/도 이름으로 보인다)
function postWhere(d) { const u = REGIONS.unitOf(d.c); return u ? u.n : d.n; }

// ── 자유게시판 ──
export function renderBoard(app) {
  let el = $('#board');
  if (!app.boardOpen) { if (el) el.remove(); return; }
  if (!el) { el = h('aside', { id: 'board', 'aria-label': '자유게시판' }); document.body.append(el); }
  const tab = app.boardTab || 'all';
  const me = Caps.uid || 'local';
  let posts = Board.posts.slice();
  if (tab === 'dong') posts = posts.filter((p) => p.dong && (REGIONS.unitOf(p.dong.c) || {}).c === app.dong.c); // 옛 동 코드 글은 앞 자리로 해당 시/도에 모인다
  if (tab === 'hot') posts.sort((a, b) => Object.values(b.likes || {}).filter(Boolean).length - Object.values(a.likes || {}).filter(Boolean).length);
  const closeBtn = h('button', { class: 'close btn ghost', type: 'button', 'aria-label': '게시판 닫기', style: 'margin-left:auto;padding:6px', onclick: () => { app.boardOpen = false; renderBoard(app); } }); closeBtn.innerHTML = ICON.close;
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, ...[['all', '전체'], ['dong', '이 지역'], ['hot', '인기']].map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': tab === k ? 'true' : 'false', text: l, onclick: () => { app.boardTab = k; renderBoard(app); } })));
  const feed = h('div', { class: 'feed' });
  if (!posts.length) {
    const e = h('div', { class: 'empty' }); e.innerHTML = ICON.cat;
    e.append(h('div', { text: tab === 'dong' ? `${app.dong.n} 지역에서 올라온 사진이 아직 없어요.` : '아직 올라온 사진이 없어요.' }), h('div', { text: '오른쪽 아래 카메라 버튼으로 고양이를 캡쳐해서 첫 글을 남겨 보세요.' }));
    feed.append(e);
  }
  for (const p of posts) {
    const likes = Object.values(p.likes || {}).filter(Boolean).length, liked = !!(p.likes && p.likes[me]);
    const cms = Object.values(p.comments || {}).sort((a, b) => a.at - b.at);
    const likeBtn = h('button', { class: 'btn ghost', type: 'button', 'aria-pressed': liked ? 'true' : 'false', onclick: () => requireGate(app, 'board_like', '좋아요는 이웃만 누를 수 있어요', () => Board.like(p, !liked).catch(() => toast('반영하지 못했어요'))) });
    likeBtn.innerHTML = (liked ? ICON.heartF : ICON.heart) + Number(likes);
    const cmBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => { app.openComments = app.openComments === p.id ? null : p.id; renderBoard(app); } }); cmBtn.innerHTML = ICON.chat + Number(cms.length);
    const goBtn = p.cat ? h('button', { class: 'btn', type: 'button', onclick: () => app.visit(p.dong.c, p.cat.id) }) : p.dong ? h('button', { class: 'btn', type: 'button', onclick: () => app.visit(p.dong.c) }) : null;
    if (goBtn) { goBtn.innerHTML = ICON.pin; goBtn.append(p.cat ? `${p.cat.name} 보러 가기` : `${postWhere(p.dong)} 가 보기`); }
    const delBtn = p.uid === me ? h('button', { class: 'btn ghost', type: 'button', text: '삭제', onclick: () => { if (delBtn.dataset.sure) Board.remove(p).catch(() => toast('삭제하지 못했어요')); else { delBtn.dataset.sure = '1'; delBtn.textContent = '정말 삭제'; } } }) : null;
    const post = h('article', { class: 'post' },
      h('div', { class: 'by' }, h('b', { text: p.nick || '이웃' }), h('span', { text: p.dong ? postWhere(p.dong) : '' }), h('span', { text: '· ' + timeAgo(p.createdAt) })),
      p.img ? h('img', { class: 'shot', src: p.img, alt: (p.cat ? p.cat.name : '골목') + ' 사진', loading: 'lazy' }) : null,
      p.text ? h('div', { class: 'txt', text: p.text }) : null,
      h('div', { class: 'row' }, likeBtn, cmBtn, goBtn, delBtn));
    if (app.openComments === p.id) {
      const ci = h('input', { type: 'text', maxlength: '200', placeholder: '댓글 달기', 'aria-label': '댓글' });
      const cf = h('form', { class: 'say', onsubmit: (e) => { e.preventDefault(); const v = ci.value.trim(); if (!v) return; requireGate(app, 'board_comment', '댓글은 이웃만 달 수 있어요', () => Board.comment(p, v).then(() => { ci.value = ''; }).catch(() => toast('댓글을 달지 못했어요'))); } }, ci, h('button', { class: 'btn', type: 'submit', text: '달기' }));
      post.append(h('div', { class: 'cmts' }, ...(cms.length ? cms.map((c) => h('div', { class: 'c' }, h('b', { text: c.nick }), c.text)) : [h('div', { text: '첫 댓글을 남겨 보세요.' })]), cf));
    }
    feed.append(post);
  }
  const foot = h('div', { class: 'note', style: 'margin:0 16px 12px', text: Caps.shared ? '이 게시판은 이 페이지를 여는 모든 이웃이 함께 봅니다. 사진은 앱 안 캡쳐만 올릴 수 있어요.' : '공유 저장소가 없는 화면이라 이 브라우저에만 저장돼요. 사진은 앱 안 캡쳐만 올릴 수 있어요.' });
  const header = h('header', {}, h('h3', { text: '자유게시판' }), closeBtn);
  el.replaceChildren(header, tabs, feed, foot);
}
