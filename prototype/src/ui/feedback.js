// 의견 보내기 팝업 (R-16, D-24·D-25). 고양이 앞발 모양 시트. 입력은 textContent·value 로만 다룬다(innerHTML 금지)
import { cpLen, FB_LIMIT, FB_TEXT, validateFeedback } from '../core/feedback_rules.js';
import { Feedback } from '../adapters/feedback.js';
import { h, ICON, openScrim } from './dom.js';

const CAT_FACE = { idle: '=^.^=', busy: '=^.^= ~', ok: '=^-^=', fail: '=@.@=' };
let draft = { title: '', from: '', body: '' }; // 닫았다 다시 열어도 쓰던 글이 남는다(보내면 비운다)
let openState = null;

// opts.prefill: 어드민 시험용으로 칸을 채워서 연다 {title, from, body, honey}. opts.opener: 닫을 때 포커스가 돌아갈 버튼
export function openFeedback(app, opts = {}) {
  if (openState) return openState.close;
  const opener = opts.opener || document.activeElement;
  const openedAt = Date.now();
  const pf = opts.prefill || null;
  const cur = pf ? { title: pf.title || '', from: pf.from || '', body: pf.body || '' } : draft;

  const title = h('input', { type: 'text', id: 'fbTitle', name: 'fb_title', maxlength: String(FB_LIMIT.title), autocomplete: 'off', placeholder: '예: 지도 글자가 작아요', 'aria-describedby': 'fbMsg' });
  const from = h('input', { type: 'text', id: 'fbFrom', name: 'fb_from', maxlength: String(FB_LIMIT.from), autocomplete: 'off', placeholder: '이름이나 별명 (안 적어도 돼요)' });
  const body = h('textarea', { id: 'fbBody', name: 'fb_body', maxlength: String(FB_LIMIT.body), rows: '5', placeholder: '불편했던 점, 바라는 점을 적어 주세요', 'aria-describedby': 'fbCount fbMsg' });
  title.value = cur.title; from.value = cur.from; body.value = cur.body;
  // 허니팟: 사람 눈에는 안 보이고 탭으로도 닿지 않는 빈 칸. 채워져 있으면 봇으로 보고 성공한 척 버린다
  const honey = h('input', { type: 'text', name: 'fb_website', id: 'fbHoney', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', class: 'fb-honey' });
  if (pf && pf.honey) honey.value = pf.honey;

  const count = h('span', { id: 'fbCount', class: 'fb-count' });
  const msg = h('div', { id: 'fbMsg', class: 'fb-msg', role: 'status', 'aria-live': 'polite' });
  const face = h('div', { class: 'fb-face', 'aria-hidden': 'true', text: CAT_FACE.idle });
  const send = h('button', { type: 'submit', class: 'btn primary fb-send', id: 'fbSend', text: '냥 하고 보내기' });
  const closeBtn = h('button', { type: 'button', class: 'close btn ghost fb-close', 'aria-label': '닫기' });
  closeBtn.innerHTML = ICON.close;
  const field = (id, label, input, extra) => h('div', { class: 'field' }, h('label', { for: id }, label, extra || null), input);
  const form = h('form', { class: 'fb-form', novalidate: true, autocomplete: 'off' },
    field('fbTitle', '한 줄 제목', title),
    field('fbFrom', '보내는 이 (선택)', from),
    field('fbBody', '내용', body, count),
    honey, msg,
    h('div', { class: 'foot fb-foot' }, send),
    h('p', { class: 'fb-privacy', text: '보내는 이는 안 적어도 돼요. 적으면 답장하거나 의견을 확인할 때만 쓰고, 다른 곳에 공개하지 않아요. 연락처·주민번호 같은 개인 정보는 적지 말아 주세요. 의견은 확인 후 일정 기간 뒤 지워요.' }),
    h('p', { class: 'fb-keep', text: '받은 의견은 90일 동안만 보관해요.' }));
  const paws = h('div', { class: 'fb-paws', 'aria-hidden': 'true' }, ...[0, 1, 2].map(() => { const s = h('span'); s.innerHTML = ICON.paw; return s; }));
  const sheet = h('div', { class: 'sheet fbsheet', tabindex: '-1' },
    h('div', { class: 'fbscroll' },
      h('div', { class: 'fb-head' }, face, h('div', { class: 'fb-ttl' }, h('h3', { id: 'fbHead', text: '냥~ 의견을 들려주세요' }), h('p', { text: '혼자 만들고 있어서 부족한 점이 많아요. 고양이가 꼼꼼히 읽을게요.' })), closeBtn),
      form, paws));

  let busy = false, done = false, timer = null;
  const setFace = (k) => { face.textContent = CAT_FACE[k]; face.dataset.k = k; };
  const say = (t, kind) => { msg.textContent = t || ''; msg.className = 'fb-msg' + (kind ? ' ' + kind : ''); msg.setAttribute('role', kind === 'err' ? 'alert' : 'status'); };
  const refresh = () => {
    const n = cpLen(body.value);
    count.textContent = `${n}/${FB_LIMIT.body}`; count.classList.toggle('over', n > FB_LIMIT.body);
    const empty = !title.value.trim() || !body.value.trim();
    send.classList.toggle('gray', empty || done); send.setAttribute('aria-disabled', empty || busy || done ? 'true' : 'false');
    if (!pf && !done) draft = { title: title.value, from: from.value, body: body.value };
  };
  for (const el of [title, from, body]) el.addEventListener('input', () => { refresh(); if (!busy && !done) { say(''); setFace('idle'); } });
  refresh();

  const setBusy = (b) => {
    busy = b; for (const el of [title, from, body]) el.readOnly = b;
    send.textContent = b ? '꾹꾹이 중…' : '냥 하고 보내기'; send.classList.toggle('busy', b); sheet.classList.toggle('sending', b); setFace(b ? 'busy' : 'idle'); refresh();
  };
  function finish() {
    done = true; draft = { title: '', from: '', body: '' }; setFace('ok'); sheet.classList.add('purr'); refresh();
    say(FB_TEXT.ok + ' 🐾', 'ok');
    timer = setTimeout(() => close(), 2000);
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || done) return;
    const now = Date.now();
    const v = validateFeedback({ title: title.value, from: from.value, body: body.value, honey: honey.value }, { now, openedAt, recentKeys: Feedback.recentKeys() });
    if (!v.ok && v.silent) { finish(); return; } // 봇: 성공한 척, 보내지도 기록하지도 않는다
    if (!v.ok) { say(v.message, 'err'); setFace('fail'); const f = { title, from, body }[v.field]; if (f) f.focus(); return; }
    const cd = Feedback.cooldown(now);
    if (!cd.ok) { say(FB_TEXT[cd.reason], 'err'); setFace('fail'); return; }
    say(''); setBusy(true);
    try {
      await Feedback.send(v.clean);
      Feedback.recordSent(v.clean, Date.now());
      setBusy(false); finish();
    } catch (err) {
      setBusy(false); setFace('fail'); say(FB_TEXT.fail, 'err'); // 입력한 글은 그대로 남긴다
    }
  });

  // 키보드가 올라와도 보내기 버튼이 가려지지 않게 보이는 높이를 따른다
  const vv = window.visualViewport;
  const fit = () => { const hgt = vv ? vv.height : innerHeight; sheet.style.setProperty('--fbh', Math.max(240, Math.floor(hgt - 64)) + 'px'); };
  fit(); if (vv) vv.addEventListener('resize', fit);

  // 포커스 가두기(Tab 이 팝업 밖으로 나가지 않게)
  sheet.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...sheet.querySelectorAll('input:not([tabindex="-1"]),textarea,button')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  const close = openScrim(sheet, { onClose: () => {
    clearTimeout(timer); if (vv) vv.removeEventListener('resize', fit); openState = null;
    if (opener && opener.focus && document.contains(opener)) opener.focus();
  } });
  const scrim = sheet.closest('.scrim'); if (scrim) { scrim.classList.add('fbscrim'); scrim.setAttribute('aria-labelledby', 'fbHead'); }
  closeBtn.addEventListener('click', () => close());
  openState = { close };
  // 첫 칸 자동 포커스는 하지 않는다(키보드가 장면을 가리므로). openScrim 이 30ms 뒤 첫 칸에 두는 것을 팝업 자체로 옮긴다
  setTimeout(() => { if (document.contains(sheet)) sheet.focus(); }, 80);
  return close;
}
