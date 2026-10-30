// 의견 보내기 어댑터 (R-16, D-24·D-25): Caps.feedback.send({title, from, body}) 한 함수 뒤에 전송 방법을 숨긴다 (D-10 방식)
// 지금은 모의(D-21): 메일을 보내지 않고 브라우저 저장에 쌓는다. Web3Forms 호출 자리는 배포 주소에서만 중계로 열린다(D-54·62).
// 받는 이메일은 어디에도 쓰지 않는다(서비스 대시보드에만). 쿨다운 기록·받은 의견 상자도 이 모듈이 맡는다.
import { FEEDBACK_CONFIG } from '../config.js';
import { checkCooldown, feedbackKey, FB_COOL, pruneBox, pruneSent, mailPreview } from '../core/feedback_rules.js';
import { store } from './store.js';

const SLOW_MS = 3000;
// 저장값이 변조돼도(숫자·객체·문자열·null) 전송 경로가 죽지 않게: 배열이 아니면 빈 배열, 원소 타입 검증
// 알려진 한계(클라이언트에서는 못 막음, M4 서버 한도에서 방어): 시계 되돌리기로 쿨다운 우회, 두 탭 동시 전송 틈
const listOf = (k) => { const v = store.get(k, []); return Array.isArray(v) ? v : []; };
const str = (v) => (typeof v === 'string' ? v : '');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const Feedback = {
  mode: 'ok', // 모의 시험용: 'ok' | 'fail' | 'slow' (어드민 의견함이 바꾼다)
  // 배포 주소에서만 실제 전송(중계 /api/feedback). 로컬 서버(localhost·127.0.0.1·file)는 Functions 가 없어 모의 (D-54·62)
  isLive() {
    const l = FEEDBACK_CONFIG.live;
    if (l === true || l === false) return l;
    const loc = typeof location !== 'undefined' ? location : null;
    if (!loc || !/^https?:$/.test(loc.protocol || '')) return false;
    return !/^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(loc.hostname || '');
  },
  // 쌓인 의견 (최신이 앞). 보관 기간이 지난 것은 읽을 때 버린다
  box() {
    const all = listOf('feedback_box');
    const keep = pruneBox(all, Date.now(), FEEDBACK_CONFIG.retentionDays).map((x, i) => ({
      id: typeof x.id === 'string' && x.id ? x.id : 'b' + x.at.toString(36) + i, at: x.at, title: str(x.title), from: str(x.from), body: str(x.body),
      ...(typeof x.title === 'string' && typeof x.body === 'string' ? {} : { broken: true }),
    }));
    if (JSON.stringify(keep) !== JSON.stringify(all)) store.set('feedback_box', keep); // 깨진 항목은 고쳐 쓴다(표시는 어드민이 '(깨진 항목)')
    return keep;
  },
  remove(id) { store.set('feedback_box', this.box().filter((x) => x.id !== id)); },
  clearBox() { store.set('feedback_box', []); },
  // 쿨다운(60초 1회·하루 5회). 성공한 전송만 센다
  cooldown(now = Date.now()) { return checkCooldown(listOf('feedback_sent'), now); },
  recentKeys() { return listOf('feedback_keys').filter((k) => typeof k === 'string'); },
  recordSent(clean, now = Date.now()) {
    store.set('feedback_sent', [...pruneSent(listOf('feedback_sent'), now), now]);
    store.set('feedback_keys', [...this.recentKeys(), feedbackKey(clean)].slice(-FB_COOL.dupKeep));
  },
  resetCooldown() { store.set('feedback_sent', []); store.set('feedback_keys', []); },
  sentToday(now = Date.now()) { return pruneSent(listOf('feedback_sent'), now).length; },
  mail: mailPreview,
  // 보낸다. 성공 {ok:true, id} / 실패 throw. 화면은 이미 검증·정리한 clean 값만 넘긴다
  async send(clean) {
    if (this.isLive()) return this.sendWeb3Forms(clean);
    if (this.mode === 'slow') await wait(SLOW_MS);
    else await wait(250); // 보내는 동안의 모습이 보이도록 아주 조금 기다린다
    if (this.mode === 'fail') throw new Error('모의 실패');
    const now = Date.now(), id = 'f' + now.toString(36) + Math.random().toString(36).slice(2, 6);
    store.set('feedback_box', [{ id, at: now, title: clean.title, from: clean.from, body: clean.body }, ...this.box()].slice(0, 200));
    return { ok: true, id };
  },
  // 같은 출처 중계(Pages Function)로 보낸다. 키는 서버에만 있다. 상태 코드가 2xx 가 아니면 실패
  async sendWeb3Forms(clean) {
    const r = await fetch(FEEDBACK_CONFIG.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ title: clean.title, from: clean.from, body: clean.body, honey: '' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok !== true) throw new Error('전송 실패');
    return { ok: true, id: null };
  },
};
