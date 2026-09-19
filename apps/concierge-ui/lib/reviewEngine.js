'use strict';

const fs = require('fs');
const path = require('path');
const principalStore = require('./principalStore');
const libraryIndex = require('./libraryIndex');
const pieProxy = require('./pieProxy');
const claimsGate = require('./claimsGate');

const REVIEWS_DIR = path.join(__dirname, '..', 'data', 'reviews');

const STEP_LIST_FORBIDDEN = [
  /\binhale\b/i,
  /\bexhale\b/i,
  /\bpose\b/i,
  /\bsound\s+xu\b/i,
  /\bpranic\b/i,
];

function ensureReviewsDir() {
  if (!fs.existsSync(REVIEWS_DIR)) fs.mkdirSync(REVIEWS_DIR, { recursive: true });
}

function dayTypeOf(p) {
  return (p.state && p.state.day_type) || p.day_type_preference || 'Forge';
}

function deterministicFallback(dayType, travel72h) {
  const dt = dayType || 'Forge';
  if (dt === 'Travel' || travel72h) {
    return {
      recommend: 'TR-01',
      options: ['TR-01', 'TR-02', 'SS-01'],
      why: 'Travel / travel_72h → TR-01 arrival settle (deterministic fallback).',
    };
  }
  if (dt === 'Stress') {
    return {
      recommend: 'HS-01',
      options: ['HS-01', 'SS-01', 'SF-01'],
      why: 'Stress day → HS-01 high-stress interrupt (deterministic fallback).',
    };
  }
  if (dt === 'Peak') {
    return {
      recommend: 'PM-01',
      options: ['PM-01', 'CL-01', 'BR-01'],
      why: 'Peak day → PM-01 pre-meeting (deterministic fallback).',
    };
  }
  return {
    recommend: 'DF-01',
    options: ['DF-01', 'DF-02', 'CL-01'],
    why: 'Forge / default → DF-01 Daily Forge (deterministic fallback).',
  };
}

function mapPieToVaultIds(pieResult) {
  const list = (pieResult && pieResult.recommendations) || [];
  const ids = [];
  for (const r of list) {
    const raw = String(r.protocol_id || r.id || '').toLowerCase();
    if (!raw) continue;
    if (/travel|arrival|tr[-_]?0?1/.test(raw)) ids.push('TR-01');
    else if (/jet|tr[-_]?0?2/.test(raw)) ids.push('TR-02');
    else if (/high.?stress|hs[-_]?0?1|interrupt/.test(raw)) ids.push('HS-01');
    else if (/sleep|wind|ss[-_]?0?1/.test(raw)) ids.push('SS-01');
    else if (/pre.?meet|pm[-_]?0?1|meeting/.test(raw)) ids.push('PM-01');
    else if (/clarity|cl[-_]?0?1/.test(raw)) ids.push('CL-01');
    else if (/stress.?field|sf[-_]?0?1/.test(raw)) ids.push('SF-01');
    else if (/emotional|el[-_]?0?1/.test(raw)) ids.push('EL-01');
    else if (/body.?ready|br[-_]?0?1/.test(raw)) ids.push('BR-01');
    else if (/forge|df[-_]?0?2|short/.test(raw)) ids.push('DF-02');
    else if (/forge|daily|df[-_]?0?1/.test(raw)) ids.push('DF-01');
  }
  // unique preserve order
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out.slice(0, 3);
}

