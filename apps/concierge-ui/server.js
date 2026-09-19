'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const claimsGate = require('./lib/claimsGate');
const principalStore = require('./lib/principalStore');
const pieProxy = require('./lib/pieProxy');
const libraryIndex = require('./lib/libraryIndex');
const reviewEngine = require('./lib/reviewEngine');
const delivery = require('./lib/delivery');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const OUTBOX_PATH = path.join(ROOT, 'logs', 'outbox.jsonl');
const WEBHOOK_TIMEOUT_MS = 8000;

const KNOWN_PROTOCOL_IDS = [
  'DF-01', 'DF-02', 'EL-01', 'CL-01', 'SF-01',
  'TR-01', 'TR-02', 'HS-01', 'SS-01', 'PM-01', 'BR-01',
  // legacy snake_case kept for older Floor forms
  'daily_forge',
  'emotional_load_reset',
  'clarity_protocol',
  'stress_field_clearing',
  'travel_reset',
  'high_stress_interrupt',
  'sleep_wind_down',
  'pre_meeting',
  'body_ready',
];

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    const example = path.join(ROOT, 'config.example.json');
    if (!fs.existsSync(example)) throw new Error('config.json missing');
    fs.copyFileSync(example, CONFIG_PATH);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
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
      try { resolve(JSON.parse(buf)); }
      catch (e) { reject(new Error('Invalid JSON body')); }
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
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.md': 'text/markdown; charset=utf-8',
  };
  return map[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  rel = decodeURIComponent(rel).replace(/\0/g, '');
  const filePath = path.normalize(path.join(PUBLIC, rel));
  if (!filePath.startsWith(PUBLIC)) return sendJson(res, 403, { ok: false, error: 'Forbidden' });
  fs.readFile(filePath, (err, data) => {
    if (err) return sendJson(res, 404, { ok: false, error: 'Not found' });
    res.writeHead(200, { 'Content-Type': contentTypeFor(filePath), 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function staffPinRequired() {
  return Boolean((process.env.PF_STAFF_PIN || '').trim());
}

function requireStaff(req, res) {
  const required = (process.env.PF_STAFF_PIN || '').trim();
  if (!required) return true;
  const got = String(req.headers['x-pf-staff-pin'] || '').trim();
  if (got === required) return true;
  sendJson(res, 401, {
    ok: false,
    error: 'Staff PIN required (header X-PF-Staff-Pin)',
    auth_required: true,
  });
  return false;
}

function appendOutbox(entry) {
  ensureLogsDir();
  fs.appendFileSync(OUTBOX_PATH, JSON.stringify(entry) + '\n', 'utf8');
}

function webhookCreds(config, role) {
  const wh = config.webhooks && config.webhooks[role];
  if (!wh) return null;
  const url = (wh.url || '').trim();
  const keyEnv = wh.keyEnv || '';
  const key = keyEnv ? (process.env[keyEnv] || '') : '';
  if (!url || !key) return null;
  return { url, key };
}

function postWebhook(urlStr, key, payload) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(urlStr); }
    catch (e) { return reject(new Error('Invalid webhook URL')); }
    const lib = parsed.protocol === 'https:' ? https : http;
    const body = JSON.stringify(payload);
    const req = lib.request({
      method: 'POST',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: 'Bearer ' + key,
        'X-Automation-Key': key,
      },
      timeout: WEBHOOK_TIMEOUT_MS,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Webhook timeout (8s)')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function parseUpstream(text) {
  if (!text) return null;
  try { return JSON.parse(text); }
  catch (e) { return { text: text }; }
}

function applyClaims(role, data) {
  // Hard lock: claims regex on every outbound string (Today, Floor, Kitchen, WhatsApp stub)
  if (role !== 'kitchen' && role !== 'floor' && role !== 'claims' && role !== 'today' && role !== 'review' && role !== 'guest') {
    return { data: data, claims: null };
  }
  const gated = claimsGate.gatePayload(data);
  return {
    data: gated.scrubbed,
    claims: { flags: gated.flags, scrubbed: gated.flags.length > 0 },
  };
}

async function proxyRole(role, body, config) {
  const creds = webhookCreds(config, role);
  if (!creds) return { mode: 'unconfigured' };
  try {
    const result = await postWebhook(creds.url, creds.key, body);
    if (result.status >= 200 && result.status < 300) {
      const gated = applyClaims(role, parseUpstream(result.body));
      return {
        mode: 'webhook',
        data: gated.data,
        claims: gated.claims,
        upstream_status: result.status,
      };
    }
    appendOutbox({
      ts: new Date().toISOString(),
      role: role,
      error: 'Webhook returned HTTP ' + result.status,
      status: result.status,
      payload: body,
      response: (result.body || '').slice(0, 2000),
    });
    return {
      mode: 'error',
      error: 'Webhook returned HTTP ' + result.status,
      upstream_body: (result.body || '').slice(0, 2000),
    };
  } catch (e) {
    appendOutbox({
      ts: new Date().toISOString(),
      role: role,
      error: e.message || String(e),
      payload: body,
    });
    return { mode: 'error', error: e.message || String(e) };
  }
}

function localDietCard(body) {
  const alias = body.alias || 'principal';
  let p = {};
  try { p = principalStore.readPrincipal(alias); } catch (e) {}
  const day = body.day_type || (p.state && p.state.day_type) || p.day_type_preference || 'Forge';
  const physician = body.physician_constraints || (p.diet && p.diet.physician_constraints) || p.physician_constraints || 'none on file';
  const allergens = body.allergens || (Array.isArray(p.allergens) ? p.allergens.join(', ') : '') || 'none on file';
  const pattern = body.pattern || p.diet_pattern || (p.diet && p.diet.pattern) || 'India-kitchen, protein-anchored';
  const md = reviewEngine.buildKitchenCardMarkdown(
    Object.assign({}, p, {
      physician_constraints: physician,
      diet_pattern: pattern,
      allergens: typeof allergens === 'string' ? allergens.split(',').map((s) => s.trim()).filter(Boolean) : p.allergens,
    }),
    day,
    body.date || new Date().toISOString().slice(0, 10),
    body.protocol_id || ''
  );
  return { ok: true, source: 'local_fallback', alias: alias, day_type: day, text: md, card: md };
}

function localRunOfShow(body) {
  const alias = body.alias || 'principal';
  const protocol = body.protocol_id || 'DF-01';
  const catalog = libraryIndex.loadVaultCatalog();
  const hit = catalog.vault.find((v) => v.id === protocol) || { id: protocol, label: protocol };
  const text = reviewEngine.buildFloorLiveSheet(alias, hit, body.session_time || 'TBD');
  return {
    ok: true,
    source: 'local_fallback',
    alias: alias,
    protocol_id: protocol,
    known_protocol_ids: KNOWN_PROTOCOL_IDS,
    text: text,
    guest_text: reviewEngine.guestTextOnly(body.session_time || 'TBD'),
  };
}

function expandData(data) {
  if (data == null) return {};
  if (typeof data === 'object' && !Array.isArray(data)) return data;
  return { data: data };
}

async function handleToday(req, res, config) {
  if (!requireStaff(req, res)) return;
  let body;
  try { body = await readBody(req); }
  catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  const action = body.action || 'get_today';
  const alias = body.alias || 'principal';
  try {
    if (action === 'get_today') {
      const proxied = await proxyRole('today', body, config);
      if (proxied.mode === 'webhook') {
        return sendJson(res, 200, Object.assign({ ok: true }, expandData(proxied.data), { claims: proxied.claims }));
      }
      const brief = principalStore.buildTodayBrief(alias, body.date, body.tz);
      const gated = applyClaims('today', brief);
      return sendJson(res, 200, Object.assign({}, gated.data, { claims: gated.claims }));
    }
    if (action === 'log_score') {
      const updated = principalStore.logScore(alias, {
        date: body.date,
        energy: body.energy,
        sleep_rest: body.sleep_rest,
        clarity: body.clarity,
      });
      const proxied = await proxyRole('today', body, config);
      return sendJson(res, 200, {
        ok: true,
        source: 'local_principal_file',
        principal: updated,
        webhook: proxied.mode === 'webhook' ? proxied.data : null,
        webhook_status: proxied.mode,
      });
    }
    if (action === 'patch_preference') {
      const updated = principalStore.setPreference(alias, body.path, body.value);
      const proxied = await proxyRole('today', body, config);
      return sendJson(res, 200, {
        ok: true,
        source: 'local_principal_file',
        principal: updated,
        webhook: proxied.mode === 'webhook' ? proxied.data : null,
      });
    }
    if (action === 'patch_situation') {
      const patch = {
        day_type_preference: body.day_type,
        travel_72h: body.travel_72h,
        minutes_available: body.minutes_available,
        privacy_closed_room: body.privacy_closed_room,
      };
      if (body.dislikes_hard != null) patch.dislikes_hard = body.dislikes_hard;
      if (body.likes != null) patch.likes = body.likes;
      const updated = principalStore.patchPrincipal(alias, patch, {
        allow_physician_overwrite: !!body.allow_physician_overwrite,
      });
      const brief = principalStore.buildTodayBrief(alias, body.date, body.tz);
      const gated = applyClaims('today', brief);
      return sendJson(res, 200, {
        ok: true,
        source: 'local_principal_file',
        principal: updated,
        brief: gated.data,
        claims: gated.claims,
      });
    }
    return sendJson(res, 400, { ok: false, error: 'Unknown today action: ' + action });
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: e.message || String(e) });
  }
}

async function handleKitchen(req, res, config) {
  if (!requireStaff(req, res)) return;
  let body;
  try { body = await readBody(req); }
  catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }

  if (body.action === 'save_outbox') {
    try {
      const alias = body.alias || 'principal';
      let md = body.markdown || body.card || body.text;
      if (!md) {
        const card = localDietCard(body);
        md = card.text;
      }
      const saved = delivery.saveKitchenCard(alias, md, body.date);
      return sendJson(res, 200, saved);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message || String(e) });
    }
  }

  const proxied = await proxyRole('kitchen', body, config);
  if (proxied.mode === 'webhook') {
    return sendJson(res, 200, Object.assign({ ok: true }, expandData(proxied.data), { claims: proxied.claims }));
  }
  const gated = applyClaims('kitchen', localDietCard(body));
  return sendJson(res, 200, Object.assign({}, gated.data, { claims: gated.claims }));
}

