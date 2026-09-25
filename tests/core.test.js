import assert from 'node:assert/strict';
import test from 'node:test';
import { CONFIG } from '../src/data/config.js';
import {
  computeRates,
  createState,
  exportBase64,
  importSave,
  merge,
  migrateSave,
  previewImport,
  prestige,
  restoreBackup,
  saveToStorage,
  settleOffline,
  summon,
  tryRecipe,
} from '../src/core/index.js';

const noon = new Date(2026, 0, 1, 12).getTime();
const steadyRng = () => 0.99;

function addSlime(state, species, tier = 1, mutations = {}) {
  const slime = {
    uid: `slime_${state.nextUid++}`,
    species,
    tier,
    hue: 0,
    gloss: 0,
    core: 0,
    bornAt: noon,
    ...mutations,
  };
  state.slimes.push(slime);
  state.runMaxTier[species] = Math.max(state.runMaxTier[species] ?? 0, tier);
  if (!state.unlockedSpecies.includes(species)) state.unlockedSpecies.push(species);
  return slime;
}

function memoryStorage() {
  const entries = new Map();
  return {
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { entries.set(key, String(value)); },
  };
}

test('three matching slimes merge into one next-tier slime', () => {
  const state = createState({ now: noon, rng: steadyRng });
  const second = addSlime(state, 'proto');
  const third = addSlime(state, 'proto');
  const inputUids = [state.slimes[0].uid, second.uid, third.uid];

  const outcome = merge(state, inputUids, { now: noon, rng: steadyRng });

  assert.equal(outcome.ok, true);
  assert.equal(state.slimes.length, 1);
  assert.equal(state.slimes[0].species, 'proto');
  assert.equal(state.slimes[0].tier, 2);
  assert.deepEqual(state.runMaxTier, { proto: 2 });
});

test('a mismatched merge keeps every slime and leaves scrap', () => {
  const state = createState({ now: noon, rng: steadyRng });
  const strawberry = addSlime(state, 'strawberry');
  const cream = addSlime(state, 'cream');
  state.resources.gel = 9;
  const beforeSlimes = structuredClone(state.slimes);

  const outcome = merge(state, [state.slimes[0].uid, strawberry.uid, cream.uid], { now: noon, rng: steadyRng });

  assert.equal(outcome.ok, false);
  assert.deepEqual(state.slimes, beforeSlimes);
  assert.equal(state.resources.gel, 9);
  assert.equal(state.resources.scrap, CONFIG.economy.mergeFailureScrap);
});

test('a matching recipe consumes one ingredient each and births its product at tier one', () => {
  const state = createState({ now: noon, rng: steadyRng });
  const strawberry = addSlime(state, 'strawberry', 2);
  const cream = addSlime(state, 'cream');
  state.resources.gel = 0;

  const outcome = tryRecipe(state, cream.uid, strawberry.uid, { now: noon, rng: steadyRng });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.product.species, 'strawberry_cream');
  assert.equal(outcome.product.tier, 1);
  assert.equal(state.slimes.some((slime) => slime.uid === strawberry.uid || slime.uid === cream.uid), false);
  assert.equal(state.slimes.some((slime) => slime.uid === outcome.product.uid), true);
  assert.equal(state.resources.gel, 0);
  assert.ok(state.codex.recipes.includes('strawberry_cream'));
});

test('an unmatched recipe leaves ingredients intact and yields scrap', () => {
  const state = createState({ now: noon, rng: steadyRng });
  const strawberry = addSlime(state, 'strawberry');
  const jelly = addSlime(state, 'jelly');
  state.resources.gel = 7;
  const beforeSlimes = structuredClone(state.slimes);

  const outcome = tryRecipe(state, strawberry.uid, jelly.uid, { now: noon, rng: steadyRng });

  assert.equal(outcome.ok, false);
  assert.deepEqual(state.slimes, beforeSlimes);
  assert.equal(state.resources.gel, 7 - CONFIG.economy.recipeFailureGel);
  assert.equal(state.resources.scrap, CONFIG.economy.recipeFailureScrap);
});

