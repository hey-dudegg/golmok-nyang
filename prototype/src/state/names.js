// 이름 짓기·좋아요/싫어요 랭킹 상태(Names, D-31)
import { NAME_BAD, NAME_RULE } from '../core/name_rules.js';
import { Caps } from '../adapters/caps.js';
import { store } from '../adapters/store.js';
import { Member } from './members.js';

// ───────────────────────── 이름 짓기 · 좋아요/싫어요 랭킹 (D-31) ─────────────────────────
// 규칙: 세션(Caps.uid, 없으면 이 브라우저 'local')당 지역 고양이마다 이름 5개까지 제안 / 이름마다 좋아요·싫어요 중 하나(토글, 배타)
//  · 싫어요가 좋아요보다 많아지면 삭제 (제안자는 제안과 함께 좋아요 1로 시작) · 신고가 5개 쌓이면 삭제 (한 세션 한 번, 횟수는 화면에 안 보임)
//  · 랭킹: 좋아요 많은 순 -> 싫어요 적은 순 -> 먼저 제안한 순 · 지역당 이름은 최대 NAME_CAP개
// 저장 위치는 names2/ (예전 names/ 하트 기록은 지우지 않고 읽지 않는다 = 보이지 않음, D-20)
export const Names = {
  dong: null, list: [], unsub: null, listeners: [], ready: false, asUid: null, // asUid: 어드민 시험용 가짜 세션
  on(fn) { this.listeners.push(fn); },
  emit() { for (const f of this.listeners) f(this.visible()); },
  me() { return this.asUid || Caps.uid || 'local'; },
  cnt: (m) => Object.values(m || {}).filter(Boolean).length,
  dead(n) { return !!n.gone || this.cnt(n.down) > this.cnt(n.up) || this.cnt(n.rep) >= NAME_RULE.REPORT_DEL; },
  visible() { return this.list.filter((n) => !this.dead(n)); },
  watch(code, force) {
    if (this.dong === code && !force) return;
    if (this.unsub) { try { this.unsub(); } catch (e) {} this.unsub = null; }
    this.dong = code; this.list = []; this.ready = false;
    if (Caps.db) {
      try {
        this.unsub = Caps.db.collection('names2/' + code + '/list').limit(300).onSnapshot((snap) => {
          if (this.dong !== code) return;
          this.list = snap.docs.map((d) => ({ id: d.id, ...d.data() })); this.ready = true; this.emit();
        }, () => { this.ready = true; this.emit(); });
      } catch (e) { this.ready = true; this.emit(); }
    } else { this.loadLocal(); }
    if (!this.storageOn) { // 로컬 모의: 다른 탭에서 바뀐 이름 목록을 반영
      this.storageOn = true;
      addEventListener('storage', (e) => { if (!Caps.db && this.dong && (e.key === 'golmok:names2:' + this.dong || e.key === null)) this.loadLocal(); });
    }
  },
  loadLocal() { this.list = store.get('names2:' + this.dong, []); this.ready = true; this.emit(); },
  score(n) { return this.cnt(n.up); },
  ranked() {
    return this.visible().map((n) => ({ ...n, score: this.score(n), dislikes: this.cnt(n.down) }))
      .sort((a, b) => b.score - a.score || a.dislikes - b.dislikes || (a.createdAt || 0) - (b.createdAt || 0)).slice(0, NAME_RULE.SHOW);
  },
  top() { const r = this.ranked()[0]; return r && r.score > 0 ? r : null; },
  mine() { const me = this.me(); return this.list.filter((n) => n.uid === me && !this.dead(n)).length; },
  saveLocal() { store.set('names2:' + this.dong, this.list); this.emit(); },
  // 입력 정리: 제어문자·보이지 않는 글자 제거, 공백 정리, 길이·글자 종류 제한
  clean(raw) { return String(raw || '').replace(NAME_BAD, ' ').replace(/\s+/g, ' ').trim(); },
  check(raw) {
    const name = this.clean(raw);
    if (name.length < 1 || name.length > NAME_RULE.MAXLEN) return { err: `이름은 1~${NAME_RULE.MAXLEN}자로 지어 주세요.` };
    if (!/^[가-힣a-zA-Z0-9 ]+$/.test(name)) return { err: '한글, 영문, 숫자만 쓸 수 있어요.' };
    return { name };
  },
  norm: (s) => String(s || '').replace(/\s/g, '').toLowerCase(),
  async patch(item, fields) { // 바뀐 필드를 저장하고, 규칙에 걸리면 삭제 표시까지 한 번에
    const n = this.list.find((x) => x.id === item.id) || item;
    Object.assign(n, fields);
    const gone = this.dead(n);
    if (gone) n.gone = true;
    if (Caps.db) await Caps.db.doc('names2/' + this.dong + '/list/' + item.id).update(gone ? { ...fields, gone: true } : fields);
    else this.saveLocal();
    if (Caps.db) this.emit();
    return { gone };
  },
  async propose(raw) {
    const c = this.check(raw); if (c.err) throw new Error(c.err);
    const same = this.list.find((n) => this.norm(n.name) === this.norm(c.name));
    const me = this.me();
    if (same) {
      if (this.dead(same)) throw new Error('이 이름은 이웃들의 판단으로 내려졌어요. 다른 이름을 지어 주세요.');
      if (!(same.up || {})[me]) await this.vote(same, 'up'); return { dup: true, item: same };
    }
    if (this.mine() >= NAME_RULE.PER_SESSION) throw new Error(`한 지역 고양이에게는 이름을 ${NAME_RULE.PER_SESSION}개까지 제안할 수 있어요.`);
    if (this.visible().length >= NAME_RULE.CAP) throw new Error('이 고양이의 이름 후보가 가득 찼어요. 싫어요가 많은 이름이 정리되면 다시 제안해 주세요.');
    const item = { name: c.name, uid: me, nick: Member.me ? Member.me.nick : '이웃', createdAt: Date.now(), up: { [me]: true }, down: {}, rep: {} };
    if (Caps.db) { const ref = await Caps.db.collection('names2/' + this.dong + '/list').add(item); return { item: { id: ref.id, ...item } }; }
    const id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); this.list.push({ id, ...item }); this.saveLocal(); return { item: { id, ...item } };
  },
  // 좋아요('up') / 싫어요('down'): 한 세션이 하나만, 같은 걸 다시 누르면 취소
  async vote(item, kind) {
    const me = this.me(), n = this.list.find((x) => x.id === item.id) || item, was = !!(n[kind] || {})[me], other = kind === 'up' ? 'down' : 'up';
    return this.patch(n, { [kind]: { ...(n[kind] || {}), [me]: !was }, [other]: { ...(n[other] || {}), [me]: false } });
  },
  async report(item) {
    const me = this.me(), n = this.list.find((x) => x.id === item.id) || item;
    if ((n.rep || {})[me]) return { already: true };
    const r = await this.patch(n, { rep: { ...(n.rep || {}), [me]: true } });
    return { ...r, already: false };
  },
};
