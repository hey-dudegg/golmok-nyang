// 문법 검사(node --check 래퍼). 브라우저를 쓰지 않는다.
// 사용: node tests/check_syntax.js [html 파일...]   (기본: prototype/index.html)
//  - html 안의 인라인 <script type="module">은 tests/out/ 에 .mjs로 뽑아 node --check
//  - <script type="module" src=...>와 html 옆 src/ 아래 .js/.mjs 파일도 node --check
//  - 인라인 JSON(<script type="application/json">, importmap)과 html 옆 data/ 아래 .json은 JSON.parse
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const files = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(ROOT, 'prototype', 'index.html')];
let bad = 0, n = 0;
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const check = (file, label) => {
  n++;
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); console.log('ok   ', label); }
  catch (e) { bad++; console.log('FAIL ', label, '\n' + String(e.stderr || e.message).split('\n').slice(0, 6).join('\n')); }
};
const checkJson = (text, label) => {
  n++;
  try { JSON.parse(text); console.log('ok   ', label, `(JSON ${text.length.toLocaleString()}자)`); }
  catch (e) { bad++; console.log('FAIL ', label, e.message.slice(0, 200)); }
};
const walk = (d, exts, acc = []) => {
  if (!fs.existsSync(d)) return acc;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f, exts, acc); else if (exts.includes(path.extname(e.name))) acc.push(f);
  }
  return acc;
};

fs.mkdirSync(OUT, { recursive: true });
for (const html of files) {
  const dir = path.dirname(html), src = fs.readFileSync(html, 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m, i = 0;
  while ((m = re.exec(src))) {
    const attrs = m[1], body = m[2], type = (/type\s*=\s*["']?([^"'\s>]+)/i.exec(attrs) || [])[1] || '';
    const s = (/src\s*=\s*["']?([^"'\s>]+)/i.exec(attrs) || [])[1];
    if (s) { if (!/^https?:/i.test(s)) check(path.join(dir, s), rel(path.join(dir, s))); continue; }
    if (type === 'module') {
      const f = path.join(OUT, `inline_module_${path.basename(html, '.html')}_${i++}.mjs`);
      fs.writeFileSync(f, body);
      check(f, `${rel(html)} 인라인 module (${body.split('\n').length}줄)`);
    } else if (type === 'application/json' || type === 'importmap') checkJson(body, `${rel(html)} 인라인 ${type}`);
  }
  for (const f of walk(path.join(dir, 'src'), ['.js', '.mjs'])) check(f, rel(f));
  for (const f of walk(path.join(dir, 'data'), ['.json'])) checkJson(fs.readFileSync(f, 'utf8'), rel(f));
}
console.log(`검사 ${n}건, 실패 ${bad}건`);
console.log(bad || !n ? 'RESULT FAIL check_syntax' : 'RESULT PASS check_syntax');
process.exit(bad || !n ? 1 : 0);
