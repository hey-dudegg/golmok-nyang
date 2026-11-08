// 어드민 '숨김 검토' 구역 (설계 2차_연결_필터.md 3-5, M2-6b): 신고로 숨겨진 글·댓글·이름을 보고 복구·삭제한다.
// 서버(mod_list·mod_restore·mod_remove)가 어드민만 허용한다. 서버 연결이 없으면(모의·정적 모드) 안내만 낸다. 목록은 textContent 로만 그린다.
import { Caps } from '../adapters/caps.js';
import { fmtKST } from '../core/format.js';
import { h, toast } from './dom.js';
import { errText } from './err_text.js';

const KIND = { name: '이름', post: '글', comment: '댓글' };

export function buildModSection() {
  const info = h('div', { class: 'note adinfo', id: 'adModInfo' });
  const list = h('div', { class: 'adsched', id: 'adModList' });
  const mod = () => (Caps.db && Caps.db.mod) || null;
  const run = async (fn, okText) => {
    try { await fn(); toast(okText); } catch (ex) { toast(errText(ex, '처리하지 못했어요. 잠시 뒤 다시 시도해 주세요')); }
    draw();
  };
  const draw = async () => {
    const m = mod();
    if (!m) { info.textContent = '서버에 연결됐을 때만 쓸 수 있어요 (지금은 이 기기에만 저장돼요)'; list.replaceChildren(); return; }
    info.textContent = '불러오는 중…';
    let items;
    try { items = await m.list(); } catch (ex) { info.textContent = errText(ex, '목록을 불러오지 못했어요'); list.replaceChildren(); return; }
    info.textContent = `신고로 숨겨진 것 ${items.length}건 (최근 순, 최대 50)`;
    list.replaceChildren(...(items.length ? items.map((x) => h('div', { class: 'adsrow adfb-row', 'data-kind': x.kind },
      h('span', { class: 'tm', text: x.hidden_at ? fmtKST(Date.parse(x.hidden_at)) : '' }),
      h('span', { text: `[${KIND[x.kind] || x.kind}] ${x.text || ''}` }),
      h('small', { text: `신고 ${Number(x.reports) || 0}건` }),
      h('button', { type: 'button', class: 'btn ghost adbtn', text: '복구', 'aria-label': '다시 보이게 하기', onclick: () => run(() => m.restore(x.kind, x.target), '다시 보이게 했어요') }),
      h('button', { type: 'button', class: 'btn ghost adbtn', text: '삭제', 'aria-label': '화면에서 완전히 지우기', onclick: () => { if (confirm('화면 어디에도 안 보이게 지울까요?')) run(() => m.remove(x.kind, x.target), '지웠어요'); } }))) : [h('div', { class: 'note', text: '숨겨진 것이 없어요' })]));
  };
  draw();
  return h('div', { class: 'adfbwrap' },
    h('div', { class: 'note', text: '신고가 3개 쌓여 숨겨진 것을 보여줘요. 복구하면 신고가 지워져 새 신고 3개가 있어야 다시 숨겨져요. 숨김 한도는 서버 설정(report_hide)에서 조정해요.' }),
    info, list, h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn adbtn', text: '다시 불러오기', onclick: draw })));
}
