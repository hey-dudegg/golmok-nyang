// core 기준값(브라우저): 페이지의 시험용 노출(window.__inter·__recipe·__trips, ?admin 전용)로
// tests/unit/ref_cases.js 의 계산을 돌려 JSON으로 저장한다. node 단위 시험(tests/unit/core.test.js)이 같은 계산을
// prototype/src/core/*.js 로 돌려 이 값과 비교한다 -> "분리 전 페이지 = 분리 후 core 모듈"을 직접 확인.
// 사용:
//   node tests/core_ref.js              -> tests/out/core_ref.json 을 뜨고 tests/baseline/core_ref.json 과 비교
//   node tests/core_ref.js --baseline   -> tests/baseline/core_ref.json (기준값 갱신. 동작이 같을 때만!)
const fs = require('fs');
const path = require('path');
const { launch, open, run, OUT, BASELINE, ensureDir } = require('./lib/common');
const { refCases } = require('./unit/ref_cases');

const saveBase = process.argv.includes('--baseline');
const file = saveBase ? path.join(BASELINE, 'core_ref.json') : path.join(OUT, 'core_ref.json');

run('core_ref (core 기준값, 브라우저)', async () => {
  const b = await launch();
  const errs = [];
  const p = await open(b, '?admin&still=10&pr=0.3&shells=2#11', { errs, settle: 1500 });
  const res = await p.evaluate(`(() => { const X = window.__inter, R = window.__recipe;
    return (${refCases.toString()})({ ...X, ...R, Trips: window.__trips, samples: R.RECIPE_SAMPLES }); })()`);
  await b.close();
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(res, null, 1));
  console.log('저장:', path.relative(process.cwd(), file), '오류', errs.length, errs.slice(0, 3).join(' | '));
  if (saveBase) return errs.length === 0;
  const base = JSON.parse(fs.readFileSync(path.join(BASELINE, 'core_ref.json'), 'utf8'));
  const diffs = [];
  const walk = (x, y, q) => {
    if (x === y) return;
    if (typeof x !== typeof y || !x || !y || typeof x !== 'object') { diffs.push(`${q}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`); return; }
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], q ? q + '.' + k : k);
  };
  walk(base, res, '');
  console.log(diffs.length ? '다른 곳 ' + diffs.length + '건\n' + diffs.slice(0, 20).join('\n') : '기준값과 동일');
  return errs.length === 0 && diffs.length === 0;
});
