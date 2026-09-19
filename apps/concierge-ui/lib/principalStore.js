'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'principals');

const DAY_TYPES = ['Forge', 'Travel', 'Stress', 'Peak'];

const DIAGNOSIS_KEYS = new Set([
  'diagnosis',
  'diagnoses',
  'disease',
  'disorder',
  'symptom',
  'symptoms',
  'condition',
  'conditions',
  'patient',
  'icd',
  'icd10',
  'medical_history',
  'prescription',
  'prescribed',
  'aadhaar',
  'passport',
  'room_number',
  'room',
]);

const KNOWN_TOP = new Set([
  'alias',
  'partner_id',
  'track',
  'language',
  'privacy_flags',
  'timezone',
  'timezone_home',
  'timezone_now',
  'contacts',
  'likes',
  'dislikes_hard',
  'diet',
  'state',
  'service',
  'allergens',
  'diet_pattern',
  'physician_constraints',
  'day_type_preference',
  'preferences',
  'scores',
  'notes_lifestyle',
  'travel_72h',
  'minutes_available',
  'privacy_closed_room',
  'updated_at',
]);

function safeAlias(alias) {
  const a = String(alias || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  if (!a || a.length > 64) throw new Error('Invalid alias');
  return a;
}

function fileFor(alias) {
  return path.join(DATA_DIR, safeAlias(alias) + '.json');
}

function defaultPrincipal(alias) {
  return {
    alias: safeAlias(alias),
    partner_id: '',
    track: '',
    language: 'en',
    privacy_flags: [],
    timezone: 'Asia/Kolkata',
    timezone_home: 'Asia/Kolkata',
    timezone_now: 'Asia/Kolkata',
    contacts: { pa: '', chef: '', house: '', facilitator: '' },
    likes: [],
    dislikes_hard: [],
    diet: {
      physician_constraints: '',
      pattern: '',
      allergens: [],
      religion_rules: '',
      paneer_vs_fish: '',
      india_kitchen_ok: true,
      hotel_kitchen_ok: true,
      refuse_substitute: '',
      arrival_night_rule: '',
    },
    state: {
      day_type: 'Forge',
      scores_latest: null,
      last_protocol: '',
      travel_72h: false,
      open_incidents: [],
      minutes_available: 15,
      privacy_closed_room: true,
    },
    service: {
      partner: '',
      property: '',
      facilitator: '',
      consent_on_file: false,
    },
    // legacy flat fields kept for back-compat with existing Today/Kitchen
    allergens: [],
    diet_pattern: '',
    physician_constraints: '',
    day_type_preference: 'Forge',
    preferences: {},
    scores: [],
    notes_lifestyle: '',
    travel_72h: false,
    minutes_available: 15,
    privacy_closed_room: true,
    updated_at: new Date().toISOString(),
  };
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function normalizeLoaded(raw, alias) {
  const base = defaultPrincipal(alias);
  const merged = Object.assign({}, base, raw || {}, { alias: safeAlias(alias) });

  merged.diet = Object.assign({}, base.diet, (raw && raw.diet) || {});
  merged.state = Object.assign({}, base.state, (raw && raw.state) || {});
  merged.service = Object.assign({}, base.service, (raw && raw.service) || {});
  merged.contacts = Object.assign({}, base.contacts, (raw && raw.contacts) || {});

  // Sync legacy flat ↔ nested so older UI paths keep working
  if (!merged.physician_constraints && merged.diet.physician_constraints) {
    merged.physician_constraints = merged.diet.physician_constraints;
  }
  if (merged.physician_constraints && !merged.diet.physician_constraints) {
    merged.diet.physician_constraints = merged.physician_constraints;
  }
  if ((!merged.allergens || !merged.allergens.length) && merged.diet.allergens) {
    merged.allergens = merged.diet.allergens;
  }
  if (merged.allergens && merged.allergens.length && (!merged.diet.allergens || !merged.diet.allergens.length)) {
    merged.diet.allergens = merged.allergens;
  }
  if (!merged.diet_pattern && merged.diet.pattern) merged.diet_pattern = merged.diet.pattern;
  if (merged.diet_pattern && !merged.diet.pattern) merged.diet.pattern = merged.diet_pattern;

  if (merged.day_type_preference && !merged.state.day_type) {
    merged.state.day_type = merged.day_type_preference;
  }
  if (merged.state.day_type) merged.day_type_preference = merged.state.day_type;

  if (typeof merged.travel_72h === 'boolean') merged.state.travel_72h = merged.travel_72h;
  else merged.travel_72h = !!merged.state.travel_72h;

  if (merged.minutes_available != null) merged.state.minutes_available = merged.minutes_available;
  else merged.minutes_available = merged.state.minutes_available;

  if (typeof merged.privacy_closed_room === 'boolean') {
    merged.state.privacy_closed_room = merged.privacy_closed_room;
  } else {
    merged.privacy_closed_room = !!merged.state.privacy_closed_room;
  }

  return merged;
}

function readPrincipal(alias) {
  ensureDir();
  const fp = fileFor(alias);
  if (!fs.existsSync(fp)) return defaultPrincipal(alias);
  const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
  return normalizeLoaded(raw, alias);
}

function assertNoDiagnosisKeys(obj, prefix) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    const low = k.toLowerCase();
    if (DIAGNOSIS_KEYS.has(low)) {
      throw new Error('Rejected field: ' + (prefix ? prefix + '.' : '') + k);
    }
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      assertNoDiagnosisKeys(obj[k], (prefix ? prefix + '.' : '') + k);
    }
  }
}

