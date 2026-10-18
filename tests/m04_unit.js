// M0-4 레시피 검증 단위 시험(35건) + 기능 시험(저장·켜기·후보·격리·저장소 재검사).
// 사용: node tests/m04_unit.js
const { launch, open, run } = require('./lib/common');

run('m04_unit (레시피 검증)', async () => {
  const b = await launch();
  const errs = [];
  let dialogs = 0;
  const p = await open(b, '?admin&pr=0.4&shells=6#11', { errs, settle: 3500, before: (p) => p.on('dialog', (d) => { dialogs++; d.dismiss(); }) });
  const out = await p.evaluate(() => {
    const R = window.__recipe, V = R.validateRecipe, P = R.parseRecipeText, res = [];
    const t = (name, expectOk, fn) => { let ok, info = ''; try { const r = fn(); ok = !!r.ok === expectOk; info = r.ok ? '' : (r.errors[0] ? r.errors[0].path + ': ' + r.errors[0].msg.slice(0, 40) : ''); } catch (e) { ok = false; info = 'THROW ' + e.message; } res.push([ok, (expectOk ? 'OK ' : 'NG ') + name, info]); };
    const base = () => ({ name: '시험', duration_s: 6, steps: [{ t: 0, pose: 'sit' }, { t: 3, tail: 'flick' }] });
    const txt = (s) => { const q = P(s); return q.errors ? { ok: false, errors: q.errors } : V(q.value); };
    // 정상 3종
    t('샘플1', true, () => txt(R.RECIPE_SAMPLES[0].text));
    t('샘플2(새 동작 필요 포함)', true, () => { const r = txt(R.RECIPE_SAMPLES[1].text); if (!(r.needs && r.needs.length)) r.ok = false; return r; });
    t('최소+코드블록', true, () => txt('```json\n' + JSON.stringify({ name: '기지개 하품', when: { emotion: ['졸림'], need: '에너지 낮음' }, duration_s: 8, steps: [{ t: 0, pose: 'stretch', ears: 'swivel' }, { t: 4, pose: 'sit', eyes: 'half_closed', sound: 'meow' }] }) + '\n```'));
    // 악의적·깨진 입력
    t('과대 수치 duration_s', false, () => V({ ...base(), duration_s: 99999 }));
    t('과대 수치 t', false, () => V({ ...base(), steps: [{ t: 1e9, pose: 'sit' }] }));
    t('NaN/Infinity', false, () => V({ ...base(), duration_s: NaN, steps: [{ t: Infinity, pose: 'sit' }] }));
    t('문자열 숫자', false, () => V({ ...base(), duration_s: '6' }));
    t('최상위 알 수 없는 키', false, () => V({ ...base(), evil: 1 }));
    t('단계 알 수 없는 키', false, () => V({ ...base(), steps: [{ t: 0, pose: 'sit', onclick: 'x' }] }));
    t('거대 배열 steps 1000', false, () => V({ ...base(), steps: Array.from({ length: 1000 }, (_, i) => ({ t: 0, pose: 'sit' })) }));
    t('거대 배열 unknown_moves', false, () => V({ ...base(), unknown_moves: Array.from({ length: 500 }, () => 'a') }));
    t('거대 배열 emotion', false, () => V({ ...base(), when: { emotion: Array.from({ length: 5000 }, () => '편안') } }));
    t('순환 참조', false, () => { const o = base(); o.steps[0].self = o; return V(o); });
    t('순환 steps', false, () => { const o = base(); o.steps.push(o.steps); return V(o); });
    t('HTML 이름', false, () => V({ ...base(), name: '<img src=x onerror=alert(1)>' }));
    t('HTML 못하는 동작', false, () => V({ ...base(), unknown_moves: ['<script>alert(1)</script>'] }));
    t('HTML 장소', false, () => V({ ...base(), when: { place: '<b>x</b>' } }));
    t('__proto__ 키(JSON)', false, () => txt('{"__proto__":{"polluted":1},"name":"x","duration_s":5,"steps":[{"t":0,"pose":"sit"}]}'));
    t('__proto__ 단계 키(JSON)', false, () => txt('{"name":"x","duration_s":5,"steps":[{"t":0,"pose":"sit","__proto__":{"polluted":2}}]}'));
    t('constructor 키', false, () => V({ ...base(), constructor: { prototype: { polluted: 3 } } }));
    t('prototype/toString 값', false, () => V({ ...base(), steps: [{ t: 0, pose: 'toString' }, { t: 1, pose: '__proto__' }, { t: 2, tail: 'constructor' }] }));
    t('모르는 단어', false, () => V({ ...base(), steps: [{ t: 0, pose: 'fly' }] }));
    t('t 거꾸로', false, () => V({ ...base(), steps: [{ t: 3, pose: 'sit' }, { t: 1, pose: 'loaf' }] }));
    t('t가 전체 길이 초과', false, () => V({ ...base(), steps: [{ t: 7, pose: 'sit' }] }));
    t('빈 단계', false, () => V({ ...base(), steps: [{ t: 0 }] }));
    t('steps 비어 있음', false, () => V({ ...base(), steps: [] }));
    t('배열을 객체로', false, () => V([1, 2, 3]));
    t('null', false, () => V(null));
    t('문자열 입력(객체 아님)', false, () => V('{"name":"x"}'));
    t('깨진 JSON', false, () => txt('{"name": "x", "steps": [ {'));
    t('빈 입력', false, () => txt('   '));
    t('입력이 너무 김', false, () => txt('{"name":"' + 'a'.repeat(7000) + '"}'));
    t('이름 너무 김', false, () => V({ ...base(), name: '가'.repeat(100) }));
    t('Symbol 키 객체', false, () => { const o = base(); o[Symbol('x')] = 1; return V(o); });
    t('클래스 인스턴스', false, () => { class X { constructor() { Object.assign(this, base()); } } return V(new X()); });
    // 오염·참조 확인
    const clean = ({}).polluted === undefined && Object.prototype.polluted === undefined;
    const src = base(); const v1 = V(src); const noShare = v1.recipe !== src && v1.recipe.steps !== src.steps && v1.recipe.steps[0] !== src.steps[0];
    // 기능: 저장·켜기·후보·재생·격리
    const Rs = R.Recipes; Rs.adopt([]);
    const rec = V(JSON.parse(R.RECIPE_SAMPLES[0].text)).recipe;
    const it = Rs.add(rec); const savedOff = !R.ACTIONS['rcp_' + it.id];
    Rs.setEnabled(it.id, true); const on = !!R.ACTIONS['rcp_' + it.id];
    const a = window.__app.mascot; const cat = R.Clock.weights(a.cat, Date.now(), R.Clock.stateAt(a.cat, Date.now(), true), []);
    const inCand = cat.some(x => x.key === 'rcp_' + it.id);
    Rs.setEnabled(it.id, false); const offAgain = !R.ACTIONS['rcp_' + it.id];
    // 격리: 등록 뒤 내부를 망가뜨려 예외를 일으켜 본다
    Rs.setEnabled(it.id, false); it.rec = { name: 'bad', when: {}, duration_s: 5, steps: null, unknown_moves: [] }; Rs.setEnabled(it.id, true);
    let threw = false; try { R.ACTIONS['rcp_' + it.id].steps(a, window.__pose.makeRng('x')); } catch (e) { threw = true; }
    const isolated = !threw && it.enabled === false && !R.ACTIONS['rcp_' + it.id] && /오류/.test(it.err);
    Rs.adopt([]);
    // 저장소에 손댄 값(악의적)도 불러올 때 걸러지는지
    Rs.adopt([{ id: 'rabcde', rec: { name: '<b>', duration_s: 5, steps: [{ t: 0, pose: 'sit' }] }, enabled: true }, { id: '__proto__', rec }, { id: 'rzzzzz', enabled: true, rec }, 5, null]);
    const adoptOk = Rs.list.length === 1 && Rs.dropped === 4 && Rs.list[0].enabled === true;
    Rs.adopt([]);
    return { res, clean, noShare, savedOff, on, inCand, offAgain, isolated, adoptOk };
  });
  let bad = 0; for (const [ok, n, info] of out.res) { if (!ok) bad++; console.log(ok ? 'pass' : 'FAIL', n, '|', info); }
  console.log('검증 사례', out.res.length, '실패', bad);
  console.log('오염 없음', out.clean, '| 입력과 참조 분리', out.noShare);
  console.log('저장만 하면 꺼짐', out.savedOff, '| 켜면 등록', out.on, '| 후보 점수에 포함', out.inCand, '| 끄면 제거', out.offAgain, '| 오류 격리(자동 끔)', out.isolated, '| 저장소 재검사', out.adoptOk);
  console.log('대화상자(alert) 수', dialogs, 'ERR', JSON.stringify(errs));
  await b.close();
  const fail = bad || !out.clean || !out.noShare || !out.savedOff || !out.on || !out.inCand || !out.offAgain || !out.isolated || !out.adoptOk || dialogs || errs.length;
  return !fail;
});
