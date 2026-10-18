// 교감 반응 극성 감사 (D-30): 문구 표 정적 검사 + 성격 3000개 x 행동 x 신뢰 모의. 불일치 0이어야 통과.
// 사용: node tests/b2_polarity.js
const { launch, open, run } = require('./lib/common');

run('b2_polarity (교감 극성)', async () => {
  const b = await launch();
  const errs = [];
  const p = await open(b, '?admin&still=2&pr=0.3&shells=2#11', { width: 800, height: 600, errs, settle: 2500 });
  const res = await p.evaluate(() => {
    const X = window.__inter, out = { bad: [], n: 0 };
    // 1) 정적 검사: 문구 표
    for (const L of X.THOUGHTS) {
      if (X.EMO_POL[L.emo] !== L.pol) out.bad.push('line emo/pol ' + L.t);
      for (const r of L.r) { const M = X.REACT_META[r]; if (!M) out.bad.push('no meta ' + r); else if (M.pol !== L.pol) out.bad.push('line vs react ' + L.t + ' / ' + r); }
    }
    for (const [k, M] of Object.entries(X.REACT_META)) if (X.EMO_POL[M.emo] !== M.pol) out.bad.push('react emo ' + k);
    for (const k of Object.keys(X.REACTIONS)) if (!X.REACT_META[k]) out.bad.push('react not in meta ' + k);
    // 2) 동적 검사: 성격 샘플 x 부위/츄르/말 x 신뢰
    const words = ['fight', 'hiss', 'calm', 'come', 'question', 'greet', 'unknown'];
    const acts = [...['head', 'chin', 'back', 'belly'].map((p) => ({ kind: 'pet', part: p, key: 'pet:' + p })), { kind: 'churu', key: 'churu' }, ...words.map((w) => ({ kind: 'word', word: { intent: w }, text: w, key: 'word:' + w }))];
    const trusts = [0.1, 0.3, 0.6, 0.9];
    const types = {}, stat = {}, N = 3000, pairs = {};
    for (let i = 0; i < N; i++) {
      const rr = X.makeRng('aud' + i), kit = i % 5 === 0;
      const pers = X.makePersonality(rr, kit), id = 'aud-' + i;
      const ty = X.touchType(id, pers); types[ty] = (types[ty] || 0) + 1;
      if (X.touchType(id, pers) !== ty) out.bad.push('nondeterministic ' + id);
      for (const act of acts) for (const tr of trusts) {
        const ag = { p: pers, r: X.makeRng('r' + i + act.key + tr), cat: { id } };
        const R = X.resolveRule(ag, act, tr); out.n++;
        const M = X.REACT_META[R.reaction];
        let why = null;
        if (!M) why = 'unknown reaction';
        else if (R.thoughtPol === null) why = 'no thought line';
        else if (R.thoughtPol !== M.pol) why = 'thought pol ' + R.thoughtPol + ' vs act pol ' + M.pol;
        else if (X.EMO_POL[R.thoughtEmo] !== M.pol || X.EMO_POL[R.emo] !== M.pol) why = 'emo pol';
        else if (act.kind !== 'churu' && (R.reaction === 'eat_churu' || R.reaction === 'sniff_only')) why = 'churu reaction on non churu';
        else if (act.kind === 'pet' && act.part !== 'belly' && R.reaction === 'roll_over') why = 'roll_over off belly';
        if (why) { out.bad.push(act.key + ' ' + tr + ' ' + R.reaction + ' ' + R.thought + ' :: ' + why); continue; }
        const key = act.key + '|' + ty + '|' + tr; const s = (stat[key] = stat[key] || [0, 0, 0, 0]);
        s[M.pol > 0 ? 0 : M.pol === 0 ? 1 : 2]++; s[3]++;
        if (act.kind === 'pet' && tr === 0.1) { const pk = R.reaction + ' / ' + R.thought; pairs[pk] = (pairs[pk] || 0) + 1; }
      }
    }
    out.types = types; out.N = N;
    out.stat = {}; for (const [k, s] of Object.entries(stat)) out.stat[k] = s.slice(0, 3).map((x) => +(x / s[3] * 100).toFixed(0));
    out.pairs = pairs;
    // 3) 실제 시/도 고양이의 손길 유형
    out.real = ['11', '21', '22', '23', '24', '25', '26', '29', '31', '41', '42', '43', '44', '45', '46', '47', '48', '50'].map((c) => { const cat = X.dongPopulation({ c })[0]; return c + ':' + X.touchType(cat.id, cat.g.personality); });
    return out;
  });
  await b.close();
  console.log('simulated', res.n, 'mismatch(bad)=', res.bad.length); if (res.bad.length) console.log(res.bad.slice(0, 15).join('\n'));
  console.log('types', JSON.stringify(Object.fromEntries(Object.entries(res.types).map(([k, v]) => [k, +(v / res.N * 100).toFixed(1) + '%']))));
  const TY = ['dog', 'tolerant', 'aloof', 'wary', 'avoid'];
  const acts = ['pet:head', 'pet:chin', 'pet:back', 'pet:belly', 'churu', 'word:greet', 'word:calm', 'word:come'];
  for (const tr of [0.1, 0.9]) {
    console.log('--- trust', tr, '(긍정/중립/부정 %)');
    for (const a of acts) console.log(a.padEnd(10), TY.map((t) => t + ' ' + (res.stat[a + '|' + t + '|' + tr] || []).join('/')).join('   '));
  }
  // 전체 교감 중 긍정 비율 (유형 구성 반영, 쓰다듬기 4부위 균등, 신뢰 0.1)
  let pos = 0, tot = 0; for (const t of TY) for (const a of acts.slice(0, 4)) { const s = res.stat[a + '|' + t + '|0.1']; if (s) { pos += s[0] * res.types[t]; tot += 100 * res.types[t]; } }
  console.log('pet positive rate @trust0.1 overall', (pos / tot * 100).toFixed(1) + '%');
  console.log('real cats', res.real.join(' '));
  console.log('ERR', JSON.stringify(errs));
  return res.n > 0 && res.bad.length === 0 && !errs.length;
});
