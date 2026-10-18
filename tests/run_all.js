// 시험을 하나씩 차례로(동시에 돌리지 않음) 실행하고 통과표를 보여 준다.
// 사용: node tests/run_all.js [이름...]   예: node tests/run_all.js syntax pose
const path = require('path');
const { spawnSync } = require('child_process');

const ALL = [
  ['syntax', 'check_syntax.js'],
  ['imports', 'check_imports.js'],
  ['unit', '--test'], // node 단위 시험(tests/unit/, 브라우저 불필요)
  ['reg', 'reg.js'],
  ['pose', 'pose_check.js', 'after'],
  ['polarity', 'b2_polarity.js'],
  ['recipe', 'm04_unit.js'],
  ['promo', 'm02c.js'],
  ['compare', 'compare.js'],
  ['core', 'core_ref.js'],
];
const pick = process.argv.slice(2);
const list = pick.length ? ALL.filter(([n]) => pick.includes(n)) : ALL;
const rows = [];
for (const [name, file, ...args] of list) {
  const t0 = Date.now();
  const argv = file === '--test' ? ['--test', path.join(__dirname, 'unit')] : [path.join(__dirname, file), ...args];
  const r = spawnSync(process.execPath, argv, { encoding: 'utf8', env: process.env });
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out);
  const tap = file === '--test' ? `node --test ${(out.match(/# pass \d+/) || ['?'])[0]} ${(out.match(/# fail \d+/) || ['?'])[0]}` : null; // node --test 는 RESULT 줄 대신 요약을 쓴다
  const res = tap || (out.match(/RESULT (PASS|FAIL)[^\n]*/g) || ['RESULT FAIL (결과 줄 없음)']).pop();
  rows.push([name, r.status === 0 ? 'PASS' : 'FAIL', ((Date.now() - t0) / 1000).toFixed(1) + 's', res]);
}
console.log('\n== 통과표 ==');
for (const r of rows) console.log(r[0].padEnd(9), r[1].padEnd(5), r[2].padStart(7), ' ', r[3]);
process.exit(rows.every((r) => r[1] === 'PASS') ? 0 : 1);
