// import/export 정적 검사 (브라우저·서버·의존성 불필요). 사용: node tests/check_imports.js
//  1) prototype/index.html 인라인 모듈과 prototype/src/**/*.js 의 상대 경로 import 그래프에서 순환 0
//  2) import 한 이름이 대상 파일에서 export 되었는지, 같은 이름을 두 번 들이거나 선언과 겹치지 않는지
//  3) 미선언 이름: 한 모듈이 다른 모듈(또는 index.html)의 최상위 이름을 import 없이 쓰는지 (토큰 기반 근사 검사)
//  4) core 규칙: src/core/ 는 src/core/ 만 import 하고 three·DOM·window·localStorage·location 을 쓰지 않는다
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROTO = path.join(ROOT, 'prototype');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const problems = [];
const bad = (m) => problems.push(m);

// ── 토큰화: 주석·문자열·템플릿 글자·정규식을 걷어 내고 [종류, 값] 목록을 만든다 ──
const KW = new Set('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield await async of static get set from as null true false undefined'.split(' '));
function tokenize(src) {
  const out = []; let i = 0; const n = src.length; const tpl = []; // 템플릿 ${ } 깊이
  const prevSig = () => (out.length ? out[out.length - 1] : null);
  const regexOk = () => { const p = prevSig(); if (!p) return true; if (p[0] === 'id') return KW.has(p[1]) && !['this', 'super', 'null', 'true', 'false', 'undefined'].includes(p[1]); if (p[0] === 'num' || p[0] === 'str') return false; return !(p[1] === ')' || p[1] === ']' || p[1] === '}'); };
  const readTpl = () => { // ` 다음부터: 글자는 건너뛰고 ${ 를 만나면 코드로 돌아간다
    while (i < n) { const c = src[i]; if (c === '\\') { i += 2; continue; } if (c === '`') { i++; out.push(['str', '`']); return; } if (c === '$' && src[i + 1] === '{') { i += 2; tpl.push(0); out.push(['p', '(']); return; } i++; }
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; } i++; out.push(['str', q]); continue; }
    if (c === '`') { i++; readTpl(); continue; }
    if (c === '}' && tpl.length && tpl[tpl.length - 1] === 0) { tpl.pop(); i++; out.push(['p', ')']); readTpl(); continue; }
    if (c === '{' && tpl.length) tpl[tpl.length - 1]++;
    if (c === '}' && tpl.length) tpl[tpl.length - 1]--;
    if (c === '/' && regexOk()) { i++; let cls = false; while (i < n) { const d = src[i]; if (d === '\\') { i += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; else if (d === '\n') break; i++; } i++; while (/[a-z]/i.test(src[i] || '')) i++; out.push(['str', '/']); continue; }
    if (/[A-Za-z_$À-￿]/.test(c) && !/[　-〿]/.test(c)) { let j = i + 1; while (j < n && /[\w$À-￿]/.test(src[j])) j++; out.push(['id', src.slice(i, j)]); i = j; continue; }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1]))) { let j = i + 1; while (j < n && /[\w.]/.test(src[j])) j++; out.push(['num', src.slice(i, j)]); i = j; continue; }
    if (src.startsWith('...', i)) { out.push(['p', '...']); i += 3; continue; }
    if (src.startsWith('=>', i)) { out.push(['p', '=>']); i += 2; continue; }
    if (src.startsWith('?.', i) && !/\d/.test(src[i + 2])) { out.push(['p', '?.']); i += 2; continue; }
    out.push(['p', c]); i++;
  }
  return out;
}

