// 이름표의 "이름 짓기 · 랭킹" 탭 (D-31)
import { NAME_RULE } from '../core/name_rules.js';
import { Names } from '../state/names.js';
import { Caps } from '../adapters/caps.js';
import { $, ICON, h, openScrim, toast } from './dom.js';
import { requireGate } from './signup.js';

export function namesPanel(app, a) {
  const input = h('input', { type: 'text', id: 'nameDraft', maxlength: '8', placeholder: `새 이름 제안 (1~8자, 최대 ${NAME_RULE.PER_SESSION}개)`, 'aria-label': '새 이름', value: app.nameDraft || '' });
  input.addEventListener('input', () => { app.nameDraft = input.value; });
  const err = h('div', { class: 'err', id: 'nameErr', role: 'alert' });
  const btn = h('button', { class: 'btn primary', type: 'submit', text: '제안하기' });
  const form = h('form', { class: 'say', onsubmit: (e) => {
    e.preventDefault();
    const v = input.value;
    const c = Names.check(v); if (c.err) { err.textContent = c.err; return; }
    requireGate(app, 'name_suggest', '이름을 지어 주려면 이웃 등록이 필요해요', async () => {
      btn.disabled = true; err.textContent = '';
      try {
        const res = await Names.propose(v);
        app.nameDraft = ''; const ip = $('#nameDraft'); if (ip) ip.value = '';
        toast(res.dup ? `이미 있는 이름이라 좋아요를 눌렀어요` : `"${res.item.name}" 이름을 제안했어요`);
        a.react('head_tilt');
      } catch (ex) { const ee = $('#nameErr'); if (ee) ee.textContent = ex && ex.message && !ex.code ? ex.message : '제안하지 못했어요. 잠시 뒤 다시 눌러 주세요.'; }
      btn.disabled = false;
    });
  } }, input, btn);
  return h('div', { class: 'names' },
    h('p', { class: 'nhelp', text: `좋아요를 가장 많이 받은 이름이 이 고양이의 이름이 돼요. 싫어요가 좋아요보다 많아지면 이름이 내려가요. 투표 전에는 이 지역에서 부르던 '${a.cat.defaultName || a.cat.name}'(으)로 불려요.` }),
    // D-65: M2(2차) 연결 후 삭제 (공유 저장소가 없을 때만 보이는 안내)
    ...(Caps.db && Caps.shared ? [] : [h('p', { class: 'note', id: 'namesLocalNote', text: '아직은 지은 이름과 랭킹이 이 기기에만 저장돼요. 이웃과 함께 보는 기능은 준비 중이에요.' })]),
    h('ol', { class: 'rank', id: 'rankList', 'aria-label': '이름 랭킹 상위 10' }),
    form, err);
}

function confirmReport(n, onYes) {
  let close;
  const yes = h('button', { class: 'btn primary', type: 'button', text: '신고', onclick: () => { close(); onYes(); } });
  const no = h('button', { class: 'btn', type: 'button', text: '취소', onclick: () => close() });
  close = openScrim(h('div', { class: 'sheet' }, h('p', { text: `"${n.name}" 이름을 신고할까요?` }), h('div', { class: 'foot' }, no, yes)), { center: true });
}
export function renderRanking(app) {
  const ol = $('#rankList'); if (!ol) return;
  const me = Names.me();
  const items = Names.ranked();
  if (!Names.ready) { ol.replaceChildren(h('li', { class: 'rempty', text: '이름 목록을 불러오는 중…' })); return; }
  if (!items.length) { ol.replaceChildren(h('li', { class: 'rempty', text: '아직 지어 준 이름이 없어요. 첫 이름을 제안해 보세요.' })); return; }
  const vote = (n, kind) => requireGate(app, 'name_like', '이름 투표는 이웃만 할 수 있어요', () => Names.vote(n, kind).then((r) => { if (r && r.gone) toast('싫어요가 더 많아 이 이름이 내려갔어요'); }).catch(() => toast('반영하지 못했어요')));
  ol.replaceChildren(...items.map((n, i) => {
    const up = !!(n.up && n.up[me]), down = !!(n.down && n.down[me]), reported = !!(n.rep && n.rep[me]);
    const ub = h('button', { class: 'btn ghost like', type: 'button', 'aria-pressed': up ? 'true' : 'false', 'aria-label': `${n.name} 좋아요 ${n.score}`, onclick: () => vote(n, 'up') });
    ub.innerHTML = ICON.thumbUp + `<span class="num">${Number(n.score)}</span>`;
    const db = h('button', { class: 'btn ghost dislike', type: 'button', 'aria-pressed': down ? 'true' : 'false', 'aria-label': `${n.name} 싫어요 ${n.dislikes}`, onclick: () => vote(n, 'down') });
    db.innerHTML = ICON.thumbDown + `<span class="num">${Number(n.dislikes)}</span>`;
    const rb = h('button', { class: 'btn ghost rep', type: 'button', 'aria-label': '신고', title: '신고', 'aria-pressed': reported ? 'true' : 'false', onclick: () => {
      if (reported) return toast('이미 신고한 이름이에요');
      confirmReport(n, () => requireGate(app, 'name_report', '신고는 이웃만 할 수 있어요', () => Names.report(n).then((r) => toast(r.already ? '이미 신고한 이름이에요' : '신고했어요. 알려 주셔서 고마워요')).catch(() => toast('신고하지 못했어요'))));
    } });
    rb.innerHTML = ICON.flag;
    return h('li', { class: i === 0 && n.score > 0 ? 'top' : '' },
      h('span', { class: 'rk', text: String(i + 1) }),
      h('span', { class: 'nm' }, h('b', { text: n.name }), h('small', { text: n.nick ? `${n.nick} 제안` : '' })),
      ub, db, rb);
  }));
}
