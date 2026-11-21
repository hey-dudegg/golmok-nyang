// 오브젝트 캣타워 시험 (M8-3, 설계 캣타워_설계.md 5장): TC1~TC5 + tower 켠 상태 T1~T8 + 0번 기기 폭 일정 일치(D-19). ?props=1 에서 돈다.
// 사용: BASE_URL=http://127.0.0.1:<포트>/prototype/ node tests/props_tower.js   (서버 필요). TC6(배치)는 tests/unit/props_tower.test.mjs
// 캣타워는 {x:0,z:-1.0}, 차는 구석(-2.5,0.9)에 고정해 접근점이 막히지 않게 한다. 고양이는 직접 update(1/20초)로 돌려 프레임마다 잰다.
const { launch, open, run } = require('./lib/common');
const Q = '?admin&props=1&still=2&pr=0.3&shells=2&hour=13#28';
run('props_tower (캣타워 TC1~TC5·T1~T8·기기 폭 일정)', async () => {
  const b = await launch(); const errs = []; const out0 = [];
  // 0) 같은 지역·시각에 1280·390 폭의 고양이 일정이 같은가: 배치 상한(모바일 3개)이 일정에 새면 안 된다 (D-19)
  const sched = {};
  for (const w of [1280, 390]) {
    const p0 = await open(b, Q, { width: w, height: 800, errs, settle: 2000 }); sched[w] = {};
    for (const hh of ['28', '31', '43', '47']) { // 28 공원(탑 없음)·31·43 공원 탑·47 골목 탑
      await p0.evaluate((q) => { location.hash = '#' + q; }, hh); await new Promise((r) => setTimeout(r, 700));
      for (const mode of ['natural', 'forced']) sched[w][hh + mode] = await p0.evaluate((mode) => { const app = window.__app, X = window.__props;
        app.propsSet(true, mode === 'forced' ? { x: -2.5, z: 0.9, dir: 1, tower: { x: 0, z: -1.0 } } : undefined); X.Clock.cache.clear();
        const t0 = Date.UTC(2026, 9, 10, 0, 0), L = X.Clock.between(app.mascot.cat, t0, t0 + 86400000);
        return { kinds: X.PROPS.layout.map((q) => q.kind).join(','), n: L.length, s: JSON.stringify(L.map((e) => [e.key, e.slot, e.t0, e.t1, e.S, e.U, e.seed])) }; }, mode);
    }
    await p0.close();
  }
  for (const k of Object.keys(sched[1280])) { const A = sched[1280][k], B = sched[390][k]; out0.push(['0 일정 일치 #' + k + ' (1280 [' + A.kinds + '] n' + A.n + ' / 390 [' + B.kinds + '] n' + B.n + ')', A.s === B.s, A.s === B.s ? '' : '불일치']); }
  const p = await open(b, Q, { width: 390, height: 800, errs, settle: 2000 });
  const R = await p.evaluate(() => {
    const app = window.__app, X = window.__props, out = [], ok = (n, c, d) => out.push([n, !!c, d === undefined ? '' : String(d)]);
    const DT = 0.05, F = { x: -2.5, z: 0.9, dir: 1, tower: { x: 0, z: -1.0 } };
    const KEY = { towerLookout: 'tower0:top', towerLie: 'tower0:mid', towerDen: 'tower0:den' };
    const mk = (at = [0.3, 0.3]) => { app.propsSet(true, F); const a = app.mascot;
      if (app.enc) app.abortEnc(); if (app.away) app.returnNow();
      a.kitten = false; a.cat.g.months = 36; a.p.grumpy = 0.1; a.p.bold = 0.6; app.world.day = 1; app.world.night = 0;
      X.Clock.cache.clear(); X.resetSlot(a); X.PROPS.claims.clear(); a.steps = []; a.step = null; a.move = null; a.arrived = true; a.x = at[0]; a.z = at[1]; a.manual = true; a.pm = null; return a; };
    const maxSp = (a) => 0.26 * (0.65 + 0.35 * a.scale) * 3.2;
    const rec = (a) => ({ a, viol: [], maxY: 0, plateau: {}, prev: { x: a.x, y: a.y, z: a.z, hop: !!a.hop } });
    const tick = (r, n, extra) => { for (let i = 0; i < n; i++) { r.a.update(DT); const a = r.a, P = r.prev, dh = Math.hypot(a.x - P.x, a.z - P.z), dy = Math.abs(a.y - P.y);
      if (dh > maxSp(a) * DT * 1.5 + 1e-6) r.viol.push(['h', dh.toFixed(3)]); if (dy > 1e-9 && !P.hop && !a.hop) r.viol.push(['y', dy.toFixed(3)]);
      r.maxY = Math.max(r.maxY, a.y); r.prev = { x: a.x, y: a.y, z: a.z, hop: !!a.hop }; if (extra) extra(a, i); } };
    const logOf = (a, ev) => ((a.pm && a.pm.log) || []).filter((e) => !ev || e.ev === ev);
    const toOn = (r, max = 2500) => { for (let i = 0; i < max && !(r.a.slot && (r.a.slot.state === 'on' || r.a.slot.state === 'under')); i++) tick(r, 1); };
    const v3 = (r) => JSON.stringify(r.viol.slice(0, 3)), other = () => ({ other: 1 });
    // TC1 두 단 오르기: towerLookout 강제
    let a = mk(), r = rec(a); const tw = X.PROPS.layout.find((q) => q.kind === 'tower'); ok('0 tower 배치(고정)', !!tw && app.s.obstacles.some((o) => o.id === 'tower0'));
    a.playManual('towerLookout'); const ysSeen = new Set(); let midRun = 0, midMax = 0;
    tick(r, 2400, (a) => { ysSeen.add(a.y.toFixed(2)); if (!a.hop && Math.abs(a.y - 0.36) < 1e-6) { midRun++; midMax = Math.max(midMax, midRun); } else midRun = 0; });
    ok('TC1a y 0 -> 0.36 -> 0.72 거침(top 도달)', r.maxY > 0.719 && ysSeen.has('0.36') && ysSeen.has('0.72'), r.maxY.toFixed(3));
    ok('TC1b y 는 hop 중에만 변함·T1 위반 0', r.viol.length === 0, v3(r));
    ok('TC1c 중간 정지(mid 0.36) 0.6~1.0초 존재(착지 웅크림 0.3s 포함)', midMax * DT >= 0.6 && midMax * DT <= 1.0, (midMax * DT).toFixed(2) + 's');
    ok('TC1d 끝: 지상·점유 해제·mount 1·leave 1', a.y === 0 && !a.slot && !X.propOccupant('tower0:top') && logOf(a, 'mount').length === 1 && logOf(a, 'leave').length === 1, JSON.stringify(logOf(a).map((e) => e.ev)));
    // TC2 mid 막힘: mid 점유면 top 못 고름, top 위에서 내려올 때 mid 막히면 한 번 hop 으로 접근점 착지
    a = mk(); X.propClaim('tower0:mid', other()); ok('TC2a mid 점유: towerLookout 점수 0', X.ACTIONS.towerLookout.score(a) === 0); X.PROPS.claims.clear();
    a = mk(); r = rec(a); a.playManual('towerLookout'); toOn(r); tick(r, 60); ok('TC2b top 도달 y 0.72', Math.abs(a.y - 0.72) < 1e-6 && a.slot && a.slot.key === 'tower0:top', a.y);
    X.propClaim('tower0:mid', other()); a.steps = [X.PS.dismount(false)]; a.step = null; a.arrived = true; let hops = 0, last = false; const r2 = rec(a);
    for (let i = 0; i < 400 && (a.slot || a.y > 0); i++) { tick(r2, 1); if (a.hop && !last) hops++; last = !!a.hop; }
    ok('TC2c mid 막힌 채 top 내리기: 한 번 hop·지상·공중 정지/대입(T1) 0', a.y === 0 && !a.slot && hops === 1 && r2.viol.length === 0, `hops ${hops} viol ${v3(r2)}`); X.PROPS.claims.clear();
    // TC5 칸 가림: den loaf, 카메라 고정 뒤 광선-상자 교차로 몸 점의 가려진 비율 (화면 픽셀 없이)
    a = mk(); r = rec(a); a.playManual('towerDen'); toOn(r); tick(r, 40);
    { const g = app.s.env.children.find((c) => c.userData.propId === 'tower0'), s = app.s; s.camera.position.set(0, 0.95, 3.4); s.controls.target.set(app.mascot.x * 0.5, 0.24, app.mascot.z * 0.5 - 0.2); /* 기본 카메라 (main.js) */ s.camera.fov = 36; s.camera.updateProjectionMatrix(); s.controls.update(); s.camera.updateMatrixWorld(true); g.updateMatrixWorld(true);
      const V = a.v.mesh.position.constructor, cam = s.camera.position.clone(), boxes = [];
      g.traverse((m) => { if (!m.isMesh || m.geometry.type === 'PlaneGeometry') return; m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox, lo = new V(1e9, 1e9, 1e9), hi = new V(-1e9, -1e9, -1e9);
        for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) { const q = new V(x, y, z).applyMatrix4(m.matrixWorld); lo.min(q); hi.max(q); } boxes.push({ lo, hi }); });
      const pts = [], q = new V(); for (const n of a.v.rig.list) { n.getWorldPosition(q); const p1 = q.clone(); p1.nm = n.name; pts.push(p1); if (n.parent) { n.parent.getWorldPosition(q); const p2 = p1.clone().add(q).multiplyScalar(0.5); p2.nm = n.name; pts.push(p2); } }
      const E = 0.004, inside = (p, B) => p.x > B.lo.x + E && p.x < B.hi.x - E && p.y > B.lo.y + E && p.y < B.hi.y - E && p.z > B.lo.z + E && p.z < B.hi.z - E;
      const hit = (p, B) => { let t0 = 0, t1 = 1; const d = p.clone().sub(cam); for (const k of ['x', 'y', 'z']) { if (Math.abs(d[k]) < 1e-9) { if (cam[k] < B.lo[k] || cam[k] > B.hi[k]) return false; } else { let u = (B.lo[k] - cam[k]) / d[k], v = (B.hi[k] - cam[k]) / d[k]; if (u > v) { const w = u; u = v; v = w; } t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false; } } return t0 < 0.999 && t1 > 0; };
      let pen = 0, hid = 0, vis = 0; const penN = new Set(); for (const p of pts) { if (boxes.some((B) => inside(p, B))) { pen++; penN.add(p.nm + '@' + [p.x, p.y, p.z].map((v) => v.toFixed(2))); continue; } if (/^td/.test(p.nm)) continue; /* 꼬리는 가림 비율에서 뺀다(몸·머리 기준). 뚫음은 위에서 따로 센다 */ if (boxes.some((B) => hit(p, B))) hid++; else vis++; }
      const ratio = hid / Math.max(1, hid + vis);
      ok('TC5a den loaf: 몸·머리 가림 비율 0.5~0.8 (꼬리 제외, 가림 ' + hid + ', 보임 ' + vis + ')', ratio >= 0.5 && ratio <= 0.8, ratio.toFixed(2));
      ok('TC5b 몸 점이 상자 벽·판 안으로 뚫음 0', pen === 0, 'pen ' + pen + ' ' + [...penN].join(',')); }
    // TC3·TC4 30분 가속 시뮬 (세계 시계). 새끼: mid·top 0, den 가능 / 일반: 묶음 반복 (최근 3개 안 tower 2개 이상 0)
    const TK = new Set(['towerLookout', 'towerLie', 'towerDen']);
    const sim = (c, kitten, hr) => { const a = mk(); a.manual = false; a.cat.id = 'twr' + c; if (kitten) { a.kitten = true; a.cat.g.months = 1.5; } X.Clock.cache.clear(); a.pm = null;
      const t0 = Date.UTC(2026, 9, 10, hr, 0); a.enterClock(t0); a.sim = true; a.simNow = t0; const keys = [], used = new Set(), bf = a.beginEntry.bind(a); a.beginEntry = (e, rs) => { if (!rs) keys.push(e.key); return bf(e, rs); };
      let viol = 0; for (let i = 0; i < 18000; i++) { a.update(0.1); if (a.y > 0 && !a.slot && !a.hop) viol++; if (a.slot) used.add(a.slot.key); }
      a.sim = false; a.beginEntry = bf; return { keys, used, mounts: logOf(a, 'mount'), viol }; };
    let towerKeys = 0, tc3Mid = 0, tc3Den = 0, kitSlots = '', tc4Bad = 0, simViol = 0, mt = 0, win = 0, chain = 0, ent = 0;
    for (let c = 0; c < 4; c++) { const s = sim(c, true, 3 + c * 3); for (const k of s.used) { if (k === 'tower0:mid' || k === 'tower0:top') tc3Mid++; if (k === 'tower0:den') tc3Den++; } kitSlots += [...s.used].join('+') + '/'; simViol += s.viol; }
    a = mk(); a.kitten = true; a.cat.g.months = 1.5; const denScore = X.ACTIONS.towerDen.score(a);
    ok('TC3a 새끼 30분 x4: mid·top mount 0, 점수 lookout·lie 0', tc3Mid === 0 && X.ACTIONS.towerLookout.score(a) === 0 && X.ACTIONS.towerLie.score(a) === 0, 'mid/top ' + tc3Mid + ' slots ' + kitSlots);
    ok('TC3b 새끼 den 사용 가능 (점수 > 0, 시뮬 den ' + tc3Den + '회)', denScore > 0, denScore);
    for (let c = 0; c < 4; c++) { const s = sim(c, false, 6 + c * 3), ks = s.keys; simViol += s.viol; for (const k of ks) if (TK.has(k)) towerKeys++;
      for (let i = 0; i < ks.length; i++) if (TK.has(ks[i])) { let n = 0; for (let j = Math.max(0, i - 2); j <= i; j++) if (TK.has(ks[j])) n++; if (n >= 2) tc4Bad++; }
      const ms = s.mounts.map((e) => e.t); mt += ms.length; for (const t of ms) win = Math.max(win, ms.filter((u) => u >= t && u < t + 300).length);
      ent += ks.length; for (let i = 0; i < ks.length; i++) if (TK.has(ks[i])) for (let j = i + 1; j <= i + 3 && j < ks.length; j++) if (ks[j] === ks[i]) chain++; }
    ok('TC4 30분 x4 행동 기록: 최근 3개 안 tower 2개 이상 구간 0 (tower 행동 ' + towerKeys + '개)', towerKeys > 0 && tc4Bad === 0, 'bad ' + tc4Bad);
    ok('TC4b 시뮬 중 지점 밖 공중(y>0, slot 없음) 0', simViol === 0, simViol);
    ok('T2 임의 5분 창 mount <= 2 (총 ' + mt + '회, 행동 ' + ent + '개)', mt > 0 && win <= 2, 'winMax ' + win); ok('T6 같은 tower 행동이 최근 3개 안 재등장 0', chain === 0, 'chain ' + chain);
    // 기존 T1~T8 (tower 켠 상태): T3·T4 는 mid 와 top 지점 각각
    for (const act of ['towerLookout', 'towerLie']) {
      const key = KEY[act], y0 = act === 'towerLookout' ? 0.72 : 0.36;
      a = mk(); a.playManual(act); r = rec(a); toOn(r); tick(r, 10); ok('T3 준비 ' + act + ': 올라감 y ' + y0, a.slot && a.slot.key === key && Math.abs(a.y - y0) < 1e-6, a.y);
      const P0 = { x: a.x, z: a.z, y: a.y }; let xzMax = 0; for (let k = 0; k < 10; k++) { a.react('swat'); tick(r, 50, (a) => { xzMax = Math.max(xzMax, Math.hypot(a.x - P0.x, a.z - P0.z)); }); }
      ok('T3a ' + act + ' 쓰다듬기 10회: x·z 변화 <= 0.02', xzMax <= 0.02, xzMax.toFixed(4)); ok('T3b ' + act + ' y 불변·dismount 0', a.y === P0.y && logOf(a, 'leave').length === 0, a.y); ok('T3c ' + act + ' T1 위반 0', r.viol.length === 0, v3(r));
      a = mk(); a.p.grumpy = 0.9; a.playManual(act); r = rec(a); toOn(r); const Q0 = { x: a.x, z: a.z }; let xz2 = 0, dsm = false;
      for (let k = 0; k < 10; k++) { a.react('swat'); tick(r, 50, (a) => { if (!dsm) { if (a.hop) dsm = true; else xz2 = Math.max(xz2, Math.hypot(a.x - Q0.x, a.z - Q0.z)); } }); }
      ok('T3d ' + act + ' 짜증: 내려오기 전 x·z <= 0.02', xz2 <= 0.02, xz2.toFixed(4)); ok('T3e ' + act + ' dismount 최대 1회·지상', logOf(a, 'leave').length <= 1 && a.y === 0 && !a.slot, JSON.stringify(logOf(a).map((e) => e.ev)));
      let early = 0; a.playManual(act); tick(r, 300, () => { if (a.slot) early++; }); ok('T3f ' + act + ' 90초 안 재진입 0', early === 0, early);
      a = mk(); a.playManual(act); r = rec(a); toOn(r); const yy = a.y; a.react('eat_churu'); let yCh = false; tick(r, 100, (a) => { if (a.y !== yy) yCh = true; });
      ok('T4 ' + act + ' 츄르 동안 y 유지·dismount 0', !yCh && logOf(a, 'leave').length === 0 && a.slot && a.slot.state === 'on'); }
    { const ap = X.propSlots('towerLie')[0]; // T5: 접근점 막힘
      for (const act of ['towerLookout', 'towerLie', 'towerDen']) { a = mk(); app.s.obstacles.push({ x: ap.ax, z: ap.az, r: 0.7 }); r = rec(a); a.playManual(act); tick(r, 400);
        ok('T5a ' + act + ' 접근점 막힘: 오르지 않고 포기·점유 없음·T1 0', r.maxY === 0 && !a.slot && !X.propOccupant(KEY[act]) && logOf(a, 'mount').length === 0 && r.viol.length === 0, v3(r)); }
      a = mk(); a.x = -0.5; a.z = 1.2; r = rec(a); a.playManual('towerLookout'); tick(r, 20); app.s.obstacles.push({ x: ap.ax, z: ap.az, r: 0.7 }); tick(r, 1200);
      ok('T5c 걷던 중 막힘: 포기(쿨다운)·점유 없음·T1 0', a.pm && a.pm.cool[KEY.towerLookout] > 0 && !a.slot && !X.propOccupant(KEY.towerLookout) && r.maxY === 0 && r.viol.length === 0, v3(r)); }
    // T7: 복원 예외 — enterClock 직후 지점 착석(첫 프레임 예외), 그 뒤 프레임부터 T1
    for (const act of ['towerLie', 'towerLookout']) { a = mk(); a.manual = false; a.cat.id = 'twr0'; X.Clock.cache.clear(); a.pm = null; let rest = null;
      outer: for (let h = 0; h < 96; h++) { const t = Date.UTC(2026, 9, 10, 0, 0) + h * 1800000; for (const e of X.Clock.between(a.cat, t, t + 1800000)) if (e.key === act && e.t1 - e.t0 >= 90000) { for (const off of [20, 26, 32, 38, 44, 60]) { a.enterClock(e.t0 + off * 1000); if (a.slot && a.slot.state === 'on') { rest = { off }; break outer; } } } }
      ok('T7a ' + act + ' 복원 직후 이미 지점 위(첫 프레임 예외)', rest && Math.abs(a.y - (act === 'towerLie' ? 0.36 : 0.72)) < 1e-6, rest ? a.y : 'none');
      if (rest) { a.sim = false; r = rec(a); a.manual = true; tick(r, 100); ok('T7b ' + act + ' 두 번째 프레임부터 T1 위반 0', r.viol.length === 0, v3(r)); } }
    // T8: 캣타워 제거 — 안·위의 고양이가 먼저 나온 뒤 제거 (<= 2초)
    for (const act of ['towerLookout', 'towerLie', 'towerDen']) { a = mk(); a.playManual(act); r = rec(a); toOn(r); const mounted = a.slot && (a.slot.state === 'on' || a.slot.state === 'under');
      app.propsRemove('tower0'); let n = 0, gone = false; while (n < 120 && !gone) { tick(r, 1); app.propsRemoveTick(); n++; gone = !app.s.obstacles.some((o) => o.id === 'tower0'); }
      const hasGroup = app.s.env.children.some((c) => c.userData.propId === 'tower0');
      ok('T8 ' + act + ' 제거 지연 <= 2초, 지상, 그룹 제거', mounted && gone && n * DT <= 2.0 && a.y === 0 && !a.slot && !a.layer && !hasGroup && r.viol.length === 0, `mounted ${!!mounted} 지연 ${(n * DT).toFixed(2)}s viol ${v3(r)}`); }
    return { out };
  });
  let fail = 0; const all = [...out0, ...R.out];
  for (const [n, c, d] of all) { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  [' + d + ']' : '')); }
  if (errs.length) { fail++; console.log('FAIL 콘솔 오류 ' + errs.slice(0, 3).join(' | ')); }
  const total = all.length + 1; console.log(`props_tower: ${total - fail}/${total} 항목 통과`);
  await b.close(); return fail === 0;
});
