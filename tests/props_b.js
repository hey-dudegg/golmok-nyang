// 오브젝트 O1 브라우저 시험 B (M5·M7-2 분할): 낮은 담 wallLoaf·종이 상자 crateSit·스위치 끄기(10)·누수(9). tests/props.js 와 같은 도우미.
// 사용: BASE_URL=http://127.0.0.1:<포트>/prototype/ node tests/props_b.js   (서버 필요)
const { launch, open, run } = require('./lib/common');

run('props_b (담·상자·스위치 끄기·누수)', async () => {
  const b = await launch(); const errs = [];
  const p = await open(b, '?admin&props=1&still=2&pr=0.3&shells=2&hour=13#11', { width: 390, height: 800, errs, settle: 2000 });
  const R = await p.evaluate(() => {
    const app = window.__app, X = window.__props, out = [], ok = (n, c, d) => out.push([n, !!c, d === undefined ? '' : String(d)]);
    const DT = 0.05;
    const mk = (force = { x: 0, z: -1.1, dir: 1 }, at = [0.3, 0.3]) => { // 차 1대를 고정 배치하고 마스코트를 성체 지상에서 시작
      app.propsSet(true, force); const a = app.mascot;
      if (app.enc) app.abortEnc(); if (app.away) app.returnNow(); // 다시 지을 때 실제 시각 일정의 만남·외출이 걸리면 play()를 받지 않아 끝낸다 (M5-4)
      a.kitten = false; a.cat.g.months = 36; a.p.grumpy = 0.1; a.p.bold = 0.6; app.world.day = 1; app.world.night = 0;
      X.Clock.cache.clear(); X.resetSlot(a); X.PROPS.claims.clear(); a.steps = []; a.step = null; a.move = null; a.arrived = true; a.x = at[0]; a.z = at[1]; a.manual = true; a.pm = null; return a; // 지금 시각의 일정이 이미 지점에 있을 수 있어 비운다
    };
    const maxSp = (a) => 0.26 * (0.65 + 0.35 * a.scale) * 3.2; // 최고 달리기 속도
    // 프레임 기록기: T1(수평 점프 없음, 수직 변화는 도약 중만)
    const rec = (a) => ({ a, viol: [], maxY: 0, prev: { x: a.x, y: a.y, z: a.z, hop: !!a.hop } });
    const tick = (r, n, extra) => {
      for (let i = 0; i < n; i++) {
        r.a.update(DT); const a = r.a, P = r.prev, dh = Math.hypot(a.x - P.x, a.z - P.z), dy = Math.abs(a.y - P.y);
        if (dh > maxSp(a) * DT * 1.5 + 1e-6) r.viol.push(['h', dh.toFixed(3)]);
        if (dy > 1e-9 && !P.hop && !a.hop) r.viol.push(['y', dy.toFixed(3)]);
        r.maxY = Math.max(r.maxY, a.y); r.prev = { x: a.x, y: a.y, z: a.z, hop: !!a.hop }; if (extra) extra(a, i);
      }
    };
    const logOf = (a, ev) => ((a.pm && a.pm.log) || []).filter((e) => !ev || e.ev === ev);
    const toOn = (r, max = 500) => { for (let i = 0; i < max && !(r.a.slot && (r.a.slot.state === 'on' || r.a.slot.state === 'under')); i++) tick(r, 1); }; // 지점에 올라/들어갈 때까지
    const v3 = (r) => JSON.stringify(r.viol.slice(0, 3));
    // 9c) 낮은 담 wallLoaf (M5-1): 차는 앞쪽에 치워 두고 담(0.2, -1.2)만 시험
    { const WF = { x: 0, z: 0.6, dir: 1, wall: { x: 0.2, z: -1.2 } }, WA = [0.3, -0.5];
      let a = mk(WF, WA); const wl = X.PROPS.layout.find((p) => p.kind === 'lowwall'), top = X.propSlots('wallLoaf');
      ok('9c-a 담 1개·위 지점 2개·장애물 사각형 2개', !!wl && top.length === 2 && app.s.obstacles.filter((o) => o.hx).length === 2, JSON.stringify(top.map((s) => s.key)));
      ok('9c-b 담 안쪽은 막히고 접근점은 열림', app.blocked(0.2, -1.2, 0.2) && !app.blocked(top[0].ax, top[0].az, 0.2));
      let r = rec(a); a.playManual('wallLoaf'); let held = 0;
      tick(r, 1900, (a) => { if (a.slot && a.slot.state === 'on' && Math.abs(a.y - 0.8) < 1e-6) held++; });
      ok('9c-c 담 위 y 0.80 도달', Math.abs(r.maxY - 0.8) < 1e-6, r.maxY);
      ok('9c-d 0.80 유지 15초 이상(55초 이하)', held * DT >= 15 && held * DT <= 55, held * DT);
      ok('9c-e 내려와 y 0·지점 해제·mount 1·leave 1', a.y === 0 && !a.slot && !X.propOccupant(top[0].key) && !X.propOccupant(top[1].key) && logOf(a, 'mount').length === 1 && logOf(a, 'leave').length === 1, JSON.stringify(logOf(a)));
      ok('9c-f T1 위반 0 (순간이동 없음)', r.viol.length === 0, v3(r));
      // 새끼: 점수 0이고 강제 실행해도 오르지 않는다
      a = mk(WF, WA); a.kitten = true; r = rec(a);
      ok('9c-g 새끼 점수 0', X.ACTIONS.wallLoaf.score(a) === 0);
      a.playManual('wallLoaf'); tick(r, 400); ok('9c-h 새끼는 담에 못 오름(y 0)', r.maxY === 0 && !a.slot, r.maxY);
      // 쿨다운: 내려온 직후 같은 담 지점 재진입 시도는 지상 대체(오르지 않음)
      a = mk(WF, WA); r = rec(a); a.playManual('wallLoaf'); tick(r, 1900); const first = r.maxY; a.playManual('wallLoaf'); let early = 0; tick(r, 300, () => { if (a.slot && a.slot.state === 'on' && a.y > 0.7) early++; });
      ok('9c-i 쿨다운 안 같은 지점 재진입 없음', first > 0.7 && early === 0, early);
      // 접근점 막힘 (M5-4): 한쪽 접근점에 작은 장애물을 두면 다른 접근점으로 오르고, 양쪽이 막히면 포기한다
      const plug = (s) => app.s.obstacles.push({ x: s.ax, z: s.az, r: 0.05 });
      a = mk(WF, WA); plug(top[0]); r = rec(a);
      const sep = app.blocked(top[0].ax, top[0].az, 0.2) && !app.blocked(top[1].ax, top[1].az, 0.2);
      a.playManual('wallLoaf'); let on1 = 0; tick(r, 1900, (a) => { if (a.slot && a.slot.key === top[1].key && a.slot.state === 'on') on1++; });
      ok('9c-j 한쪽 접근점 막혀도 다른 쪽으로 담 위 도달·T1 위반 0', sep && Math.abs(r.maxY - 0.8) < 1e-6 && on1 > 0 && r.viol.length === 0, JSON.stringify({ sep, maxY: r.maxY, on1, v: v3(r) }));
      a = mk(WF, WA); plug(top[0]); plug(top[1]); r = rec(a); a.playManual('wallLoaf'); tick(r, 400);
      ok('9c-k 양쪽 접근점 막히면 포기(y 0·지점 없음)', r.maxY === 0 && !a.slot && logOf(a, 'mount').length === 0, r.maxY); }
    // 9d) 종이 상자 crateSit (M5-2): 차는 앞쪽에 치워 두고 상자(0.2, -0.9)만 시험. 들어가기·유지·가림·나오기
    { const CF = { x: 0, z: 0.6, dir: 1, crate: { x: 0.2, z: -0.9 } }, CA = [0.4, -0.2], V3 = app.mascot.v.mesh.position.constructor;
      let a = mk(CF, CA); const cr = X.PROPS.layout.find((p) => p.kind === 'crate'), sl = X.propSlots('crateSit');
      ok('9d-a 상자 1개·in 지점 1개·장애물 사각형 2개', !!cr && sl.length === 1 && app.s.obstacles.filter((o) => o.hx).length === 2, JSON.stringify(sl.map((s) => s.key)));
      ok('9d-b 상자 안쪽은 막히고 접근점은 열림', app.blocked(0.2, -0.9, 0.05) && !app.blocked(sl[0].ax, sl[0].az, 0.2));
      let r = rec(a); a.playManual('crateSit'); let held = 0, layerSeen = false, inside = false, topMax = 0, pushed = false;
      tick(r, 1500, (a) => { if (a.layer === 'crate0') layerSeen = true;
        if (a.slot && a.slot.state === 'under') { held++; if (Math.hypot(a.x - sl[0].x, a.z - sl[0].z) < 0.06) inside = true;
          if (held % 20 === 5 && !a.hop) { a.v.update(0); let top = -9; const q = new V3(); for (const n of a.v.rig.list) { n.getWorldPosition(q); top = Math.max(top, q.y); } topMax = Math.max(topMax, top); } }
        if (a.layer === 'crate0' && Math.abs(a.x - 0.2) > 0.3) pushed = true; });
      ok('9d-c layer 가 crate0 로 바뀌고 상자 안 지점에 도착(밀림 없음)', layerSeen && inside && !pushed);
      ok('9d-d 안에서 10초 이상 유지(40초 이하)', held * DT >= 10 && held * DT <= 48, held * DT);
      ok('9d-e 가림: 머리·귀는 벽(0.28) 위로 보이되 0.5 미만(몸은 가려짐)', topMax > 0.28 && topMax < 0.5, topMax.toFixed(3));
      ok('9d-f 나온 뒤 layer 없음·지점 해제·y 0·mount 1·leave 1', !a.layer && !a.slot && a.y === 0 && !X.propOccupant('crate0:in') && logOf(a, 'mount').length === 1 && logOf(a, 'leave').length === 1, JSON.stringify(logOf(a)));
      ok('9d-g T1 위반 0 (순간이동 없음)', r.viol.length === 0, v3(r));
      // 새끼: 점수 > 0 이고 들어간다(높이 제한 없음)
      // 꼬리·몸통 관절 (R-24, M5-4 후속): 앉아 있는 동안 꼬리 관절은 벽 안쪽이거나 벽 위, 입퇴장 중 몸통 관절은 벽높이 아래로 앞벽 면을 지나지 않는다
      { const CX = 0.2, CZ = -0.9, HX = 0.275, HZ = 0.225, WH = 0.28; a = mk(CF, CA); r = rec(a); a.playManual('crateSit');
        const q = new V3(), TAIL = [0, 1, 2, 3, 4, 5, 6].map((i) => 't' + i), BODY = ['hips', 'chest', 'neck', 'head'], prev = {}; let tailBad = 0, tailWorst = 0, tailInfo = '', cross = 0, crossAt = '', sampled = 0, hopsSeen = 0, wasHop = false;
        tick(r, 1700, (a) => { a.v.update(0);
          for (const nm of BODY) { a.v.rig[nm].getWorldPosition(q); const p0 = prev[nm]; if (p0 && Math.abs(q.x - CX) < HX && ((p0.z - (CZ + HZ)) * (q.z - (CZ + HZ)) < 0) && p0.y + (q.y - p0.y) * (p0.z - (CZ + HZ)) / (p0.z - q.z) < WH) { /* 벽 면을 지나는 순간의 높이(두 프레임 사이 선형 보간) */ cross++; crossAt = nm + ' y' + q.y.toFixed(2); } prev[nm] = { z: q.z, y: q.y }; }
          if (a.hop && !wasHop) hopsSeen++; wasHop = !!a.hop;
          if (a.slot && a.slot.state === 'under' && !a.hop) { sampled++; for (const nm of TAIL) { a.v.rig[nm].getWorldPosition(q);
            const out = Math.max(Math.abs(q.x - CX) - HX, Math.abs(q.z - CZ) - HZ); if (out > 0.01 && q.y < WH) { tailBad++; if (out > tailWorst) { tailWorst = out; tailInfo = nm + ' x' + (q.x - CX).toFixed(2) + ' y' + q.y.toFixed(2) + ' z' + (q.z - CZ).toFixed(2) + ' yaw' + a.yaw.toFixed(2) + ' f' + sampled; } } } } });
        ok('9d-n 앉은 동안 꼬리 관절이 벽 안쪽이거나 벽 위(바깥으로 새지 않음)', sampled > 30 && tailBad === 0, `sampled ${sampled} bad ${tailBad} worst ${tailWorst.toFixed(3)} ${tailInfo}`);
        ok('9d-o 입퇴장: 앞벽을 도약으로 넘음(들어갈 때·나올 때 각 도약)·몸통 관절이 벽높이 아래로 벽 면을 지나지 않음·T1 0', hopsSeen >= 2 && cross === 0 && r.viol.length === 0, `hops ${hopsSeen} cross ${cross} ${crossAt} viol ${v3(r)}`); }
      a = mk(CF, CA); a.kitten = true; a.cat.g.months = 2; r = rec(a); ok('9d-h 새끼 점수 양수', X.ACTIONS.crateSit.score(a) > 0);
      let inK = false; a.playManual('crateSit'); tick(r, 1500, (a) => { if (a.slot && a.slot.state === 'under') inK = true; }); ok('9d-i 새끼도 들어감', inK && r.viol.length === 0);
      // 쓰다듬기 반응: 그 자리에서 sit 몸짓, 내려오지 않고 위치 불변
      a = mk(CF, CA); a.playManual('crateSit'); r = rec(a); toOn(r); const P0 = { x: a.x, z: a.z }; let dmax = 0;
      a.react('pet'); tick(r, 60, (a) => { dmax = Math.max(dmax, Math.hypot(a.x - P0.x, a.z - P0.z)); });
      ok('9d-j 숨은 상태 쓰다듬기: 그 자리 반응(위치 불변·점유 유지)', a.slot && a.slot.state === 'under' && dmax < 0.02, dmax.toFixed(3));
      // 점유 중이면 대체 동작(들어가지 않음)
      a = mk(CF, CA); X.propClaim('crate0:in', { fake: 1 }); a.playManual('crateSit'); r = rec(a); tick(r, 300);
      ok('9d-k 점유 중 대체: 들어가지 않음', !a.slot && !a.layer); 
      // 숨은 상태 극성: 부정 반응 연속은 무한 반복 없이 전환, 긍정(츄르)은 걸어 나와 받고 다시 들어가지 않음
      a = mk(CF, CA); a.playManual('crateSit'); r = rec(a); toOn(r); let swapped = false;
      for (let k = 0; k < 4 && !swapped; k++) { a.react('swat'); tick(r, 80, (a) => { if (!a.slot) swapped = true; }); }
      ok('9d-l 숨은 채 부정 반응 4연속: 전환(내려옴 또는 무시 유지) 후 T1 위반 0·점유 일관', r.viol.length === 0 && (swapped ? !X.propOccupant('crate0:in') && !a.layer : a.slot.state === 'under'), `swapped ${swapped} viol ${v3(r)}`);
      a = mk(CF, CA); a.playManual('crateSit'); r = rec(a); toOn(r); a.react('eat_churu'); let outC = false; tick(r, 400, (a) => { if (!a.slot && !a.layer) outC = true; });
      ok('9d-m 상자 안 츄르: 나와서 받음·layer 해제·재입장 없음·T1 위반 0', outC && !a.slot && !a.layer && !X.propOccupant('crate0:in') && logOf(a, 'mount').length === 1 && r.viol.length === 0, `out ${outC} mount ${logOf(a, 'mount').length} viol ${v3(r)}`); }
    // 10) 스위치 끄면 원래대로
    app.propsSet(false); ok('10 끄면 장애물·행동 표에서 사라짐', !app.s.obstacles.some((o) => o.hx) && !X.ACTIONS.hoodLoaf && !X.ACTIONS.underHide && !X.ACTIONS.wallLoaf && !X.ACTIONS.crateSit);
    return { out };
  });
  // 9) 누수: 차가 있는 같은 지역을 여러 번 다시 지어도 지오메트리·텍스처 누적 증가 없음 (렌더가 돈 뒤에 잰다)
  const memNow = () => p.evaluate(() => new Promise((res) => { window.__advance(3); setTimeout(() => res({ g: window.__app.s.renderer.info.memory.geometries, t: window.__app.s.renderer.info.memory.textures }), 900); }));
  await p.evaluate(() => window.__app.propsSet(true, { x: 0, z: -1.1, dir: 1 })); await memNow(); /* 첫 렌더 뒤 안정 */ await p.evaluate(() => window.__app.propsSet(true, { x: 0, z: -1.1, dir: 1 })); const m0 = await memNow();
  // 반복 다시 짓기 8회, 회마다 측정. memory.geometries는 그려진 것만 세어 ±3 흔들리므로(M5-7) 단발 비교 대신 누적 증가로 판정:
  // 뒤 절반 최대 <= 앞 절반 최대 + 3 (진짜 누수 회당 +1 이상이면 차이 4 이상). 텍스처는 흔들림 없어 처음값 +2.
  const series = []; for (let i = 0; i < 8; i++) { await p.evaluate(() => window.__app.propsSet(true, { x: 0, z: -1.1, dir: 1 })); series.push(await memNow()); }
  const memAfter = series[series.length - 1];
  let fail = 0;
  for (const [n, c, d] of R.out) { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  [' + d + ']' : '')); }
  const gs = series.map((x) => x.g), h = gs.length >> 1; const noLeak = Math.max(...gs.slice(h)) <= Math.max(...gs.slice(0, h)) + 3 && Math.max(...series.map((x) => x.t)) <= m0.t + 2;
  console.log((noLeak ? 'PASS ' : 'FAIL ') + '9 누수 0 (다시 짓기 8회 누적 증가 없음) g=' + gs.join(',') + ' t ' + m0.t + '->' + memAfter.t); if (!noLeak) fail++;
  if (errs.length) { fail++; console.log('FAIL 콘솔 오류 ' + errs.slice(0, 3).join(' | ')); }
  const total = R.out.length + 2; console.log(`props_b: ${total - fail}/${total} 항목 통과`); // 누수·콘솔 오류도 집계
  await b.close(); return fail === 0;
});
