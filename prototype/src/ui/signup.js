// 이웃 등록(회원가입) 시트와 기능 실행 전 회원 범위 확인(requireGate)
import { Caps } from '../adapters/caps.js';
import { gateNeedsMember, gatedList } from '../state/gate.js';
import { Member } from '../state/members.js';
import { h, openScrim, toast } from './dom.js';

// ── 이웃 등록(회원가입) 시트 ──
export function openSignup(app, reason, then) {
  const err = h('div', { class: 'err', role: 'alert' });
  const nick = h('input', { type: 'text', id: 'nick', maxlength: '12', placeholder: '예: 삼청동집사', autocomplete: 'nickname' });
  const age = h('input', { type: 'checkbox', id: 'age14' });
  const terms = h('input', { type: 'checkbox', id: 'terms' });
  const mode = Caps.shared
    ? '이 체험판에서는 지금 로그인한 Claude 계정이 이웃 신분증이 됩니다. 실제 서비스에서는 카카오·네이버·Google·Apple 로그인으로 바뀝니다.'
    : '공유 저장소가 없는 화면이라 이 브라우저 안에서만 기억합니다. 실제 서비스에서는 카카오·네이버·Google·Apple 로그인으로 가입합니다.';
  const submit = h('button', { class: 'btn primary', type: 'submit', text: '이웃 등록하고 계속하기' });
  const form = h('form', { class: 'sheet', novalidate: true },
    h('h3', { text: reason || '고양이에게 손을 내밀려면 이웃 등록이 필요해요' }),
    h('p', { text: `보는 건 누구나 할 수 있어요. ${gatedList()}은(는) 이웃만 할 수 있고, 고양이는 이웃을 기억합니다.` }),
    h('div', { class: 'field' }, h('label', { for: 'nick', text: '골목에서 쓸 이름 (2~12자)' }), nick),
    h('label', { class: 'check', for: 'age14' }, age, h('span', { text: '만 14세 이상입니다.' })),
    h('label', { class: 'check', for: 'terms' }, terms, h('span', { text: '여기 고양이는 가상의 고양이이며, 실제 길고양이 돌봄은 지자체 안내를 따르겠습니다.' })),
    h('div', { class: 'note', text: mode }),
    err,
    h('div', { class: 'foot' }, h('button', { class: 'btn ghost', type: 'button', text: '그냥 구경할게요', onclick: () => close() }), submit),
  );
  const close = openScrim(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = nick.value.trim();
    if (n.length < 2) { err.textContent = '이름을 2자 이상 적어 주세요.'; nick.focus(); return; }
    if (!age.checked) { err.textContent = '만 14세 미만은 보호자 동의가 필요해서 지금은 가입할 수 없어요.'; return; }
    if (!terms.checked) { err.textContent = '가상 고양이 안내에 동의해 주세요.'; return; }
    submit.disabled = true; submit.textContent = '등록하는 중…';
    try {
      await Member.join(n, app.dong && app.dong.c);
      close(); toast(`${n}님, 골목 이웃이 되었어요`);
      then && then();
    } catch (ex) {
      submit.disabled = false; submit.textContent = '이웃 등록하고 계속하기';
      err.textContent = ex.message === 'readonly' ? '이 링크는 보기 전용이라 등록할 수 없어요. 편집 권한이 있는 링크로 열어 주세요.' : '등록하지 못했어요. 잠시 뒤 다시 눌러 주세요.';
    }
  });
}
// 기능 하나를 실행하기 전 설정표(GATE)를 보고 판단한다. 어드민은 가입 없이 바로 실행.
export function requireGate(app, key, reason, fn) {
  if (!gateNeedsMember(key)) return fn();
  openSignup(app, reason, fn);
}