async function handleFloor(req, res, config) {
  if (!requireStaff(req, res)) return;
  let body;
  try { body = await readBody(req); }
  catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }

  if (body.action === 'guest_text') {
    try {
      const gt = delivery.buildGuestText(body.session_time || 'TBD');
      return sendJson(res, 200, gt);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message || String(e) });
    }
  }

  if (body.action === 'log_qa') {
    const proxied = await proxyRole('floor', body, config);
    return sendJson(res, 200, {
      ok: true,
      source: 'qa_logged',
      received: {
        alias: body.alias,
        protocol_id: body.protocol_id,
        session_id: body.session_id,
        consent: body.consent,
        checklist: body.checklist,
        incident: body.incident,
      },
      webhook: proxied.mode === 'webhook' ? proxied.data : null,
      known_protocol_ids: KNOWN_PROTOCOL_IDS,
    });
  }
  const proxied = await proxyRole('floor', body, config);
  if (proxied.mode === 'webhook') {
    return sendJson(res, 200, Object.assign({ ok: true }, expandData(proxied.data), {
      claims: proxied.claims,
      known_protocol_ids: KNOWN_PROTOCOL_IDS,
    }));
  }
  const gated = applyClaims('floor', localRunOfShow(body));
  return sendJson(res, 200, Object.assign({}, gated.data, { claims: gated.claims }));
}

