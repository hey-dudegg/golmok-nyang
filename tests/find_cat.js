// D-68 고양이 찾기 버튼: 고양이를 화면 밖으로 돌리면 뜨고, 누르면 중앙으로 오며 숨는지 (390x800, 1280x800)
// 사용: node tests/find_cat.js   (스크린샷: tests/out/find_*.png)
const fs = require('fs');
const path = require('path');
const { launch, open, run, wait, OUT } = require('./lib/common');

run('find_cat (고양이 찾기)', async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await launch(); const errs = []; const res = [];
  const t = (name, ok, info = '') => { res.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : '')); };
  for (const [w, h] of [[390, 800], [1280, 800]]) {
    const p = await open(b, '?pr=0.5&shells=6', { width: w, height: h, errs, settle: 2500 });
    const frames = (n) => p.evaluate((k) => new Promise((ok) => { const f0 = window.__app.frames; const q = () => (window.__app.frames >= f0 + k ? ok() : setTimeout(q, 50)); q(); }), n); // 느린 환경 대비: 시간 대신 프레임으로 기다린다
    const vis = () => p.evaluate(() => { const e = document.querySelector('#findCat'); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; });
    await p.evaluate(() => { const a = window.__app, S = a.s; a.selected = null; const c = a.agents.find((x) => !x.hidden); const d = S.camera.position.clone().sub(S.controls.target); S.controls.target.set(c.x, 0.2, c.z); S.camera.position.copy(S.controls.target).add(d); });
    await frames(8);
    t(`${w}: 고양이가 가운데면 숨김`, !(await vis()));
    await p.evaluate(() => { const a = window.__app, S = a.s; S.controls.target.x += 7; S.camera.position.x += 7; });
    await frames(8);
    t(`${w}: 화면 밖이면 표시`, await vis());
    const box = await p.$eval('#findCat', (e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, r: r.right, b: r.bottom, l: r.left, t: r.top, label: e.getAttribute('aria-label') }; });
    t(`${w}: 44px 이상·라벨`, box.w >= 44 && box.h >= 44 && box.label === '고양이 찾기', JSON.stringify(box));
    const ov = await p.evaluate(() => { const r = document.querySelector('#findCat').getBoundingClientRect(); return ['capture', 'promo', 'share'].filter((id) => { const q = document.getElementById(id).getBoundingClientRect(); return !(r.right <= q.left || r.left >= q.right || r.bottom <= q.top || r.top >= q.bottom); }); });
    t(`${w}: 다른 버튼과 안 겹침`, ov.length === 0, ov.join(','));
    await p.screenshot({ path: path.join(OUT, `find_${w}_out.png`) });
    const d0 = await p.evaluate(() => { const a = window.__app; const c = a.s.camera.position.clone().sub(a.s.controls.target); return [c.length(), Math.atan2(c.x, c.z)]; });
    await p.evaluate(() => document.querySelector('#findCat').click()); await frames(24);
    const r = await p.evaluate(() => { const a = window.__app, V = a.s.camera.position.constructor; const best = a.agents.filter((x) => !x.hidden).map((x) => { const v = new V(x.x, 0.16 * x.scale + 0.04, x.z).project(a.s.camera); return Math.hypot(v.x, v.y); }).sort((m, n) => m - n)[0]; const c = a.s.camera.position.clone().sub(a.s.controls.target); return { d: best, dist: c.length(), az: Math.atan2(c.x, c.z) }; });
    t(`${w}: 누르면 중앙 근처로`, r.d < 0.45, 'ndc거리 ' + r.d.toFixed(2));
    t(`${w}: 줌 거리·회전각 유지`, Math.abs(r.dist - d0[0]) < 0.05 && Math.abs(r.az - d0[1]) < 0.05, `${d0.map((x) => x.toFixed(2))} -> ${r.dist.toFixed(2)},${r.az.toFixed(2)}`);
    t(`${w}: 도착 뒤 숨김`, !(await vis()));
    await p.screenshot({ path: path.join(OUT, `find_${w}_after.png`) });
    await p.close();
  }
  const bad = errs.filter(Boolean);
  t('콘솔·페이지 오류 0', bad.length === 0, bad.slice(0, 3).join(' | '));
  await b.close();
  const fails = res.filter((x) => !x).length;
  console.log(`# ${res.length - fails}/${res.length} 통과`);
  return fails === 0;
});
