// Nep-Home Assistant voor tests: REST (/api/, /api/states) en WebSocket (inloggen, lovelace-dashboards).
import http from 'node:http';
import crypto from 'node:crypto';

export const TOKEN = 'ha-token';
export const ha = { states: {}, dashboards: [], configs: {}, mainMode: 'storage', calls: [] };
export const resetHa = (mainMode) => Object.assign(ha, { states: {}, dashboards: [], configs: { main: { views: [{ title: 'Thuis', cards: [{ type: 'entities' }] }] } }, mainMode, calls: [] });

function sendFrame(socket, text) {
  const data = Buffer.from(text);
  const head = data.length < 126 ? Buffer.from([0x81, data.length])
    : Buffer.from([0x81, 126, data.length >> 8, data.length & 255]);
  if (data.length > 65535) throw new Error('te groot voor de test');
  socket.write(Buffer.concat([head, data]));
}
function readFrames(buf) {
  const out = [];
  let i = 0;
  while (buf.length - i >= 2) {
    const op = buf[i] & 15;
    let len = buf[i + 1] & 127;
    let p = i + 2;
    if (len === 126) { len = buf.readUInt16BE(p); p += 2; } else if (len === 127) { len = Number(buf.readBigUInt64BE(p)); p += 8; }
    if (buf.length < p + 4 + len) break;
    const mask = buf.subarray(p, p + 4);
    const data = Buffer.from(buf.subarray(p + 4, p + 4 + len)).map((b, k) => b ^ mask[k % 4]);
    out.push({ op, text: data.toString() });
    i = p + 4 + len;
  }
  return { frames: out, rest: buf.subarray(i) };
}

function lovelace(msg) {
  const key = msg.url_path || 'main';
  if (msg.type === 'lovelace/config') {
    if (key === 'main' && ha.mainMode === 'auto') return { success: false, error: { code: 'config_not_found' } };
    if (key === 'main' && ha.mainMode === 'strategy') return { success: true, result: { strategy: { type: 'original-states' } } };
    return ha.configs[key] ? { success: true, result: ha.configs[key] } : { success: false, error: { code: 'config_not_found' } };
  }
  if (msg.type === 'lovelace/config/save') { ha.configs[key] = msg.config; return { success: true, result: null }; }
  if (msg.type === 'lovelace/dashboards/list') return { success: true, result: ha.dashboards };
  if (msg.type === 'lovelace/dashboards/create') { ha.dashboards.push({ url_path: msg.url_path, title: msg.title }); return { success: true, result: {} }; }
  return { success: false, error: { code: 'unknown_command' } };
}

export const haServer = http.createServer((req, res) => {
  ha.calls.push(`${req.method} ${req.url}`);
  if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.statusCode = 401; return res.end('401: Unauthorized'); }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/') return res.end(JSON.stringify({ message: 'API running.' }));
    const m = req.url.match(/^\/api\/states\/(.+)$/);
    if (m && req.method === 'POST') { ha.states[m[1]] = JSON.parse(body); res.statusCode = 201; return res.end(body); }
    res.statusCode = 404;
    res.end('{}');
  });
});
haServer.on('upgrade', (req, socket) => {
  const accept = crypto.createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sendFrame(socket, JSON.stringify({ type: 'auth_required' }));
  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    const { frames, rest } = readFrames(Buffer.concat([buf, chunk]));
    buf = rest;
    for (const f of frames) {
      if (f.op === 8) { socket.end(Buffer.from([0x88, 0])); return; }
      const msg = JSON.parse(f.text);
      if (msg.type === 'auth') {
        sendFrame(socket, JSON.stringify({ type: msg.access_token === TOKEN ? 'auth_ok' : 'auth_invalid' }));
        continue;
      }
      ha.calls.push(`WS ${msg.type} ${msg.url_path ?? ''}`.trim());
      sendFrame(socket, JSON.stringify({ id: msg.id, type: 'result', ...lovelace(msg) }));
    }
  });
  socket.on('error', () => {});
});

/** Start op een vrije poort (of `port`) en geeft het adres terug. */
export async function startHaMock(port = 0) {
  resetHa('storage');
  await new Promise((r) => haServer.listen(port, r));
  return `http://localhost:${haServer.address().port}`;
}

// Los starten voor de UAT: node test/ha-mock.js 3998
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(await startHaMock(Number(process.argv[2]) || 3998));
}
