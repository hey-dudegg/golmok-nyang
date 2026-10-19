// import/export 정적 검사 (브라우저·서버·의존성 불필요). 사용: node tests/check_imports.js
//  1) prototype/index.html 인라인 모듈(로더)과 prototype/src/**/*.js 의 상대 경로 import 그래프(동적 import() 포함)에서 순환 0
//  2) import 한 이름이 대상 파일에서 export 되었는지, 같은 이름을 두 번 들이거나 선언과 겹치지 않는지
//  3) 미선언 이름: 한 모듈이 다른 모듈의 최상위 이름을 import 없이 쓰는지 (토큰 기반 근사 검사)
//  4) core 규칙: src/core/ 는 src/core/ 만 import 하고 three·DOM·window·localStorage·location 을 쓰지 않는다
//  5) 층 규칙(한 방향): core <- adapters <- state <- render·sim <- ui <- app·main (아래 LAYERS 표)
const fs = require('fs');
const path = require('path');
const { analyze } = require('./lib/js_scan');

const ROOT = path.join(__dirname, '..');
const PROTO = path.join(ROOT, 'prototype');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const problems = [];
const bad = (m) => problems.push(m);

// 층마다 import 해도 되는 층 (src/ 아래 첫 폴더 이름, src/main.js 는 main, index.html 로더는 html)
const LAYERS = {
  core: ['core'],
  adapters: ['core', 'adapters', 'config'], // config: src/config.js 배포 설정 자리(아무것도 import 하지 않는다)
  config: [],
  state: ['core', 'adapters', 'state'],
  render: ['core', 'render'],
  sim: ['core', 'adapters', 'state', 'render', 'sim'],
  ui: ['core', 'adapters', 'state', 'render', 'sim', 'ui'],
  app: ['core', 'adapters', 'state', 'render', 'sim', 'ui', 'app'],
  main: ['core', 'adapters', 'state', 'render', 'sim', 'ui', 'app'],
  html: ['main'],
};

// ── 대상 모으기 ──
const mods = new Map(); // 절대 경로 -> 정보
const html = path.join(PROTO, 'index.html');
const hs = fs.readFileSync(html, 'utf8');
const HTML_KEY = html + '#module';
const inline = [...hs.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
if (!inline) { console.log('RESULT FAIL check_imports: 인라인 모듈(로더) 없음'); process.exit(1); }
const srcOf = new Map([[HTML_KEY, inline]]);
mods.set(HTML_KEY, analyze(HTML_KEY, inline));
const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.m?js$/.test(e.name)) { const s = fs.readFileSync(f, 'utf8'); srcOf.set(f, s); mods.set(f, analyze(f, s)); } } };
walk(path.join(PROTO, 'src'));
const SRC = path.join(PROTO, 'src') + path.sep;
const layerOf = (k) => (k === HTML_KEY ? 'html' : k === path.join(PROTO, 'src', 'main.js') ? 'main' : k === path.join(PROTO, 'src', 'config.js') ? 'config' : k.slice(SRC.length).split(path.sep)[0]);

// ── 1·2) import 해석, 이름 확인, 그래프 ──
const graph = new Map();
const base = (k) => (k === HTML_KEY ? PROTO : path.dirname(k));
for (const [k, M] of mods) {
  const edges = []; const seen = new Set();
  if (M.hasDefault) bad(`${rel(k)}: export default 금지(합치기 규칙)`);
  for (const im of M.imports) {
    for (const nm of im.names) { if (seen.has(nm)) bad(`${rel(k)}: ${nm} 를 두 번 import`); seen.add(nm); if (M.top.has(nm)) bad(`${rel(k)}: import 한 ${nm} 를 다시 선언`); }
    if (!im.from.startsWith('.')) continue; // three 등 import map 이름
    const target = path.resolve(base(k), im.from);
    const T = mods.get(target);
    if (!T) { bad(`${rel(k)}: 없는 파일 import ${im.from}`); continue; }
    if (im.ns || im.def) bad(`${rel(k)}: ${im.from} 는 이름 import 만 쓴다({ a, b })`);
    for (const nm of im.orig) if (!T.exports.has(nm)) bad(`${rel(k)}: ${im.from} 에 export 되지 않은 ${nm}`);
    edges.push(target);
  }
  for (const d of srcOf.get(k).matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g)) { // 동적 import (로더)
    const target = path.resolve(base(k), d[1]);
    if (!mods.get(target)) bad(`${rel(k)}: 없는 파일 import() ${d[1]}`); else edges.push(target);
  }
  graph.set(k, edges);
}
const cycles = [];
const state = new Map();
const dfs = (k, stack) => {
  state.set(k, 1); stack.push(k);
  for (const t of graph.get(k) || []) {
    if (state.get(t) === 1) cycles.push([...stack.slice(stack.indexOf(t)), t].map(rel).join(' -> '));
    else if (!state.get(t)) dfs(t, stack);
  }
  stack.pop(); state.set(k, 2);
};
for (const k of graph.keys()) if (!state.get(k)) dfs(k, []);
for (const c of cycles) bad('순환 import: ' + c);

