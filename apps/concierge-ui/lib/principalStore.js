'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'principals');

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
    timezone: 'Asia/Kolkata',
    day_type_preference: 'Forge',
    allergens: [],
    diet_pattern: '',
    physician_constraints: '',
    preferences: {},
    scores: [],
    notes_lifestyle: '',
    updated_at: new Date().toISOString(),
  };
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readPrincipal(alias) {
  ensureDir();
  const fp = fileFor(alias);
  if (!fs.existsSync(fp)) return defaultPrincipal(alias);
  const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
  return Object.assign({}, defaultPrincipal(alias), raw, { alias: safeAlias(alias) });
}

function writePrincipal(alias, data) {
  ensureDir();
  const a = safeAlias(alias);
  const next = Object.assign({}, defaultPrincipal(a), data, {
    alias: a,
    updated_at: new Date().toISOString(),
  });
  fs.writeFileSync(fileFor(a), JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

function setPreference(alias, prefPath, value) {
  const p = readPrincipal(alias);
  const parts = String(prefPath || '')
    .split('.')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.length) throw new Error('preference path required');
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
  return writePrincipal(alias, p);
}

function buildTodayBrief(alias, date, tz) {
  const p = readPrincipal(alias);
  const d = date || new Date().toISOString().slice(0, 10);
  const todayScore = (p.scores || []).find((s) => s.date === d) || null;
  const lines = [
    'Today brief for ' + p.alias + ' (' + d + ')',
    'Day preference: ' + (p.day_type_preference || '-'),
    'Physician constraints: ' + (p.physician_constraints || 'none on file'),
    'Allergens: ' + ((p.allergens || []).join(', ') || 'none on file'),
    'Diet pattern: ' + (p.diet_pattern || '-'),
    todayScore
      ? 'Scores - energy ' + todayScore.energy + ', sleep_rest ' + todayScore.sleep_rest + ', clarity ' + todayScore.clarity
      : 'Scores - not logged yet',
  ];
  return {
    ok: true,
    source: 'local_principal_file',
    alias: p.alias,
    date: d,
    timezone: tz || p.timezone,
    day_type_preference: p.day_type_preference,
    allergens: p.allergens,
    diet_pattern: p.diet_pattern,
    physician_constraints: p.physician_constraints,
    preferences: p.preferences,
    score_today: todayScore,
    notes_lifestyle: p.notes_lifestyle,
    text: lines.join('\n'),
  };
}

module.exports = {
  readPrincipal,
  writePrincipal,
  setPreference,
  logScore,
  buildTodayBrief,
  safeAlias,
};
