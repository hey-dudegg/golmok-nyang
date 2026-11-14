// 오브젝트 O1 브라우저 시험 (M3-6): 본네트 엎드리기·차 밑 숨기 + 자연스러움 T1~T8 (설계 4A-3, D-120). 기능 스위치를 켠 상태(?props=1)에서 돈다.
// 사용: BASE_URL=http://127.0.0.1:<포트>/prototype/ node tests/props.js   (서버 필요)
// 고양이 한 마리를 직접 update(1/20초)로 돌려 프레임마다 위치·높이를 잰다. 화면 루프는 still 로 멈춰 둔다.
const { launch, open, run } = require('./lib/common');

run('props (오브젝트 O1: hoodLoaf·underHide + T1~T8)', async () => {
  const b = await launch(); const errs = [];
  const p = await open(b, '?admin&props=1&still=2&pr=0.3&shells=2&hour=13#11', { width: 390, height: 800, errs, settle: 2000 });
  const R = await p.evaluate(() => {
    const app = window.__app, X = window.__props, out = [], ok = (n, c, d) => out.push([n, !!c, d === undefined ? '' : String(d)]);
    const DT = 0.05;
    const mk = () => { // 차 1대를 고정 배치하고 마스코트를 성체 지상에서 시작
      app.propsSet(true, { x: 0, z: -1.1, dir: 1 }); const a = app.mascot;
      a.kitten = false; a.cat.g.months = 36; a.p.grumpy = 0.1; a.p.bold = 0.6; app.world.day = 1; app.world.night = 0;
      X.Clock.cache.clear(); X.resetSlot(a); X.PROPS.claims.clear(); a.steps = []; a.step = null; a.move = null; a.arrived = true; a.x = 0.3; a.z = 0.3; a.manual = true; a.pm = null; return a; // 지금 시각의 일정이 이미 지점에 있을 수 있어 비운다
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
    // 0) 배치·충돌
    let a = mk();
    ok('0a 차 사각형 장애물 1개', app.s.obstacles.filter((o) => o.hx).length === 1);
    const ap = X.propSlots('hoodLoaf')[0];
    ok('0b 차 안쪽은 blocked, 접근점은 아님', app.blocked(0, -1.1, 0.2) && !app.blocked(ap.ax, ap.az, 0.2));
    const rs = app.resolve(a, 0, -0.9); ok('0c resolve 가 차 밖으로 밈', rs.z > -0.9 + 0.01 && rs.stuck);
    a.layer = 'car0'; const rs2 = app.resolve(a, 0, -0.9); ok('0d layer 면 통과', Math.abs(rs2.z + 0.9) < 1e-9); a.layer = null;
    // 1) hoodLoaf: 걸어 접근 -> 도약 -> y 0.42 유지 -> 내려옴 0.42->0
    let r = rec(a); a.playManual('hoodLoaf'); let held = 0;
    tick(r, 1600, (a) => { if (a.slot && a.slot.state === 'on' && Math.abs(a.y - 0.42) < 1e-6) held++; });
    ok('1a hood y 0.42 도달', Math.abs(r.maxY - 0.42) < 1e-6, r.maxY);
    ok('1b 0.42 유지 10초 이상', held * DT >= 10, held * DT);
    ok('1c 내려와 y 0·지점 해제', a.y === 0 && !a.slot && !X.propOccupant('car0:hood') && logOf(a, 'mount').length === 1 && logOf(a, 'leave').length === 1, JSON.stringify(logOf(a)));
    ok('1d T1 위반 0', r.viol.length === 0, v3(r));
    // 2) underHide: layer 변화·풋프린트 내부 도착·밀림 없음·나옴
    a = mk(); r = rec(a); a.playManual('underHide'); let layerSeen = false, inside = false, shadeMax = 0;
    const slotU = X.propSlots('underHide')[0];
    tick(r, 1500, (a) => { if (a.layer === 'car0') layerSeen = true; if (a.slot && a.slot.state === 'under' && Math.hypot(a.x - slotU.x, a.z - slotU.z) < 0.08) inside = true; shadeMax = Math.max(shadeMax, a.shadeK || 0); });
    ok('2a layer 가 car0 로 바뀜', layerSeen); ok('2b 차 밑 지점에 도착(밀림 없음)', inside);
    ok('2c 나온 뒤 layer 없음·지점 해제·y 0', !a.layer && !a.slot && a.y === 0 && !X.propOccupant('car0:under'));
    ok('2d 그늘 보간(shade) 0.5 이상 갔다 돌아옴', shadeMax > 0.5 && a.shadeK < 0.05, shadeMax.toFixed(2));
    ok('2e T1 위반 0', r.viol.length === 0, v3(r));
    // 2f) 점유 중이면 대체 동작(지상, 오르지 않음)
    a = mk(); X.propClaim('car0:hood', { fake: 1 }); a.playManual('hoodLoaf'); r = rec(a); tick(r, 400);
    ok('2f 점유 중 대체: 오르지 않고 y 0', r.maxY === 0 && !a.slot);
    // 3) T3: on 지점 쓰다듬기 10회 (거부 연속 상한) — (a) 무시하고 엎드림
    a = mk(); a.playManual('hoodLoaf'); r = rec(a); toOn(r);
    ok('T3 준비: 올라감', a.slot && a.slot.state === 'on' && Math.abs(a.y - 0.42) < 1e-6);
    const P0 = { x: a.x, z: a.z, y: a.y }; let xzMax = 0;
    for (let k = 0; k < 10; k++) { a.react('swat'); tick(r, 50, (a) => { xzMax = Math.max(xzMax, Math.hypot(a.x - P0.x, a.z - P0.z)); }); }
    ok('T3a 10회 반응 동안 x·z 변화 <= 0.02', xzMax <= 0.02, xzMax.toFixed(4));
    ok('T3b y 불변·dismount 0 (무시하고 엎드림)', a.y === P0.y && logOf(a, 'leave').length === 0);
    ok('T3c T1 위반 0', r.viol.length === 0, v3(r));
    // 3d) 짜증 많은 고양이: 3번째 거부에서 1회 내려와 멀리 걸어감 + 90초 재진입 0
    a = mk(); a.p.grumpy = 0.9; a.playManual('hoodLoaf'); r = rec(a); toOn(r);
    const Q0 = { x: a.x, z: a.z }; let xz2 = 0, dsm = false;
    for (let k = 0; k < 10; k++) { a.react('swat'); tick(r, 50, (a) => { if (!dsm) { if (a.hop) dsm = true; else xz2 = Math.max(xz2, Math.hypot(a.x - Q0.x, a.z - Q0.z)); } }); }
    ok('T3d 내려오기 전 x·z 변화 <= 0.02', xz2 <= 0.02, xz2.toFixed(4));
    ok('T3e dismount 최대 1회, y 0', logOf(a, 'leave').length === 1 && a.y === 0 && !a.slot, JSON.stringify(logOf(a)));
    const tl = a.time; let early = 0; a.playManual('hoodLoaf'); tick(r, 300, () => { if (a.slot) early++; }); // 쿨다운(90초) 안 재진입 시도는 지상 대체
    ok('T3f 90초 안 같은 지점 mount 0', early === 0 && logOf(a, 'mount').length === 1 && a.time - tl < 90, (a.time - tl).toFixed(1));
    a.time += 100; for (const k of ['sit', 'groom', 'loaf']) { a.playManual(k); tick(r, 20); } /* 사슬 규칙: 최근 3개 행동이 다른 것이어야 */ a.playManual('hoodLoaf'); tick(r, 1000); ok('T3g 쿨다운 뒤에는 다시 오른다', logOf(a, 'mount').length === 2, logOf(a, 'mount').length);
    ok('T3h T1 위반 0', r.viol.length === 0, v3(r));
    // 4) T4: 츄르 — on 지점에서 y 유지, dismount 0
    a = mk(); a.playManual('hoodLoaf'); r = rec(a); toOn(r); const yy = a.y; a.react('eat_churu'); let yChanged = false; tick(r, 100, (a) => { if (a.y !== yy) yChanged = true; });
    ok('T4 츄르 동안 a.y 유지·dismount 0', !yChanged && logOf(a, 'leave').length === 0 && a.slot && a.slot.state === 'on');
    // 5) T5: 접근점 막힘 포기
    a = mk(); app.s.obstacles.push({ x: ap.ax, z: ap.az, r: 0.7 }); r = rec(a); a.playManual('hoodLoaf'); tick(r, 400);
    ok('T5a 접근점 막힘: 오르지 않고 포기·점유 없음', r.maxY === 0 && !a.slot && !X.propOccupant('car0:hood') && logOf(a, 'mount').length === 0);
    ok('T5b 위치 대입 0 (T1 위반 0)', r.viol.length === 0, v3(r));
    a = mk(); a.x = -2.0; a.z = 0.8; r = rec(a); a.playManual('hoodLoaf'); tick(r, 20); app.s.obstacles.push({ x: ap.ax, z: ap.az, r: 0.7 });
    tick(r, 1200);
    ok('T5c 걷던 중 막힘: 제한 시간 안에 포기(지점 쿨다운)·점유 없음', a.pm && a.pm.cool['car0:hood'] > 0 && !a.slot && !X.propOccupant('car0:hood') && r.maxY === 0 && r.viol.length === 0, v3(r));
    // 6) T2·T6: 30분 가속 시뮬 (세계 시계). 고양이 id 를 바꿔 여러 마리 분량
    let mountsTotal = 0, winMax = 0, chainBad = 0, simViol = 0, entriesN = 0;
    for (let c = 0; c < 6; c++) {
      a = mk(); a.manual = false; a.cat.id = 'sim' + c; X.Clock.cache.clear(); a.pm = null;
      const t0 = Date.UTC(2026, 9, 10, 3 + c, 0); a.enterClock(t0); a.sim = true; a.simNow = t0;
      const keys = []; const bf = a.beginEntry.bind(a); a.beginEntry = (e, rs) => { if (!rs) keys.push(e.key); return bf(e, rs); };
      for (let i = 0; i < 18000; i++) { a.update(0.1); if (a.y > 0 && !a.slot) simViol++; }
      const ms = logOf(a, 'mount').map((e) => e.t); mountsTotal += ms.length;
      for (const t of ms) winMax = Math.max(winMax, ms.filter((u) => u >= t && u < t + 300).length);
      entriesN += keys.length;
      for (let i = 0; i < keys.length; i++) if (keys[i] === 'hoodLoaf' || keys[i] === 'underHide') for (let j = i + 1; j <= i + 3 && j < keys.length; j++) if (keys[j] === keys[i]) chainBad++;
      a.sim = false; a.beginEntry = bf;
    }
    ok('T2 임의 5분 창 mount <= 2 (총 ' + mountsTotal + '회, 행동 ' + entriesN + '개)', mountsTotal > 0 && winMax <= 2, 'winMax ' + winMax);
    ok('T6 같은 (행동,지점) 쌍이 최근 3개 안 재등장 0', chainBad === 0 && simViol === 0, 'chain ' + chainBad + ' simViol ' + simViol);
    // 7) T7: 복원 예외 — enterClock 직후 지점 착석 상태(첫 프레임 예외), 그 뒤 프레임부터 T1
    a = mk(); a.manual = false; a.cat.id = 'sim0'; X.Clock.cache.clear(); a.pm = null; let rest = null;
    outer: for (let h = 0; h < 96; h++) { const t = Date.UTC(2026, 9, 10, 0, 0) + h * 1800000; for (const e of X.Clock.between(a.cat, t, t + 1800000)) if (e.key === 'hoodLoaf' && e.t1 - e.t0 >= 90000) { for (const off of [20, 26, 32, 38, 44]) { a.enterClock(e.t0 + off * 1000); if (a.slot && a.slot.state === 'on') { rest = { e, off }; break outer; } } } }
    ok('T7a 복원 직후 이미 본네트 위(첫 프레임 예외)', rest && Math.abs(a.y - 0.42) < 1e-6, rest ? rest.off : 'none');
    if (rest) { a.sim = false; r = rec(a); a.manual = true; tick(r, 100); ok('T7b 두 번째 프레임부터 T1 위반 0', r.viol.length === 0, v3(r)); }
    // 8) T8: 오브젝트 제거 — 안·위의 고양이가 먼저 나온 뒤 제거 (<= 2초)
    for (const act of ['hoodLoaf', 'underHide']) {
      a = mk(); a.playManual(act); r = rec(a); toOn(r); const mounted = a.slot && (a.slot.state === 'on' || a.slot.state === 'under');
      app.propsRemove('car0'); let n = 0, gone = false; while (n < 120 && !gone) { tick(r, 1); app.propsRemoveTick(); n++; gone = !app.s.obstacles.some((o) => o.id === 'car0'); }
      const hasGroup = app.s.env.children.some((c) => c.userData.propId === 'car0');
      ok('T8 ' + act + ' 제거 지연 <= 2초, 지상, 그룹 제거', mounted && gone && n * DT <= 2.0 && a.y === 0 && !a.slot && !hasGroup && r.viol.length === 0, `mounted ${mounted} 지연 ${(n * DT).toFixed(2)}s viol ${v3(r)}`);
    }
    // 11) M4-4 O2-2: (a) 만남·놀러가기 시작 때 지점 위 고양이는 도약으로 내려온 뒤 참여 / flee 뒤 차 밑 / (b) 숨은 채 츄르 / (c) 비 오면 차 밑이 비 피할 자리
    { const from = app.dong.c === '11' ? '26' : '11', rn = Date.now;
      for (const act of ['hoodLoaf', 'underHide']) {
        a = mk(); a.playManual(act); r = rec(a); toOn(r); const y0 = a.y, ap0 = X.propSlots(act)[0];
        app.forceVisit(from, 'friend'); const E = app.enc; E.wall = false; E.paused = false; let first = null, n = 0, vis = 0;
        for (; n < 400 && (a.slot || n < 2); n++) { tick(r, 1, () => { E.step(DT); E.guest.update(DT); }); if (n === 0) first = a.y; }
        ok('11a ' + act + ' 만남 시작: 지점을 도약·낮은 걸음으로 내려온 뒤 참여(지상, 점유 해제, 첫 프레임 y 유지)', !a.slot && a.y === 0 && !X.propOccupant(ap0.key) && Math.abs(first - y0) < 0.2 && logOf(a, 'leave').length === 1 && r.viol.length === 0, `n ${n} first ${first} viol ${v3(r)}`);
        tick(r, 200, () => { E.step(DT); E.guest.update(DT); }); ok('11a2 ' + act + ' 내려온 뒤 만남 진행·T1 위반 0·같은 지점 쿨다운', a.enc === E && r.viol.length === 0 && a.pm.cool[ap0.key] > a.time, v3(r));
        app.abortEnc();
      }
      a = mk(); a.playManual('hoodLoaf'); r = rec(a); toOn(r); app.forceAway(); for (let i = 0; i < 80 && a.slot; i++) tick(r, 1);
      ok('11b 놀러가기 시작: 지점에서 도약으로 내려온 뒤 걸어 나감', !a.slot && a.y === 0 && r.viol.length === 0 && logOf(a, 'leave').length === 1, v3(r)); app.returnNow(); app.abortEnc && app.abortEnc();
      // flee 뒤 숨기: 진 쪽이 주인이 되는 만남을 찾는다 (Date.now 를 밀어 시도마다 다른 시드)
      let found = null; a = mk(); a.p.bold = 0; a.p.grumpy = 0;
      for (let i = 0; i < 60 && !found; i++) { Date.now = () => rn() + i * 997; app.forceVisit(from, 'fight'); if (app.enc && app.enc.loser === 'host' && app.enc.hideKey) found = app.enc; else app.abortEnc(); }
      Date.now = rn;
      ok('11c 진 쪽이 주인인 싸움에서 숨는 지점(차 밑) 정해짐', !!found); 
      if (found) { const E = found; E.wall = false; E.paused = false; r = rec(a); let under = 0; E.done = false;
        for (let i = 0; i < 2600 && !under; i++) { tick(r, 1, () => { if (!E.done) { E.step(DT); E.guest.update(DT); } }); if (a.slot && a.slot.state === 'under') under = 1; }
        ok('11d 만남 뒤 차 밑으로 숨음(걸어서, T1 위반 0)', under === 1 && a.y === 0 && logOf(a, 'mount').length === 1 && r.viol.length === 0, `under ${under} viol ${v3(r)}`); }
      // (b) 숨은 상태 츄르: 걸어 나와 받음, 다시 들어가지 않음. 쓰다듬기는 그 자리 반응
      a = mk(); a.playManual('underHide'); r = rec(a); toOn(r); const sx = a.x, sz = a.z, ap = X.propSlots('underHide')[0];
      a.react('swat'); tick(r, 60); ok('11e 숨은 채 쓰다듬기: 그 자리 반응(위치 불변·점유 유지)', Math.hypot(a.x - sx, a.z - sz) < 0.02 && a.slot && a.slot.state === 'under');
      a.react('eat_churu'); let out = false; tick(r, 400, (a) => { if (!a.slot && Math.hypot(a.x - ap.ax, a.z - ap.az) < 0.3) out = true; });
      ok('11f 숨은 채 츄르: 걸어 나와(접근점 근처) 받음·점유 해제·다시 들어가지 않음', out && !a.slot && a.y === 0 && logOf(a, 'mount').length === 1 && !X.propOccupant(ap.key) && r.viol.length === 0, `out ${out} mount ${logOf(a, 'mount').length} viol ${v3(r)}`);
      // (c) 비 피할 자리: 비 오는 날 일정에 차 밑이 들어오고, 처마 자리(S)와 한 칸에 하나뿐·쿨다운 지킴. 스위치 끄면 없음
      const sched = () => { X.Clock.cache.clear(); const cat = app.mascot.cat, t0 = Math.floor(Date.now() / 600000) * 600000, L = X.Clock.between(cat, t0, t0 + 86400000); return L; };
      const wxOld = X.Clock.wxSrc; X.Clock.wxSrc = () => ({ wx: { kind: 'rain', amt: 0.9 }, theme: 'alley' });
      app.propsSet(true, { x: 0, z: -1.1, dir: 1 }); X.Clock.wxSrc = () => ({ wx: { kind: 'rain', amt: 0.9 }, theme: 'alley' });
      let L = sched(), nU = 0, u = L.filter((e) => e.key === 'underHide'), both = u.filter((e) => e.S).length, gapBad = 0, last = -99;
      L.forEach((e, i) => { if (e.key === 'underHide') { if (i - last <= 5 && (e.U || L[last].U) && Math.floor(e.t0 / 600000) === Math.floor(L[last].t0 / 600000)) gapBad++; last = i; } }); // 같은 10분 구간 안에서 변환 항목의 반복만 센다(구간 경계의 앞 구간 이음은 기존 근사)
      const sheltered = L.filter((e) => e.S).length;
      ok('11g 비 오는 날 일정: 차 밑 후보가 들어오고 처마 자리와 겹치지 않음·최근 5개 안 반복 0', u.length > 0 && both === 0 && gapBad === 0 && sheltered > 0, `under ${u.length} S ${sheltered} both ${both} gap ${gapBad}`);
      app.propsSet(false); X.Clock.wxSrc = () => ({ wx: { kind: 'rain', amt: 0.9 }, theme: 'alley' }); L = sched();
      ok('11h 스위치 꺼짐: 차 밑 행동 없음·처마 자리는 그대로', L.every((e) => e.key !== 'underHide') && L.some((e) => e.S), `n ${L.length}`);
      X.Clock.wxSrc = wxOld; app.propsSet(true, { x: 0, z: -1.1, dir: 1 }); X.Clock.cache.clear(); }
    // 9b) 자세 높이: 차 밑 지점에서 쓰는 hideLow·peek 가 5체형 모두 틈(clear 0.20m) 안 (뼈대 최고점 + 털·귀 여유 25mm)
    { const Xp = window.__pose, V3 = app.mascot.v.mesh.position.constructor, clear = X.PROP_KINDS.car.slots[1].clear, hs = {};
      const cats = [['m', 1.5, null], ['f', 4, null], ['m', 9, null], ['f', 30, { chub: 1.16, legLen: 1.06, headSize: 1.06, earSize: 1.12 }], ['m', 60, { chub: 0.92, legLen: 0.93, headSize: 0.95, earSize: 0.9 }]];
      let worst = 0; for (const name of ['hideLow', 'peek']) for (const [sex, months, body] of cats) {
        const g = Xp.makeGenome(Xp.makeRng('chk:' + months), { sex, months }); if (body) Object.assign(g.body, body);
        const v = new Xp.CatView(g, 2), T = Xp.poseTarget(v.dim, name); v.pose = T; v.plant = T.plant; v.update(0, 0);
        let top = -9; const q = new V3(); for (const n of v.rig.list) { n.getWorldPosition(q); top = Math.max(top, q.y); }
        worst = Math.max(worst, top + 0.025); v.dispose(); }
      ok('9b hideLow·peek 최대 높이 <= clear ' + clear, worst <= clear, worst.toFixed(3)); }
    // 10) 스위치 끄면 원래대로
    app.propsSet(false); ok('10 끄면 장애물·행동 표에서 사라짐', !app.s.obstacles.some((o) => o.hx) && !X.ACTIONS.hoodLoaf && !X.ACTIONS.underHide);
    return { out };
  });
  // 9) 누수: 차가 있는 같은 지역을 10번 다시 지어도 지오메트리·텍스처 수 그대로 (렌더가 돈 뒤에 잰다)
  const memNow = () => p.evaluate(() => new Promise((res) => { window.__advance(3); setTimeout(() => res({ g: window.__app.s.renderer.info.memory.geometries, t: window.__app.s.renderer.info.memory.textures }), 900); }));
  await p.evaluate(() => window.__app.propsSet(true, { x: 0, z: -1.1, dir: 1 })); await memNow(); /* 첫 렌더 뒤 안정 */ await p.evaluate(() => window.__app.propsSet(true, { x: 0, z: -1.1, dir: 1 })); const m0 = await memNow();
  await p.evaluate(() => { for (let i = 0; i < 10; i++) window.__app.propsSet(true, { x: 0, z: -1.1, dir: 1 }); }); const memAfter = await memNow();
  let fail = 0;
  for (const [n, c, d] of R.out) { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  [' + d + ']' : '')); }
  const noLeak = memAfter.g <= m0.g + 2 && memAfter.t <= m0.t + 2;
  console.log((noLeak ? 'PASS ' : 'FAIL ') + '9 누수 0 (다시 짓기 10번 뒤 지오메트리·텍스처) ' + JSON.stringify(m0) + ' -> ' + JSON.stringify(memAfter)); if (!noLeak) fail++;
  if (errs.length) { fail++; console.log('FAIL 콘솔 오류 ' + errs.slice(0, 3).join(' | ')); }
  console.log(`props: ${R.out.filter((o) => o[1]).length}/${R.out.length} 항목 통과`);
  await b.close(); return fail === 0;
});
