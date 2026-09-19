'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'vault', 'catalog.json');

function tryReadJson(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    return null;
  }
}

function resolveResearchProtocols() {
  const candidates = [
    path.join(ROOT, '..', '..', '..', 'pranaforge-protocol-research', '_protocols.json'),
    path.join('/workspace', 'pranaforge-protocol-research', '_protocols.json'),
    path.join(ROOT, '..', '..', 'pranaforge-protocol-research', '_protocols.json'),
  ];
  for (const c of candidates) {
    const data = tryReadJson(c);
    if (data) return { path: c, data: data };
  }
  return null;
}

function resolveWorldPractices() {
  const candidates = [
    path.join('/workspace', 'pranaforge', 'protocols', 'world-practices'),
    path.join(ROOT, '..', '..', '..', 'pranaforge', 'protocols', 'world-practices'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return dir;
    }
  }
  return null;
}

function loadVaultCatalog() {
  const raw = tryReadJson(CATALOG_PATH) || { protocols: [], public_rails_optional: [] };
  return {
    vault: (raw.protocols || []).map((p) => ({
      id: p.id,
      label: p.label,
      duration_min: p.duration_min,
      product_role: p.product_role || 'vault',
      when: p.when || '',
      not: p.not || '',
      fill_status: p.fill_status || 'empty',
      source: 'vault/catalog.json',
    })),
    rails_builtin: (raw.public_rails_optional || []).map((p) => ({
      id: p.id,
      label: p.label,
      duration_min: p.duration_min,
      product_role: 'public_rail',
      when: p.when || '',
      not: p.not || '',
      source: 'vault/catalog.json',
    })),
  };
}

function loadPublicProtocols() {
  const hit = resolveResearchProtocols();
  if (!hit) return { available: false, items: [] };
  const arr = Array.isArray(hit.data) ? hit.data : hit.data.protocols || [];
  const items = arr.slice(0, 80).map((p) => ({
    id: p.id,
    label: p.name || p.id,
    duration_min: p.typical || p.minimum || '',
    product_role: 'public_protocol',
    when: p.when || '',
    not: p.avoid || '',
    grade: p.evidence || '',
    source: hit.path,
  }));
  return { available: true, path: hit.path, items: items };
}

function loadWorldPracticeIds() {
  const dir = resolveWorldPractices();
  if (!dir) return { available: false, items: [] };
  const files = fs.readdirSync(dir).filter((f) => /\.(md|json)$/i.test(f));
  const items = files.map((f) => {
    const id = f.replace(/\.(md|json)$/i, '');
    return {
      id: id,
      label: id.replace(/[_-]/g, ' '),
      duration_min: '',
      product_role: 'world_practice',
      when: 'Optional public rail — off unless reviewer ticks include rail',
      not: 'Never replaces vault in a paid hour; no recipe paste to guest',
      source: dir,
    };
  });
  return { available: true, path: dir, items: items };
}

function buildLibraryIndex() {
  const vault = loadVaultCatalog();
  const pub = loadPublicProtocols();
  const world = loadWorldPracticeIds();
  return {
    ok: true,
    staff_only: true,
    vault: vault.vault,
    public_rails: vault.rails_builtin,
    public_protocols: pub,
    world_practices: world,
  };
}

function findVaultById(id) {
  const vault = loadVaultCatalog();
  const all = vault.vault.concat(vault.rails_builtin);
  return all.find((p) => p.id === id) || null;
}

module.exports = {
  buildLibraryIndex,
  loadVaultCatalog,
  findVaultById,
  CATALOG_PATH,
};
