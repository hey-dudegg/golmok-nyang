// JS 소스 가벼운 정적 분석(의존성 없음). check_imports.js 가 쓴다.
//  tokenize(src): 주석·문자열·정규식을 걷어 낸 토큰 목록
//  analyze(file, src): import·export·최상위 선언·지역 선언·쓰인 이름 (근사)
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
  const hasDefault = /^export\s+default\b/m.test(src); // export default 금지(합치기 규칙). 판정은 부르는 쪽에서
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
  return { file, imports, exports, top, local, used, hasDefault };
}


module.exports = { tokenize, analyze, KW };