async function handleClaims(req, res, config) {
  if (!requireStaff(req, res)) return;
  let body;
  try { body = await readBody(req); }
  catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  const text = body.text != null ? String(body.text) : JSON.stringify(body);
  const flags = claimsGate.findFlags(text);
  const scrubbed = claimsGate.scrubText(text);
  const proxied = await proxyRole('claims', { action: 'audit', text: text }, config);
  return sendJson(res, 200, {
    ok: true,
    source: 'local_claims_gate',
    flags: flags,
    scrubbed: scrubbed,
    clean: flags.length === 0,
    webhook: proxied.mode === 'webhook' ? proxied.data : null,
  });
}

async function handlePrincipal(req, res, pathname) {
  if (!requireStaff(req, res)) return;
  const parts = pathname.split('/').filter(Boolean);
  const alias = parts[2];
  if (!alias) return sendJson(res, 400, { ok: false, error: 'alias required' });
  try {
    if (req.method === 'GET') {
      return sendJson(res, 200, { ok: true, principal: principalStore.readPrincipal(alias) });
    }
    if (req.method === 'PUT') {
      const body = await readBody(req);
      return sendJson(res, 200, { ok: true, principal: principalStore.writePrincipal(alias, body) });
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const updated = principalStore.patchPrincipal(alias, body, {
        allow_physician_overwrite: !!body.allow_physician_overwrite,
      });
      return sendJson(res, 200, { ok: true, principal: updated });
    }
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: e.message || String(e) });
  }
}

