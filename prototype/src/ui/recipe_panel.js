// 어드민 "행동 레시피" 구역 (R-14)
import { RECIPE_SAMPLES, RLIM, parseRecipeText, recipePrompt, validateRecipe } from '../core/recipe_rules.js';
import { Recipes } from '../state/recipes.js';
import { copyText, h, toast } from './dom.js';

// 어드민 '행동 레시피' 구역 (붙여 넣기 · 검사 · 미리보기 · 저장 · 켜기/끄기 · 목록)
export function buildRecipeSection(panel) {
  const app = panel.app, ta = h('textarea', { id: 'adRcpIn', class: 'adrcp-in', rows: '8', spellcheck: 'false', autocomplete: 'off', 'aria-label': '행동 레시피 JSON', placeholder: '여기에 AI가 준 JSON을 붙여 넣어요 ({ 로 시작해서 } 로 끝나는 글)' });
  const res = h('div', { class: 'note adrcp-res', id: 'adRcpRes', 'aria-live': 'polite' });
  const list = h('div', { class: 'adrcp-list', id: 'adRcpList' });
  const say = (cls, head, lines) => { res.className = 'note adrcp-res ' + cls; res.replaceChildren(h('b', { text: head }), ...lines.map((l) => h('div', { class: 'adrcp-line', text: l }))); };
  const check = () => {
    const p = parseRecipeText(ta.value);
    if (p.errors) {
      say('bad', '검사: 오류', p.errors.map((e) => `${e.path}: ${e.msg}`));
      if (p.errors[0].pos >= 0 && p.text === ta.value.trim()) { try { ta.focus(); ta.setSelectionRange(p.errors[0].pos, Math.min(ta.value.length, p.errors[0].pos + 1)); } catch (e) {} }
      return null;
    }
    const v = validateRecipe(p.value);
    if (!v.ok) { say('bad', `검사: 오류 ${v.errors.length}건 (고친 뒤 다시 검사)`, v.errors.map((e) => `${e.path}: ${e.msg}`)); return null; }
    const l = [`이름: ${v.recipe.name} · 길이 ${v.recipe.duration_s}초 · 단계 ${v.recipe.steps.length}개`];
    if (v.recipe.when.emotion && v.recipe.when.emotion.length) l.push('어울리는 감정: ' + v.recipe.when.emotion.join(', '));
    if (v.recipe.when.need) l.push('욕구 상황: ' + v.recipe.when.need);
    if (v.needs.length) l.push('새 동작 필요 (미리보기에서는 건너뛰어요. Claude Code에 이 JSON을 붙여 "새 동작 추가해 줘"):', ...v.needs.map((x) => ' - ' + x));
    say(v.needs.length ? 'warn' : 'ok', v.needs.length ? '검사: 통과 (새 동작 필요 있음)' : '검사: 통과', l);
    return v.recipe;
  };
  const target = () => (app.selected && !app.selected.guest ? app.selected : app.mascot);
  const play = (rec) => { const a = target(); if (!Recipes.preview(rec, a)) toast('지금은 재생할 수 없어요 (놀러가기 중이거나 고양이가 없어요)'); else toast(`미리보기: ${a.cat.name}`); };
  const sample = h('select', { 'aria-label': '샘플 레시피' }, ...RECIPE_SAMPLES.map((s, i) => h('option', { value: String(i), text: s.label })));
  const btn = (label, fn, cls = '') => h('button', { type: 'button', class: 'btn adbtn ' + cls, text: label, onclick: fn });
  const renderList = () => {
    list.replaceChildren(h('div', { class: 'adsub', text: `저장된 레시피 ${Recipes.list.length}/${RLIM.saved} · 켜진 것 ${Recipes.list.filter((x) => x.enabled).length}/${RLIM.enabled}` }),
      ...(Recipes.list.length ? Recipes.list.map((it) => {
        const nn = validateRecipe(it.rec).needs.length;
        let askDel = false;
        const del = btn('삭제', () => { if (!askDel) { askDel = true; del.textContent = '정말 삭제'; setTimeout(() => { askDel = false; del.textContent = '삭제'; }, 3000); return; } Recipes.remove(it.id); });
        return h('div', { class: 'adrcp-item' + (it.enabled ? ' on' : ''), 'data-rid': it.id },
          h('div', { class: 'adrcp-name' }, h('b', { text: it.rec.name }), h('small', { text: ` ${it.rec.duration_s}초 · ${it.rec.steps.length}단계` }),
            h('span', { class: 'adrcp-tag ' + (it.enabled ? 'on' : ''), text: it.enabled ? '켜짐' : '꺼짐' }), nn ? h('span', { class: 'adrcp-tag warn', text: '새 동작 필요' }) : null),
          it.err ? h('div', { class: 'adrcp-err', text: it.err }) : null,
          h('div', { class: 'adrow2' }, btn('재생', () => play(it.rec)), btn(it.enabled ? '끄기' : '켜기', () => { try { Recipes.setEnabled(it.id, !it.enabled); } catch (e) { toast(e.message); } }, it.enabled ? '' : 'primary'),
            btn('불러오기', () => { ta.value = JSON.stringify(it.rec, null, 2); check(); }), del));
      }) : [h('div', { class: 'note', text: '아직 저장한 레시피가 없어요.' })]));
  };
  Recipes.on(renderList); renderList();
  return h('div', { class: 'adrcp' },
    h('div', { class: 'note', text: '숏츠에서 정리한 행동 레시피(JSON)를 붙여 넣어요. 글은 코드로 실행되지 않고, 정해진 단어와 숫자 범위만 받아요. 켜진 레시피만 고양이의 일정 후보에 들어가요.' }),
    h('div', { class: 'adrow2' }, sample, btn('샘플 넣기', () => { ta.value = RECIPE_SAMPLES[+sample.value].text; check(); }), btn('프롬프트 복사', async () => { toast((await copyText(recipePrompt())) ? 'AI Studio용 프롬프트를 복사했어요' : '복사하지 못했어요'); })),
    ta,
    h('div', { class: 'adrow2' }, btn('검사', check), btn('미리보기', () => { const r = check(); if (r) play(r); }, 'primary'),
      btn('저장 (꺼진 채로)', () => { const r = check(); if (!r) return; try { Recipes.add(r); toast('저장했어요. 켜면 일정 후보에 들어가요'); } catch (e) { toast(e.message); } }),
      btn('비우기', () => { ta.value = ''; res.className = 'note adrcp-res'; res.replaceChildren(); })),
    h('div', { class: 'note', text: '미리보기는 지금 고른 고양이(없으면 첫 고양이)가 해요.' }), res, list);
}
