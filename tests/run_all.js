// 시험을 하나씩 차례로(동시에 돌리지 않음) 실행하고 통과표를 보여 준다.
// 사용: node tests/run_all.js [--verbose] [이름...]   예: node tests/run_all.js syntax pose
// 기본(요약): 통과한 시험은 통과표 한 줄, 실패한 시험은 출력 끝 30줄만 낸다. --verbose 또는 TEST_VERBOSE=1 이면 전부 낸다.
const path = require('path');
const { spawn } = require('child_process');
const { startServer } = require('./lib/static_server');

const ALL = [
  ['syntax', 'check_syntax.js'],
  ['imports', 'check_imports.js'],
  ['unit', '--test'], // node 단위 시험(tests/unit/, 브라우저 불필요)
  ['reg', 'reg.js'],
  ['pose', 'pose_check.js', 'after'],
  ['polarity', 'b2_polarity.js'],
  ['recipe', 'm04_unit.js'],
  ['promo', 'm02c.js'],
  ['loadfail', 'load_fail.js'],
  ['feedback', 'feedback_ui.js'],
  ['findcat', 'find_cat.js'],
  ['backdrop', 'backdrop.js'],
  ['compare', 'compare.js'],
  ['core', 'core_ref.js'],
];
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || /^(1|true)$/i.test(process.env.TEST_VERBOSE || '');
const pick = args.filter((a) => !a.startsWith('--'));
const TAIL = 30;
const list = pick.length ? ALL.filter(([n]) => pick.includes(n)) : ALL;
function run(argv, env) { // 비동기 실행(서버가 같은 프로세스에서 요청을 받아야 하므로 spawnSync 불가)
  return new Promise((resolve) => {
    const c = spawn(process.execPath, argv, { env });
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { out += d; });
    c.on('error', (e) => resolve({ status: 1, stdout: out + String(e), stderr: '' }));
    c.on('close', (code) => resolve({ status: code, stdout: out, stderr: '' }));
  });
}
const rows = [];
async function main() {
  let server = null;
  const env = { ...process.env };
  if (!env.BASE_URL) { server = await startServer(); env.BASE_URL = server.baseUrl; console.log('# 시험 서버', server.baseUrl); } // D-61
  const stop = async () => { if (server) { const s = server; server = null; await s.close(); } };
  process.on('SIGINT', () => stop().then(() => process.exit(130)));
  process.on('SIGTERM', () => stop().then(() => process.exit(143)));
  try {
for (const [name, file, ...args] of list) {
  const t0 = Date.now();
  const argv = file === '--test' ? [path.join(__dirname, 'run_unit.js')] : [path.join(__dirname, file), ...args];
  const r = await run(argv, env);
  const out = (r.stdout || '') + (r.stderr || '');
  const tap = file === '--test' ? `node --test ${(out.match(/# pass \d+/) || ['?'])[0]} ${(out.match(/# fail \d+/) || ['?'])[0]}` : null; // node --test 는 RESULT 줄 대신 요약을 쓴다
  const res = tap || (out.match(/RESULT (PASS|FAIL)[^\n]*/g) || ['RESULT FAIL (결과 줄 없음)']).pop();
  if (verbose) process.stdout.write(out);
  else if (r.status !== 0) {
    const lines = out.replace(/\s+$/, '').split('\n');
    const cut = lines.length > TAIL ? `, 앞 ${lines.length - TAIL}줄 생략` : '';
    console.log(`--- ${name} 실패 출력 (끝 ${Math.min(TAIL, lines.length)}줄${cut}) ---`);
    console.log(lines.slice(-TAIL).join('\n'));
  }
  rows.push([name, r.status === 0 ? 'PASS' : 'FAIL', ((Date.now() - t0) / 1000).toFixed(1) + 's', res]);
}
} finally { await stop(); }
console.log('\n== 통과표 ==');
for (const r of rows) console.log(r[0].padEnd(9), r[1].padEnd(5), r[2].padStart(7), ' ', r[3]);
process.exit(rows.every((r) => r[1] === 'PASS') ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