async function buildOptions(alias, config, overrides) {
  overrides = overrides || {};
  const p = principalStore.readPrincipal(alias);
  const dayType = overrides.day_type || dayTypeOf(p);
  const travel72h =
    overrides.travel_72h != null
      ? !!overrides.travel_72h
      : !!(p.state && p.state.travel_72h) || !!p.travel_72h;
  const minutes =
    overrides.minutes_available != null
      ? Number(overrides.minutes_available)
      : (p.state && p.state.minutes_available) || p.minutes_available || 15;

  let pieOk = false;
  let pieWhy = '';
  let options = [];
  let recommend = '';
  let why = '';
  let source = 'deterministic';

  try {
    const pie = await pieProxy.proxyRecommend(
      {
        alias: alias,
        client_id: alias,
        available_minutes: minutes,
        place_class: travel72h || dayType === 'Travel' ? 'hotel' : 'private',
        event_tag:
          dayType === 'Travel'
            ? 'post_landing'
            : dayType === 'Peak'
              ? 'investor_meeting'
              : dayType === 'Stress'
                ? 'midday_crash'
                : 'none',
        stress: dayType === 'Stress' ? 5 : 3,
        energy: 3,
      },
      config || {}
    );
    if (pie && pie.ok && !pie.error) {
      const mapped = mapPieToVaultIds(pie);
      if (mapped.length) {
        pieOk = true;
        options = mapped;
        recommend = mapped[0];
        pieWhy =
          (Array.isArray(pie.why_selected)
            ? pie.why_selected.join(' · ')
            : pie.why_selected) ||
          (pie.inferred_need ? 'inferred_need: ' + pie.inferred_need : '') ||
          'PIE Top-3 mapped to vault IDs.';
        why = pieWhy;
        source = 'pie';
      }
    }
  } catch (e) {
    /* fall through */
  }

  if (!pieOk) {
    const fb = deterministicFallback(dayType, travel72h);
    options = fb.options;
    recommend = fb.recommend;
    why = fb.why;
    source = 'deterministic';
  }

  const catalog = libraryIndex.loadVaultCatalog();
  const enrich = (id) => {
    const hit = catalog.vault.find((v) => v.id === id);
    return hit
      ? {
          id: hit.id,
          label: hit.label,
          duration_min: hit.duration_min,
          fill_status: hit.fill_status,
        }
      : { id: id, label: id };
  };

  const publicRail = {
    id: 'rail-cyclic-sigh',
    label: 'Cyclic sigh (public rail)',
    include_default: false,
    note: 'Off unless reviewer ticks include rail',
  };

  const refuse = [
    'WhatsApp protocol step-list / recipe to guest',
    'Medical / cure / treat / diagnose language',
    'Stacking multiple vault methods in one paid hour',
    'Public rail on by default (include rail is off)',
    'Inventing Daily Forge / asana / pranic steps (FILL empty)',
    'Overwriting physician_constraints',
  ];

  return {
    ok: true,
    alias: principalStore.safeAlias(alias),
    day_type: dayType,
    travel_72h: travel72h,
    minutes_available: minutes,
    options: options.map(enrich),
    recommend: enrich(recommend),
    public_rail: publicRail,
    refuse: refuse,
    why: why,
    source: source,
    physician_constraints:
      (p.diet && p.diet.physician_constraints) ||
      p.physician_constraints ||
      'none',
    dislikes_hard: p.dislikes_hard || [],
  };
}

