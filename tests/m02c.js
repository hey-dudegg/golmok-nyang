// 홍보 잠금(D-15): 두 탭이 거의 동시에 홍보를 누르면 1명만 나가고 1명은 묻힌다. 12번 반복 + 만료 뒤 + 저장 지역.
// 사용: node tests/m02c.js   (홍보 잠금 10초를 기다리므로 약 60초 걸린다. 다른 시험과 동시에 돌리지 않는다)
const { launch, open, wait, url, run, SLOW } = require('./lib/common');

run('m02c (홍보 잠금)', async () => {
  const b = await launch();
  const errs = [];
  const U = '?admin&still=30&pr=0.4#11';
  const A = await open(b, U, { width: 800, height: 600, errs, settle: 0 });
  const B = await open(b, U, { width: 800, height: 600, errs, settle: 0 });
  await wait(3500);
  for (const p of [A, B]) await p.evaluate(() => { window.__t = []; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.classList && n.classList.contains('toast')) window.__t.push(n.textContent); }))).observe(document.body, { childList: true }); });
  console.log('locks api', await A.evaluate(() => !!navigator.locks));
  const click = (p, d) => p.evaluate((d) => new Promise((r) => setTimeout(() => { document.querySelector('#promo').click(); r(); }, d)), d);
  const toasts = async () => { const t = []; for (const p of [A, B]) t.push(...await p.evaluate(() => { const o = window.__t.slice(); window.__t.length = 0; return o; })); return t; };
  const clear = () => A.evaluate(() => { localStorage.removeItem('golmok:lock:promo'); });
  let pass = 0; const gaps = [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 150, 150];
  for (const gap of gaps) {
    await clear(); await toasts();
    await Promise.all([click(A, 0), click(B, gap)]);
    let t = []; for (let i = 0; i < 60 && t.length < 2; i++) { await wait(100); t.push(...await toasts()); }
    await wait(600); t.push(...await toasts());
    const ok = t.filter((x) => x.includes('내보냈')).length, lost = t.filter((x) => x.includes('묻혔')).length;
    const good = ok === 1 && lost === 1; if (good) pass++;
    console.log(JSON.stringify(t), 'gap', gap, 'ok', ok, 'lost', lost, good ? 'PASS' : 'FAIL');
  }
  await new Promise((r) => setTimeout(r, 10500 + 500 * (SLOW - 1)));
  await click(A, 0); await wait(800); const exp = await toasts(); console.log('after expiry', JSON.stringify(exp));
  await click(B, 0); await wait(800); const again = await toasts(); console.log('immediate again', JSON.stringify(again));
  // 저장 지역: ?r= 로 열면 그 지역을 보여 주되 저장된 지역은 바꾸지 않는다
  const C = await open(b, '?still=30&pr=0.4', { width: 800, height: 600, errs, settle: 1500 });
  await C.evaluate(() => localStorage.setItem('golmok:region', JSON.stringify('11')));
  await C.goto(url('?r=26&still=30&pr=0.4'), { waitUntil: 'load' }); await wait(2500);
  const r26 = [await C.evaluate(() => window.__app.dong.c), await C.evaluate(() => localStorage.getItem('golmok:region'))];
  console.log('?r=26 shows', r26[0], 'stored', r26[1]);
  await C.goto(url('?still=30&pr=0.4'), { waitUntil: 'load' }); await wait(2500);
  const plain = [await C.evaluate(() => window.__app.dong.c), await C.evaluate(() => localStorage.getItem('golmok:region'))];
  console.log('plain reload', plain[0], 'stored', plain[1]);
  console.log(`잠금 ${pass}/${gaps.length} 통과`, 'ERR', JSON.stringify(errs));
  await b.close();
  return pass === gaps.length && exp.length === 1 && exp[0].includes('내보냈') && again.length === 1 && again[0].includes('묻혔')
    && r26[0] === '26' && r26[1] === '"11"' && plain[0] === '11' && plain[1] === '"11"' && !errs.length;
});
