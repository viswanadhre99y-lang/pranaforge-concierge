'use strict';

const BLACKLIST = [
  /\bcures?\b/gi,
  /\bcured\b/gi,
  /\btreat(s|ment|ing)?\b/gi,
  /\bheals?\b/gi,
  /\bhealing\b/gi,
  /\bdiagnos(e|is|tic)\b/gi,
  /\breverse\s+(disease|diabetes|inflammation)\b/gi,
  /\banti-?cancer\b/gi,
  /\bprevents?\s+cancer\b/gi,
  /\breplaces?\s+your\s+doctor\b/gi,
  /\bbetter\s+than\s+medicine\b/gi,
  /\bhormone\s+optim/gi,
  /\bbalances?\s+hormones?\b/gi,
  /\btestosterone\b/gi,
  /\bcortisol\s+fix\b/gi,
  /\bdetox(ify|ification|ifies)?\b/gi,
  /\\bdetoxifies\\b/gi,
  /\bcleanse\s+toxins?\b/gi,
  /\bburn\s+fat\s+fast\b/gi,
  /\bmelt\s+visceral\s+fat\b/gi,
  /\bimmunity\s+boost\b/gi,
  /\bantiviral\s+plate\b/gi,
  /\bpsychotherapy\b/gi,
  /\bjet-?lag\s+cure\b/gi,
  /\bcures?\s+jet\s+lag\b/gi,
  /\bguaranteed\s+sleep\b/gi,
  /\bsedative\s+food\b/gi,
  /\bsupplement\s+stack\b/gi,
];

function findFlags(text) {
  const flags = [];
  const s = String(text || '');
  for (const re of BLACKLIST) {
    re.lastIndex = 0;
    const m = s.match(re);
    if (m) {
      for (const hit of m) {
        const t = hit.toLowerCase();
        if (!flags.includes(t)) flags.push(t);
      }
    }
  }
  return flags;
}

function scrubText(text) {
  let out = String(text || '');
  for (const re of BLACKLIST) out = out.replace(re, '[removed]');
  return out;
}

function gatePayload(payload) {
  const flags = new Set();
  function walk(v) {
    if (v == null) return v;
    if (typeof v === 'string') {
      findFlags(v).forEach((f) => flags.add(f));
      return scrubText(v);
    }
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === 'object') {
      const o = {};
      for (const [k, val] of Object.entries(v)) o[k] = walk(val);
      return o;
    }
    return v;
  }
  return { scrubbed: walk(payload), flags: [...flags] };
}

module.exports = { findFlags, scrubText, gatePayload };
