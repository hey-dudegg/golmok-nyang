// 그림 여러 장을 가로로 이어 붙인다(비교용). 사용: node tests/lib/montage.js 출력.png 입력1.png 입력2.png ... [--scale 0.5]
const fs = require('fs'); const { launch } = require('./common');
(async () => {
  const a = process.argv.slice(2), si = a.indexOf('--scale'), sc = si >= 0 ? +a[si + 1] : 0.5; if (si >= 0) a.splice(si, 2);
  const out = a.shift(), b = await launch(), p = await b.newPage();
  const data = a.map((f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
  const url = await p.evaluate(async (data, sc) => {
    const im = await Promise.all(data.map((d) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = d; })));
    const w = Math.round(im[0].width * sc), h = Math.round(im[0].height * sc), c = document.createElement('canvas'); c.width = w * im.length; c.height = h;
    const x = c.getContext('2d'); im.forEach((i, k) => x.drawImage(i, k * w, 0, w, h)); return c.toDataURL('image/png');
  }, data, sc);
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); await b.close();
})();
