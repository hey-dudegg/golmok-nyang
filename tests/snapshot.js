// 상태 기준값 뽑기: 고정 시각(브라우저 시계를 FIXED에서 시작하게 바꿈)·같은 지역에서
//  - Clock 일정 해시(레시피를 켜지 않은 상태, 고정 시각 기준 고양이)
//  - 지역 11·26·41 첫 화면 상태 요약(주소판·인구·시계·고양이 성격·욕구·감정·지금 행동·놀러가기 일정)
//  - 지역 고르기 시트(시/도 목록, 지도 SVG 해시)
// 를 JSON으로 저장한다. 사용:
//   node tests/snapshot.js              -> tests/out/state.json
//   node tests/snapshot.js --baseline   -> tests/baseline/state.json (기준값 갱신. 동작이 같을 때만!)
//   비교는 node tests/compare.js
const fs = require('fs');
const path = require('path');
const { launch, open, wait, run, OUT, BASELINE, ensureDir } = require('./lib/common');

const FIXED = Date.UTC(2026, 9, 18, 3, 0, 5); // 2026-10-18 12:00:05 KST. 시계 표시는 분 단위라 로딩이 50초 안이면 같다
const T0 = Date.UTC(2026, 9, 18, 0, 0, 0); // 일정 해시 시작 (예전 t4hash와 같은 구간: 6시간)
const CODES = ['11', '26', '41'];
const saveBase = process.argv.includes('--baseline');
const oi = process.argv.indexOf('--out');
const outFile = saveBase ? path.join(BASELINE, 'state.json') : oi > 0 ? path.resolve(process.argv[oi + 1]) : path.join(OUT, 'state.json');

// 페이지의 Date만 고정 시각에서 흐르게 한다(performance.now·애니메이션은 그대로)
const fixClock = (FIX) => {
  const R = Date, off = FIX - R.now();
  function D(...a) { if (!new.target) return new R(R.now() + off).toString(); return a.length ? new R(...a) : new R(R.now() + off); }
  D.prototype = R.prototype; D.now = () => R.now() + off; D.UTC = R.UTC; D.parse = R.parse;
  window.Date = D;
};

function summarize(FIX, T0) {
  const app = window.__app, X = window.__inter, R = window.__recipe, C = R.Clock;
  const H = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; };
  const rnd = (o, k = 1e4) => JSON.parse(JSON.stringify(o, (key, v) => (typeof v === 'number' ? Math.round(v * k) / k : v)));
  const txt = (sel) => { const e = document.querySelector(sel); return e ? e.textContent.trim() : null; };
  const d = app.dong;
  const cat = X.dongPopulation(d, FIX)[0]; cat.geo = { lat: d.lat, lng: d.lng };
  C.cache.clear();
  const sched = (t0, hours) => {
    let s = '', n = 0;
    for (const e of C.between(cat, t0, t0 + hours * 3600000)) { s += cat.id + ':' + e.key + ':' + Math.round(e.t0 !== undefined ? e.t0 : (e.t || 0)) + ';'; n++; }
    return { entries: n, hash: H(s), head: s.slice(0, 100) };
  };
  const trips = window.__trips.between(FIX, FIX + 3 * 3600000).map((x) => [x.kind, x.from, x.to, Math.round((x.t0 - FIX) / 1000), Math.round((x.t1 - FIX) / 1000)]);
  let theme = null; try { const s = JSON.stringify(rnd(app.theme, 1e5)); theme = { len: s.length, hash: H(s) }; } catch (e) { theme = 'ERR ' + e.message; }
  const keys = Object.keys(R.ACTIONS);
  return {
    dong: { c: d.c, n: d.n, level: d.level, sido: d.sido, lat: +d.lat.toFixed(4), lng: +d.lng.toFixed(4) },
    plate: { up: txt('#pUp'), dong: txt('#pDong'), code: txt('#pCode') },
    census: txt('#census'), clock: txt('#clockT'), clockLabel: txt('#clockL'),
    roster: [...document.querySelectorAll('#roster .catchip')].map((e) => e.textContent.trim()),
    live: { agents: app.agents.length, mascotId: app.mascot.cat.id, mascotName: app.mascot.cat.name },
    recipes: { saved: R.Recipes.list.length, enabled: R.Recipes.list.filter((x) => x.enabled).length, actions: keys.length, actionsHash: H(keys.join(',')) },
    cat: {
      id: cat.id, name: cat.defaultName, sex: cat.g.sex, months: +cat.g.months.toFixed(3),
      personality: rnd(cat.g.personality), touchType: X.touchType(cat.id, cat.g.personality),
      genomeHash: H(JSON.stringify(rnd(cat.g, 1e6))),
    },
    clockAtFixed: { entry: C.entryAt(cat, FIX).entry.key, state: rnd(C.state(cat, FIX, C.recentAt(cat, FIX), false)) },
    schedule6h: sched(T0, 6),
    trips3h: { n: trips.length, hash: H(JSON.stringify(trips)), mine: trips.filter((x) => x[1] === d.c || x[2] === d.c) },
    theme,
  };
}

run('snapshot (상태 기준값)', async () => {
  const b = await launch();
  const errs = [];
  const res = { meta: { fixed: new Date(FIXED).toISOString(), t0: new Date(T0).toISOString(), codes: CODES, note: '비교할 때 meta는 빼고 본다' }, regions: {} };
  for (const c of CODES) {
    const p = await open(b, `?admin&still=30&pr=0.3&shells=2#${c}`, { width: 1100, height: 800, errs, settle: 3000, before: (p) => p.evaluateOnNewDocument(fixClock, FIXED) });
    res.regions[c] = await p.evaluate(summarize, FIXED, T0);
    if (c === CODES[0]) {
      await p.click('#btnMove'); await wait(800);
      res.picker = await p.evaluate(() => {
        const H = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; };
        const list = [...document.querySelectorAll('.results button')].map((e) => [...e.children].map((x) => x.textContent.trim()).join(' / '));
        const map = document.querySelector('.mapbox');
        const svg = map ? map.innerHTML : '';
        return { sido: list.length, list, soonhead: (document.querySelector('.soonhead') || {}).textContent || null, map: { len: svg.length, hash: H(svg), paths: map ? map.querySelectorAll('path').length : 0 } };
      });
    }
    await p.close();
  }
  await b.close();
  ensureDir(path.dirname(outFile));
  fs.writeFileSync(outFile, JSON.stringify(res, null, 1) + '\n');
  for (const [c, r] of Object.entries(res.regions)) console.log(c, r.plate.dong, '|', r.cat.name, r.cat.touchType, '| 지금', r.clockAtFixed.entry, '| 일정', r.schedule6h.entries, r.schedule6h.hash, '| 시계', r.clock, '| 레시피 켬', r.recipes.enabled);
  console.log('시트 시/도', res.picker && res.picker.sido, '지도 path', res.picker && res.picker.map.paths, '해시', res.picker && res.picker.map.hash);
  console.log('저장:', path.relative(process.cwd(), outFile), ' ERR', JSON.stringify(errs));
  return !errs.length && Object.values(res.regions).every((r) => r.recipes.enabled === 0);
});