function writePrincipal(alias, data) {
  ensureDir();
  const a = safeAlias(alias);
  assertNoDiagnosisKeys(data || {});
  const next = normalizeLoaded(Object.assign({}, data || {}), a);
  next.updated_at = new Date().toISOString();
  fs.writeFileSync(fileFor(a), JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

/**
 * PATCH only known fields. Never overwrite physician_constraints unless
 * explicit allow_physician_overwrite:true (operator command).
 * Rejects diagnosis / identity-sensitive keys.
 */
function patchPrincipal(alias, patch, opts) {
  opts = opts || {};
  assertNoDiagnosisKeys(patch || {});
  const p = readPrincipal(alias);

  for (const k of Object.keys(patch || {})) {
    if (k === 'alias' || k === 'updated_at') continue;
    if (!KNOWN_TOP.has(k) && k !== 'allow_physician_overwrite') {
      // allow nested diet/state/service/contacts keys via those objects only
      throw new Error('Unknown field: ' + k);
    }
  }

  const next = Object.assign({}, p);

  if (patch.partner_id != null) next.partner_id = String(patch.partner_id);
  if (patch.track != null) next.track = String(patch.track);
  if (patch.language != null) next.language = String(patch.language);
  if (patch.privacy_flags != null) next.privacy_flags = patch.privacy_flags;
  if (patch.timezone != null) next.timezone = String(patch.timezone);
  if (patch.timezone_home != null) next.timezone_home = String(patch.timezone_home);
  if (patch.timezone_now != null) next.timezone_now = String(patch.timezone_now);
  if (patch.likes != null) next.likes = patch.likes;
  if (patch.dislikes_hard != null) next.dislikes_hard = patch.dislikes_hard;
  if (patch.notes_lifestyle != null) next.notes_lifestyle = String(patch.notes_lifestyle);
  if (patch.allergens != null) {
    next.allergens = patch.allergens;
    next.diet.allergens = patch.allergens;
  }
  if (patch.diet_pattern != null) {
    next.diet_pattern = String(patch.diet_pattern);
    next.diet.pattern = next.diet_pattern;
  }
  if (patch.day_type_preference != null) {
    if (!DAY_TYPES.includes(patch.day_type_preference)) {
      throw new Error('day_type must be Forge|Travel|Stress|Peak');
    }
    next.day_type_preference = patch.day_type_preference;
    next.state.day_type = patch.day_type_preference;
  }
  if (typeof patch.travel_72h === 'boolean') {
    next.travel_72h = patch.travel_72h;
    next.state.travel_72h = patch.travel_72h;
  }
  if (patch.minutes_available != null) {
    next.minutes_available = Number(patch.minutes_available);
    next.state.minutes_available = next.minutes_available;
  }
  if (typeof patch.privacy_closed_room === 'boolean') {
    next.privacy_closed_room = patch.privacy_closed_room;
    next.state.privacy_closed_room = patch.privacy_closed_room;
  }
  if (patch.preferences != null && typeof patch.preferences === 'object') {
    next.preferences = Object.assign({}, next.preferences, patch.preferences);
  }
  if (patch.contacts != null && typeof patch.contacts === 'object') {
    next.contacts = Object.assign({}, next.contacts, patch.contacts);
  }
  if (patch.service != null && typeof patch.service === 'object') {
    next.service = Object.assign({}, next.service, patch.service);
  }
  if (patch.state != null && typeof patch.state === 'object') {
    if (patch.state.day_type != null) {
      if (!DAY_TYPES.includes(patch.state.day_type)) {
        throw new Error('day_type must be Forge|Travel|Stress|Peak');
      }
      next.state.day_type = patch.state.day_type;
      next.day_type_preference = patch.state.day_type;
    }
    if (typeof patch.state.travel_72h === 'boolean') {
      next.state.travel_72h = patch.state.travel_72h;
      next.travel_72h = patch.state.travel_72h;
    }
    if (patch.state.minutes_available != null) {
      next.state.minutes_available = Number(patch.state.minutes_available);
      next.minutes_available = next.state.minutes_available;
    }
    if (typeof patch.state.privacy_closed_room === 'boolean') {
      next.state.privacy_closed_room = patch.state.privacy_closed_room;
      next.privacy_closed_room = patch.state.privacy_closed_room;
    }
    if (patch.state.last_protocol != null) next.state.last_protocol = String(patch.state.last_protocol);
    if (patch.state.open_incidents != null) next.state.open_incidents = patch.state.open_incidents;
  }
  if (patch.diet != null && typeof patch.diet === 'object') {
    const d = Object.assign({}, next.diet);
    for (const dk of Object.keys(patch.diet)) {
      if (dk === 'physician_constraints') continue; // handled below
      d[dk] = patch.diet[dk];
    }
    next.diet = d;
    if (d.pattern) next.diet_pattern = d.pattern;
    if (d.allergens) next.allergens = d.allergens;
  }

  const wantPhys =
    patch.physician_constraints != null ||
    (patch.diet && patch.diet.physician_constraints != null);
  if (wantPhys) {
    const allow =
      opts.allow_physician_overwrite === true ||
      patch.allow_physician_overwrite === true;
    if (!allow) {
      // hard lock: never overwrite silently
      // if empty on file, allow first set
      const current =
        (next.diet && next.diet.physician_constraints) ||
        next.physician_constraints ||
        '';
      if (String(current).trim()) {
        throw new Error(
          'physician_constraints never overwritten without allow_physician_overwrite'
        );
      }
    }
    const val =
      patch.physician_constraints != null
        ? String(patch.physician_constraints)
        : String(patch.diet.physician_constraints);
    next.physician_constraints = val;
    next.diet.physician_constraints = val;
  }

  return writePrincipal(alias, next);
}

function setPreference(alias, prefPath, value) {
  const p = readPrincipal(alias);
  const parts = String(prefPath || '')
    .split('.')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.length) throw new Error('preference path required');
  // Reject diagnosis-ish preference paths
  for (const part of parts) {
    if (DIAGNOSIS_KEYS.has(part.toLowerCase())) {
      throw new Error('Rejected preference path: ' + prefPath);
    }
  }
  let cur = p.preferences;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== 'object' || cur[k] == null) cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return writePrincipal(alias, p);
}

