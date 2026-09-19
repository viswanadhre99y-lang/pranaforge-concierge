'use strict';

/**
 * Four Rooms smoke for fixture R.
 * Expect: Travel → TR-01 + arrival card without smoothie;
 * Approve → outbox exists; guest text has zero step-list keywords;
 * Claims still fails "treats insomnia."
 *
 * Usage (server must be up on :8787, or this script starts one):
 *   node scripts/test-four-rooms.js
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const claimsGate = require('../lib/claimsGate');
const reviewEngine = require('../lib/reviewEngine');
const principalStore = require('../lib/principalStore');

const BASE = process.env.PF_TEST_BASE || 'http://127.0.0.1:8787';
const STEP_RE = reviewEngine.STEP_LIST_FORBIDDEN;

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, BASE);
    const payload = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        method: method,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : {},
        timeout: 8000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = text ? JSON.parse(text) : null; }
          catch (e) { json = { raw: text }; }
          resolve({ status: res.statusCode, body: json, text: text });
        });
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealth(maxMs) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const h = await request('GET', '/health');
      if (h.status === 200 && h.body && h.body.ok) return true;
    } catch (e) {}
    await sleep(200);
  }
  return false;
}

async function ensureServer() {
  try {
    const h = await request('GET', '/health');
    if (h.status === 200) return { child: null };
  } catch (e) {}
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env),
  });
  const ok = await waitHealth(8000);
  if (!ok) {
    child.kill();
    throw new Error('Server failed to start on :8787');
  }
  return { child: child };
}

async function main() {
  // Unit: claims still flags "treats insomnia"
  const flags = claimsGate.findFlags('This protocol treats insomnia.');
  assert.ok(flags.length > 0, 'claims must flag "treats insomnia"');
  assert.ok(flags.some((f) => /treat/i.test(f)), 'expect treat* flag');

  // Unit: deterministic Travel → TR-01
  const fb = reviewEngine.deterministicFallback('Travel', true);
  assert.strictEqual(fb.recommend, 'TR-01');

  // Ensure fixture R on disk (idempotent)
  const rPath = path.join(ROOT, 'data', 'principals', 'r.json');
  assert.ok(fs.existsSync(rPath), 'fixture r.json (alias R) must exist');
  const p = principalStore.readPrincipal('r');
  assert.strictEqual(p.state.day_type, 'Travel');
  assert.ok(p.dislikes_hard.some((d) => /cold\s*smoothie/i.test(d)));
  assert.ok(/none/i.test(p.physician_constraints || p.diet.physician_constraints));

  // Reject diagnosis keys
  let rejected = false;
  try {
    principalStore.patchPrincipal('r', { diagnosis: 'insomnia' });
  } catch (e) {
    rejected = true;
  }
  assert.ok(rejected, 'diagnosis key must be rejected');

  // Physician lock
  let physLocked = false;
  try {
    principalStore.patchPrincipal('r', { physician_constraints: 'altered' });
  } catch (e) {
    physLocked = /physician_constraints/.test(e.message);
  }
  assert.ok(physLocked, 'physician_constraints must not overwrite');

  const { child } = await ensureServer();
  try {
    // OPTIONS for R
    const opts = await request('POST', '/api/review', {
      action: 'options',
      alias: 'r',
      session_time: '18:00 IST',
    });
    assert.strictEqual(opts.status, 200, 'options status');
    assert.ok(opts.body.ok, 'options ok');
    assert.strictEqual(opts.body.recommend.id, 'TR-01', 'recommend TR-01 for Travel R');
    assert.ok(
      (opts.body.options || []).some((o) => o.id === 'TR-01'),
      'TR-01 in options'
    );
    assert.ok(opts.body.why, 'why line present');
    assert.ok(
      opts.body.draft && opts.body.draft.kitchen_card_md,
      'draft kitchen card'
    );
    const card = opts.body.draft.kitchen_card_md;
    assert.ok(/HARD AVOID:\s*cold smoothie/i.test(card), 'arrival card must HARD AVOID cold smoothie');
    assert.ok(/warm/i.test(card), 'arrival card prefers warm');
    assert.ok(!/MEAL 1[\s\S]*?cold smoothie(?![\s\S]*no )/i.test(card) || /no cold smoothie/i.test(card), 'travel meal cues avoid cold smoothie');
    // Approve
    const appr = await request('POST', '/api/review', {
      action: 'approve',
      alias: 'r',
      recommend_id: 'TR-01',
      options: opts.body.options,
      include_rail: false,
      refuse: opts.body.refuse,
      why: opts.body.why,
      approver: 'founder',
      session_time: '18:00 IST',
    });
    assert.strictEqual(appr.status, 200, 'approve status');
    assert.ok(appr.body.ok, 'approve ok: ' + JSON.stringify(appr.body));
    assert.ok(appr.body.review_path, 'review_path written');
    assert.ok(fs.existsSync(appr.body.review_path), 'review file exists');
    assert.ok(appr.body.outbox && appr.body.outbox.path, 'outbox path');
    assert.ok(fs.existsSync(appr.body.outbox.path), 'outbox file exists');

    const outboxMd = fs.readFileSync(appr.body.outbox.path, 'utf8');
    assert.ok(/Kitchen card|Alias: r/i.test(outboxMd), 'outbox has card');
    assert.ok(/HARD AVOID: cold smoothie/i.test(outboxMd), 'outbox avoids cold smoothie');
    assert.ok(!/treats insomnia/i.test(outboxMd), 'outbox clean of medical claim');

    const guest = appr.body.guest_text || '';
    assert.ok(guest.length > 0, 'guest text present');
    for (const re of STEP_RE) {
      assert.ok(!re.test(guest), 'guest text must not match ' + re);
    }
    assert.ok(/Session at/i.test(guest), 'guest logistics');
    assert.ok(/See you live/i.test(guest), 'guest live line');

    // Floor guest_text endpoint
    const gt = await request('POST', '/api/floor', {
      action: 'guest_text',
      session_time: '18:00 IST',
    });
    assert.ok(gt.body.ok);
    for (const re of STEP_RE) {
      assert.ok(!re.test(gt.body.guest_text), 'floor guest_text clean');
    }

    // Log score on R
    const score = await request('POST', '/api/today', {
      action: 'log_score',
      alias: 'r',
      date: new Date().toISOString().slice(0, 10),
      energy: 4,
      sleep_rest: 3,
      clarity: 4,
    });
    assert.ok(score.body.ok, 'score logged');

    // Claims API
    const claims = await request('POST', '/api/claims', {
      text: 'This treats insomnia.',
    });
    assert.ok(claims.body.ok);
    assert.ok(claims.body.flags.length > 0, 'API flags treats insomnia');
    assert.strictEqual(claims.body.clean, false);

    // Library
    const lib = await request('GET', '/api/library');
    assert.ok(lib.body.ok);
    assert.ok((lib.body.vault || []).some((v) => v.id === 'TR-01'));

    console.log('ok — four rooms smoke (R Travel → TR-01 → Approve → outbox)');
    console.log('  review:', appr.body.review_path);
    console.log('  outbox:', appr.body.outbox.path);
    console.log('  guest:', guest);
    console.log('  why:', opts.body.why);
  } finally {
    if (child) child.kill();
  }
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
