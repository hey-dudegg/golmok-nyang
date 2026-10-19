// 교감 반응 고르기: 규칙 엔진(core/touch_rules) + (있으면) AI 표본 (D-03·30)
import { REACTIONS, REACTION_KEYS } from '../core/behavior.js';
import { ageText, sexText, stageOf } from '../core/genome.js';
import { PET_PARTS, REACT_META, TOUCH_TYPES, TRUST_D, pickThought, resolveRule, touchType } from '../core/touch_rules.js';
import { clamp } from '../core/util.js';
import { Caps } from '../adapters/caps.js';
import { Bonds } from '../state/members.js';

export async function askCat(a, act) {
  const bond = Bonds.get(a.cat.id);
  const rule = resolveRule(a, act, bond.trust);
  if (!Caps.sample || Caps.sampleOff) return rule;
  const g = a.cat.g, P = g.personality, f = (x) => x.toFixed(2);
  const st = stageOf(g.months), type = touchType(a.cat.id, P);
  const actDesc = act.kind === 'pet' ? `사람이 손을 뻗어 ${PET_PARTS.find((x) => x[0] === act.part)[1]}를 쓰다듬으려 한다`
    : act.kind === 'churu' ? '사람이 츄르 봉지를 뜯어 내민다'
    : `사람이 고양이 말로 "${act.text}"라고 한다 (사전 해석: ${act.word.meaning})`;
  const prompt = [
    '너는 한국 골목에 사는 길고양이의 반응을 고르는 엔진이다. 고양이답게, 성격에 맞게 고른다.',
    `고양이: 이름 "${a.cat.name}", ${g.patternLabel} 무늬, ${ageText(g.months)} (${st.label}), ${sexText(g)}${g.tnr ? ', 왼쪽 귀 끝이 잘려 있음' : ''}.`,
    `성격(0~1): 대담함 ${f(P.bold)}, 사교성 ${f(P.social)}, 장난기 ${f(P.playful)}, 식탐 ${f(P.food)}, 활동량 ${f(P.energy)}, 까칠함 ${f(P.grumpy)}. 손길 성향: ${TOUCH_TYPES[type]} (길고양이의 약 20%만 개냥이).`,
    `지금 하던 일: ${a.label}. 시간대: ${a.world.night > 0.5 ? '밤' : '낮'}.`,
    `이 사람에 대한 신뢰도(0~1): ${f(bond.trust)}. 최근 이 사람과 있었던 일: ${bond.last && bond.last.length ? bond.last.join(' / ') : '없음'}.`,
    `사람의 행동: ${actDesc}.`,
    `반응 목록: ${REACTION_KEYS.join(', ')}.`,
    '규칙: 츄르가 아니면 eat_churu와 sniff_only는 고르지 않는다. 신뢰도가 낮고 겁이 많으면 다가가지 않는다. 하악질이나 싸움 소리에는 피하거나 경계하거나 맞선다. 배 쓰다듬기는 대부분의 고양이가 싫어한다. 대부분의 길고양이는 낯선 사람의 손길을 좋아하지 않는다.',
    `참고로 규칙 기반 엔진은 "${rule.reaction}"(${rule.pol > 0 ? '긍정' : rule.pol < 0 ? '부정' : '중립'})을 골랐다. 같은 극성 안에서만 바꿔도 된다.`,
    '다음 JSON 하나만 답한다: {"reaction":"목록 중 하나","polarity":"pos|neu|neg (속마음의 극성)","thought":"고양이 속마음 한 줄 (반말, 20자 안팎)","trust_delta":-0.2~0.2 숫자}',
  ].join('\n');
  try {
    const out = await Caps.sample.json(prompt, { modelTier: 'quick' });
    const reaction = REACTIONS[out && out.reaction] ? out.reaction : rule.reaction;
    const M = REACT_META[reaction];
    // 극성이 규칙 엔진과 달라지거나(예: 싫어하는 부위인데 반긴다), 츄르가 아닌데 먹는 경우는 규칙 결과를 쓴다
    if ((act.kind !== 'churu' && (reaction === 'eat_churu' || reaction === 'sniff_only')) || M.pol !== rule.pol) return rule;
    const pp = { pos: 1, neu: 0, neg: -1 }[out && out.polarity];
    if (pp !== M.pol) { const line = pickThought(a.r, reaction, act); return { ...rule, reaction, thought: line ? line.t : rule.thought, thoughtPol: M.pol, thoughtEmo: M.emo, emo: M.emo, trust_delta: TRUST_D[reaction] || 0 }; } // 속마음 극성이 행동과 다르면 표의 문구로 바꾼다
    return { reaction, thought: String((out && out.thought) || rule.thought).slice(0, 60), thoughtPol: pp, thoughtEmo: M.emo, pol: M.pol, emo: M.emo, trust_delta: clamp(Number(out && out.trust_delta) || 0, -0.2, 0.2), by: 'ai' };
  } catch (e) {
    if (e && ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(e.code)) Caps.sampleOff = true;
    return { ...rule, err: e && e.code };
  }
}
