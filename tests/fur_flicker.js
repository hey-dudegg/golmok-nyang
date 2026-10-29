// 털 지지직 측정 (D-66, D-69): 카메라를 0.5화소씩 돌린 인접 프레임의 털 영역 변화율(%)
// 전(가장자리 폭 fwidth, 최소 0.02) 대 후(fwidth*2, 최소 0.05)를 근접·중간 거리에서 비교한다.
// 사용: node tests/fur_flicker.js [--tag x]   (그림은 tests/out/fur/<tag>_<전후>_<거리>.png)
// 합격: 후 near 5% 이하, 후 mid 가 전 mid 의 60% 이하 (swiftshader 값, 상대 비교만 유효)
const fs = require('fs');
const path = require('path');
const { launch, open, run, OUT, ensureDir } = require('./lib/common');
const tag = (() => { const i = process.argv.indexOf('--tag'); return i > 0 ? process.argv[i + 1] : 'x'; })();
const dir = ensureDir(path.join(OUT, 'fur'));
run('fur_flicker ' + tag, async () => {
  const b = await launch(); const errs = [];
  const p = await open(b, '?admin&still=20&pr=1.75&shells=16', { width: 390, height: 800, errs, settle: 3000 });
  const res = await p.evaluate(() => {
    const a = window.__app, S = a.s, R = S.renderer, v = a.views[0], out = {};
    a.selected = null; a.camAnim = null; S.camera.clearViewOffset(); S.controls.enabled = false;
    const cv = document.createElement('canvas'), x = cv.getContext('2d', { willReadFrequently: true });
    const grab = () => { R.render(S.scene, S.camera); const c = R.domElement; cv.width = c.width; cv.height = c.height; x.drawImage(c, 0, 0); return x.getImageData(0, 0, cv.width, cv.height).data; };
    const mats = a.views.map((q) => q.mat), fs0 = mats[0].fragmentShader;
    const oldFs = fs0.replace('max(fwidth(d) * 2.0, 0.05)', 'max(fwidth(d), 0.02)').replace('max(fwidth(d2) * 2.0, 0.05)', 'max(fwidth(d2), 0.02)');
    out.patched = oldFs !== fs0;
    const tp = v.root.position.clone(); v.root.getWorldPosition(tp);
    const fovPx = 2 * Math.tan(S.camera.fov * Math.PI / 360) / R.domElement.clientHeight;
    for (const [tagN, f] of [['before', oldFs], ['after', fs0]]) {
      for (const m of mats) { m.fragmentShader = f + String.fromCharCode(10) + '// ' + tagN; m.needsUpdate = true; }
      for (const [name, dist] of [['near', 0.7], ['mid', 2.2]]) {
        const tg = [tp.x, tp.y + 0.2, tp.z], base = [dist * 0.3, 0.35 + dist * 0.1 - 0.2, dist];
        const put = (yaw) => { const c = Math.cos(yaw), sn = Math.sin(yaw); S.camera.position.set(tg[0] + base[0] * c + base[2] * sn, tg[1] + base[1], tg[2] - base[0] * sn + base[2] * c); S.controls.target.set(...tg); S.camera.lookAt(...tg); };
        put(0); v.root.visible = false; const E = grab(); v.root.visible = true;
        let tot = 0, n = 0, prev = null, url = '';
        for (let i = 0; i < 4; i++) {
          put(fovPx * 0.5 * i); const A = grab(); if (i === 0) url = cv.toDataURL('image/png');
          if (prev) for (let j = 0; j < A.length; j += 4) if (Math.abs(A[j] - E[j]) + Math.abs(A[j + 1] - E[j + 1]) + Math.abs(A[j + 2] - E[j + 2]) > 24) {
            n++; if (Math.abs(A[j] - prev[j]) + Math.abs(A[j + 1] - prev[j + 1]) + Math.abs(A[j + 2] - prev[j + 2]) > 30) tot++;
          }
          prev = A;
        }
        out[tagN + '_' + name] = { pct: +(tot * 100 / Math.max(n, 1)).toFixed(2), url };
      }
    }
    { const g = R.getContext(); out.aa = g.getParameter(g.SAMPLES); }
    return out;
  });
  console.log('samples=' + res.aa + (res.patched ? '' : ' (경고: 전 셰이더 치환 실패)'));
  for (const k of ['before_near', 'before_mid', 'after_near', 'after_mid']) {
    fs.writeFileSync(path.join(dir, `${tag}_${k}.png`), Buffer.from(res[k].url.split(',')[1], 'base64'));
    console.log(`${k}: 변화율 ${res[k].pct}%`);
  }
  await b.close();
  const ok = res.patched && res.after_near.pct <= 5 && res.after_mid.pct <= res.before_mid.pct * 0.6;
  console.log(ok ? '합격' : '불합격(기준: near<=5%, mid<=전 mid의 60%)');
  if (errs.length) { console.log('오류', errs.slice(0, 3)); return false; }
  return ok;
});
