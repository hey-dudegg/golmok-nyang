// 단위 시험 실행기: *.test.mjs 목록을 만들어 node --test 에 넘긴다.
// Node 20은 글롭·디렉터리 순회가 달라(22는 디렉터리 인자를 파일로 취급) 목록을 직접 만든다. (M2-2)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dir = path.join(__dirname, 'unit');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join(dir, f));
if (!files.length) { console.error('단위 시험 파일 없음'); process.exit(1); }
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
