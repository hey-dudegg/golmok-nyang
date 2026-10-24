// 명소 배경 가시성 측정 (R-17 시야 방식 비교): 시야 방식(A 현재·B 담 낮춤·C 카메라 위로) x 16곳에서
// 기본 시야(처음 카메라)와 고양이 근접 시야(고양이를 고른 뒤 카메라)를 고정해 그린 뒤, 배경 메시를 켰을 때와 껐을 때 픽셀이 다른 비율(%)을 잰다.
// 카메라 고정: 앱의 자동 이동(goDong 뒤 1.4초 선택 타이머·camAnim·frame 의 damp)이 끼어들지 않게 한 evaluate 안에서
//   카메라·target 을 직접 정하고 renderer.render 를 바로 두 번 부른 뒤 같은 작업 안에서 캔버스를 복사한다(타이머가 실행될 틈이 없다).
// 사용: node tests/backdrop_view.js [--size 1100x800] [--modes ABC] [--shots]   (--shots: 대표 6곳 그림을 tests/out/view/ 에 저장)
// 통과 조건: 오류 0, 측정이 끝까지 됨(가시성 수치는 판단 자료이지 합격선이 아니다). 결과 표는 tests/out/view/visibility_<크기>.json
const fs = require('fs');
const path = require('path');
const { launch, open, run, OUT, ensureDir } = require('./lib/common');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const [W, H] = arg('--size', '1100x800').split('x').map(Number), MODES = arg('--modes', 'ABC').split(''), SHOTS = process.argv.includes('--shots');
const REP = ['11', '41', '50', '51', '26', '47'];
const dir = ensureDir(path.join(OUT, 'view'));

run(`backdrop_view ${W}x${H}`, async () => {
  const b = await launch();
  const errs = [];
  const p = await open(b, `?admin&still=10&pr=0.35&shells=2&hour=12#11`, { width: W, height: H, errs, settle: 2500 });
  await p.evaluate(() => window.__lm.LandmarkData.load());
  const table = {};
  for (const mode of MODES) {
    const res = await p.evaluate((mode, REP, SHOTS) => {
      const a = window.__app, S = a.s, R = S.renderer, out = {}, shots = {};
      a.setViewMode(mode);
      const cv = document.createElement('canvas'), x = cv.getContext('2d', { willReadFrequently: true });
      const grab = () => { R.render(S.scene, S.camera); const c = R.domElement; cv.width = c.width; cv.height = c.height; x.drawImage(c, 0, 0); return x.getImageData(0, 0, cv.width, cv.height).data; };
      const diff = () => {
        const m = S.backdrop && S.backdrop.mesh; if (!m) return 0;
        const on = grab(); const url = cv.toDataURL('image/png'); m.visible = false; const off = grab(); m.visible = true;
        let n = 0; for (let i = 0; i < on.length; i += 4) if (Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]) > 24) n++;
        return [+(n * 400 / on.length).toFixed(2), url];
      };
      for (const c of Object.keys(window.__lm.LandmarkData.get().places)) {
        a.visit(c);
        a.selected = null; a.camAnim = null; S.camera.clearViewOffset();
        const cp = a.camPreset, m = a.mascot;
        S.camera.position.set(...(cp ? cp.pos : [0.0, 0.95, 3.4])); S.controls.target.set(m.x * 0.5, cp ? cp.tgtY : 0.24, m.z * 0.5 - 0.2); S.controls.update();
        const [over, u1] = diff();
        // 근접 시야: select() 의 카메라 목표와 frame 의 target 수렴값을 그대로 쓴다
        const cam = S.camera.position, dirv = { x: cam.x - m.x, z: cam.z - m.z }; let L = Math.hypot(dirv.x, dirv.z) || 1; dirv.x /= L; dirv.z /= L;
        if (dirv.z < 0.2) { dirv.z = 0.6; L = Math.hypot(dirv.x, dirv.z); dirv.x /= L; dirv.z /= L; }
        const dist = (1.05 + m.scale * 0.55) * (cp ? cp.selK : 1);
        S.camera.position.set(m.x + dirv.x * dist, 0.38 + 0.28 * m.scale + (cp ? cp.selUp : 0), m.z + dirv.z * dist);
        S.controls.target.set(m.x, 0.16 * m.scale + 0.04 + (cp ? cp.selTgtUp : 0), m.z); S.controls.update();
        const [close, u2] = diff();
        // 최대 줌아웃 시야: 기본 시야 방향 그대로 target 에서 controls.maxDistance 만큼 물러난다 (D-42)
        const cp2 = a.camPreset; S.camera.position.set(...(cp2 ? cp2.pos : [0.0, 0.95, 3.4])); S.controls.target.set(m.x * 0.5, cp2 ? cp2.tgtY : 0.24, m.z * 0.5 - 0.2);
        const tg = S.controls.target, v3 = S.camera.position.clone().sub(tg).normalize().multiplyScalar(S.controls.maxDistance); S.camera.position.copy(tg).add(v3); S.controls.update();
        const [far, u3] = diff();
        out[c] = { name: a.lmSel && a.lmSel.place ? a.lmSel.place.name : '-', theme: a.theme, over, close, far };
        if (SHOTS && REP.includes(c)) shots[c] = [u1, u2, u3];
      }
      return { out, shots };
    }, mode, REP, SHOTS);
    table[mode] = res.out;
    for (const [c, [u1, u2, u3]] of Object.entries(res.shots)) for (const [k, u] of [['over', u1], ['close', u2], ['far', u3]]) if (u) fs.writeFileSync(path.join(dir, `${mode}_${c}_${W}x${H}_${k}.png`), Buffer.from(u.split(',')[1], 'base64'));
  }
  await b.close();
  const codes = Object.keys(table[MODES[0]]);
  console.log('지역       테마    ' + MODES.map((m) => `${m}기본%  ${m}근접%  ${m}최원%`).join('  '));
  for (const c of codes) console.log(`${c} ${table[MODES[0]][c].name.slice(0, 9).padEnd(10)} ${table[MODES[0]][c].theme.padEnd(7)} ` + MODES.map((m) => `${String(table[m][c].over).padStart(6)} ${String(table[m][c].close).padStart(6)} ${String(table[m][c].far).padStart(6)}`).join('  '));
  for (const m of MODES) { const v = codes.filter((c) => table[m][c].over >= 1).length, vc = codes.filter((c) => table[m][c].close >= 1).length; console.log(`방식 ${m}: 기본 시야에서 보이는 곳(1% 이상) ${v}/16, 근접 시야 ${vc}/16, 최대 줌아웃 ${codes.filter((c) => table[m][c].far >= 1).length}/16`); }
  fs.writeFileSync(path.join(dir, `visibility_${W}x${H}.json`), JSON.stringify(table, null, 1));
  console.log('ERR', JSON.stringify(errs));
  return errs.length === 0;
});