function buildKitchenCardMarkdown(p, dayType, dateStr, protocolId) {
  const alias = p.alias;
  const phys =
    (p.diet && p.diet.physician_constraints) ||
    p.physician_constraints ||
    'none on file';
  const allergens = (p.allergens || (p.diet && p.diet.allergens) || []).join(', ') || 'none on file';
  const pattern =
    p.diet_pattern || (p.diet && p.diet.pattern) || 'India-kitchen, protein-anchored';
  const dislikes = p.dislikes_hard || [];
  const travel = dayType === 'Travel' || !!(p.state && p.state.travel_72h) || !!p.travel_72h;

  const mealNotes = [];
  if (travel) {
    mealNotes.push('Arrival: warm, simple, familiar spices; low alcohol; no tasting-menu experiment.');
  }
  if (dayType === 'Stress') {
    mealNotes.push('Stress: cut fried, late sugar, espresso after 14:00 local.');
  }
  if (dislikes.some((d) => /cold\s*smoothie/i.test(String(d)))) {
    mealNotes.push('HARD AVOID: cold smoothie (principal dislike).');
  }
  for (const d of dislikes) {
    if (!/cold\s*smoothie/i.test(String(d))) {
      mealNotes.push('HARD AVOID: ' + d);
    }
  }

  const meal1 = travel
    ? 'Warm dal or broth + soft rice/roti; familiar spice; no cold smoothie.'
    : 'Protein-anchored first meal; plants visible; warm spices default.';
  const meal2 = 'Simple plate per pattern; chef-executable; no experiment.';
  const meal3 = 'Light evening; caffeine cutoff per file.';

  const lines = [
    '# Kitchen card — ' + alias + ' — ' + dateStr,
    '',
    '- Alias: ' + alias,
    '- Date/tz: ' + dateStr + ' / ' + (p.timezone_now || p.timezone || 'Asia/Kolkata'),
    '- Day type: ' + dayType,
    '- Protocol intent (staff): ' + (protocolId || '-'),
    '- Physician constraints (verbatim, win): ' + phys,
    '- Pattern: ' + pattern,
    '- Allergens: ' + allergens,
    '',
    '## MEAL 1',
    meal1,
    '',
    '## MEAL 2',
    meal2,
    '',
    '## MEAL 3',
    meal3,
    '',
    '## Chef rules',
    '- Anti-inflammatory default',
    '- NEVER override physician_constraints',
    '- No supplements pitch; no calorie sermon; no disease-food claims',
    mealNotes.length ? mealNotes.map((m) => '- ' + m).join('\n') : '- (no extra locks)',
    '',
    '## Avoids',
    dislikes.length
      ? dislikes.map((d) => '- ' + d).join('\n')
      : '- none on file',
    '',
  ];
  return lines.join('\n');
}

function buildFloorLiveSheet(alias, protocol, sessionTime) {
  const id = protocol.id || protocol;
  const label = protocol.label || id;
  const dur = protocol.duration_min
    ? Array.isArray(protocol.duration_min)
      ? protocol.duration_min[0] + '–' + protocol.duration_min[1] + ' min'
      : String(protocol.duration_min)
    : 'per catalog';
  const time = sessionTime || 'TBD';
  const lines = [
    'FLOOR LIVE RUN SHEET — staff only',
    'Alias: ' + alias,
    'Protocol ID: ' + id + ' — ' + label,
    'Duration window: ' + dur,
    'Session time: ' + time,
    '',
    'CHECKLIST',
    '[ ] Consent first — lifestyle recovery only; not medical care; stop on discomfort',
    '[ ] Quiet room / phones per principal file',
    '[ ] Timer started (target ±2 min QA)',
    '[ ] Deliver live — do NOT paste recipe / step-list to guest WhatsApp',
    '[ ] FILL empty: no invented asana or pranic steps',
    '[ ] Fail checks: discomfort → stop; crisis → escalate human; no photos; no named gossip',
    '[ ] Close + score prompt (energy / sleep_rest / clarity 1–5)',
    '',
    'GUEST CHANNEL (logistics only — copy via Guest text button)',
    'Session at ' + time + '. Quiet room. Phones per your file. See you live.',
  ];
  return lines.join('\n');
}

function guestTextOnly(sessionTime) {
  const time = sessionTime || 'TBD';
  return (
    'Session at ' +
    time +
    '. Quiet room. Phones per your file. See you live.'
  );
}

