// 행동 레시피 저장 어댑터 (R-14, D-10·21): db가 있으면 db 한 칸, 없으면 브라우저 저장
import { Caps } from './caps.js';
import { store } from './store.js';

// 저장소 어댑터 (D-21, D-10): 로컬은 localStorage, 배포 뒤 db가 있으면 db 한 칸. 저장 모양은 { json: "<목록 JSON 글자>" } 한 가지라 db로 옮기기 쉽다.
export const RecipeStore = {
  local: () => store.get('recipes', []),
  async load() {
    if (Caps.db) { try { const s = await Caps.db.doc('admin/recipes').get(); if (s.exists) { const d = s.data(); return JSON.parse(String(d.json || '[]')); } } catch (e) {} }
    return this.local();
  },
  async save(list) {
    if (Caps.db) { try { await Caps.db.doc('admin/recipes').set({ json: JSON.stringify(list) }); return; } catch (e) {} }
    store.set('recipes', list);
  },
};
