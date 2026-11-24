// 행동 판정 촬영 공용 도구(M20-2, R-25). 사진은 저장소 밖(기본 OS 임시 폴더/golmok_shots)에만 저장한다.
// CLI: node tests/lib/shoot_action.js --action loaf --at 0.5,2 --view side|front|back|top|3q --dist 2.4
//        [--props car@0,-1.1] [--cat 0.6,0.2] [--kitten] [--you 0,1.16] [--other x,z] [--bolt 0|1] [--skipwalk] [--port 8789] [--out 폴더] [--measure]
//   시각: 행동 시작=0초(--skipwalk면 걷기가 끝난 시점=0초). 카메라는 컷마다 마스코트 화면 위치를 따라간다(fixCamera 기본).
//   서버: --port면 static_server를 그 포트로 띄우고 끝나면 끈다. 아니면 BASE_URL(…/prototype/)을 쓴다.
//   --poses side,sit: 행동 대신 자세 전환(from,to)을 시험. AI 는 manual 로 멈추고 --at 은 전환 전체 시간의 비율(기본 0.4,0.7). --measure 에 전환 구간 minPart(+바닥보정)·엉덩이 높이 범위·출렁임 기록(M21-3)
//   --you x,z: 교감 반응(REACTIONS)으로 실행하고 youPoint를 고정. --props 가 필요한 행동에 소품이 없으면 오류로 끝낸다(AD2).
// 모듈: const { shootAction } = require('./shoot_action'); await shootAction({ action, at:[..], view, ... });
const path = require('path'), os = require('os'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..');
const VIEWS = { side: [0, 3], front: [90, 3], back: [-90, 3], top: [0, 80], '3q': [45, 20] };
// 소품이 있어야 의미 있는 행동(없으면 앱이 벽 쪽 대체 동작을 해서 오판 위험, AD2)
const NEEDS = { cheekRub: 'car', sniffProp: 'car', underHide: 'car', fleeHide: 'car', crateNap: 'crate', giftPeek: 'gift', headBump: 'car', giftSniff: 'gift' }; // headBump 는 물건 모서리(차), giftSniff 는 선물 상자. 도구는 상자를 따로 못 놓고 --props gift@x,z 로만 받는다
const num = (s) => String(s).split(',').map(Number);

async function shootAction(o) {
  const { poses = null } = o; // at 기본값이 poses 를 보므로 먼저 꺼낸다
  const { at = poses ? [0.4, 0.7] : [0], view = 'side', dist = 2.4, props = [], cat = [0, 0], kitten = false, you = null, other = null, bolt = null, skipwalk = false, port, out, measure = false } = o;
  const action = poses ? poses.join('_to_') : o.action;
  if (!action) throw new Error('--action 필요');
  if (!VIEWS[view]) throw new Error('--view 는 ' + Object.keys(VIEWS).join('|'));
  const outDir = path.resolve(out || path.join(os.tmpdir(), 'golmok_shots'));
  const rel = path.relative(ROOT, outDir);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) throw new Error('--out 이 저장소 안입니다: ' + outDir);
  if (!poses && NEEDS[action] && !you && !props.some((q) => Math.hypot(q.x - cat[0], q.z - cat[1]) < 3)) throw new Error(action + ' 은 ' + NEEDS[action] + ' 소품이 고양이 근처(3m 안)에 필요: --props ' + NEEDS[action] + '@x,z --cat x,z' + '');
  fs.mkdirSync(outDir, { recursive: true });
  let srv = null;
  if (port) { srv = await require('./static_server').startServer(+port); process.env.BASE_URL = srv.baseUrl; }
  const { launch, open, wait } = require('./common'); // BASE_URL 은 common 로드 때 읽는다
  const { fixCamera, hidePanels, shoot } = require('./capture');
  const b = await launch(), files = [], lines = [];
  try {
    const errs = [];
    const p = await open(b, '?admin&props=1&still=2&pr=0.3&shells=2&hour=13#11', { width: 390, height: 800, errs, settle: 2000 });
    const r0 = await p.evaluate(async (action, props, cat, kitten, you, skipwalk, poses, other, bolt) => {
      const app = window.__app, X = window.__props;
      for (const pr of props) if (!['car', 'gift', 'crate', 'wall', 'tower'].includes(pr.kind)) return { err: '소품 종류는 car·gift·crate·wall·tower 만 배치 가능: ' + pr.kind };
      const car = props.find((q) => q.kind === 'car'), cr = props.find((q) => q.kind === 'crate'), gf = props.find((q) => q.kind === 'gift'), wl = props.find((q) => q.kind === 'wall'), tw = props.find((q) => q.kind === 'tower');
      const force = { x: car ? car.x : 0, z: car ? car.z : -1.1, dir: 1 }; if (cr) force.crate = { x: cr.x, z: cr.z }; if (wl) force.wall = { x: wl.x, z: wl.z }; if (tw) force.tower = { x: tw.x, z: tw.z }; X.HOP.bolt = bolt; // wall=낮은 담, tower=캣타워, bolt=상자 뛰쳐나오기 고정(null=확률)
      if (!poses) app.propsSet(true, force);
      const a = app.mascot; window.__A = a; // propsSet 이 마스코트를 새로 만들므로 그 뒤에 잡는다(먼저 잡으면 장면 밖 옛 고양이를 움직여 컷이 모두 같았음, M21-3)
      if (gf) { const n = X.Box.now(); X.Box.set({ code: '11', id: 'gshoot', placed: n - 1000, until: n + 3600000, seed: 7, name: null, mine: false }, 'recv'); } // 선물 상자: props_gift.js 와 같은 가짜 수신 경로 (자리는 앱이 정함)
      if (gf) { for (let i = 0; i < 24 && !X.PROPS.layout.find((q) => q.id === 'gift0' && !q.gone); i++) await new Promise((r) => setTimeout(r, 250)); await new Promise((r) => setTimeout(r, 500)); if (!X.PROPS.layout.find((q) => q.id === 'gift0')) return { err: '선물 상자가 장면에 나타나지 않음' }; }
      if (app.enc) app.abortEnc(); if (app.away) app.returnNow();
      a.kitten = !!kitten; if (!kitten) a.cat.g.months = 36; app.world.day = 1; app.world.night = 0;
      X.Clock.cache.clear(); X.resetSlot(a); X.PROPS.claims.clear();
      a.steps = []; a.step = null; a.move = null; a.arrived = true; a.x = cat[0]; a.z = cat[1]; a.manual = true; a.pm = null;
      a.setPose('stand'); for (let i = 0; i < 60; i++) a.update(1 / 30);
      a.manual = false;
      if (poses) { a.manual = true; a.setPose(poses[0]); a.snapPose(); for (let i = 0; i < 90; i++) a.update(1 / 30); a.setPose(poses[1]); const pq = a.pq; window.__T = pq.wait + pq.q.reduce((x, q) => x + q.hold, 0) + 0.5; window.__S = { lo: 9, hMin: 9, hMax: -9, hips: [] }; return { ok: 1, T: window.__T, stages: pq.q.length + 1 }; }
      if (you) { app.world.youPoint = () => ({ x: you[0], z: you[1] }); a.react(action); }
      else {
        try { a.runAction(action, false); } catch (e) { return { err: action + ' 실행 실패(소품·자세 조건 확인): ' + e.message }; }
        if (!a.steps.length || a.action !== action) return { err: action + ' 시작 안 됨: 필요한 소품(예: --props car@x,z)이 고양이 근처에 있는지 확인' };
      }
      if (other) app.world.agents.push({ x: other[0], z: other[1], hidden: false, cat: { id: 'other_shoot', mother: null }, update() {} }); // 이웃 고양이 자리(--other): 가짜 에이전트, 거리·가족 판정용(M23-4b)
      a.override = true;
      if (skipwalk) for (let i = 0; i < 900 && (a.move || a.arrived === false); i++) a.update(1 / 30);
      return { ok: 1, props: (X.PROPS.layout || []).length };
    }, action, props, cat, kitten, you, skipwalk, poses, other, bolt);
    if (r0.err) throw new Error(r0.err);
    await hidePanels(p);
    const [yaw, pitch] = VIEWS[view]; let t = 0;
    if (poses) lines.push(`${action} 전환 길이 T=${r0.T.toFixed(2)}s 단계=${r0.stages}`);
    for (const tt0 of at) {
      const tt = poses ? +(tt0 * r0.T).toFixed(2) : tt0;
      const m = await p.evaluate((n) => {
        const a = window.__A, S = window.__S; for (let i = 0; i < n; i++) { a.update(1 / 30); if (S) { const v = a.v, L = v.rig.list; let q = 9; for (let j = 0; j < L.length; j++) q = Math.min(q, v.minPart[j]); const lw = q + (v.hFinal || 0), hw = v.minPart[0] + (v.hFinal || 0); S.lo = Math.min(S.lo, lw); S.hips.push(hw); } }
        const v = a.v, L = v.rig.list; let lo = 9, nm = '';
        L.forEach((q, i) => { if (v.minPart[i] < lo) { lo = v.minPart[i]; nm = q.name; } });
        return { lo: +lo.toFixed(3), nm, x: +v.root.position.x.toFixed(2), z: +v.root.position.z.toFixed(2), h: +(v.hFinal || 0).toFixed(3) };
      }, Math.round((tt - t) * 30));
      t = tt;
      await fixCamera(p, { dist, yaw, pitch });
      const f = path.join(outDir, `${action}_${poses ? 'r' + tt0 : tt}_${view}.png`);
      await shoot(p, f); files.push(f);
      if (measure) lines.push(`${action} t=${tt} minPart=${m.lo}(${m.nm}) cat=${m.x},${m.z} h=${m.h}`);
    }
    if (poses && measure) {
      const S = await p.evaluate(() => window.__S), H = S.hips; let run = -9, dd = 0; for (const h of H) { run = Math.max(run, h); dd = Math.max(dd, run - h); }
      lines.push(`${action} 전환구간 minPart(바닥보정)=${S.lo.toFixed(3)} 엉덩이 ${Math.min(...H).toFixed(3)}~${Math.max(...H).toFixed(3)} 최대되내림=${dd.toFixed(3)} 보정되내림=${(dd - Math.max(0, H[0] - H[H.length - 1])).toFixed(3)} (프레임 ${H.length}, 컷 마지막까지)`);
    }
    if (errs.length) lines.push('페이지 오류 ' + errs.length + '건: ' + String(errs[0]).slice(0, 100));
  } finally { await b.close(); if (srv) await srv.close(); }
  return { files, lines };
}

