import { CONFIG } from '../data/config.js';
import { SPECIES } from '../data/species.js';
import { createState } from './engine.js';

export function serialize(state) {
  return JSON.stringify({ ...state, saveVersion: CONFIG.saveVersion });
}

export function migrateSave(input, { now = Date.now(), rng = Math.random } = {}) {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('存檔格式不正確');
  const version = parsed.saveVersion ?? 0;
  if (!Number.isInteger(version) || version > CONFIG.saveVersion) throw new RangeError('存檔版本較新，暫時無法開啟');

  const migrated = { ...parsed };
  if (version === 0) {
    migrated.resources = { ...(parsed.resources ?? {}) };
    if (migrated.resources.primordialMud === undefined) migrated.resources.primordialMud = migrated.resources.mud ?? 0;
    migrated.meta = { ...(parsed.meta ?? {}) };
    if (migrated.meta.prestigeCount === undefined) migrated.meta.prestigeCount = parsed.prestigeCount ?? 0;
  }
  if (version < 2 && parsed.settings?.language === 'zh') {
    // v2：語系代碼改用 BCP 47 標籤
    migrated.settings = { ...parsed.settings, language: 'zh-Hant' };
  }
  const defaults = createState({ now, rng });
  const result = {
    ...defaults,
    ...migrated,
    saveVersion: CONFIG.saveVersion,
    resources: { ...defaults.resources, ...(migrated.resources ?? {}) },
    settings: { ...defaults.settings, ...(migrated.settings ?? {}) },
    upgrades: { ...defaults.upgrades, ...(migrated.upgrades ?? {}) },
    meta: { ...defaults.meta, ...(migrated.meta ?? {}) },
    codex: normalizeCodex(migrated.codex, defaults.codex),
    slimes: Array.isArray(migrated.slimes) ? migrated.slimes : defaults.slimes,
    unlockedSpecies: Array.isArray(migrated.unlockedSpecies) ? migrated.unlockedSpecies : defaults.unlockedSpecies,
    runMaxTier: { ...(migrated.runMaxTier ?? defaults.runMaxTier) },
    decorations: Array.isArray(migrated.decorations) ? migrated.decorations : [],
    events: Array.isArray(migrated.events) ? migrated.events : [],
  };
  result.nextUid = Math.max(Number(migrated.nextUid) || 1, nextUidAfter(result.slimes, result.decorations));
  Object.defineProperty(result, '_rng', { value: rng, writable: true, configurable: true, enumerable: false });
  return result;
}

export function saveToStorage(state, storage = defaultStorage(), key = CONFIG.storage.saveKey) {
  if (!storage) return false;
  storage.setItem(key, serialize(state));
  return true;
}

export function loadFromStorage(storage = defaultStorage(), key = CONFIG.storage.saveKey, options = {}) {
  if (!storage) return null;
  const raw = storage.getItem(key);
  return raw === null ? null : migrateSave(raw, options);
}

export function exportSave(state) {
  return serialize(state);
}

export function exportBase64(state) {
  const bytes = new TextEncoder().encode(serialize(state));
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function summarizeSave(state) {
  const counts = new Map();
  for (const slime of state.slimes) counts.set(slime.species, (counts.get(slime.species) ?? 0) + 1);
  const topSpecies = [...counts.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, 3)
    .map(([id, count]) => ({ id, count, name: SPECIES.find((species) => species.id === id)?.name }));
  return {
    playMs: state.playMs,
    topSpecies,
    codexCount: state.codex.entries.length,
    prestigeCount: state.meta.prestigeCount,
  };
}

export function previewImport(payload, options = {}) {
  const state = migrateSave(decodePayload(payload), options);
  return { summary: summarizeSave(state), state };
}

export function importSave(payload, { storage = defaultStorage(), key = CONFIG.storage.saveKey, backupKey = CONFIG.storage.backupKey, ...options } = {}) {
  const candidate = migrateSave(decodePayload(payload), options);
  let backedUp = false;
  if (storage) {
    const current = storage.getItem(key);
    if (current !== null) {
      storage.setItem(backupKey, current);
      backedUp = true;
    }
    storage.setItem(key, serialize(candidate));
  }
  return { state: candidate, summary: summarizeSave(candidate), backedUp };
}

export function backupCurrentSave(storage = defaultStorage(), key = CONFIG.storage.saveKey, backupKey = CONFIG.storage.backupKey) {
  if (!storage) return false;
  const current = storage.getItem(key);
  if (current === null) return false;
  storage.setItem(backupKey, current);
  return true;
}

export function restoreBackup(storage = defaultStorage(), key = CONFIG.storage.saveKey, backupKey = CONFIG.storage.backupKey, options = {}) {
  if (!storage) return null;
  const backup = storage.getItem(backupKey);
  if (backup === null) return null;
  const state = migrateSave(backup, options);
  storage.setItem(key, serialize(state));
  return state;
}

function normalizeCodex(codex, defaults) {
  const value = codex ?? defaults;
  return {
    entries: Array.isArray(value.entries) ? value.entries : [],
    species: Array.isArray(value.species) ? value.species : [],
    tiers: Array.isArray(value.tiers) ? value.tiers : [],
    mutations: {
      hue: Array.isArray(value.mutations?.hue) ? value.mutations.hue : [],
      gloss: Array.isArray(value.mutations?.gloss) ? value.mutations.gloss : [],
      core: Array.isArray(value.mutations?.core) ? value.mutations.core : [],
    },
    recipes: Array.isArray(value.recipes) ? value.recipes : [],
  };
}

function nextUidAfter(slimes, decorations) {
  let largest = 0;
  for (const item of [...slimes, ...decorations]) {
    const suffix = Number(String(item.uid).match(/(\d+)$/)?.[1] ?? 0);
    largest = Math.max(largest, suffix + 1);
  }
  return largest;
}

function decodePayload(payload) {
  if (typeof payload !== 'string') return payload;
  const trimmed = payload.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const binary = atob(trimmed);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function defaultStorage() {
  return globalThis.localStorage;
}
