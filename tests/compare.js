// 기준값 비교: tests/snapshot.js 를 돌려 tests/out/state.json 을 만들고 tests/baseline/state.json 과 비교한다.
// 사용: node tests/compare.js            (스냅숏을 새로 뜬 뒤 비교)
//       node tests/compare.js --no-run   (이미 있는 tests/out/state.json 만 비교)
//       node tests/compare.js A.json B.json (두 파일 비교)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, 'out', 'state.json');
const BASE = path.join(__dirname, 'baseline', 'state.json');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
let [a, b] = args.length === 2 ? args : [BASE, OUT];
if (args.length !== 2 && !process.argv.includes('--no-run')) {
  try { execFileSync(process.execPath, [path.join(__dirname, 'snapshot.js')], { stdio: 'inherit' }); }
  catch (e) { console.log('RESULT FAIL compare: snapshot 실패'); process.exit(1); }
}
if (!fs.existsSync(a)) { console.log('기준 파일이 없습니다:', a, '\n먼저 "node tests/snapshot.js --baseline"으로 만드세요.'); process.exit(1); }
const A = JSON.parse(fs.readFileSync(a, 'utf8')), B = JSON.parse(fs.readFileSync(b, 'utf8'));
delete A.meta; delete B.meta;
const diffs = [];
const walk = (x, y, p) => {
  if (x === y) return;
  if (typeof x !== typeof y || x === null || y === null || typeof x !== 'object' || Array.isArray(x) !== Array.isArray(y)) { diffs.push(`${p}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`); return; }
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p ? p + '.' + k : k);
};
walk(A, B, '');
console.log('기준:', path.relative(process.cwd(), a), ' 비교:', path.relative(process.cwd(), b));
if (diffs.length) { console.log('다른 곳', diffs.length + '건'); console.log(diffs.slice(0, 40).join('\n')); }
else console.log('기준값과 동일 (meta 제외)');
console.log(diffs.length ? 'RESULT FAIL compare' : 'RESULT PASS compare');
process.exit(diffs.length ? 1 : 0);
