// 상자 놓기 버튼·이름 입력·남은 시간·신고 (M6-4, 설계 상자_놓기_설계.md 4장). 장면 3D 그림·고양이 행동은 M6-5.
// 이름은 textContent 로만 넣는다(innerHTML 금지). 상태 판단은 state/box.js boxView.
import { Caps } from '../adapters/caps.js';
import { boxNameOk } from '../core/box.js';
import { Box, boxView, boxErrText } from '../state/box.js';
import { $, h, toast } from './dom.js';

const NAME_KEY = 'gn.box.name', NOTE_MS = 3000, PLACE_TIMEOUT_MS = 10000, TICK_MS = 60000;
const lsGet = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } };
const lsSet = (v) => { try { localStorage.setItem(NAME_KEY, v); } catch (e) {} };

export const BoxUi = {
  el: null, editing: false, pending: false, note: '', noteTimer: null, tick: null, reported: new Set(),
  init(app) {
    if (this.el) return;
    Box.init(Caps);
    if (!Box.enabled()) return; // 상자 어댑터가 없으면 버튼 자체를 만들지 않는다
    this.build();
    Box.on((box, why) => { this.onChange(box, why); });
    if (Caps.room) Caps.room.onCount(() => this.render());
    this.tick = setInterval(() => { if (!document.hidden) this.render(); }, TICK_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.render(); });
    this.setRegion(app.dong.c);
  },
  setRegion(code) { if (this.el) { this.editing = false; Box.setRegion(code); this.render(); } },
  build() {
    this.btn = h('button', { id: 'boxBtn', class: 'btn', type: 'button', onclick: () => this.press() });
    this.rep = h('button', { id: 'boxRep', class: 'btn ghost', type: 'button', text: '신고', hidden: true, onclick: () => this.report() });
    this.input = h('input', { id: 'boxName', type: 'text', maxlength: '10', autocomplete: 'off', 'aria-label': '상자에 보일 이름', onkeydown: (e) => { if (e.key === 'Enter') this.submit(); } });
    this.form = h('div', { class: 'boxform', hidden: true },
      h('div', { class: 'boxrow' }, this.input, h('button', { id: 'boxGo', class: 'btn primary', type: 'button', text: '놓기', onclick: () => this.submit() }), h('button', { id: 'boxCancel', class: 'btn ghost', type: 'button', text: '취소', onclick: () => { this.editing = false; this.render(); } })),
      h('small', { text: "모두에게 '○○님의 상자'로 보여요. 실명·연락처는 적지 마세요" }));
    this.noteEl = h('div', { class: 'boxnote', 'aria-live': 'polite' });
    this.el = h('div', { id: 'boxBar', class: 'ui panel' }, h('div', { class: 'boxrow' }, this.btn, this.rep), this.form, this.noteEl);
    document.body.append(this.el);
  },
  say(t) { this.note = t; clearTimeout(this.noteTimer); this.noteTimer = setTimeout(() => { this.note = ''; this.render(); }, NOTE_MS); this.render(); },
  onChange(box, why) {
    if (why === 'recv' && box && !box.mine) this.say(box.name != null ? box.name + '님이 상자를 놓아 줬어요' : '이웃님이 상자를 놓아 줬어요');
    else this.render();
  },
  view() { return boxView(Box.get(), Box.now(), { live: Box.live(), pending: this.pending, editing: this.editing }); },
  render() {
    if (!this.el) return;
    const v = this.view(), box = Box.get();
    this.el.dataset.phase = v.phase;
    this.btn.textContent = v.text; // 이름이 들어가므로 textContent
    this.btn.disabled = v.phase !== 'empty';
    if (v.phase === 'offline') this.btn.title = '지금은 상자를 놓을 수 없어요'; else this.btn.removeAttribute('title');
    this.rep.hidden = !(v.canReport && box && !this.reported.has(box.id));
    this.form.hidden = v.phase !== 'editing';
    this.noteEl.textContent = this.note;
    this.noteEl.hidden = !this.note;
  },
  press() {
    if (this.view().phase !== 'empty') return;
    this.editing = true; this.input.value = lsGet(); this.render(); this.input.focus();
  },
  async submit() {
    if (this.pending) return;
    const name = this.input.value.trim();
    if (!boxNameOk(name)) return this.say('쓸 수 없는 이름이에요');
    this.pending = true; this.render();
    let to; const timeout = new Promise((_, rej) => { to = setTimeout(() => { const e = new Error('network'); e.code = 'network'; rej(e); }, PLACE_TIMEOUT_MS); });
    try {
      await Promise.race([Box.place(name), timeout]);
      lsSet(name); this.editing = false; this.pending = false; this.say('상자를 놓았어요! 1시간 뒤에 사라져요');
    } catch (ex) {
      this.pending = false; this.say(boxErrText(ex));
      if (ex && ex.code === 'busy') { this.editing = false; Box.refresh(); }
      else if (ex && ex.code !== 'network') this.editing = ex.code === 'bad_name' || String(ex.code).startsWith('filter_');
    } finally { clearTimeout(to); this.render(); }
  },
  async report() {
    const box = Box.get(); if (!box || this.reported.has(box.id)) return;
    if (!window.confirm('이 상자 이름을 신고할까요?')) return;
    this.reported.add(box.id); this.render();
    try { await Box.report(box.id); } catch (e) { /* 같은 상자 다시 신고·실패는 조용히 */ }
    toast('신고했어요');
  },
};
