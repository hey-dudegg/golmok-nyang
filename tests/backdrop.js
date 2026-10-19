// 명소 배경(R-17) 시험: (a) 16곳 모두 배경 생성·오류 0 (c) 구성 시간 (b) 지역 전환 10회 뒤 지오메트리·텍스처 수 그대로(누수 없음)
// (d) data/landmarks.json 404 일 때 기본 테마로 정상 동작. 사용: node tests/backdrop.js
const { launch, open, wait, run } = require('./lib/common');

const Q = '?admin&still=30&pr=0.3&shells=2#11';
run('backdrop', async () => {
  const b = await launch();
  let ok = true;
  const fail = (m) => { ok = false; console.log('FAIL ' + m); };
  // ── (a)(c)(b) 정상 자료 ──
  const errs = [];
  const p = await open(b, Q, { errs, settle: 2500 });
  await p.evaluate(() => window.__lm.LandmarkData.load());
  const res = await p.evaluate(() => {
    const a = window.__app, S = a.s, out = [];
    const codes = [...new Set(Array.from(document.querySelectorAll('#adLmRegion option')).map((o) => o.value))];
    for (const c of (codes.length ? codes : ['11'])) {
      const t0 = performance.now(); a.visit(c); const switchMs = performance.now() - t0;
      S.renderer.render(S.scene, S.camera);
      const bd = S.backdrop;
      out.push({ c, name: a.lmSel && a.lmSel.place ? a.lmSel.place.name : null, source: a.lmSel && a.lmSel.source, inScene: !!(bd && bd.mesh.parent === S.env && S.env.parent === S.scene),
        ms: bd ? +bd.ms.toFixed(2) : null, tris: bd ? bd.tris : 0, switchMs: +switchMs.toFixed(1), label: document.querySelector('#lmName').textContent });
    }
    return out;
  });
  if (res.length !== 16) fail('지역 수 ' + res.length);
  for (const r of res) {
    console.log(`${r.c} ${String(r.name).padEnd(18)} 배경 ${r.ms}ms 삼각형 ${r.tris} 지역 전환 ${r.switchMs}ms  ${r.label}`);
    if (r.source !== 'sido' || !r.inScene || !r.name || !r.label.includes(r.name)) fail(r.c + ' 배경 없음/표시 없음');
  }
  const msList = res.map((r) => r.ms).filter((x) => x != null), maxMs = Math.max(...msList), avgMs = msList.reduce((s, x) => s + x, 0) / msList.length;
  console.log(`구성 시간: 평균 ${avgMs.toFixed(1)}ms, 최대 ${maxMs.toFixed(1)}ms (소프트웨어 렌더링 환경)`);
  if (maxMs > 50) fail('구성 시간이 50ms 넘음');
  // 후보 3곳 모두 (주차 오프셋) 생성되는지
  const all = await p.evaluate(() => {
    const a = window.__app, bad = [];
    for (const c of Object.keys(window.__lm.LandmarkData.get().places)) {
      a.visit(c);
      for (let w = 0; w < 3; w++) { a.lmPreview = { weekOffset: w }; a.refreshBackdrop(true); if (!a.s.backdrop || a.s.backdrop.tris < 50) bad.push(c + ':' + w); }
    }
    a.lmPreview = null; a.refreshBackdrop(true);
    return bad;
  });
  if (all.length) fail('후보 배경 실패 ' + all.join(','));
  else console.log('16곳 x 후보(2~3) 모두 배경 생성');
  // 누수: 한 바퀴 돌린 뒤 기준을 재고, 10번 더 옮긴 뒤 다시 잰다
  const mem = await p.evaluate(() => {
    const a = window.__app, S = a.s, R = S.renderer, codes = ['11', '26', '50', '47', '28'];
    const snap = () => { S.renderer.render(S.scene, S.camera); return { geo: R.info.memory.geometries, tex: R.info.memory.textures, prog: (R.info.programs || []).length }; };
    for (const c of codes) a.visit(c);
    a.visit('11'); const before = snap();
    for (let i = 0; i < 10; i++) a.visit(codes[(i + 1) % codes.length]);
    a.visit('11'); const after = snap();
    // 시각 변화(해질녘·밤)는 색조만: 지오메트리 수가 그대로인지
    S.renderer.render(S.scene, S.camera); const mesh = S.backdrop && S.backdrop.mesh, g0 = R.info.memory.geometries;
    for (const hh of [12, 18, 23]) { a.previewTime = Date.UTC(2026, 9, 19, hh - 9, 0); a.updateClock(); S.renderer.render(S.scene, S.camera); }
    a.previewTime = null; a.updateClock();
    return { before, after, timeSame: !!(S.backdrop && S.backdrop.mesh === mesh), geoDelta: R.info.memory.geometries - g0, glowNight: (() => { a.previewTime = Date.UTC(2026, 9, 19, 23 - 9, 0); a.updateClock(); const v = S.backdrop.mesh.material.uniforms.uGlow.value; a.previewTime = null; a.updateClock(); return v; })() };
  });
  console.log(`메모리 전 ${JSON.stringify(mem.before)} 뒤 ${JSON.stringify(mem.after)} · 시각 변화 시 배경 메시 그대로 ${mem.timeSame}(지오메트리 증감 ${mem.geoDelta}) · 밤 창불빛 ${mem.glowNight.toFixed(2)}`);
  if (mem.after.geo > mem.before.geo || mem.after.tex > mem.before.tex || mem.after.prog > mem.before.prog) fail('지역 전환 10회 뒤 지오메트리/텍스처/프로그램 증가');
  if (!mem.timeSame) fail('시각 변화 때 배경이 다시 만들어짐');
  if (!(mem.glowNight > 0.5)) fail('밤에 창 불빛이 켜지지 않음');
  console.log('정상 자료 ERR', JSON.stringify(errs));
  if (errs.length) fail('콘솔 오류');
  await p.close();
  // ── (d) 자료 404 ──
  const errs2 = [], warns = [];
  const p2 = await open(b, Q, { errs: errs2, settle: 2500, before: async (pg) => {
    await pg.setRequestInterception(true);
    pg.on('request', (r) => (/data\/landmarks\.json/.test(r.url()) ? r.respond({ status: 404, contentType: 'text/plain', body: 'nope' }) : r.continue()));
    pg.on('console', (m) => { if (/^warn/.test(m.type())) warns.push(m.text()); });
  } });
  await wait(800);
  const fb = await p2.evaluate(() => {
    const a = window.__app, S = a.s; a.visit('26'); S.renderer.render(S.scene, S.camera);
    return { failed: window.__lm.LandmarkData.failed, backdrop: !!S.backdrop, source: a.lmSel && a.lmSel.source, theme: a.theme, cats: a.agents.length, label: document.querySelector('#lmName').textContent, hidden: document.querySelector('#lmName').hidden };
  });
  console.log('404:', JSON.stringify(fb), '경고', warns.filter((w) => /명소/.test(w)).length, 'ERR', JSON.stringify(errs2));
  if (!warns.some((w) => /명소/.test(w))) fail('404 경고 문구 없음');
  if (!fb.failed || fb.backdrop || fb.source !== 'theme' || !fb.theme || !fb.cats || fb.label || !fb.hidden) fail('404 폴백');
  if (errs2.length) fail('404 때 콘솔 오류');
  await p2.close();
  await b.close();
  return ok;
});
