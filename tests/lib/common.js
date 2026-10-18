// 시험 공통 설정. 개인 경로·계정 값은 두지 않는다. 환경 변수로 바꾼다 (tests/README.md).
//   BASE_URL     시험할 페이지 주소 (기본 http://localhost:8000/prototype/)
//   CHROME_PATH  Chrome/Chromium 실행 파일 (없으면 흔한 설치 위치를 찾아 본다)
//   TEST_SLOW    느린 환경 배수 (기본 1). 대기 시간과 시험 제한 시간에 곱한다
//   TEST_TIMEOUT 시험 하나의 제한 시간(ms, 기본 90000 x TEST_SLOW)
//   HEADLESS     0이면 창을 띄운다
const fs = require('fs');
const path = require('path');

let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e) {
  console.log('puppeteer-core가 없습니다. 저장소 루트에서 "npm install"을 먼저 실행하세요.'); process.exit(2);
}

const SLOW = Math.max(0.2, +process.env.TEST_SLOW || 1);
const BASE_URL = (process.env.BASE_URL || 'http://localhost:8000/prototype/').replace(/[?#].*$/, '');
const TIMEOUT = +process.env.TEST_TIMEOUT || 90000 * SLOW;
const OUT = path.join(__dirname, '..', 'out');
const BASELINE = path.join(__dirname, '..', 'baseline');

const wait = (ms) => new Promise((r) => setTimeout(r, ms * SLOW));
// 페이지 주소: url('?admin&pr=0.4#11') -> BASE_URL + 그 뒤
const url = (rest = '') => BASE_URL + rest;

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const pf = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const cands = [
    ...pf.map((d) => path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ...pf.map((d) => path.join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  const hit = cands.find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
  if (!hit) { console.log('Chrome을 찾지 못했습니다. CHROME_PATH 환경 변수에 실행 파일 경로를 넣어 주세요.'); process.exit(2); }
  return hit;
}

function launch() {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: process.env.HEADLESS === '0' ? false : 'new',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    protocolTimeout: 180000 * SLOW,
  });
}

// 콘솔 오류·페이지 오류 모으기. 404(파비콘 등)는 뺀다.
function collectErrors(page, errs, tag = '') {
  page.on('pageerror', (e) => errs.push(tag + 'PE ' + String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(tag + 'CE ' + m.text().slice(0, 200)); });
  // 같은 서버의 파일(style.css, data/*.json 등)을 못 받으면 오류로 센다. 바깥 CDN·글꼴은 망 상태에 따라 달라 빼 둔다.
  const origin = new URL(BASE_URL).origin;
  page.on('requestfailed', (r) => { if (r.url().startsWith(origin) && !/favicon/.test(r.url())) errs.push(tag + 'RF ' + r.url().slice(-80) + ' ' + ((r.failure() && r.failure().errorText) || '')); });
  return errs;
}

// before(page): 주소를 열기 전에 할 일(대화상자 처리, evaluateOnNewDocument 등)
async function open(browser, rest, { width = 1100, height = 800, errs, settle = 3000, before } = {}) {
  const p = await browser.newPage();
  await p.setViewport({ width, height });
  if (errs) collectErrors(p, errs);
  if (before) await before(p);
  await p.goto(url(rest), { waitUntil: 'load', timeout: 60000 * SLOW });
  await p.waitForFunction(() => window.__app && window.__app.mascot, { timeout: 60000 * SLOW });
  if (settle) await wait(settle);
  return p;
}

// 시험 하나를 제한 시간 안에서 실행하고 종료 코드를 정한다. fn이 true를 돌려주면 통과.
function run(name, fn) {
  const t0 = Date.now();
  const guard = setTimeout(() => { console.log(`RESULT FAIL ${name}: 제한 시간 ${Math.round(TIMEOUT / 1000)}초 초과`); process.exit(1); }, TIMEOUT);
  console.log(`# ${name}  BASE_URL=${BASE_URL}  TEST_SLOW=${SLOW}`);
  Promise.resolve().then(fn).then((ok) => {
    clearTimeout(guard);
    console.log(`RESULT ${ok ? 'PASS' : 'FAIL'} ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    process.exit(ok ? 0 : 1);
  }, (e) => { clearTimeout(guard); console.log(`RESULT FAIL ${name}: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`); process.exit(1); });
}

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); return d; }

module.exports = { puppeteer, SLOW, BASE_URL, TIMEOUT, OUT, BASELINE, wait, url, launch, collectErrors, open, run, ensureDir, chromePath };
