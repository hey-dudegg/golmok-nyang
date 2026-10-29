// M1-14 털 후보 비교(고정 구도): 정면 얼굴 0.7m·옆 2m 촬영(shots) 또는 지지직 변화율(flicker, 0.5화소씩 돈 인접 프레임의 털 영역 변화율 %).
// 사용: node tests/fur_m114.js --mode shots|flicker --tag x --variants roll,a,b,c --aa 1|0 [--view 390x800x2]
// 변형은 런타임에 셰이더 문자열을 치환해 만든다(롤백 셰이더 기준). 구도 고정: 일정을 끄고(ext) 'sit' 자세로 안정시킨 뒤 머리 기준으로 카메라를 둔다.
const fs = require('fs'); const path = require('path');
const { launch, open, run, OUT, ensureDir } = require('./lib/common');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const tag = arg('tag', 'x'), mode = arg('mode', 'shots'), AA = arg('aa', '1') === '1', variants = arg('variants', 'roll').split(',');
const [W, H, PR] = arg('view', '390x800x2').split('x').map(Number);
const dir = ensureDir(path.join(OUT, 'fur_m114'));
run(`fur_m114 ${mode} ${tag} aa=${+AA}`, async () => {
  const b = await launch(); const errs = [];
  const before = AA ? null : async (pg) => { await pg.evaluateOnNewDocument(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { return g.call(this, t, Object.assign({}, o, { antialias: false })); }; }); };
  const p = await open(b, `?admin&still=20&pr=${PR}` + (arg("hour", "") ? `&hour=${arg("hour")}` : ""), { width: W, height: H, errs, settle: 3000, before });
  const res = await p.evaluate(async (variants, mode) => {
    const a = window.__app, S = a.s, R = S.renderer, m0 = a.mascot, v = a.views[0], out = { shots: {}, flick: {} };
    m0.ext = true; m0.hidden = false; v.root.visible = true; m0.setPose('sit'); for (let i = 0; i < 80; i++) m0.update(0.05);
    a.selected = null; a.camAnim = null; S.camera.clearViewOffset(); S.controls.enabled = false;
    const g = R.getContext(); out.samples = g.getParameter(g.SAMPLES);
    const V3 = S.camera.position.constructor, mats = a.views.map((q) => q.mat);
    const head = v.rig.list[3]; head.updateWorldMatrix(true, false);
    const hp = head.getWorldPosition(new V3()), fwd = new V3(0, 0, 1).transformDirection(head.matrixWorld); fwd.y = 0; fwd.normalize();
    const side = new V3(fwd.z, 0, -fwd.x);
    const views = { face: [hp.clone(), fwd.clone().multiplyScalar(0.7).add(new V3(0, 0.03, 0))], mid: [hp.clone().add(new V3(0, -0.15, 0)), side.clone().multiplyScalar(2.0).add(new V3(0, 0.5, 0))] };
    const put = (name, yaw) => { const [tg, off] = views[name], c = Math.cos(yaw), s = Math.sin(yaw); S.camera.position.set(tg.x + off.x * c + off.z * s, tg.y + off.y, tg.z - off.x * s + off.z * c); S.controls.target.copy(tg); S.camera.lookAt(tg); };
    const cv = document.createElement('canvas'), x2 = cv.getContext('2d', { willReadFrequently: true });
    const grab = () => { R.render(S.scene, S.camera); const c = R.domElement; cv.width = c.width; cv.height = c.height; x2.drawImage(c, 0, 0); return x2.getImageData(0, 0, cv.width, cv.height).data; };
    const fs0 = mats[0].fragmentShader, d0 = mats.map((q) => q.uniforms.density.value);
    const OUTL = 'gl_FragColor = vec4(c, 1.0);', DISC = 'if (alpha < max(ign, 0.02)) discard;';
    const code = {
      roll: [fs0, false, 1],
      a: [fs0.replace(DISC, 'alpha = clamp(alpha + (ign - 0.5) * 0.5, 0.0, 1.0); if (alpha < 0.004) discard;').replace(OUTL, 'gl_FragColor = vec4(c, alpha);'), true, 1],
      a0: [fs0.replace(DISC, 'if (alpha < 0.004) discard;').replace(OUTL, 'gl_FragColor = vec4(c, alpha);'), true, 1],
      a2: [fs0.replace(DISC, 'alpha = clamp(alpha + (ign - 0.5) * 1.0, 0.0, 1.0); if (alpha < 0.004) discard;').replace(OUTL, 'gl_FragColor = vec4(c, alpha);'), true, 1],
      b: [fs0.replace(DISC, 'if (alpha < 0.5) discard;'), false, 1],
      c: [fs0, false, 0.7], c8: [fs0, false, 0.8], c85: [fs0, false, 0.85],
    };
    const fovPx = 2 * Math.tan(S.camera.fov * Math.PI / 360) / R.domElement.clientHeight;
    for (const vr of variants) {
      const [fsv, a2c, dens] = code[vr];
      mats.forEach((q, i) => { q.fragmentShader = fsv + '\n// ' + vr; q.alphaToCoverage = a2c; q.uniforms.density.value = d0[i] * dens; q.needsUpdate = true; });
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
  }, variants, mode);
  console.log('samples=' + res.samples);
  for (const [k, u] of Object.entries(res.shots)) fs.writeFileSync(path.join(dir, `${tag}_aa${+AA}_${k}.png`), Buffer.from(u.split(',')[1], 'base64'));
  if (mode === 'flicker') console.log(JSON.stringify(res.flick));
  await b.close();
  if (errs.length) { console.log('오류', errs.slice(0, 3)); return false; }
  return true;
});