function parse(argv) {
  const o = { props: [] }, g = (i) => argv[i + 1];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--action') o.action = g(i++); else if (k === '--poses') o.poses = g(i++).split(','); else if (k === '--at') o.at = num(g(i++)); else if (k === '--view') o.view = g(i++);
    else if (k === '--dist') o.dist = +g(i++); else if (k === '--cat') o.cat = num(g(i++)); else if (k === '--you') o.you = num(g(i++)); else if (k === '--other') o.other = num(g(i++)); else if (k === '--bolt') o.bolt = +g(i++);
    else if (k === '--port') o.port = g(i++); else if (k === '--out') o.out = g(i++); else if (k === '--kitten') o.kitten = true;
    else if (k === '--measure') o.measure = true; else if (k === '--skipwalk') o.skipwalk = true; else if (k === '--admin') { /* 항상 admin */ }
    else if (k === '--props') for (const s of g(i++).match(/[a-z]+@-?[\d.]+,-?[\d.]+|[a-z]+(?!@)/g) || []) { const [kind, xz] = s.split('@'), [x, z] = num(xz || '0,0'); o.props.push({ kind, x, z }); }
    else throw new Error('모르는 옵션 ' + k);
  }
  return o;
}

if (require.main === module) {
  shootAction(parse(process.argv.slice(2))).then((r) => { r.lines.forEach((l) => console.log(l)); r.files.forEach((f) => console.log(f)); process.exit(0); })
    .catch((e) => { console.error('오류: ' + e.message); process.exit(1); });
}
module.exports = { shootAction, parse };
