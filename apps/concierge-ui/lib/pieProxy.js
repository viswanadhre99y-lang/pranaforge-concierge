'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_PIE_URL = 'http://127.0.0.1:8790';
const PIE_TIMEOUT_MS = 8000;

/**
 * Normalize Floor / staff-assist payload into PIE flat recommend body.
 * Accepts event_tag as alias for upcoming_event_tag; alias as fallback for client_id.
 * Never expands vault recipes — IDs + scores only.
 */
function buildPieRecommendBody(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const clientId = (src.client_id || src.alias || '').toString().trim() || null;
  const eventTag = src.upcoming_event_tag != null && src.upcoming_event_tag !== ''
    ? src.upcoming_event_tag
    : (src.event_tag != null ? src.event_tag : undefined);

  const body = {};
  if (clientId) body.client_id = clientId;
  if (src.client_type) body.client_type = String(src.client_type);

  if (src.available_minutes != null && src.available_minutes !== '') {
    body.available_minutes = Number(src.available_minutes);
  }
  if (src.place_class) body.place_class = String(src.place_class);
  if (eventTag != null && eventTag !== '') body.upcoming_event_tag = String(eventTag);
  if (src.stress != null && src.stress !== '') body.stress = Number(src.stress);
  if (src.energy != null && src.energy !== '') body.energy = Number(src.energy);
  if (src.sleep_h != null && src.sleep_h !== '') body.sleep_h = Number(src.sleep_h);
  if (src.prefers_breath) body.prefers_breath = String(src.prefers_breath);
  if (src.goal) body.goal = String(src.goal);
  if (src.privacy) body.privacy = String(src.privacy);
  if (src.history_notes) body.history_notes = String(src.history_notes);
  if (src.notes) body.notes = String(src.notes);
  if (src.clinician_mode === true) body.clinician_mode = true;
  if (src.crisis_flag === true) body.crisis_flag = true;

  return body;
}

function resolvePieBaseUrl(config) {
  const fromEnv = (process.env.PIE_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const fromCfg = config && config.pie_url ? String(config.pie_url).trim() : '';
  if (fromCfg) return fromCfg.replace(/\/$/, '');
  return DEFAULT_PIE_URL;
}

function postJson(urlStr, headers, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(urlStr); }
    catch (e) { return reject(new Error('Invalid PIE_URL')); }
    const lib = parsed.protocol === 'https:' ? https : http;
    const body = JSON.stringify(payload);
    const req = lib.request({
      method: 'POST',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }, headers || {}),
      timeout: timeoutMs || PIE_TIMEOUT_MS,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; }
        catch (e) { json = { raw: text }; }
        resolve({ status: res.statusCode, body: json, text: text });
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('PIE timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Forward recommend to PIE. On network / unreachable → { ok:false, error:'pie_unavailable' }.
 */
async function proxyRecommend(rawBody, config) {
  const pieBody = buildPieRecommendBody(rawBody);
  const base = resolvePieBaseUrl(config);
  const url = base + '/api/recommend';
  const headers = {};
  const pin = (process.env.PIE_STAFF_PIN || '').trim();
  if (pin) headers['X-PIE-Staff-Pin'] = pin;

  try {
    const result = await postJson(url, headers, pieBody, PIE_TIMEOUT_MS);
    if (result.status >= 200 && result.status < 300) {
      return Object.assign({ ok: true, source: 'pie' }, result.body || {});
    }
    if (result.status === 401) {
      return {
        ok: false,
        error: 'pie_unauthorized',
        upstream_status: 401,
        pie: result.body,
      };
    }
    // PIE returned a handled error (e.g. validation) — pass through without crashing Floor
    if (result.body && typeof result.body === 'object') {
      return Object.assign({ ok: false, source: 'pie', upstream_status: result.status }, result.body);
    }
    return {
      ok: false,
      error: 'pie_error',
      upstream_status: result.status,
      detail: (result.text || '').slice(0, 500),
    };
  } catch (e) {
    return { ok: false, error: 'pie_unavailable', detail: e.message || String(e) };
  }
}

module.exports = {
  DEFAULT_PIE_URL,
  buildPieRecommendBody,
  resolvePieBaseUrl,
  proxyRecommend,
};
