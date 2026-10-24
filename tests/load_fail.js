// 모듈 불러오기 실패 안내: src/ 모듈 하나가 404이면 로딩 화면에서 멈추지 않고 role=alert 안내가 떠야 한다 (D-33 단계 3).
// 요청 가로채기로 404를 흉내 낸다. 경우: core 모듈 404 / main.js 404 / 지역 자료 404(지역 자료 안내가 그대로 남아야 함) / 정상.
// 사용: node tests/load_fail.js
const { launch, open, wait, url, run, SLOW } = require('./lib/common');

const CASES = [
  ['core 모듈 404', /\/src\/core\/util\.js$/, '화면을 만드는 파일'],
  ['main.js 404', /\/src\/main\.js$/, '화면을 만드는 파일'],
  ['ui 모듈 404', /\/src\/ui\/dom\.js$/, '화면을 만드는 파일'],
  ['지역 자료 404', /\/data\/regions\.json$/, '지역 자료(data/regions.json)'],
];

run('load_fail (모듈 불러오기 실패 안내)', async () => {
  const b = await launch();
  let ok = true;
  for (const [name, re, want] of CASES) {
    const p = await b.newPage();
    await p.setViewport({ width: 800, height: 600 });
    await p.setRequestInterception(true);
    p.on('request', (r) => { if (re.test(r.url().split('?')[0])) r.respond({ status: 404, contentType: 'text/plain', body: 'not found' }); else r.continue(); });
    await p.goto(url('?pr=0.3&shells=2'), { waitUntil: 'load', timeout: 60000 * SLOW });
    let st = null;
    for (let i = 0; i < 60; i++) {
      st = await p.evaluate(() => { const l = document.getElementById('loading'); return { role: l && l.getAttribute('role'), text: l ? l.textContent : null, app: !!window.__app }; });
      if (st.role === 'alert') break;
      await wait(250);
    }
    const good = st.role === 'alert' && st.text.includes(want) && st.text.includes('http.server') && !st.app;
    console.log(name.padEnd(12), good ? 'PASS' : 'FAIL', JSON.stringify({ role: st.role, app: st.app, text: (st.text || '').slice(0, 90) }));
    ok = ok && good;
    await p.close();
  }
  // 정상: 안내 없이 열리고 로딩 화면이 사라진다
  const errs = [];
  const p = await open(b, '?pr=0.3&shells=2#11', { errs, settle: 2500 });
  // 로딩 화면은 첫 그림 뒤 페이드(약 0.9초)로 사라진다. 고정 대기 대신 사라질 때까지 기다린다(없어지지 않으면 실패).
  await p.waitForFunction(() => !document.getElementById('loading'), { timeout: 15000 * SLOW }).catch(() => {});
  const st = await p.evaluate(() => ({ loading: !!document.getElementById('loading'), alert: !!document.querySelector('[role=alert]') }));
  const good = !st.loading && !st.alert && !errs.length;
  console.log('정상'.padEnd(12), good ? 'PASS' : 'FAIL', JSON.stringify(st), 'ERR', JSON.stringify(errs));
  await b.close();
  return ok && good;
});
