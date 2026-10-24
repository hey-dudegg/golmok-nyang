// 시험용 정적 서버: node 내장 http·fs·path 만 쓴다 (D-61). 저장소 루트를 제공한다.
//   const { startServer } = require('./lib/static_server');  const s = await startServer(); s.baseUrl; await s.close();
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
};

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
  let rel;
  try { rel = decodeURIComponent(req.url.split(/[?#]/)[0]); } catch { return send(res, 400, 'bad request'); }
  if (rel.includes('\0')) return send(res, 400, 'bad request');
  let file = path.resolve(ROOT, '.' + path.posix.normalize('/' + rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'forbidden');
  fs.stat(file, (e, st) => {
    if (!e && st.isDirectory()) {
      if (!rel.endsWith('/')) { res.writeHead(301, { Location: rel + '/' }); return res.end(); }
      file = path.join(file, 'index.html');
    }
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, 'not found');
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

// port 0 = 빈 포트. backlog 511 (연결 거부 방지).
function startServer(port = 0) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on('error', reject);
    server.listen(port, '127.0.0.1', 511, () => {
      const p = server.address().port;
      resolve({
        port: p,
        baseUrl: `http://127.0.0.1:${p}/prototype/`,
        close: () => new Promise((r) => { server.closeAllConnections && server.closeAllConnections(); server.close(() => r()); }),
      });
    });
  });
}

module.exports = { startServer, ROOT };
