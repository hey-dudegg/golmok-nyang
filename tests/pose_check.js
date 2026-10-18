// 자세 바닥 뚫림 검사: 모든 자세 x 5개 체형의 부위별 최저점(mm, 음수=바닥 아래)과 뒷다리-앞다리 겹침 깊이(mm).
// 사용: node tests/pose_check.js [after|before] [--baseline]
//   after  : 바닥 보정을 켠 실제 상태 (기본). 뚫린 칸 0이어야 통과
//   before : 바닥 보정을 끈 상태(참고용)
//   --baseline : 결과를 tests/baseline/pose_<mode>.json 으로 저장. 기준 파일이 있으면 매번 같은지 비교한다
const fs = require('fs');
const path = require('path');
const { launch, open, run, OUT, BASELINE, ensureDir } = require('./lib/common');

const mode = process.argv.includes('before') ? 'before' : 'after';
const saveBase = process.argv.includes('--baseline');
const GN = ['head', 'ear', 'chest', 'hips', 'front', 'hind', 'tail'];

run('pose_check ' + mode, async () => {
  const b = await launch();
  const errs = [];
  const p = await open(b, '?admin&still=2&pr=0.3&shells=2', { width: 400, height: 300, errs, settle: 2500 });
  const res = await p.evaluate((mode) => {
    const X = window.__pose, V3 = window.__app.mascot.v.mesh.position.constructor;
    const cats = [
      ['m1.5mo', 'm', 1.5, null], ['f4mo', 'f', 4, null], ['m9mo', 'm', 9, null],
      ['f30fat', 'f', 30, { chub: 1.16, legLen: 1.06, headSize: 1.06, earSize: 1.12 }],
      ['m60slim', 'm', 60, { chub: 0.92, legLen: 0.93, headSize: 0.95, earSize: 0.9 }],
    ];
    const grp = (i) => (i === 3 ? 0 : i === 4 || i === 5 ? 1 : i === 1 || i === 2 ? 2 : i === 0 ? 3 : i >= 6 && i <= 9 ? 4 : i >= 10 && i <= 13 ? 5 : 6);
    const segDist = (p1, q1, p2, q2) => {
      const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
      const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), bb = d1.dot(d2), den = a * e - bb * bb;
      const cl = (x) => Math.min(1, Math.max(0, x));
      let s = den > 1e-12 ? cl((bb * f - c * e) / den) : 0, t = (bb * s + f) / (e || 1e-9);
      if (t < 0) { t = 0; s = cl(-c / (a || 1e-9)); } else if (t > 1) { t = 1; s = cl((bb - c) / (a || 1e-9)); }
      return p1.clone().addScaledVector(d1, s).sub(p2.clone().addScaledVector(d2, t)).length();
    };
    const out = {};
    for (const name of Object.keys(X.POSES)) {
      out[name] = [];
      for (const [label, sex, months, body] of cats) {
        const g = X.makeGenome(X.makeRng('chk:' + label), { sex, months });
        if (body) Object.assign(g.body, body);
        const v = new X.CatView(g, 2);
        if (mode === 'before') v.ground = false;
        const T = X.poseTarget(v.dim, name); v.pose = T; v.plant = T.plant;
        v.update(0, 0);
        v.lowest(); // 보정이 끝난 자세에서 부위별 최저 y
        const low = new Array(7).fill(9);
        for (let i = 0; i < v.rig.list.length; i++) low[grp(i)] = Math.min(low[grp(i)], v.minPart[i]);
        // 다리 뼈대 겹침 (몸 좌표, 반지름 합 - 거리)
        const R = v.rig, d = v.dim;
        const W = (node, x, y, z) => new V3(x, y, z).applyMatrix4(node.matrixWorld).applyMatrix4(v.inv);
        const fr = [], hd = [];
        for (const s of ['L', 'R']) {
          fr.push([W(R['sh' + s], 0, 0, 0), W(R['el' + s], 0, 0, 0), 0.027 + 0.004], [W(R['el' + s], 0, 0, 0), W(R['el' + s], 0, -d.ll, 0.008), 0.024]);
          hd.push({ thigh: [W(R['hip' + s], 0, 0, 0), W(R['kn' + s], 0, 0, 0), 0.04], shin: [W(R['kn' + s], 0, 0, 0), W(R['kn' + s], 0, -d.hl, 0.011), 0.024] });
        }
        let shin = -9, thigh = -9;
        for (const h of hd) for (const f of fr) {
          shin = Math.max(shin, h.shin[2] + f[2] - segDist(h.shin[0], h.shin[1], f[0], f[1]));
          thigh = Math.max(thigh, h.thigh[2] + f[2] - segDist(h.thigh[0], h.thigh[1], f[0], f[1]));
        }
        out[name].push({ label, low: low.map((x) => Math.round(x * 10000) / 10), shin: Math.round(shin * 10000) / 10, thigh: Math.round(thigh * 10000) / 10 });
      }
    }
    return out;
  }, mode);
  await b.close();
  const json = JSON.stringify(res);
  fs.writeFileSync(path.join(ensureDir(OUT), 'pose_' + mode + '.json'), json);
  const TOL = -6.5; // mm: 피부가 5mm까지 눌리는 건 허용(털 두께)
  let bad = 0, cells = 0;
  console.log('mode=' + mode + '  (단위 mm. low=가장 낮은 부위 높이, 음수는 바닥 아래. 판정 기준 ' + TOL + 'mm 미만이면 뚫림)');
  console.log('pose      | ' + res.stand.map((c) => c.label.padEnd(9)).join('| ') + '| 최악 부위 | 다리겹침 shin/thigh 최대');
  for (const [name, arr] of Object.entries(res)) {
    let worst = 99, wp = '', sh = -99, th = -99;
    const row = arr.map((c) => { cells++; const m = Math.min(...c.low); const gi = c.low.indexOf(m); if (m < worst) { worst = m; wp = GN[gi]; } sh = Math.max(sh, c.shin); th = Math.max(th, c.thigh); if (m < TOL) bad++; return (m < TOL ? '*' : ' ') + m.toFixed(1).padStart(7); });
    console.log(name.padEnd(9) + ' |' + row.join(' |') + ' | ' + wp.padEnd(6) + ' | ' + sh.toFixed(1) + ' / ' + th.toFixed(1));
  }
  console.log(`뚫린 칸 수(자세x체형 ${cells} 중):`, bad, '  ERR', JSON.stringify(errs));
  const bf = path.join(BASELINE, 'pose_' + mode + '.json');
  let same = true;
  if (saveBase) { fs.writeFileSync(path.join(ensureDir(BASELINE), 'pose_' + mode + '.json'), json + '\n'); console.log('기준값 저장:', path.relative(process.cwd(), bf)); }
  else if (fs.existsSync(bf)) { same = fs.readFileSync(bf, 'utf8').trim() === json; console.log('기준값과 같음:', same); }
  return !errs.length && same && (mode === 'before' || bad === 0);
});