test('offline settlement splits production at local day and night boundaries', () => {
  const from = new Date(2026, 0, 1, 17, 30);
  const to = new Date(2026, 0, 1, 19, 30);
  const state = createState({ now: from.getTime(), rng: steadyRng });

  const breakdown = settleOffline(state, from, to);

  assert.equal(breakdown.day.durationMs, 30 * CONFIG.time.minuteMs);
  assert.equal(breakdown.night.durationMs, 90 * CONFIG.time.minuteMs);
  assert.equal(breakdown.segments.length, 2);
  assert.equal(breakdown.segments[0].phase, 'day');
  assert.equal(breakdown.segments[1].phase, 'night');
  assert.equal(breakdown.settledMs, 2 * CONFIG.time.hourMs);
  assert.ok(Math.abs(state.resources.gel - CONFIG.economy.startingGel - breakdown.gelEarned) < 1e-9);
  assert.ok(state.resources.gel > CONFIG.economy.startingGel);
});

test('mutation bonuses use only the best three individuals per dimension', () => {
  const state = createState({ now: noon, rng: steadyRng });
  for (let index = 0; index < 5; index += 1) addSlime(state, 'proto', 1, { hue: 3 });

  const rates = computeRates(state, 'night');

  assert.ok(Math.abs(rates.hueBonus - 0.45) < 1e-12);
  assert.equal(rates.mutationChance.hue, CONFIG.economy.mutation.hueChance * CONFIG.time.phaseRate.nightMutation);
});

test('save migration, Base64 preview, import backup, and restore round-trip', () => {
  const state = createState({ now: noon, rng: steadyRng });
  state.playMs = 123456;
  state.resources.gel = 42;
  const encoded = exportBase64(state);
  const preview = previewImport(encoded, { now: noon, rng: steadyRng });

  assert.equal(preview.summary.playMs, state.playMs);
  assert.equal(preview.summary.codexCount, state.codex.entries.length);
  assert.equal(preview.state.resources.gel, 42);

  const storage = memoryStorage();
  const existing = createState({ now: noon, rng: steadyRng });
  existing.resources.gel = 17;
  saveToStorage(existing, storage);
  const imported = importSave(encoded, { storage, now: noon, rng: steadyRng });
  assert.equal(imported.backedUp, true);
  assert.equal(imported.state.resources.gel, 42);
  assert.equal(JSON.parse(storage.getItem(CONFIG.storage.backupKey)).resources.gel, 17);
  assert.equal(restoreBackup(storage, undefined, undefined, { now: noon, rng: steadyRng }).resources.gel, 17);

  const oldSave = migrateSave({ resources: { gel: 5, mud: 3 }, prestigeCount: 2 }, { now: noon, rng: steadyRng });
  assert.equal(oldSave.saveVersion, CONFIG.saveVersion);
  assert.equal(oldSave.resources.primordialMud, 3);
  assert.equal(oldSave.meta.prestigeCount, 2);

  const v1Save = migrateSave({ saveVersion: 1, settings: { language: 'zh', autoMerge: true } }, { now: noon, rng: steadyRng });
  assert.equal(v1Save.settings.language, 'zh-Hant');
  assert.equal(v1Save.settings.autoMerge, true);
});

test('prestige requires tier ten and allows primal summoning with mud alone', () => {
  const state = createState({ now: noon, rng: steadyRng });
  state.runMaxTier.proto = 10;
  state.slimes[0].tier = 10;
  state.resources.gel = 50;

  const result = prestige(state, { now: noon });
  assert.equal(result.ok, true);
  assert.ok(state.resources.primordialMud >= CONFIG.economy.primalSpeciesCost.primal_ooze);
  assert.equal(state.resources.gel, 0);
  assert.equal(state.meta.prestigeCount, 1);
  assert.equal(state.slimes.length, 1);
  assert.equal(state.runMaxTier.proto, 1);
  const primal = summon(state, 'primal_ooze', { now: noon, rng: steadyRng });
  assert.equal(primal.ok, true);
  assert.equal(state.resources.gel, 0);
  assert.equal(state.slimes.some((slime) => slime.species === 'primal_ooze'), true);
});
