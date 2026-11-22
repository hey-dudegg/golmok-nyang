// 남은 시험 서버·시험 브라우저 정리 (M8-4). 사용자의 일반 Chrome은 건드리지 않는다.
// 대상: (1) 명령줄에 puppeteer_dev_chrome_profile 이 든 chrome (2) 명령줄이 tests/lib/static_server.js ... --test 인 node(자기·부모 제외). 표시(--test) 없는 사용자 서버는 둔다
// 사용: require('./lib/cleanup').cleanup() 또는 node tests/lib/cleanup.js. 실패해도 던지지 않고 경고만.
const { execFile } = require('child_process');

function list() {
  return new Promise((resolve, reject) => {
    const cb = (e, out) => (e ? reject(e) : resolve(out));
    if (process.platform === 'win32') {
      const ps = "Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'chrome.exe','node.exe' } | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress";
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { maxBuffer: 32 << 20, timeout: 30000 }, (e, out) => {
        if (e) return reject(e);
        let j = []; const t = String(out).trim();
        if (t) { j = JSON.parse(t); if (!Array.isArray(j)) j = [j]; }
        resolve(j.map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, name: String(p.Name || ''), cmd: String(p.CommandLine || '') })));
      });
    } else {
      execFile('ps', ['-eo', 'pid,ppid,args'], { maxBuffer: 32 << 20, timeout: 30000 }, (e, out) => {
        if (e) return reject(e);
        resolve(String(out).split('\n').slice(1).map((l) => {
          const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
          return m ? { pid: +m[1], ppid: +m[2], name: m[3].split(/\s/)[0], cmd: m[3] } : null;
        }).filter(Boolean));
      });
    }
  });
}

function kill(pid) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') execFile('taskkill', ['/PID', String(pid), '/F'], () => resolve());
    else { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* 이미 끝남 */ } resolve(); }
  });
}

async function cleanup({ quiet = false } = {}) {
  let chrome = 0; let server = 0;
  try {
    const procs = await list();
    const skip = new Set([process.pid, process.ppid]);
    const isChrome = (p) => /chrome/i.test(p.name) && p.cmd.includes('puppeteer_dev_chrome_profile');
    const isSrv = (p) => /node/i.test(p.name) && /tests[/\/]lib[/\/]static_server\.js(\s.*)?\s--test(\s|$)/.test(p.cmd) && !skip.has(p.pid);
    const targets = procs.filter((p) => isChrome(p) || isSrv(p));
    for (const p of targets) { await kill(p.pid); if (isChrome(p)) chrome++; else server++; }
  } catch (e) {
    console.log('# 정리 경고: ' + String(e.message || e).slice(0, 120));
  }
  if (!quiet) console.log(`# 정리: 시험 브라우저 ${chrome}개, 시험 서버 ${server}개 종료`);
  return { chrome, server };
}

module.exports = { cleanup };
if (require.main === module) cleanup().then(() => process.exit(0));