// ── 5) 층 규칙 ──
for (const [k, edges] of graph) {
  const L = layerOf(k), ok = LAYERS[L];
  if (!ok) { bad(`${rel(k)}: 알 수 없는 층 ${L} (src/ 아래 core·adapters·state·render·sim·ui·app 또는 main.js)`); continue; }
  for (const t of edges) if (!ok.includes(layerOf(t))) bad(`${rel(k)}: 층 규칙 위반 ${L} -> ${layerOf(t)} (${rel(t)})`);
}

// ── 3) 미선언 이름 ──
const owner = new Map(); // 최상위 이름 -> 선언한 모듈들
for (const [k, M] of mods) for (const nm of M.top) { if (!owner.has(nm)) owner.set(nm, []); owner.get(nm).push(k); }
for (const [nm, ks] of owner) if (ks.length > 1) {
  // 같은 이름이 여러 모듈에 최상위로 있으면 합치기(단계 4)에서 충돌한다. 단, export 하지 않는 내부 도우미끼리는 알려만 준다
  const exp = ks.filter((k) => mods.get(k).exports.has(nm) || k === HTML_KEY);
  if (exp.length > 1) bad(`이름 충돌: ${nm} (${ks.map(rel).join(', ')})`);
}
for (const [k, M] of mods) {
  const have = new Set([...M.top, ...M.imports.flatMap((i) => i.names)]);
  for (const nm of M.used.keys()) {
    if (have.has(nm) || M.local.has(nm) || !owner.has(nm)) continue;
    bad(`${rel(k)}: ${nm} 를 import 없이 씀 (선언: ${owner.get(nm).map(rel).join(', ')})`);
  }
}

// ── 4) core 규칙 ──
const CORE = path.join(PROTO, 'src', 'core') + path.sep;
const BROWSER = ['document', 'window', 'localStorage', 'sessionStorage', 'location', 'navigator', 'THREE', 'matchMedia', 'fetch', 'requestAnimationFrame', 'performance', 'app'];
for (const [k, M] of mods) {
  if (!k.startsWith(CORE)) continue;
  for (const t of graph.get(k)) if (!t.startsWith(CORE)) bad(`${rel(k)}: core 가 core 밖(${rel(t)})을 import`);
  for (const im of M.imports) if (!im.from.startsWith('.')) bad(`${rel(k)}: core 가 ${im.from} 를 import`);
  for (const nm of BROWSER) if (M.used.has(nm) && !M.local.has(nm) && !M.top.has(nm)) bad(`${rel(k)}: core 에서 ${nm} 사용`);
}

const coreN = [...mods.keys()].filter((k) => k.startsWith(CORE)).length;
const edgesN = [...graph.values()].reduce((s, e) => s + e.length, 0);
console.log(`모듈 ${mods.size}개(core ${coreN}), import 간선 ${edgesN}개, 순환 ${cycles.length}건`);
for (const [k, e] of graph) console.log('  ' + rel(k).padEnd(40) + ' -> ' + (e.map((t) => path.relative(path.join(PROTO, 'src'), t).split(path.sep).join('/')).join(', ') || '(없음)'));
if (problems.length) console.log('문제 ' + problems.length + '건\n' + problems.slice(0, 60).join('\n'));
console.log(problems.length ? 'RESULT FAIL check_imports' : 'RESULT PASS check_imports');
process.exit(problems.length ? 1 : 0);
