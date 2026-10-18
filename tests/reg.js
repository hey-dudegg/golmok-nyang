// 행동 재생 회귀: 어드민 행동 버튼을 전부 하나씩 눌러 멈춤·오류가 없는지, 그때 고양이 최저점(mm)과 디딤 상태를 본다.
// 사용: node tests/reg.js
const { launch, open, wait, run } = require('./lib/common');

run('reg (어드민 행동 버튼 전수)', async () => {
  const b = await launch();
  const errs = [];
  const p = await open(b, '?admin&pr=0.4&shells=6#11', { errs, settle: 3500 });
  const n = await p.evaluate(() => document.querySelectorAll('#admin .adgrid button').length);
  console.log('buttons', n);
  const hang = [], lows = [];
  for (let i = 0; i < n; i++) {
    const r = await Promise.race([
      p.evaluate((i) => { const x = document.querySelectorAll('#admin .adgrid button')[i]; x.click(); return x.title || x.textContent; }, i),
      wait(5000).then(() => 'HANG'),
    ]);
    await wait(900);
    const lo = await p.evaluate(() => { const v = window.__app.mascot.v; const m = v.lowest(); return [Math.round(m * 1000), v.plant]; });
    lows.push(r + ':' + lo.join('/'));
    if (r === 'HANG') hang.push(i);
  }
  console.log(lows.join(' | '));
  console.log('hang', JSON.stringify(hang), 'ERR', JSON.stringify(errs));
  await b.close();
  return n > 0 && !hang.length && !errs.length;
});
