'use strict';

const fs = require('fs');
const path = require('path');
const claimsGate = require('./claimsGate');
const reviewEngine = require('./reviewEngine');
const principalStore = require('./principalStore');

const OUTBOX_DIR = path.join(__dirname, '..', 'data', 'outbox');

function ensureOutbox() {
  if (!fs.existsSync(OUTBOX_DIR)) fs.mkdirSync(OUTBOX_DIR, { recursive: true });
}

function saveKitchenCard(alias, markdown, dateStr) {
  ensureOutbox();
  const a = principalStore.safeAlias(alias);
  const d = dateStr || new Date().toISOString().slice(0, 10);
  const gated = claimsGate.gatePayload({ text: String(markdown || '') });
  const text = gated.scrubbed.text;
  const fp = path.join(OUTBOX_DIR, a + '-' + d + '.md');
  fs.writeFileSync(fp, text + (text.endsWith('\n') ? '' : '\n'), 'utf8');
  return {
    ok: true,
    path: fp,
    relative: 'data/outbox/' + a + '-' + d + '.md',
    claims_flags: gated.flags,
  };
}

function floorFromApproval(draft) {
  return {
    ok: true,
    mode: 'live_checklist',
    floor_live_sheet: draft.floor_live_sheet,
    guest_text: draft.guest_text,
    protocol_id: draft.protocol_id,
    note: 'Guest channel = logistics only. No recipe / step-list.',
  };
}

function buildGuestText(sessionTime) {
  const text = reviewEngine.guestTextOnly(sessionTime);
  reviewEngine.assertGuestSafe(text);
  const gated = claimsGate.gatePayload({ text: text });
  return {
    ok: true,
    guest_text: gated.scrubbed.text,
    claims_flags: gated.flags,
  };
}

module.exports = {
  saveKitchenCard,
  floorFromApproval,
  buildGuestText,
  OUTBOX_DIR,
};