// ── 모듈 정보: import·export·최상위 선언·쓰인 이름·지역 선언 ──
function analyze(file, src) {
  const imports = []; // { names:[], from, line }
  const importRe = /^\s*import\s+(?:(\*\s+as\s+\w+)|\{([^}]*)\}|(\w+))?\s*(?:from\s*)?['"]([^'"]+)['"]\s*;?/gm;
  let m;
  while ((m = importRe.exec(src))) {
    const names = m[2] ? m[2].split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+as\s+/).pop()) : m[1] ? [m[1].split(/\s+/).pop()] : m[3] ? [m[3]] : [];
    const orig = m[2] ? m[2].split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+as\s+/)[0]) : [];
    imports.push({ names, orig, from: m[4], ns: !!m[1], def: !!m[3] });
  }
  const exports = new Set();
  for (const e of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) exports.add(e[1]);
  for (const e of src.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const s of e[1].split(',')) if (s.trim()) exports.add(s.trim().split(/\s+as\s+/).pop());
  if (/^export\s+default\b/m.test(src)) bad(`${rel(file)}: export default 금지(합치기 규칙)`);
  const top = new Set();
  for (const d of src.matchAll(/^(?:export\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) top.add(d[1]);
  const toks = tokenize(src.replace(/^\s*import\s[^\n]*$/gm, ''));
  // 지역 선언(함수 인자·안쪽 const/let 등): 같은 이름이 어디서든 선언되면 그 모듈 안에서는 검사하지 않는다(근사)
  const local = new Set();
  const declKw = new Set(['const', 'let', 'var', 'function', 'class', 'catch']);
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t[0] === 'id' && declKw.has(t[1])) {
      // const a / const { a, b: c } / const [a, b] / function f(a, b) / catch (e)
      let j = k + 1, depth = 0;
      if (t[1] === 'function' && toks[j] && toks[j][1] === '*') j++;
      for (; j < toks.length; j++) {
        const u = toks[j];
        if (u[0] === 'p' && '{[('.includes(u[1])) depth++;
        else if (u[0] === 'p' && '}])'.includes(u[1])) { depth--; if (depth <= 0 && (t[1] === 'function' || t[1] === 'catch' || t[1] === 'class')) break; if (depth < 0) break; }
        else if (u[0] === 'id' && !KW.has(u[1])) { const nx = toks[j + 1]; if (!(nx && nx[1] === ':' && depth > 0)) local.add(u[1]); if (!depth && t[1] !== 'function' && t[1] !== 'class') break; }
        else if (u[0] === 'p' && (u[1] === '=' || u[1] === ';') && depth === 0) break;
        if (j - k > 200) break;
      }
    }
    if (t[0] === 'p' && t[1] === '=>') { // 화살표 함수 인자: x => / (a, { b }, ...c) =>
      const p = toks[k - 1];
      if (p && p[0] === 'id') local.add(p[1]);
      else if (p && p[1] === ')') { let d = 0; for (let j = k - 1; j >= 0; j--) { const u = toks[j]; if (u[1] === ')') d++; else if (u[1] === '(') { d--; if (!d) break; } else if (u[0] === 'id' && !KW.has(u[1])) local.add(u[1]); } }
    }
    if (t[0] === 'p' && t[1] === '{' && toks[k - 1] && toks[k - 1][1] === ')') { // 메서드: name(a, b) {
      let d = 0, j = k - 1; const ids = [];
      for (; j >= 0; j--) { const u = toks[j]; if (u[1] === ')') d++; else if (u[1] === '(') { d--; if (!d) break; } else if (u[0] === 'id' && !KW.has(u[1])) ids.push(u[1]); }
      const before = toks[j - 1];
      if (before && before[0] === 'id' && !['if', 'for', 'while', 'switch', 'with'].includes(before[1])) for (const x of ids) local.add(x);
    }
  }
  const used = new Map(); // 이름 -> 처음 나온 토큰 위치
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]; if (t[0] !== 'id' || KW.has(t[1])) continue;
    const p = toks[k - 1], nx = toks[k + 1];
    if (p && (p[1] === '.' || p[1] === '?.')) continue; // 속성
    if (nx && nx[1] === ':' && p && (p[1] === '{' || p[1] === ',')) continue; // 객체 키 { a: 1 }
    if (nx && nx[1] === '(' && p && (p[1] === '{' || p[1] === ',') ) { // 메서드 이름 { f() {} }
      let d = 0, j = k + 1; for (; j < toks.length; j++) { if (toks[j][1] === '(') d++; else if (toks[j][1] === ')') { d--; if (!d) break; } }
      if (toks[j + 1] && toks[j + 1][1] === '{') continue;
    }
    if (!used.has(t[1])) used.set(t[1], k);
  }
  return { file, imports, exports, top, local, used };
}

// ── 대상 모으기 ──
const mods = new Map(); // 절대 경로 -> 정보
const html = path.join(PROTO, 'index.html');
const hs = fs.readFileSync(html, 'utf8');
const inline = /<script type="module">([\s\S]*?)<\/script>/.exec(hs);
if (!inline) { console.log('RESULT FAIL check_imports: 인라인 모듈 없음'); process.exit(1); }
const HTML_KEY = html + '#module';
mods.set(HTML_KEY, analyze(HTML_KEY, inline[1]));
const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.m?js$/.test(e.name)) mods.set(f, analyze(f, fs.readFileSync(f, 'utf8'))); } };
walk(path.join(PROTO, 'src'));

// ── 1·2) import 해석, 이름 확인, 그래프 ──
const graph = new Map();
const base = (k) => (k === HTML_KEY ? PROTO : path.dirname(k));
for (const [k, M] of mods) {
  const edges = []; const seen = new Set();
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
for (const [k, e] of graph) console.log('  ' + rel(k).padEnd(40) + ' -> ' + (e.map((t) => path.basename(t)).join(', ') || '(없음)'));
if (problems.length) console.log('문제 ' + problems.length + '건\n' + problems.slice(0, 60).join('\n'));
console.log(problems.length ? 'RESULT FAIL check_imports' : 'RESULT PASS check_imports');
process.exit(problems.length ? 1 : 0);
