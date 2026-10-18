// 대표 화면 스크린샷(눈 확인용)과 화면별 오류 수. 픽셀 비교는 하지 않는다(WebGL·난수 때문에 매번 조금 다르다).
// 사용: node tests/shots.js [--label 이름] [--code 11]
//   tests/out/shots/<이름>/ 에 일반·어드민 x 390x800·1100x800, 지역 고르기 시트 x 2 크기를 저장
const path = require('path');
const { launch, open, wait, run, OUT, ensureDir } = require('./lib/common');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const label = arg('--label', 'now'), code = arg('--code', '11');
const dir = ensureDir(path.join(OUT, 'shots', label));
const FIXED = Date.UTC(2026, 9, 18, 3, 0, 5);
const fixClock = (FIX) => {
  const R = Date, off = FIX - R.now();
  function D(...a) { if (!new.target) return new R(R.now() + off).toString(); return a.length ? new R(...a) : new R(R.now() + off); }
  D.prototype = R.prototype; D.now = () => R.now() + off; D.UTC = R.UTC; D.parse = R.parse;
  window.Date = D;
};

run('shots ' + label, async () => {
  const b = await launch();
  let total = 0;
  for (const [w, h] of [[390, 800], [1100, 800]]) {
    for (const mode of ['normal', 'admin']) {
      const errs = [];
      // pr·shells를 낮춰 소프트웨어 렌더링(swiftshader)에서도 90초 안에 끝나게 한다
      const q = (mode === 'admin' ? '?admin&' : '?') + `still=90&pr=0.5&shells=8#${code}`;
      const p = await open(b, q, { width: w, height: h, errs, settle: 3500, before: (p) => p.evaluateOnNewDocument(fixClock, FIXED) });
      await p.screenshot({ path: path.join(dir, `${mode}_${w}x${h}.png`) });
      let sido = '-';
      if (mode === 'normal') {
        await p.click('#btnMove'); await wait(900);
        sido = await p.evaluate(() => document.querySelectorAll('.results button').length);
        await p.screenshot({ path: path.join(dir, `picker_${w}x${h}.png`) });
      }
      const adm = await p.evaluate(() => !!document.querySelector('#admin'));
      console.log(`${mode.padEnd(6)} ${w}x${h}  어드민 패널 ${adm}  시트 시/도 ${sido}  ERR ${JSON.stringify(errs)}`);
      total += errs.length;
      await p.close();
    }
  }
  await b.close();
  console.log('저장 위치:', path.relative(process.cwd(), dir));
  return total === 0;
});
