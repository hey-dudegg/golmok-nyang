// 저장된 행동 레시피 목록과 켜기·끄기·ACTIONS 등록 (R-14). 오류 알림은 notify 로 바깥(화면)에 맡긴다
import { ACTIONS } from '../core/behavior.js';
import { EMO_BIAS } from '../core/clock.js';
import { recipeToAction } from '../core/recipe_action.js';
import { RLIM, recipeIsPlain, validateRecipe } from '../core/recipe_rules.js';
import { Caps } from '../adapters/caps.js';
import { RecipeStore } from '../adapters/recipe_store.js';
import { Clock } from './clock.js';

export const Recipes = {
  list: [], listeners: [], dropped: 0,
  notify: () => {}, // 오류 알림 (main.js 가 toast 를 넣는다)
  on(fn) { this.listeners.push(fn); },
  emit() { for (const f of this.listeners) { try { f(this.list); } catch (e) {} } },
  adopt(raw) { // 저장소에서 읽은 목록은 믿지 않고 다시 검사한다
    this.list = []; this.dropped = 0;
    if (Array.isArray(raw)) {
      for (const it of raw.slice(0, RLIM.saved)) {
        const v = recipeIsPlain(it) && typeof it.id === 'string' && /^r[0-9a-z]{4,14}$/.test(it.id) ? validateRecipe(it.rec) : null;
        if (!v || !v.ok) { this.dropped++; continue; }
        this.list.push({ id: it.id, savedAt: +it.savedAt || 0, enabled: it.enabled === true, rec: v.recipe, err: typeof it.err === 'string' ? it.err.slice(0, 80) : '' });
      }
    }
    this.sync();
  },
  async init() { if (Caps.db) { this.adopt(await RecipeStore.load()); this.emit(); } },
  persist() { return RecipeStore.save(this.list.map((x) => ({ id: x.id, savedAt: x.savedAt, enabled: x.enabled, rec: x.rec, err: x.err }))); },
  register(it) {
    const A = recipeToAction(it.id, it.rec, (e) => this.fail(it.id, e));
    ACTIONS['rcp_' + it.id] = A; if (Object.keys(A.emoBias).length) EMO_BIAS['rcp_' + it.id] = A.emoBias;
  },
  sync() { // 켜진 레시피만 ACTIONS에 등록 (켜는 수 상한). 일정 계산 캐시를 비워 새 후보가 반영되게 한다
    for (const k of Object.keys(ACTIONS)) if (k.startsWith('rcp_') && k !== 'rcp_preview') { delete ACTIONS[k]; delete EMO_BIAS[k]; }
    let n = 0;
    for (const it of this.list) {
      if (!it.enabled) continue;
      if (n >= RLIM.enabled) { it.enabled = false; it.err = `켜는 수 상한(${RLIM.enabled}개) 초과`; continue; }
      try { this.register(it); n++; } catch (e) { it.enabled = false; it.err = '등록 중 오류: ' + String(e && e.message).slice(0, 50); }
    }
    Clock.cache.clear();
  },
  fail(id, e) { // 실행 중 오류: 그 레시피를 끈다 (미리보기는 끄지 않고 알림만)
    const it = this.list.find((x) => x.id === id);
    if (it && it.enabled) { it.enabled = false; it.err = '실행 중 오류로 꺼졌어요: ' + String(e && e.message).slice(0, 50); this.sync(); this.persist(); this.emit(); }
    try { this.notify('레시피 오류: ' + (it ? it.rec.name : '미리보기') + ' (꺼짐)'); } catch (e2) {}
  },
  add(rec) {
    if (this.list.length >= RLIM.saved) throw new Error(`저장은 최대 ${RLIM.saved}개예요`);
    const it = { id: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), savedAt: Date.now(), enabled: false, rec, err: '' };
    this.list.unshift(it); this.persist(); this.emit(); return it;
  },
  setEnabled(id, on) {
    const it = this.list.find((x) => x.id === id); if (!it) return false;
    if (on && this.list.filter((x) => x.enabled).length >= RLIM.enabled) throw new Error(`켜는 수는 최대 ${RLIM.enabled}개예요`);
    it.enabled = !!on; it.err = ''; this.sync(); this.persist(); this.emit(); return true;
  },
  remove(id) { this.list = this.list.filter((x) => x.id !== id); this.sync(); this.persist(); this.emit(); },
  preview(rec, agent) { // 저장하지 않은 레시피도 재생: 점수 0이라 일정 후보에는 절대 들어가지 않는 임시 행동
    if (!agent || agent.enc || agent.hidden) return false;
    ACTIONS.rcp_preview = recipeToAction('preview', rec, (e) => this.fail('preview', e)); ACTIONS.rcp_preview.score = () => 0;
    agent.repeatKey = null; agent.play('rcp_preview'); return true;
  },
};
Recipes.adopt(RecipeStore.local()); // 로컬 저장분은 앱이 시작되기 전에 읽는다