function buildDraft(alias, recommendId, includeRail, sessionTime) {
  const p = principalStore.readPrincipal(alias);
  const dayType = dayTypeOf(p);
  const dateStr = new Date().toISOString().slice(0, 10);
  const catalog = libraryIndex.loadVaultCatalog();
  const protocol =
    catalog.vault.find((v) => v.id === recommendId) ||
    { id: recommendId, label: recommendId };

  let floor = buildFloorLiveSheet(alias, protocol, sessionTime);
  if (includeRail) {
    floor +=
      '\n\nOPTIONAL PUBLIC RAIL (reviewer ticked include rail)\n' +
      'Wrap only — does not replace vault ID ' +
      protocol.id +
      '.';
  }

  const kitchenMd = buildKitchenCardMarkdown(p, dayType, dateStr, protocol.id);
  const guest = guestTextOnly(sessionTime);

  // Claims gate on outbound strings
  const floorGated = claimsGate.gatePayload({ text: floor });
  const kitchenGated = claimsGate.gatePayload({ text: kitchenMd });
  const guestGated = claimsGate.gatePayload({ text: guest });

  return {
    floor_live_sheet: floorGated.scrubbed.text,
    kitchen_card_md: kitchenGated.scrubbed.text,
    guest_text: guestGated.scrubbed.text,
    claims: {
      floor: floorGated.flags,
      kitchen: kitchenGated.flags,
      guest: guestGated.flags,
    },
    protocol_id: protocol.id,
    include_rail: !!includeRail,
    date: dateStr,
  };
}

function assertGuestSafe(text) {
  for (const re of STEP_LIST_FORBIDDEN) {
    if (re.test(text)) {
      throw new Error('Guest text contains forbidden step-list keyword');
    }
  }
}

function approveReview(alias, payload) {
  ensureReviewsDir();
  const a = principalStore.safeAlias(alias);
  const ts = new Date().toISOString();
  const isoSafe = ts.replace(/[:.]/g, '-');
  const recommendId = (payload.recommend_id || payload.recommend || '').toString();
  if (!recommendId) throw new Error('recommend_id required to Approve');

  const includeRail = !!payload.include_rail;
  const sessionTime = payload.session_time || 'TBD';
  const draft = buildDraft(a, recommendId, includeRail, sessionTime);
  assertGuestSafe(draft.guest_text);

  const record = {
    alias: a,
    options: payload.options || [],
    recommend: recommendId,
    edits: payload.edits || {},
    include_rail: includeRail,
    refuse: payload.refuse || [],
    why: payload.why || '',
    draft: {
      floor_live_sheet: draft.floor_live_sheet,
      kitchen_card_md: draft.kitchen_card_md,
      guest_text: draft.guest_text,
      protocol_id: draft.protocol_id,
    },
    approver: payload.approver || 'founder',
    ts: ts,
    silence: false,
  };

  const fp = path.join(REVIEWS_DIR, a + '-' + isoSafe + '.json');
  fs.writeFileSync(fp, JSON.stringify(record, null, 2) + '\n', 'utf8');

  // Update last_protocol on principal
  principalStore.patchPrincipal(a, {
    state: { last_protocol: recommendId },
  });

  return {
    ok: true,
    review_path: fp,
    record: record,
    draft: draft,
  };
}

function silenceReview(alias, payload) {
  ensureReviewsDir();
  const a = principalStore.safeAlias(alias);
  const ts = new Date().toISOString();
  const isoSafe = ts.replace(/[:.]/g, '-');
  const record = {
    alias: a,
    options: payload.options || [],
    recommend: null,
    silence: true,
    why: payload.why || 'SILENCE — no protocol this window',
    approver: payload.approver || 'founder',
    ts: ts,
  };
  const fp = path.join(REVIEWS_DIR, a + '-' + isoSafe + '-silence.json');
  fs.writeFileSync(fp, JSON.stringify(record, null, 2) + '\n', 'utf8');
  return { ok: true, review_path: fp, record: record };
}

module.exports = {
  buildOptions,
  buildDraft,
  approveReview,
  silenceReview,
  guestTextOnly,
  buildKitchenCardMarkdown,
  buildFloorLiveSheet,
  deterministicFallback,
  STEP_LIST_FORBIDDEN,
  REVIEWS_DIR,
  assertGuestSafe,
};
