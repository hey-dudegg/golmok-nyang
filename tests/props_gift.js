// 선물 상자(M6-5) 브라우저 시험: 등장·배수·giftPeek·giftSniff·만료 T8·두 탭 일정 일치·누수. tests/props.js 가 불러 쓴다.
// 항목은 [이름, 통과, 설명] 배열로 돌려준다.
async function giftTests(p, b, open, errs) {
  const out = []; const ok = (n, c, d) => out.push([n, !!c, d === undefined ? '' : String(d)]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ev = (f, a) => p.evaluate(f, a);
  // 상자 놓기(가짜): 서버 시각 기준 placed·until. 장면에 나타날 때까지(최대 6초) 기다린다
  const place = async (o = {}) => {
    await ev((o) => { const X = window.__props, n = X.Box.now(); X.Box.set({ code: '11', id: 'g' + (window.__gid = (window.__gid || 0) + 1), placed: n - 1000, until: n + 3600000, seed: 7, name: null, mine: false, ...o }, 'recv'); }, o);
    for (let i = 0; i < 24; i++) { if (await ev(() => !!window.__props.PROPS.layout.find((q) => q.id === 'gift0' && !q.gone))) break; await sleep(250); }
    await sleep(400); // 0.3초 등장
  };
  // 고양이 한 마리를 지상에서 시작(차는 뒤쪽 고정), 다른 고양이는 치워 둔다
  const prep = () => ev(() => {
    const app = window.__app, X = window.__props; app.propsSet(true, { x: 0, z: -1.1, dir: 1 }); const a = app.mascot;
    if (app.enc) app.abortEnc(); if (app.away) app.returnNow();
    a.kitten = false; a.cat.g.months = 36; a.p.grumpy = 0.1; a.p.bold = 0.6; app.world.day = 1; app.world.night = 0;
    X.Clock.cache.clear(); X.resetSlot(a); X.PROPS.claims.clear(); a.steps = []; a.step = null; a.move = null; a.arrived = true; a.x = 1.0; a.z = 0.9; a.manual = true; a.pm = null;
    for (const o of app.agents) if (o !== a) { o.hidden = true; o.v.root.visible = false; }
    window.__rec = { viol: [], prev: { x: a.x, y: a.y, z: a.z, hop: false }, poses: [] }; return true;
  });
  // 프레임을 돌려 T1 기록. stopAt 'under' 면 안에 든 지 20프레임 뒤 멈춤, 없으면 행동이 끝날 때까지
  const run = (play, stopAt) => ev(([play, stopAt]) => {
    const app = window.__app, a = app.mascot, R = window.__rec; if (play) a.playManual(play);
    const maxSp = 0.26 * (0.65 + 0.35 * a.scale) * 3.2; let n = 0, entered = 0, under = 0;
    for (; n < 1600; n++) {
      a.update(0.05); const P = R.prev, dh = Math.hypot(a.x - P.x, a.z - P.z), dy = Math.abs(a.y - P.y);
      if (dh > maxSp * 0.05 * 1.5 + 1e-6) R.viol.push(['h', dh.toFixed(3)]); if (dy > 1e-9 && !P.hop && !a.hop) R.viol.push(['y', dy.toFixed(3)]);
      R.prev = { x: a.x, y: a.y, z: a.z, hop: !!a.hop }; if (a.slot && a.slot.state === 'under') under++; if (a.layer === 'gift0') entered = 1;
      if (stopAt === 'under' && under > 20) break; if (!stopAt && n > 30 && !a.step && !a.steps.length && !a.slot) break;
    }
    return { n, viol: R.viol.length, entered, under, y: a.y, slot: !!a.slot, steps: a.steps.length };
  }, [play, stopAt]);

  await prep(); await place();
  const g1 = await ev(() => { const X = window.__props, app = window.__app, g = X.PROPS.layout.find((q) => q.id === 'gift0'), grp = app.s.env.children.find((c) => c.userData.propId === 'gift0');
    return { has: !!g, look: g && g.look, x: g && g.x, z: g && g.z, grp: !!grp && !!grp.userData.gift, sc: grp && grp.scale.x, obs: app.s.obstacles.some((o) => o.id === 'gift0'), w: !!app.world.gift, flaps: grp ? grp.children.length : 0, giftAct: !!X.ACTIONS.giftPeek && !!X.ACTIONS.giftSniff }; });
  ok('G1 상자 놓으면 장면에 나타남 (자리 x -1.2~1.2·z 0~0.8, 충돌 사각형, 0.3초 뒤 크기 1)', g1.has && g1.look === 'gift' && Math.abs(g1.x) <= 1.2 && g1.z >= 0 && g1.z <= 0.8 && g1.grp && g1.sc > 0.99 && g1.obs && g1.w && g1.flaps >= 9, JSON.stringify(g1));
  ok('G2 행동 표에 giftPeek·giftSniff', g1.giftAct);

  // G3: 배수 2.5 (처음 15분 4)
  const g3 = await ev(() => { const X = window.__props, app = window.__app, a = app.mascot, g = X.PROPS.layout.find((q) => q.id === 'gift0'), n = X.Box.now(); a.pm = null;
    g.placed = n - 60000; const s1 = X.ACTIONS.crateSit.score(a, app.world); g.placed = n - 20 * 60000; const s2 = X.ACTIONS.crateSit.score(a, app.world); g.placed = n - 1000; return { s1, s2, r: s1 / s2 }; });
  ok('G3 crateSit 배수: 처음 15분 / 그 뒤 = 4 / 2.5', g3.s2 > 0 && Math.abs(g3.r - 1.6) < 0.01, JSON.stringify(g3));

  // G4 giftPeek
  await prep(); let r = await run('giftPeek', 'under');
  ok('G4a giftPeek: 걸어가 들어감(T1 위반 0)', r.entered === 1 && r.viol === 0 && r.under > 20, JSON.stringify(r));
  r = await run(null); ok('G4b giftPeek: 빼꼼 뒤 나와서 지상·점유 해제·T1 위반 0', r.y === 0 && !r.slot && r.viol === 0, JSON.stringify(r));
  // G5 giftSniff
  await prep(); r = await run('giftSniff'); ok('G5 giftSniff: 접근→냄새→(들어감/떠남) 끝, T1 위반 0·지상', r.viol === 0 && r.y === 0 && !r.slot, JSON.stringify(r));
  // G6 T8 만료: 안에 든 고양이가 먼저 나온 뒤 상자가 줄어 사라진다
  await prep(); r = await run('crateSit', 'under'); const had = r.under > 20;
  const t8 = await ev(async () => { const app = window.__app, X = window.__props, a = app.mascot, R = window.__rec; X.Box.set(null, 'expire'); let n = 0, outDone = false;
    for (; n < 120 && !outDone; n++) { a.update(0.05); const P = R.prev, dh = Math.hypot(a.x - P.x, a.z - P.z), dy = Math.abs(a.y - P.y); if (dh > 0.26 * 3.2 * 0.05 * 1.5 + 1e-6 || (dy > 1e-9 && !P.hop && !a.hop)) R.viol.push(['t8']); R.prev = { x: a.x, y: a.y, z: a.z, hop: !!a.hop }; app.propsRemoveTick(); outDone = !a.slot && a.y === 0; }
    const sec = n * 0.05, early = app.s.env.children.some((c) => c.userData.propId === 'gift0'); // 고양이가 나온 시점에는 아직 상자가 있다
    await new Promise((r) => setTimeout(r, 700)); app.propsRemoveTick(); await new Promise((r) => setTimeout(r, 200)); app.propsRemoveTick();
    return { sec, early, gone: !app.s.env.children.some((c) => c.userData.propId === 'gift0'), layout: X.PROPS.layout.some((q) => q.id === 'gift0'), obs: app.s.obstacles.some((o) => o.id === 'gift0'), y: a.y, slot: !!a.slot, viol: R.viol.length, w: !!app.world.gift }; });
  ok('T8 상자 만료: 고양이가 먼저 나온 뒤(<=2초) 상자 줄어 제거·지상·T1 위반 0', had && t8.sec <= 2 && t8.early && t8.gone && !t8.layout && !t8.obs && t8.y === 0 && !t8.slot && t8.viol === 0 && !t8.w, JSON.stringify(t8));

  // G7 두 탭 같은 시각 일정 일치 (같은 상자·같은 시각 구간)
  const PL = 1893456000000; // 고정 시각(임의)
  const sched = (pg) => pg.evaluate(async ([PL]) => { const X = window.__props, app = window.__app; app.propsSet(true, { x: 0, z: -1.1, dir: 1 }); X.Box.offset = PL + 600000 - Date.now();
    X.Box.set({ code: '11', id: 'gfix', placed: PL, until: PL + 3600000, seed: 11, name: null, mine: false }, 'recv');
    for (let i = 0; i < 24 && !X.PROPS.layout.find((q) => q.id === 'gift0'); i++) await new Promise((r) => setTimeout(r, 250));
    X.Clock.cache.clear(); const keys = []; let gifts = 0; const g = X.PROPS.layout.find((q) => q.id === 'gift0');
    for (const c of app.cats.slice(0, 8)) for (const e of X.Clock.between(c, PL - 600000, PL + 3000000)) { keys.push(c.id + e.t0 + e.key); if (/gift|crateSit/.test(e.key)) gifts++; }
    return { sig: keys.join('|'), n: keys.length, gifts, spot: JSON.stringify(g && [g.x, g.z]) }; }, [PL]);
  const p2 = await open(b, '?admin&props=1&still=2&pr=0.3&shells=2&hour=13#11', { width: 390, height: 800, errs, settle: 2000 });
  const s1 = await sched(p), s2 = await sched(p2); await p2.close();
  ok('G7 같은 시각 두 탭: 일정·자리 일치 (일정 ' + s1.n + '칸, 상자 관련 ' + s1.gifts + '칸)', s1.sig === s2.sig && s1.spot === s2.spot && s1.gifts > 0 && s1.n > 0, 'gifts ' + s1.gifts + ' spot ' + s1.spot + '/' + s2.spot);
  // G8 상자가 없으면: 선물 행동 0칸·배치 없음
  const g8 = await ev(async ([PL]) => { const X = window.__props, app = window.__app; X.Box.set(null, 'expire'); await new Promise((r) => setTimeout(r, 1200)); app.propsRemoveTick(); X.Clock.cache.clear(); let gk = 0;
    for (const c of app.cats.slice(0, 8)) for (const e of X.Clock.between(c, PL, PL + 3000000)) if (/^gift/.test(e.key)) gk++; return { gk, has: X.PROPS.layout.some((q) => q.id === 'gift0') }; }, [PL]);
  ok('G8 상자 없음: 선물 행동 0칸·배치 없음', g8.gk === 0 && !g8.has, JSON.stringify(g8));
  // G9 누수: 놓기·만료 8회
  const mem = () => ev(() => new Promise((res) => { window.__advance(3); setTimeout(() => res(window.__app.s.renderer.info.memory.geometries), 900); }));
  await ev(() => { window.__props.Box.offset = 0; });
  const gs = []; for (let i = 0; i < 8; i++) { await place({ id: 'gl' + i }); await mem(); await ev(() => window.__props.Box.set(null, 'expire')); await sleep(1500); await ev(() => window.__app.propsRemoveTick()); gs.push(await mem()); }
  const h = gs.length >> 1, noLeak = Math.max(...gs.slice(h)) <= Math.max(...gs.slice(0, h)) + 3;
  ok('G9 누수 0 (놓기·만료 8회 지오메트리 ' + gs.join(',') + ')', noLeak);
  await ev(() => window.__app.propsSet(false)); await ev(() => window.__props.Box.set(null, 'expire'));
  return out;
}
module.exports = { giftTests };