async function handlePing(req, res, config) {
  if (!requireStaff(req, res)) return;
  const creds = webhookCreds(config, 'today');
  if (!creds) {
    return sendJson(res, 200, {
      ok: true,
      source: 'local',
      message: 'Server up. Today webhook not configured - local Principal File still works.',
      auth_required: staffPinRequired(),
      known_protocol_ids: KNOWN_PROTOCOL_IDS,
      four_rooms: true,
    });
  }
  try {
    const result = await postWebhook(creds.url, creds.key, { action: 'ping' });
    const data = parseUpstream(result.body);
    if (result.status >= 200 && result.status < 300) {
      return sendJson(res, 200, { ok: true, source: 'webhook', data: data, upstream_status: result.status });
    }
    return sendJson(res, 502, { ok: false, error: 'Webhook HTTP ' + result.status, data: data });
  } catch (e) {
    appendOutbox({ ts: new Date().toISOString(), role: 'today', error: e.message, payload: { action: 'ping' } });
    return sendJson(res, 502, { ok: false, error: e.message || String(e) });
  }
}

async function handlePieRecommend(req, res, config) {
  if (!requireStaff(req, res)) return;
  let body;
  try { body = await readBody(req); }
  catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  const result = await pieProxy.proxyRecommend(body, config);
  return sendJson(res, 200, result);
}

async function handleLibrary(req, res) {
  if (!requireStaff(req, res)) return;
  return sendJson(res, 200, libraryIndex.buildLibraryIndex());
}

