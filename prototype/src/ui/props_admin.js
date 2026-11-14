// 어드민 '오브젝트' 구역 (M3-6 O1, 설계 7장): 기능 스위치·지점 표시·배치 목록·다시 배치·강제 행동·정보·도약 느리게 보기
import { ACTIONS } from '../core/behavior.js';
import { HOP } from '../core/prop_actions.js';
import { PROPS, PROP_ACTION_KEYS } from '../core/props.js';
import { h, toast } from './dom.js';

export function buildPropsSection(panel) {
  const app = panel.app;
  const chk = (label, fn, id) => { const i = h('input', { type: 'checkbox', id, onchange: () => fn(i.checked) }); return [h('label', { class: 'row' }, i, ' ' + label), i]; };
  const [swL, sw] = chk('오브젝트 기능 켜기 (개발 중 꺼짐, D-120)', (v) => { app.propsSet(v); toast(v ? '오브젝트 켬 (장면을 다시 지었어요)' : '오브젝트 끔'); }, 'adPropsOn');
  const [mkL] = chk('지점 표시 (접근점 파랑 · 지점 초록 · 점유 빨강)', (v) => app.propsMarks(v), 'adPropsMarks');
  const [slL] = chk('도약 느리게 보기 (4배)', (v) => { HOP.slow = v ? 4 : 1; }, 'adPropsSlow');
  const seed = h('input', { type: 'text', value: 'a', 'aria-label': '배치 시드', id: 'adPropsSeed', style: 'width:5em' });
  const list = h('div', { class: 'note adinfo', style: 'white-space:pre-line' }), info = h('div', { class: 'note adinfo', style: 'white-space:pre-line' });
  const btn = (label, fn) => h('button', { type: 'button', class: 'btn adbtn', text: label, onclick: fn });
  const keys = [...PROP_ACTION_KEYS];
  const play = h('div', { class: 'adgrid', id: 'adPropsPlay' });
  const upd = () => {
    sw.checked = PROPS.on;
    list.textContent = PROPS.on ? (PROPS.layout.length ? PROPS.layout.map((p) => `${p.kind} ${p.id} x ${p.x.toFixed(2)} z ${p.z.toFixed(2)} 방향 ${p.dir > 0 ? '→' : '←'}`).join('\n') : '이 지역에는 오브젝트가 없어요 (다시 배치로 시드를 바꿔 보세요)') : '꺼짐';
    const a = panel.agent();
    info.textContent = a ? `a.y ${a.y.toFixed(2)} · layer ${a.layer || '-'} · 지점 ${a.slot ? a.slot.key + ' (' + a.slot.state + ')' : '-'} · 도약 ${a.hop ? '중' : '-'}` : '';
    play.replaceChildren(...keys.filter((k) => ACTIONS[k]).map((k) => btn(ACTIONS[k].label, () => { const g = panel.agent(); if (g) { g.playManual(k); toast('실행: ' + ACTIONS[k].label); } })));
  };
  const timer = setInterval(() => { if (!document.getElementById('adPropsOn')) { clearInterval(timer); return; } upd(); }, 700);
  upd();
  return h('div', { class: 'adbox' }, swL, mkL, slL, h('div', { class: 'adsub', text: '이 지역 배치' }), list,
    h('div', { class: 'row' }, seed, btn('다시 배치', () => { if (!PROPS.on) return toast('먼저 기능을 켜 주세요'); app.propsSet(true, { code: seed.value || 'a' }); upd(); })),
    h('div', { class: 'adsub', text: '선택 고양이를 지점으로 보내기 (걸어서 접근)' }), play, h('div', { class: 'adsub', text: '선택 고양이 정보' }), info);
}