function logScore(alias, score) {
  const p = readPrincipal(alias);
  const entry = {
    date: score.date || new Date().toISOString().slice(0, 10),
    energy: Number(score.energy),
    sleep_rest: Number(score.sleep_rest),
    clarity: Number(score.clarity),
    logged_at: new Date().toISOString(),
  };
  p.scores = Array.isArray(p.scores) ? p.scores : [];
  p.scores = p.scores.filter((s) => s.date !== entry.date);
  p.scores.push(entry);
  p.scores.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  p.state = p.state || {};
  p.state.scores_latest = entry;
  return writePrincipal(alias, p);
}

function buildTodayBrief(alias, date, tz) {
  const p = readPrincipal(alias);
  const d = date || new Date().toISOString().slice(0, 10);
  const todayScore = (p.scores || []).find((s) => s.date === d) || null;
  const dayType = (p.state && p.state.day_type) || p.day_type_preference || 'Forge';
  const phys =
    (p.diet && p.diet.physician_constraints) ||
    p.physician_constraints ||
    'none on file';
  const travel = !!(p.state && p.state.travel_72h) || !!p.travel_72h;
  const minutes =
    (p.state && p.state.minutes_available) != null
      ? p.state.minutes_available
      : p.minutes_available;
  const privacy =
    p.state && typeof p.state.privacy_closed_room === 'boolean'
      ? p.state.privacy_closed_room
      : p.privacy_closed_room;
  const lines = [
    'Today brief for ' + p.alias + ' (' + d + ')',
    'Day type: ' + dayType,
    'Minutes available: ' + (minutes != null ? minutes : '-'),
    'Privacy closed room: ' + (privacy ? 'yes' : 'no'),
    'Travel 72h: ' + (travel ? 'yes' : 'no'),
    'Physician constraints: ' + (phys || 'none on file'),
    'Allergens: ' + ((p.allergens || []).join(', ') || 'none on file'),
    'Diet pattern: ' + (p.diet_pattern || (p.diet && p.diet.pattern) || '-'),
    'Dislikes hard: ' +
      ((p.dislikes_hard || []).join(', ') || 'none on file'),
    todayScore
      ? 'Scores - energy ' +
        todayScore.energy +
        ', sleep_rest ' +
        todayScore.sleep_rest +
        ', clarity ' +
        todayScore.clarity
      : 'Scores - not logged yet',
  ];
  return {
    ok: true,
    source: 'local_principal_file',
    alias: p.alias,
    date: d,
    timezone: tz || p.timezone_now || p.timezone,
    day_type: dayType,
    day_type_preference: dayType,
    minutes_available: minutes,
    privacy_closed_room: !!privacy,
    travel_72h: travel,
    allergens: p.allergens,
    diet_pattern: p.diet_pattern || (p.diet && p.diet.pattern) || '',
    physician_constraints: phys,
    physician_lock: true,
    dislikes_hard: p.dislikes_hard || [],
    likes: p.likes || [],
    contacts: p.contacts,
    preferences: p.preferences,
    score_today: todayScore,
    notes_lifestyle: p.notes_lifestyle,
    text: lines.join('\n'),
  };
}

module.exports = {
  readPrincipal,
  writePrincipal,
  patchPrincipal,
  setPreference,
  logScore,
  buildTodayBrief,
  safeAlias,
  DAY_TYPES,
  DIAGNOSIS_KEYS,
  DATA_DIR,
};
