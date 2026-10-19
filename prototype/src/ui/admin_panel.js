// 어드민 패널 (R-15, 설계 9장)
import { ACTIONS, REACTIONS } from '../core/behavior.js';
import { CLOCK, EMO_DEFS, NEED_DEFS } from '../core/clock.js';
import { fmtKST } from '../core/format.js';
import { TRAITS } from '../core/genome.js';
import { PET_PARTS, TOUCH_TYPES, petPolarityWeights, touchType } from '../core/touch_rules.js';
import { clamp, fmtCount, makeRng } from '../core/util.js';
import { Caps } from '../adapters/caps.js';
import { REGIONS } from '../adapters/regions_data.js';
import { store } from '../adapters/store.js';
import { Clock } from '../state/clock.js';
import { Admin, GATE, GATE_LABEL, SHARE_ENABLED } from '../state/gate.js';
import { Bonds } from '../state/members.js';
import { Names } from '../state/names.js';
import { Trips, unitName } from '../sim/trips.js';
import { renderCard } from './card.js';
import { h, toast } from './dom.js';
import { renderRanking } from './names_panel.js';
import { buildRecipeSection } from './recipe_panel.js';
import { Live, Promo } from './together.js';

// ───────────────────────── 어드민 (R-15, 설계 9장) ─────────────────────────
// 주소 뒤에 ?admin. 소유자만 열린다 (로컬에서는 모의 어댑터가 소유자로 취급, D-21). 가입 없이 모든 기능을 쓴다 (D-16).
// M0-1: 행동 재생 · 상태 조절 · 일정 미리보기 · 회원 범위. M0-2: 이벤트 시험 · 공유. 나머지 구역은 뒤 단계에서 더한다.
// Clock.state()의 감정 식에서 배고픔·관심이 고픔이 곱해지는 계수 (식을 바꾸면 여기도 맞춘다)
const NEED_TO_EMO = { hunger: { happy: -0.3, grumpy: 0.25 }, social: { happy: -0.2, lonely: (p) => 0.6 * (0.4 + p.social) } };
const PERS_LABEL = { bold: '대담함', social: '사교성', playful: '장난기', food: '식탐', energy: '활동량', grumpy: '까칠함' };
export const AdminPanel = {
  app: null, el: null, over: null, orig: null, boundCat: null, rows: {}, timer: null,
  agent() { return this.app && this.app.mascot; },
  async init(app) {
    if (!Admin.wantsPage || Admin.active) return;
    let owner = false;
    try { owner = !!(Caps.user && await Caps.user.isOwner()); } catch (e) {}
    if (!owner) { toast('어드민은 소유자만 열 수 있어요'); return; }
    Admin.active = true; this.app = app;
    this.mount();
    app.renderMember(); renderCard(app);
  },
  mount() {
    const app = this.app, self = this, rows = this.rows;
    const body = h('div', { class: 'adbody' });
    const fold = matchMedia('(max-width: 720px)').matches; // 모바일에서는 처음에 접어 두어 고양이를 가리지 않는다
    body.hidden = fold;
    const toggle = h('button', { type: 'button', class: 'adtoggle', 'aria-expanded': String(!fold), text: fold ? '어드민 ▸' : '어드민 ▾', onclick: () => {
      body.hidden = !body.hidden; toggle.textContent = body.hidden ? '어드민 ▸' : '어드민 ▾'; toggle.setAttribute('aria-expanded', String(!body.hidden));
    } });
    const el = h('aside', { id: 'admin', class: 'ui panel', 'aria-label': '어드민 패널' }, toggle, body);
    const sec = (title, open, ...kids) => h('details', { class: 'adsec', open: open || null }, h('summary', { text: title }), ...kids);
    this.banner = h('div', { class: 'note adbanner', hidden: true });

    // 1) 행동 재생
    const speed = h('select', { 'aria-label': '재생 속도', onchange: () => { app.speed = +speed.value; } },
      ...[0.25, 0.5, 1, 1.5, 2].map((v) => h('option', { value: String(v), selected: v === 1, text: v + '배' })));
    const rep = h('input', { type: 'checkbox', id: 'adRep' });
    const playBtn = (k, label) => h('button', { type: 'button', class: 'btn ghost adbtn', title: k, text: label, onclick: () => {
      const a = self.agent(); if (!a) return;
      a.repeatKey = rep.checked ? k : null; a.play(k); self.refresh();
    } });
    const resume = h('button', { type: 'button', class: 'btn', text: '일정으로 복귀', onclick: () => { const a = self.agent(); if (a) { a.resumeSchedule(); self.refresh(); } } });
    const s1 = sec('행동 재생', true,
      h('div', { class: 'row' }, h('label', { for: 'adSpeed', text: '속도' }), speed, h('label', { class: 'check', for: 'adRep' }, rep, h('span', { text: '반복' })), resume),
      h('div', { class: 'adsub', text: '일정 행동' }), h('div', { class: 'adgrid' }, ...Object.entries(ACTIONS).filter(([k]) => !k.startsWith('rcp_')).map(([k, A]) => playBtn(k, A.label))),
      h('div', { class: 'adsub', text: '교감 반응' }), h('div', { class: 'adgrid' }, ...Object.entries(REACTIONS).map(([k, R]) => playBtn(k, R.label))));
    speed.id = 'adSpeed';

    // 2) 상태 조절
    const slider = (id, label, onInput) => {
      const out = h('output', { text: '0.00' });
      const inp = h('input', { type: 'range', min: '0', max: '1', step: '0.01', 'aria-label': label, oninput: () => { out.textContent = (+inp.value).toFixed(2); onInput(+inp.value); } });
      rows[id] = { inp, out };
      return h('label', { class: 'adsl' }, h('span', { text: label }), inp, out);
    };
    const setOver = (grp, key, v) => { if (!self.over) self.over = JSON.parse(JSON.stringify(Clock.stateAt(self.agent().cat, Date.now(), true))); const prev = self.over[grp][key]; self.over[grp][key] = v;
      // 배고픔·관심이 고픔은 Clock.state()가 감정(기쁨·짜증·외로움)을 만들 때 쓰는 계수만큼 파생 감정을 같이 옮긴다 (변화량만 더하므로 감정을 직접 움직인 값은 유지된다)
      const dep = grp === 'needs' && NEED_TO_EMO[key];
      if (dep) { const d = v - prev, p = self.agent().cat.g.personality; for (const [ek, c] of Object.entries(dep)) self.over.emo[ek] = clamp(self.over.emo[ek] + d * (typeof c === 'function' ? c(p) : c), 0, 1); }
      self.refresh(); };
    const needs = h('div', { class: 'adsls' }, ...NEED_DEFS.map(([k, l]) => slider('n:' + k, l, (v) => setOver('needs', k, v))));
    const emos = h('div', { class: 'adsls' }, ...EMO_DEFS.map(([k, l]) => slider('e:' + k, l, (v) => setOver('emo', k, v))));
    const pers = h('div', { class: 'adsls' }, ...TRAITS.map(([k]) => slider('p:' + k, PERS_LABEL[k], (v) => {
      const a = self.agent(); a.cat.g.personality[k] = v; Clock.cache.clear(); self.refresh();
    })));
    this.cand = h('div', { class: 'adcand', 'aria-live': 'off' });
    const runNext = h('button', { type: 'button', class: 'btn primary', text: '이 상태로 다음 행동 실행', onclick: () => {
      const a = self.agent(); if (!a) return;
      const l = Clock.top5(a.cat, Date.now(), self.currentState(), Clock.recentAt(a.cat, Date.now())); if (!l.length) return;
      const k = makeRng(Date.now()).weighted(l.map((x) => [x.key, x.w]));
      a.playManual(k); toast('실행: ' + ACTIONS[k].label); self.refresh();
    } });
    const reset = h('button', { type: 'button', class: 'btn', text: '시각 상태로 되돌리기', onclick: () => {
      const a = self.agent(); if (!a) return;
      if (self.orig) Object.assign(a.cat.g.personality, self.orig);
      self.over = null; Clock.cache.clear(); a.resumeSchedule(); self.refresh();
    } });
    const s2 = sec('상태 조절', true, this.banner,
      h('div', { class: 'adsub', text: '욕구 4 (시각의 함수)' }), needs, h('div', { class: 'adsub', text: '감정 8' }), emos, h('div', { class: 'adsub', text: '성격 6축 (이 화면에서만 바뀜)' }), pers,
      h('div', { class: 'adsub', text: '다음 행동 후보 상위 5' }), this.cand, h('div', { class: 'row' }, runNext, reset));

    // 3) 일정 미리보기
    this.sched = h('div', { class: 'adsched' });
    const s3 = sec('일정 미리보기 (앞으로 30분)', true, this.sched);

    // 4) 회원 범위
    const gate = h('div', { class: 'adgate' }, ...Object.keys(GATE).map((k) => {
      const sel = h('select', { 'aria-label': GATE_LABEL[k], onchange: () => { GATE[k] = sel.value; renderCard(app); app.refreshFab(); } },
        ...['회원', '누구나'].map((v) => h('option', { value: v, selected: GATE[k] === v, text: v })));
      return h('label', {}, h('span', { text: GATE_LABEL[k] }), sel);
    }));
    const s4 = sec('회원 범위 (이 화면에서만)', false, h('div', { class: 'note', text: '어드민은 이 표와 상관없이 가입 없이 모두 쓸 수 있어요. 새로고침하면 원래 표로 돌아와요.' }), gate);

    // 5) 이벤트 시험 (홍보 안내창 · 사람 수 가짜 값 · 회원/비회원 화면)
    const view = h('select', { 'aria-label': '보기 모드', onchange: () => { Admin.view = view.value; app.renderMember(); renderCard(app); } },
      ...[['admin', '어드민 (가입 없이 전부)'], ['member', '회원 화면'], ['guest', '비회원 화면']].map(([v, l]) => h('option', { value: v, selected: Admin.view === v, text: l })));
    const target = h('select', { 'aria-label': '안내창이 가리킬 지역' }, ...REGIONS.units.map((u) => h('option', { value: u.c, text: u.n, selected: u.c === '26' })));
    const fakeIn = h('input', { type: 'number', min: '0', step: '1', 'aria-label': '보는 사람 수 가짜 값', placeholder: '예: 1234' });
    const fakeOut = h('output', { class: 'adinfo', text: '실제 값' });
    const setFake = (v) => { Live.fake = v; fakeIn.value = v == null ? '' : String(v); fakeOut.textContent = v == null ? '실제 값' : `표기 ${fmtCount(v)}`; Live.render(); };
    fakeIn.addEventListener('input', () => setFake(fakeIn.value === '' ? null : Math.max(0, Math.floor(+fakeIn.value || 0))));
    const preset = (v) => h('button', { type: 'button', class: 'btn ghost adbtn', text: String(v), onclick: () => setFake(v) });
    const shareBox = (k, l) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: SHARE_ENABLED[k] || null, onchange: (e) => { SHARE_ENABLED[k] = e.target.checked; } }), h('span', { text: l }));
    const s5 = sec('이벤트 시험 · 공유', false,
      h('div', { class: 'adsub', text: '화면 전환' }), h('div', { class: 'note', text: '회원/비회원 화면에서는 회원 범위 표(위)를 그대로 적용해요. "누구나"로 바꿔 두면 비회원도 되는지 볼 수 있어요.' }), view,
      h('div', { class: 'adsub', text: '홍보 안내창 (나에게만)' }),
      h('div', { class: 'adrow2' }, target, h('button', { type: 'button', class: 'btn adbtn', text: '안내창 띄우기', onclick: () => {
        const a = app.selected || app.mascot; if (!a) return;
        Promo.show({ code: target.value, name: a.cat.name, where: REGIONS.unitOf(target.value).n, thumb: Promo.thumb(app) });
      } })),
      h('div', { class: 'adsub', text: '보는 사람 수 가짜 값 (이 화면에서만)' }),
      h('div', { class: 'adrow2' }, fakeIn, fakeOut, h('button', { type: 'button', class: 'btn adbtn', text: '실제 값', onclick: () => setFake(null) })),
      h('div', { class: 'adgrid' }, ...[999, 1000, 1234, 12500, 999999, 1234567].map(preset)),
      h('div', { class: 'adsub', text: '홍보 잠금' }),
      h('div', { class: 'adrow2' }, h('button', { type: 'button', class: 'btn adbtn', text: '10초 잠금·1분 쿨다운 풀기', onclick: () => { if (Caps.lock) Caps.lock.clear('promo'); Promo.lastAt = 0; store.set('promoAt', 0); toast('홍보 잠금을 풀었어요'); } })),
      h('div', { class: 'adsub', text: '공유 비활성 채널 켜 보기 (화면 확인용)' }), shareBox('kakao', '카카오톡'), shareBox('insta', '인스타그램'));

    // 6) 놀러가기 시험 (설계 7장 어드민 시험 기능)
    const guestSel = h('select', { 'aria-label': '손님이 올 지역' }, ...REGIONS.units.map((u) => h('option', { value: u.c, text: u.n, selected: u.c === '41' })));
    const kindSel = h('select', { 'aria-label': '상호작용 종류' }, ...[['random', '무작위(시각대로)'], ['fight', '싸움'], ['play', '어울리기']].map(([v, l]) => h('option', { value: v, text: l })));
    const stepChk = h('input', { type: 'checkbox', id: 'adStep', onchange: () => { if (app.enc) app.enc.stepMode = stepChk.checked; } });
    const gazeChk = h('input', { type: 'checkbox', id: 'adGaze', onchange: () => { app.gaze = gazeChk.checked; self.refresh(); } });
    const act = (label, fn) => h('button', { type: 'button', class: 'btn adbtn', text: label, onclick: () => { fn(); self.refresh(); } });
    this.visitInfo = h('div', { class: 'note adinfo', id: 'adVisitInfo' });
    this.tripList = h('div', { class: 'adsched adtrips', id: 'adTrips' });
    const s6 = sec('놀러가기 시험', true,
      h('div', { class: 'adsub', text: '손님이 오는 지역 · 상호작용 종류' }),
      h('div', { class: 'adrow2' }, guestSel, kindSel),
      h('label', { class: 'check' }, stepChk, h('span', { text: '단계마다 멈춤 (계속·다음 단계를 눌러야 넘어가요)' })),
      h('div', { class: 'adrow2' }, act('지금 놀러 오기', () => app.forceVisit(guestSel.value, kindSel.value, stepChk.checked)), act('이 지역 고양이 지금 놀러 보내기', () => app.forceAway()), act('바로 돌아오기', () => app.returnNow())),
      h('div', { class: 'adsub', text: '진행' }), this.visitInfo,
      h('div', { class: 'adrow2' }, act('멈춤 / 계속', () => { const E = app.enc; if (E) { E.wall = false; E.paused = !E.paused; } }), act('다음 단계', () => { if (app.enc) app.enc.nextPhase(); }), act('만남 끝내기', () => app.abortEnc())),
      h('label', { class: 'check' }, gazeChk, h('span', { text: '시선 선 보기 (흰 선 = 상대 머리까지, 주황 선 = 머리가 실제로 향한 방향)' })),
      h('div', { class: 'adsub', text: '외출 일정표 (앞으로 3시간, 16마리)' }), this.tripList);

    this.info = h('div', { class: 'note adinfo' });
    // 이름 규칙 시험 (D-31): 가짜 세션으로 투표·신고를 넣어 삭제 규칙을 눈으로 확인
    let fake = 0;
    const nameSel = h('select', { 'aria-label': '시험할 이름' });
    const fillNames = () => { nameSel.replaceChildren(...Names.list.filter((n) => !Names.dead(n)).map((n) => h('option', { value: n.id, text: `${n.name} (좋아요 ${Names.cnt(n.up)} / 싫어요 ${Names.cnt(n.down)} / 신고 ${Names.cnt(n.rep)})` }))); };
    Names.on(fillNames);
    const asFake = async (fn) => { const keep = Names.asUid; Names.asUid = 'fake' + (++fake); try { const n = Names.list.find((x) => x.id === nameSel.value); if (!n) return toast('이름이 없어요'); const r = await fn(n); toast('가짜 ' + Names.asUid + (r && r.gone ? ' - 이름이 내려갔어요' : ' 완료')); } finally { Names.asUid = keep; fillNames(); renderRanking(app); } };
    const s7 = sec('이름 규칙 시험', false,
      h('div', { class: 'note', text: '다른 사람인 척(가짜 세션) 투표·신고를 넣어요. 싫어요 > 좋아요면 삭제, 신고 5개면 삭제.' }), nameSel,
      h('div', { class: 'adrow2' }, act('가짜 좋아요 +1', () => asFake((n) => Names.vote(n, 'up'))), act('가짜 싫어요 +1', () => asFake((n) => Names.vote(n, 'down'))), act('가짜 신고 +1', () => asFake((n) => Names.report(n)))),
      h('div', { class: 'adrow2' }, act('가짜 이름 5개 채우기(내 세션)', async () => { for (let i = 1; i <= 6; i++) { try { await Names.propose('시험' + i); } catch (e) { toast(e.message); break; } } fillNames(); }), act('이 지역 이름 모두 지우기', async () => { if (Caps.db) return toast('로컬에서만 지울 수 있어요'); Names.list = []; Names.saveLocal(); })));
    fillNames();
    // 교감 극성 표 (D-30): 고른 고양이의 손길 유형과 부위별 긍정/중립/부정 비율(현재 신뢰도)
    const touchInfo = h('div', { class: 'note adinfo' });
    const showTouch = () => { const a = self.agent(); if (!a) return; const ty = touchType(a.cat.id, a.cat.g.personality), tr = Bonds.get(a.cat.id).trust;
      const rows = PET_PARTS.map(([k, l]) => { const w = petPolarityWeights(ty, k, tr), t = w[0] + w[1] + w[2]; return `${l}: 긍정 ${Math.round(w[0] / t * 100)}% · 중립 ${Math.round(w[1] / t * 100)}% · 부정 ${Math.round(w[2] / t * 100)}%`; });
      touchInfo.textContent = `손길 유형: ${TOUCH_TYPES[ty]} · 신뢰도 ${tr.toFixed(2)}` + '\n' + rows.join('\n'); touchInfo.style.whiteSpace = 'pre-line'; };
    const s8 = sec('교감 극성 표', false, act('고른 고양이 손길 유형 보기', showTouch), touchInfo);
    const s9 = sec('행동 레시피 (숏츠에서 가져오기)', false, buildRecipeSection(this));
    body.append(s1, s2, s3, s6, s4, s5, s7, s8, s9, this.info);
    document.body.append(el); this.el = el;
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 1000);
  },
  currentState() { const a = this.agent(); return this.over || Clock.stateAt(a.cat, Date.now(), true); },
  refreshVisit(now) {
    const app = this.app, E = app.enc, KO = { fight: '싸움', play: '어울리기' };
    let s;
    if (E && !E.done) {
      s = `${KO[E.kind]} · 단계 ${E.phases.indexOf(E.ph) + 1}/${E.phases.length} ${E.ph.name} · ${E.t.toFixed(1)}/${E.dur.toFixed(0)}초${E.paused ? ' · 멈춤' : ''}${E.wall ? '' : ' · 수동'}`;
      if (E.kind === 'fight') s += ` · 이긴 쪽 ${E.winner === 'host' ? '이 지역' : '손님'}`;
      if (app.gaze && app.gazeAng) s += ` · 시선 오차 이 지역 ${app.gazeAng[0]}° / 손님 ${app.gazeAng[1]}°`;
    } else if (app.away) s = '이 지역 고양이가 인근 지역에 놀러 가 있어요 (표지판 화면)';
    else s = '진행 중인 만남 없음';
    const mine = Trips.between(now, now + 3 * 3600000).filter((x) => x.from === app.dong.c || x.to === app.dong.c)[0];
    if (mine) s += ` · 이 지역 다음 일정 ${fmtKST(mine.t0)} ${mine.from === app.dong.c ? '나감 → ' + unitName(mine.to) : '손님 ← ' + unitName(mine.from)}`;
    this.visitInfo.textContent = s;
    const key = Math.floor(now / 5000) + ':' + app.dong.c;
    if (this._tripKey !== key) { // 일정표는 5초마다만 다시 그린다
      this._tripKey = key;
      const list = Trips.between(now, now + 3 * 3600000), nf = list.filter((x) => x.kind === 'fight').length;
      this.tripList.replaceChildren(h('div', { class: 'adsrow' }, h('span', { class: 'tm', text: '합계' }), h('span', { text: `${list.length}건 (싸움 ${nf} · 어울림 ${list.length - nf})` }), h('small', { text: '' })),
        ...list.map((x) => h('div', { class: 'adsrow' + (x.from === app.dong.c || x.to === app.dong.c ? ' now' : '') }, h('span', { class: 'tm', text: fmtKST(x.t0) }), h('span', { text: `${unitName(x.from)} → ${unitName(x.to)}` }), h('small', { text: `${Math.round((x.t1 - x.t0) / 1000)}초 ${KO[x.kind]}` }))));
    }
  },
  refresh() {
    const a = this.agent(); if (!a || !this.el) return;
    const now = Date.now();
    if (this.boundCat !== a.cat) { this.boundCat = a.cat; this.over = null; this.orig = { ...a.cat.g.personality }; }
    const st = this.currentState(), rows = this.rows, active = document.activeElement;
    const put = (id, v) => { const r = rows[id]; if (r && r.inp !== active) { r.inp.value = String(v); r.out.textContent = v.toFixed(2); } };
    for (const [k] of NEED_DEFS) put('n:' + k, st.needs[k]);
    for (const [k] of EMO_DEFS) put('e:' + k, st.emo[k]);
    for (const [k] of TRAITS) put('p:' + k, a.cat.g.personality[k]);
    this.banner.hidden = !(this.over || a.manual);
    this.banner.textContent = (this.over ? '상태를 직접 조절 중이에요. ' : '') + (a.manual ? '일정이 멈춰 있어요. 아래 "시각 상태로 되돌리기"로 복귀합니다.' : '');
    // 후보
    const l = Clock.top5(a.cat, now, st, Clock.recentAt(a.cat, now));
    this.cand.replaceChildren(...l.map((x) => h('div', { class: 'adcrow' }, h('span', { text: x.label }), h('i', { style: `width:${Math.round(x.p * 100)}%` }), h('b', { text: Math.round(x.p * 100) + '%' }))));
    // 일정
    const list = Clock.between(a.cat, now, now + 30 * 60000);
    this.sched.replaceChildren(...list.map((e) => {
      const cur = now >= e.t0 && now < e.t1;
      return h('div', { class: 'adsrow' + (cur ? ' now' : '') }, h('span', { class: 'tm', text: fmtKST(e.t0) }), h('span', { text: e.label }), h('small', { text: cur ? `${Math.round((e.t1 - now) / 1000)}초 남음` : `${Math.round((e.t1 - e.t0) / 1000)}초` }));
    }));
    this.refreshVisit(now);
    const slot = Math.floor(now / CLOCK.SLOT);
    this.info.textContent = `지역 ${this.app.dong.n}(${this.app.dong.c}) · 고양이 ${a.cat.id} · 칸 ${slot} (30초) · 시각 ${fmtKST(now)} KST · 사람 ${Live.real()}명(실제)${Caps.room && !Caps.room.live ? ' · 탭 통신 없음' : ''}`;
  },
};
