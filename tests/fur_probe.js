// 털 측정 도구(M1-14에서 시작, M2-3 정리): 정면 얼굴 0.7m·옆 2m 촬영(shots) 또는 지지직 변화율(flicker: 0.5화소씩 돈 인접 프레임의 털 영역 변화율 %).
// 사용: node tests/fur_probe.js --mode shots|flicker --tag x --variants roll,d0.8 --aa 1|0 [--view 390x800x2] [--seed 문자열]
// 변형: roll=기준 밀도, d<배율>=기준 밀도의 배율(d0.8, d0.85, d0.7 ...). 고정 시드 고양이를 직접 만들어 쓰므로 실행 간 비교도 된다(같은 하드웨어·브라우저일 때).
// 구도: 고양이를 'sit' 자세로 안정시킨 뒤 머리 기준으로 카메라를 둔다. 앱 코드는 ?admin의 __pose 노출만 쓴다.
const fs = require('fs'); const path = require('path');
const { launch, open, run, OUT, ensureDir } = require('./lib/common');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const tag = arg('tag', 'x'), mode = arg('mode', 'shots'), AA = arg('aa', '1') === '1', variants = arg('variants', 'roll,d0.8').split(','), seedStr = arg('seed', 'fur_probe');
const [W, H, PR] = arg('view', '390x800x2').split('x').map(Number);
const dir = ensureDir(path.join(OUT, 'fur_probe'));
run(`fur_probe ${mode} ${tag} aa=${+AA}`, async () => {
  const b = await launch(); const errs = [];
  const before = AA ? null : async (pg) => { await pg.evaluateOnNewDocument(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { return g.call(this, t, Object.assign({}, o, { antialias: false })); }; }); };
  const p = await open(b, `?admin&still=20&pr=${PR}` + (arg("hour", "") ? `&hour=${arg("hour")}` : ""), { width: W, height: H, errs, settle: 3000, before });
  const res = await p.evaluate(async (variants, mode, seedStr) => {
    const a = window.__app, S = a.s, R = S.renderer, X = window.__pose, out = { shots: {}, flick: {} };
    // 고정 고양이: 실행마다 달라지는 앱의 고양이 대신 고정 시드로 직접 만든다(같은 털·몸). 앱의 다른 고양이는 숨긴다.
    const g = X.makeGenome(X.makeRng(seedStr), { sex: 'f', months: 24 });
    const v = new X.CatView(g, a.shells); S.scene.add(v.root);
    a.views.forEach((q) => { q.root.visible = false; });
    v.root.visible = true; const T = X.poseTarget(v.dim, 'sit'); v.pose = T; v.plant = T.plant;
    for (let i = 0; i < 80; i++) v.update(0.05, 0.05);
    a.selected = null; a.camAnim = null; S.camera.clearViewOffset(); S.controls.enabled = false;
    const gl = R.getContext(); out.samples = gl.getParameter(gl.SAMPLES);
    const V3 = S.camera.position.constructor, mat = v.mat;
    const head = v.rig.list[3]; head.updateWorldMatrix(true, false);
    const hp = head.getWorldPosition(new V3()), fwd = new V3(0, 0, 1).transformDirection(head.matrixWorld); fwd.y = 0; fwd.normalize();
    const side = new V3(fwd.z, 0, -fwd.x);
    const views = { face: [hp.clone(), fwd.clone().multiplyScalar(0.7).add(new V3(0, 0.03, 0))], mid: [hp.clone().add(new V3(0, -0.15, 0)), side.clone().multiplyScalar(2.0).add(new V3(0, 0.5, 0))] };
    const put = (name, yaw) => { const [tg, off] = views[name], c = Math.cos(yaw), s = Math.sin(yaw); S.camera.position.set(tg.x + off.x * c + off.z * s, tg.y + off.y, tg.z - off.x * s + off.z * c); S.controls.target.copy(tg); S.camera.lookAt(tg); };
    const cv = document.createElement('canvas'), x2 = cv.getContext('2d', { willReadFrequently: true });
    const grab = () => { R.render(S.scene, S.camera); const c = R.domElement; cv.width = c.width; cv.height = c.height; x2.drawImage(c, 0, 0); return x2.getImageData(0, 0, cv.width, cv.height).data; };
    // 변형 = 털 밀도 절대값. 앱의 기기별 배율(FUR_DENSITY_K)·?fur 스위치에 의존하지 않도록 기준(620/sqrt(scale))에 직접 곱한다.
    const base = 620 / Math.sqrt(v.dim.scale);
    const fovPx = 2 * Math.tan(S.camera.fov * Math.PI / 360) / R.domElement.clientHeight;
    for (const vr of variants) {
      const dens = vr === 'roll' ? 1 : +vr.slice(1);
      if (!(dens > 0)) throw new Error('변형 이름은 roll 또는 d<배율>(예 d0.8): ' + vr);
      mat.uniforms.density.value = base * dens;
      for (const name of ['face', 'mid']) {
        if (mode === 'shots') { put(name, 0); R.render(S.scene, S.camera); out.shots[vr + '_' + name] = R.domElement.toDataURL('image/png'); continue; }
        put(name, 0); v.root.visible = false; const E = grab(); v.root.visible = true;
        let tot = 0, n = 0, prev = null;
        for (let i = 0; i < 4; i++) {
          put(name, fovPx * 0.5 * i * (name === 'face' ? 0.7 : 2.0) * 0 + (fovPx * 0.5 * i)); const A = grab();
          if (prev) for (let j = 0; j < A.length; j += 4) if (Math.abs(A[j] - E[j]) + Math.abs(A[j + 1] - E[j + 1]) + Math.abs(A[j + 2] - E[j + 2]) > 24) {
            n++; if (Math.abs(A[j] - prev[j]) + Math.abs(A[j + 1] - prev[j + 1]) + Math.abs(A[j + 2] - prev[j + 2]) > 30) tot++;
          }
          prev = A;
        }
        out.flick[vr + '_' + name] = +(tot * 100 / Math.max(n, 1)).toFixed(2);
      }
    }
    return out;
  }, variants, mode, seedStr);
  console.log('samples=' + res.samples);
  for (const [k, u] of Object.entries(res.shots)) fs.writeFileSync(path.join(dir, `${tag}_aa${+AA}_${k}.png`), Buffer.from(u.split(',')[1], 'base64'));
  if (mode === 'flicker') console.log(JSON.stringify(res.flick));
  await b.close();
  if (errs.length) { console.log('오류', errs.slice(0, 3)); return false; }
  return true;
});
