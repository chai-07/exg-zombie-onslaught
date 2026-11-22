/*
 * 尸潮突击 — 局域网服务器
 * 作用：1) 静态服务游戏(index.html)与手机控制页(phone.html) 2) WebSocket 中转手机↔电脑
 * 启动：node server.js  (默认端口 8123，可 node server.js 9000 自定义)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.argv[2] || '8123', 10);
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); }
  catch (e) { res.writeHead(400); res.end('Bad request'); return; }
  if (url === '/') url = '/index.html';

  const fp = path.normalize(path.join(ROOT, url));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found: ' + url); return; }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

// WebSocket：任一客户端消息 → 广播给其它客户端（手机↔电脑对等）
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const who = (req.url || '').includes('phone') ? '手机' : '客户端';
  console.log(`[ws] ${who} 已连接，当前 ${wss.clients.size} 个连接`);
  ws.on('message', (data) => {
    const msg = data.toString();
    for (const c of wss.clients) {
      if (c !== ws && c.readyState === 1) c.send(msg);
    }
  });
  ws.on('close', () => console.log(`[ws] ${who} 断开，剩余 ${wss.clients.size} 个连接`));
});

server.listen(PORT, () => {
  console.log('==============================================');
  console.log('  尸潮突击 局域网服务器已启动');
  console.log('==============================================');
  console.log('  电脑（游戏画面）:  http://localhost:' + PORT + '/');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ifc of nets[name] || []) {
      if (ifc.family === 'IPv4' && !ifc.internal) {
        console.log('  手机（控制器，需同一 WiFi）:  http://' + ifc.address + ':' + PORT + '/phone.html');
      }
    }
  }
  console.log('==============================================');
});
