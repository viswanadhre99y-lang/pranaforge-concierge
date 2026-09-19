'use strict';

/**
 * Minimal assert: Floor body maps to PIE recommend payload (no network).
 * Run: node scripts/test-pie-proxy.js
 */
const assert = require('assert');
const { buildPieRecommendBody, resolvePieBaseUrl, DEFAULT_PIE_URL } = require('../lib/pieProxy');

const mapped = buildPieRecommendBody({
  alias: 'principal',
  client_id: '',
  available_minutes: '12',
  place_class: 'office',
  event_tag: 'investor_meeting',
  stress: 5,
  energy: 3,
  sleep_h: 5.5,
  prefers_breath: 'yes',
});

assert.strictEqual(mapped.client_id, 'principal', 'alias fills client_id when blank');
assert.strictEqual(mapped.available_minutes, 12);
assert.strictEqual(mapped.place_class, 'office');
assert.strictEqual(mapped.upcoming_event_tag, 'investor_meeting', 'event_tag → upcoming_event_tag');
assert.strictEqual(mapped.stress, 5);
assert.strictEqual(mapped.energy, 3);
assert.strictEqual(mapped.sleep_h, 5.5);
assert.strictEqual(mapped.prefers_breath, 'yes');
assert.ok(!('event_tag' in mapped), 'raw event_tag not forwarded');
assert.ok(!('alias' in mapped), 'alias not forwarded as field');

const preferClient = buildPieRecommendBody({ alias: 'a', client_id: 'c1', event_tag: 'pitch' });
assert.strictEqual(preferClient.client_id, 'c1');
assert.strictEqual(preferClient.upcoming_event_tag, 'pitch');

const preferUpcoming = buildPieRecommendBody({
  event_tag: 'pitch',
  upcoming_event_tag: 'board_meeting',
});
assert.strictEqual(preferUpcoming.upcoming_event_tag, 'board_meeting');

assert.strictEqual(resolvePieBaseUrl({}), DEFAULT_PIE_URL);
assert.strictEqual(resolvePieBaseUrl({ pie_url: '' }), DEFAULT_PIE_URL);
assert.strictEqual(resolvePieBaseUrl({ pie_url: 'http://pie:8790/' }), 'http://pie:8790');

const prev = process.env.PIE_URL;
process.env.PIE_URL = 'http://env-pie:9000/';
assert.strictEqual(resolvePieBaseUrl({ pie_url: 'http://cfg:1' }), 'http://env-pie:9000');
if (prev === undefined) delete process.env.PIE_URL;
else process.env.PIE_URL = prev;

console.log('ok — pie proxy body map + URL resolve');