async function handleReview(req, res, config) {
  if (!requireStaff(req, res)) return;
  let body;
  try { body = await readBody(req); }
  catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  const action = body.action || 'options';
  const alias = body.alias || 'r';
  try {
    if (action === 'options') {
      const opts = await reviewEngine.buildOptions(alias, config, {
        day_type: body.day_type,
        travel_72h: body.travel_72h,
        minutes_available: body.minutes_available,
      });
      const draft = reviewEngine.buildDraft(
        alias,
        (opts.recommend && opts.recommend.id) || 'DF-01',
        false,
        body.session_time || 'TBD'
      );
      return sendJson(res, 200, Object.assign({}, opts, {
        draft: draft,
        refuse: opts.refuse,
      }));
    }
    if (action === 'draft') {
      const recommendId = body.recommend_id || body.recommend || 'DF-01';
      const draft = reviewEngine.buildDraft(
        alias,
        recommendId,
        !!body.include_rail,
        body.session_time || 'TBD'
      );
      return sendJson(res, 200, { ok: true, draft: draft });
    }
    if (action === 'approve') {
      const result = reviewEngine.approveReview(alias, {
        recommend_id: body.recommend_id || body.recommend,
        options: body.options,
        edits: body.edits,
        include_rail: !!body.include_rail,
        refuse: body.refuse,
        why: body.why,
        approver: body.approver || 'founder',
        session_time: body.session_time || 'TBD',
      });
      // Also write kitchen card to outbox on Approve (Room 4 contract)
      const saved = delivery.saveKitchenCard(
        alias,
        result.draft.kitchen_card_md,
        result.draft.date
      );
      const floor = delivery.floorFromApproval(result.draft);
      return sendJson(res, 200, {
        ok: true,
        review_path: result.review_path,
        record: result.record,
        floor: floor,
        outbox: saved,
        guest_text: result.draft.guest_text,
      });
    }
    if (action === 'silence') {
      const result = reviewEngine.silenceReview(alias, body);
      return sendJson(res, 200, result);
    }
    return sendJson(res, 400, { ok: false, error: 'Unknown review action: ' + action });
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: e.message || String(e) });
  }
}

function createServer(config) {
  return http.createServer(async (req, res) => {
    const host = req.headers.host || 'localhost';
    let pathname;
    try { pathname = new URL(req.url || '/', 'http://' + host).pathname; }
    catch (e) { return sendJson(res, 400, { ok: false, error: 'Bad request' }); }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, PATCH, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-PF-Staff-Pin',
      });
      return res.end();
    }

    try {
      if (req.method === 'GET' && pathname === '/health') {
        return sendJson(res, 200, { ok: true, auth_required: staffPinRequired(), four_rooms: true });
      }
      if (req.method === 'GET' && pathname === '/api/meta') {
        return sendJson(res, 200, {
          ok: true,
          auth_required: staffPinRequired(),
          known_protocol_ids: KNOWN_PROTOCOL_IDS,
          pie_url: pieProxy.resolvePieBaseUrl(config),
          pie_assist: true,
          four_rooms: true,
        });
      }
      if (req.method === 'GET' && pathname === '/api/library') {
        return await handleLibrary(req, res);
      }
      if (pathname.indexOf('/api/principal') === 0) {
        return await handlePrincipal(req, res, pathname);
      }
      if (req.method === 'POST' && pathname === '/api/today') return await handleToday(req, res, config);
      if (req.method === 'POST' && pathname === '/api/kitchen') return await handleKitchen(req, res, config);
      if (req.method === 'POST' && pathname === '/api/floor') return await handleFloor(req, res, config);
      if (req.method === 'POST' && pathname === '/api/claims') return await handleClaims(req, res, config);
      if (req.method === 'POST' && pathname === '/api/review') return await handleReview(req, res, config);
      if (req.method === 'POST' && pathname === '/api/pie/recommend') return await handlePieRecommend(req, res, config);
      if (req.method === 'POST' && pathname === '/api/ping') return await handlePing(req, res, config);
      if (req.method === 'GET') return serveStatic(req, res, pathname);
      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    } catch (e) {
      console.error(e);
      sendJson(res, 500, { ok: false, error: 'Internal server error' });
    }
  });
}

function main() {
  ensureLogsDir();
  let config;
  try { config = loadConfig(); }
  catch (e) {
    console.error('Failed to load config.json:', e.message);
    process.exit(1);
  }
  const port = Number(config.port) || 8787;
  createServer(config).listen(port, '0.0.0.0', function () {
    console.log('PranaForge Concierge listening on 0.0.0.0:' + port);
    console.log('Staff PIN ' + (staffPinRequired() ? 'REQUIRED' : 'not set (dev open)'));
    console.log('Four Rooms: Library | Situation | Review | Delivery');
  });
}

main();
