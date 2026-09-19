'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const OUTBOX_PATH = path.join(ROOT, 'logs', 'outbox.jsonl');
const WEBHOOK_TIMEOUT_MS = 8000;

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function ensureLogsDir() {
  const dir = path.dirname(OUTBOX_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks).toString('utf8');
      if (!buf) return resolve({});
      try {
        resolve(JSON.parse(buf));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
  };
  return map[ext] || 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  rel = decodeURIComponent(rel).replace(/\0/g, '');
  const filePath = path.normalize(path.join(PUBLIC, rel));
  if (!filePath.startsWith(PUBLIC)) {
    sendJson(res, 403, { ok: false, error: 'Forbidden' });
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { ok: false, error: 'Not found' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentTypeFor(filePath),
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

function postWebhook(urlStr, key, payload) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (e) {
      return reject(new Error('Invalid webhook URL'));
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const body = JSON.stringify(payload);
    const opts = {
      method: 'POST',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Bearer ${key}`,
        'X-Automation-Key': key,
      },
      timeout: WEBHOOK_TIMEOUT_MS,
    };
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, body: text });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Webhook timeout (8s)'));
    });
    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

function appendOutbox(entry) {
  ensureLogsDir();
  fs.appendFileSync(OUTBOX_PATH, JSON.stringify(entry) + '\n', 'utf8');
}

async function handleApiProxy(role, req, res, config) {
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: e.message });
  }

  const wh = config.webhooks && config.webhooks[role];
  if (!wh) {
    return sendJson(res, 503, {
      ok: false,
      error: `No webhook config for role "${role}"`,
    });
  }

  const url = (wh.url || '').trim();
  const keyEnv = wh.keyEnv || '';
  const key = keyEnv ? (process.env[keyEnv] || '') : '';

  if (!url || !key) {
    return sendJson(res, 503, {
      ok: false,
      error: `Webhook not configured for ${role}: set webhooks.${role}.url in config.json and env ${keyEnv || '(keyEnv)'}`,
    });
  }

  try {
    const result = await postWebhook(url, key, body);
    if (result.status >= 200 && result.status < 300) {
      return sendJson(res, 200, { ok: true, status: 200 });
    }
    const errText = `Webhook returned HTTP ${result.status}`;
    appendOutbox({
      ts: new Date().toISOString(),
      role,
      error: errText,
      status: result.status,
      payload: body,
      response: result.body.slice(0, 2000),
    });
    return sendJson(res, 502, { ok: false, error: errText });
  } catch (e) {
    const errText = e.message || String(e);
    appendOutbox({
      ts: new Date().toISOString(),
      role,
      error: errText,
      payload: body,
    });
    return sendJson(res, 502, { ok: false, error: errText });
  }
}

async function handlePing(req, res, config) {
  // Reuse today proxy with fixed ping body
  const fakeReq = Object.assign(Object.create(Object.getPrototypeOf(req)), req);
  // Simpler: call same logic with synthetic body
  const wh = config.webhooks && config.webhooks.today;
  if (!wh) {
    return sendJson(res, 503, { ok: false, error: 'No webhook config for role "today"' });
  }
  const url = (wh.url || '').trim();
  const keyEnv = wh.keyEnv || '';
  const key = keyEnv ? (process.env[keyEnv] || '') : '';
  if (!url || !key) {
    return sendJson(res, 503, {
      ok: false,
      error: `Webhook not configured for today: set webhooks.today.url in config.json and env ${keyEnv || '(keyEnv)'}`,
    });
  }
  const body = { action: 'ping' };
  try {
    const result = await postWebhook(url, key, body);
    if (result.status >= 200 && result.status < 300) {
      return sendJson(res, 200, { ok: true, status: 200 });
    }
    const errText = `Webhook returned HTTP ${result.status}`;
    appendOutbox({
      ts: new Date().toISOString(),
      role: 'today',
      error: errText,
      status: result.status,
      payload: body,
      response: result.body.slice(0, 2000),
    });
    return sendJson(res, 502, { ok: false, error: errText });
  } catch (e) {
    const errText = e.message || String(e);
    appendOutbox({
      ts: new Date().toISOString(),
      role: 'today',
      error: errText,
      payload: body,
    });
    return sendJson(res, 502, { ok: false, error: errText });
  }
}

function createServer(config) {
  return http.createServer(async (req, res) => {
    const host = req.headers.host || 'localhost';
    let pathname;
    try {
      pathname = new URL(req.url || '/', `http://${host}`).pathname;
    } catch {
      return sendJson(res, 400, { ok: false, error: 'Bad request' });
    }

    // CORS not needed for same-origin SPA; allow simple health probes
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    try {
      if (req.method === 'GET' && (pathname === '/health' || pathname === '/')) {
        if (pathname === '/health') {
          return sendJson(res, 200, { ok: true });
        }
        // GET / serves UI
        return serveStatic(req, res, '/');
      }

      if (req.method === 'POST' && pathname === '/api/today') {
        return await handleApiProxy('today', req, res, config);
      }
      if (req.method === 'POST' && pathname === '/api/kitchen') {
        return await handleApiProxy('kitchen', req, res, config);
      }
      if (req.method === 'POST' && pathname === '/api/floor') {
        return await handleApiProxy('floor', req, res, config);
      }
      if (req.method === 'POST' && pathname === '/api/ping') {
        return await handlePing(req, res, config);
      }

      if (req.method === 'GET') {
        return serveStatic(req, res, pathname);
      }

      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: 'Internal server error' });
    }
  });
}

function main() {
  ensureLogsDir();
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    console.error('Failed to load config.json:', e.message);
    process.exit(1);
  }

  const port = Number(config.port) || 8787;
  const server = createServer(config);
  server.listen(port, '0.0.0.0', () => {
    console.log(`PranaForge Concierge listening on 0.0.0.0:${port}`);
  });
}

main();
