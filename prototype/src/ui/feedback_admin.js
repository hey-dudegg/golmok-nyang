// 어드민 '의견함' 구역 (R-16, 설계 7장): 쌓인 모의 의견·전송 결과 강제·쿨다운 풀기·가짜 스팸 입력. 목록은 textContent 로만 그린다
import { fmtKST } from '../core/format.js';
import { Feedback } from '../adapters/feedback.js';
import { h, toast } from './dom.js';
import { openFeedback } from './feedback.js';

const SPAM = [
  ['링크가 든 글', { title: '좋은 소식', body: '여기 놀러 오세요 http://example.invalid/x 또는 www.example.invalid' }],
  ['도메인 모양', { title: '광고', body: '싸게 팔아요 spam-shop.com 으로 오세요' }],
  ['500자 넘는 글', { title: '긴 글', body: '냥'.repeat(501) }],
  ['허니팟 채움(봇)', { title: '봇의 글', body: '안녕하세요 봇입니다', honey: 'http://bot.invalid' }],
  ['스크립트 글자', { title: '<script>alert(1)</script>', body: '<img src=x onerror=alert(1)> 이 글자는 그대로 보여요' }],
  ['안 보이는 글자', { title: '제\u200b로\u202e폭', body: '보\u0000이\u202a지 않는 글자\u2066들' }],
];
const HINT = '목록에서 의견을 누르면 메일에 담길 모양이 보여요';

export function buildFeedbackSection(panel) {
  const app = panel.app;
  const list = h('div', { class: 'adsched adfb', id: 'adFbList' });
  const info = h('div', { class: 'note adinfo', id: 'adFbInfo' });
  const prev = h('pre', { class: 'note adinfo adfb-mail', id: 'adFbMail', text: HINT });
  const show = (x) => { if (x.broken) { prev.textContent = '(깨진 항목) 저장된 모양이 이상해요. 지우기로 치울 수 있어요'; return; }
     const m = Feedback.mail({ title: x.title, from: x.from, body: x.body }); prev.textContent = `제목: ${m.subject}\n보낸 이: ${m.name}\n\n${m.message}`; };
  const draw = () => {
    const box = Feedback.box(), cd = Feedback.cooldown();
    info.textContent = `모의 상자 ${box.length}건 · 전송 결과 ${Feedback.mode === 'ok' ? '성공' : Feedback.mode === 'fail' ? '실패' : '느림(3초)'} · 오늘 보낸 횟수 ${Feedback.sentToday()}/5 · ${cd.ok ? '쿨다운 없음' : '쿨다운 ' + (cd.reason === 'gap' ? Math.ceil(cd.waitMs / 1000) + '초' : '하루 한도')} · 실제 전송 ${Feedback.isLive() ? '켜짐' : '꺼짐(모의)'}`;
    list.replaceChildren(...(box.length ? box.map((x) => h('div', { class: 'adsrow adfb-row', role: 'button', tabindex: '0', 'data-id': x.id,
      onclick: () => show(x), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(x); } } },
      h('span', { class: 'tm', text: fmtKST(x.at) }), h('span', { text: x.broken ? '(깨진 항목)' : x.title }), h('small', { text: (x.from || '(이름 없음)') + ' · ' + x.body.slice(0, 30) }),
      h('button', { type: 'button', class: 'btn ghost adbtn', 'aria-label': '이 의견 지우기', text: '지우기', onclick: (e) => { e.stopPropagation(); Feedback.remove(x.id); draw(); } }))) : [h('div', { class: 'note', text: '아직 받은 의견이 없어요' })]));
  };
  const act = (label, fn) => h('button', { type: 'button', class: 'btn adbtn', text: label, onclick: () => { fn(); draw(); } });
  const modeSel = h('select', { 'aria-label': '전송 결과 강제', id: 'adFbMode', onchange: () => { Feedback.mode = modeSel.value; draw(); } },
    ...[['ok', '성공'], ['fail', '실패'], ['slow', '느림(3초 뒤 성공)']].map(([v, l]) => h('option', { value: v, text: l, selected: Feedback.mode === v })));
  const openBtn = (label, prefill) => h('button', { type: 'button', class: 'btn ghost adbtn', text: label, onclick: (e) => openFeedback(app, { prefill, opener: e.currentTarget }) });
  const sec = h('div', { class: 'adfbwrap' },
    h('div', { class: 'note', text: '모의 어댑터예요. 메일은 가지 않고 이 브라우저에만 쌓여요. 아래 입력 시험은 실제 팝업을 칸이 채워진 채로 열어요(보내기를 눌러 확인).' }),
    info,
    h('div', { class: 'adsub', text: '전송 결과 강제' }), h('div', { class: 'adrow2' }, modeSel),
    h('div', { class: 'adsub', text: '쿨다운' }),
    h('div', { class: 'adrow2' }, act('쿨다운·하루 횟수 풀기', () => { Feedback.resetCooldown(); toast('쿨다운을 풀었어요'); })),
    h('div', { class: 'adsub', text: '팝업 열기 · 가짜 스팸 입력 시험' }),
    h('div', { class: 'adgrid' }, openBtn('빈 팝업 열기', null), ...SPAM.map(([l, p]) => openBtn(l, p))),
    h('div', { class: 'adsub', text: '받은 의견 (최신순)' }), list, prev,
    h('div', { class: 'adrow2' }, act('전체 지우기', () => { Feedback.clearBox(); prev.textContent = HINT; }), act('새로 고침', () => {})));
  draw();
  const t = setInterval(() => { if (document.contains(sec)) draw(); else clearInterval(t); }, 2000);
  return sec;
}
