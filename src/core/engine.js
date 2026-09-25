import { CONFIG } from '../data/config.js';
import { DECORATIONS } from '../data/decorations.js';
import { MUTATIONS } from '../data/mutations.js';
import { RECIPES } from '../data/recipes.js';
import { SPECIES } from '../data/species.js';
import { UPGRADES } from '../data/upgrades.js';
import { getPhase, toTimestamp } from './time.js';

const speciesById = new Map(SPECIES.map((species) => [species.id, species]));
const recipeByPair = new Map();
for (const recipe of RECIPES) {
  const key = pairKey(recipe.a, recipe.b);
  const pair = recipeByPair.get(key) ?? [];
  pair.push(recipe);
  recipeByPair.set(key, pair);
}

export function createState({ now = Date.now(), rng = Math.random } = {}) {
  const timestamp = toTimestamp(now);
  const state = {
    saveVersion: CONFIG.saveVersion,
    createdAt: timestamp,
    lastTickAt: timestamp,
    playMs: 0,
    nextUid: 1,
    resources: {
      gel: CONFIG.economy.startingGel,
      stardust: 0,
      primordialMud: CONFIG.economy.prestige.startingPrestigeMud,
      scrap: 0,
    },
    slimes: [],
    unlockedSpecies: [CONFIG.economy.startingSpecies],
    runMaxTier: { [CONFIG.economy.startingSpecies]: 1 },
    codex: { entries: [], species: [], tiers: [], mutations: { hue: [], gloss: [], core: [] }, recipes: [] },
    settings: { autoMerge: CONFIG.merge.autoMergeDefault, language: 'en' },
    upgrades: Object.fromEntries(UPGRADES.map((upgrade) => [upgrade.id, 0])),
    decorations: [],
    meta: { prestigeCount: 0, pokeCount: 0, consecutivePokes: 0, titles: [] },
    events: [],
  };
  Object.defineProperty(state, '_rng', { value: rng, writable: true, configurable: true, enumerable: false });
  const starter = { uid: nextUid(state), species: CONFIG.economy.startingSpecies, tier: 1, hue: 0, gloss: 0, core: 0, bornAt: timestamp };
  state.slimes.push(starter);
  unlockSpecies(state, starter.species);
  state.runMaxTier[starter.species] = 1;
  recordCodex(state, 'species', starter.species, timestamp);
  for (const dimension of Object.keys(state.codex.mutations)) {
    recordCodex(state, 'mutation', `${dimension}:${starter.species}:0`, timestamp);
  }
  return state;
}

export function tick(state, dtMs, now = Date.now(), options = {}) {
  const elapsed = Math.max(0, Number(dtMs) || 0);
  const timestamp = toTimestamp(now);
  if (elapsed === 0) {
    state.lastTickAt = timestamp;
    return { elapsedMs: 0, gelEarned: 0, events: [] };
  }
  const beforeEvents = state.events.length;
  const phase = getPhase(timestamp);
  const rates = computeRates(state, phase);
  const gelEarned = rates.gelPerSecond * elapsed / CONFIG.time.secondMs;
  state.resources.gel += gelEarned;
  state.playMs += elapsed;
  state.lastTickAt = timestamp;
  if (state.settings.autoMerge) runAutoMerge(state, { now: timestamp, rng: options.rng });
  return { elapsedMs: elapsed, gelEarned, events: state.events.slice(beforeEvents) };
}

export function summon(state, speciesId, { tier, now = Date.now(), rng } = {}) {
  const species = speciesById.get(speciesId);
  if (!species) return result(false, 'unknownSpecies');
  if (species.kind === 'primal' && state.meta.prestigeCount < 1) return result(false, 'needsPrestige');
  if (species.kind === 'recipe' && !state.unlockedSpecies.includes(speciesId)) return result(false, 'speciesNotDiscovered');
  if (!ensureRoom(state, now, rng)) return result(false, 'tankFull');

  const normalTier = Math.min(CONFIG.merge.maximumTier, state.runMaxTier[speciesId] ?? CONFIG.economy.summonProgressFreeTierCap);
  const requestedTier = tier ?? normalTier;
  if (!Number.isInteger(requestedTier) || requestedTier < 1 || requestedTier > CONFIG.merge.maximumTier) return result(false, 'invalidTier');
  const isPrimal = species.kind === 'primal';
  const mudCost = isPrimal ? CONFIG.economy.primalSpeciesCost[speciesId] * (1 + (requestedTier - 1) * CONFIG.economy.primalTierCostPerStep) : 0;
  if (isPrimal && state.resources.primordialMud < mudCost) return result(false, 'notEnoughMud');

  const isNewUnlock = species.kind === 'base' && !state.unlockedSpecies.includes(speciesId);
  const baseCost = isNewUnlock
    ? CONFIG.economy.summonUnlockCosts[speciesId]
    : species.kind === 'starter' ? CONFIG.economy.starterSummonCost : CONFIG.economy.repeatSummonCost;
  const gelDiscount = upgradeValue(state, 'soft_summons', 'summonDiscount');
  const tierCost = CONFIG.economy.summonBaseCost * CONFIG.economy.summonTierCostMultiplier ** (requestedTier - 1);
  const gelCost = isPrimal ? 0 : (baseCost + tierCost * (requestedTier > 1 ? 1 : 0)) * Math.max(0, 1 - gelDiscount);
  const dustCost = !isPrimal && requestedTier > normalTier
    ? (CONFIG.economy.stardustSummonTierCosts[requestedTier] ?? Infinity)
    : 0;
  const extraGelCost = !isPrimal && requestedTier > normalTier ? tierCost * CONFIG.economy.stardustSummonGelMultiplier : 0;
  const totalGelCost = gelCost + extraGelCost;
  if (state.resources.gel < totalGelCost || state.resources.stardust < dustCost) return result(false, 'notEnoughMaterials', { gelCost: totalGelCost, stardustCost: dustCost });

  state.resources.gel -= totalGelCost;
  state.resources.stardust -= dustCost;
  state.resources.primordialMud -= mudCost;
  if (isNewUnlock) unlockSpecies(state, speciesId);
  const slime = birthSlime(state, speciesId, requestedTier, now, rng);
  emit(state, 'summoned', { slime, gelCost: totalGelCost, stardustCost: dustCost, mudCost });
  return result(true, 'summoned', { slime, gelCost: totalGelCost, stardustCost: dustCost, mudCost });
}

export function merge(state, uids, { now = Date.now(), rng } = {}) {
  const selected = Array.isArray(uids) ? uids : [uids];
  const distinct = [...new Set(selected)];
  const inputs = distinct.map((uid) => state.slimes.find((slime) => slime.uid === uid));
  if (distinct.length !== CONFIG.merge.requiredSlimes || inputs.some((slime) => !slime)) return result(false, 'selectThreeSlimes');
  const [first, ...rest] = inputs;
  const matching = rest.every((slime) => slime.species === first.species && slime.tier === first.tier);
  if (!matching || first.tier >= CONFIG.merge.maximumTier) {
    const gelCost = CONFIG.economy.mergeFailureGel;
    state.resources.gel = Math.max(0, state.resources.gel - gelCost);
    state.resources.scrap += CONFIG.economy.mergeFailureScrap;
    emit(state, 'mergeFail', { uids: distinct, scrap: CONFIG.economy.mergeFailureScrap, gelCost });
    return result(false, 'materialsStayTogether', { scrap: CONFIG.economy.mergeFailureScrap, gelCost });
  }

  const removed = new Set(distinct);
  state.slimes = state.slimes.filter((slime) => !removed.has(slime.uid));
  const slime = birthSlime(state, first.species, first.tier + 1, now, rng);
  emit(state, 'merged', { inputs: distinct, slime });
  return result(true, 'merged', { slime, inputs: distinct });
}

export function toggleAutoMerge(state, enabled = !state.settings.autoMerge) {
  state.settings.autoMerge = Boolean(enabled);
  emit(state, 'autoMergeChanged', { enabled: state.settings.autoMerge });
  return result(true, 'autoMergeChanged', { enabled: state.settings.autoMerge });
}

export function tryRecipe(state, uidA, uidB, { now = Date.now(), rng } = {}) {
  const slimeA = state.slimes.find((slime) => slime.uid === uidA);
  const slimeB = state.slimes.find((slime) => slime.uid === uidB);
  const timestamp = toTimestamp(now);
  let recipe;
  if (slimeA && slimeB && slimeA.uid !== slimeB.uid && slimeA.species !== slimeB.species) {
    const candidates = recipeByPair.get(pairKey(slimeA.species, slimeB.species)) ?? [];
    recipe = candidates.find((candidate) => recipeMatches(candidate, slimeA, slimeB, state, timestamp));
  }
  if (!recipe) return failRecipe(state, 'notThisCombination');

  state.slimes = state.slimes.filter((slime) => slime.uid !== uidA && slime.uid !== uidB);
  unlockSpecies(state, recipe.id);
  recordCodex(state, 'recipe', recipe.id, timestamp);
  if (recipe.hidden) state.meta.hiddenRecipeCount = (state.meta.hiddenRecipeCount ?? 0) + 1;
  const product = birthSlime(state, recipe.id, 1, timestamp, rng);
  emit(state, 'recipeOk', { recipeId: recipe.id, product, hidden: recipe.hidden });
  return result(true, 'recipeOk', { recipe, product, gelCost: 0 });
}

export function disassemble(state, uids) {
  const selected = new Set(Array.isArray(uids) ? uids : [uids]);
  const removed = state.slimes.filter((slime) => selected.has(slime.uid));
  if (!removed.length) return result(false, 'noSlimesSelected');
  const removedIds = new Set(removed.map((slime) => slime.uid));
  state.slimes = state.slimes.filter((slime) => !removedIds.has(slime.uid));
  const stardust = removed.reduce((total, slime) => total + CONFIG.economy.stardustPerDisassembledSlime + Math.floor((slime.tier - 1) * CONFIG.economy.stardustPerTier), 0);
  state.resources.stardust += stardust;
  emit(state, 'disassembled', { uids: [...removedIds], stardust });
  return result(true, 'disassembled', { stardust, uids: [...removedIds] });
}

export function craftDecoration(state, decorationId) {
  const definition = DECORATIONS.find((item) => item.id === decorationId);
  if (!definition) return result(false, 'unknownDecoration');
  if (state.decorations.length >= CONFIG.tank.decorationCapacity) return result(false, 'decorationStorageFull');
  if (state.resources.scrap < definition.cost.scrap || state.resources.gel < definition.cost.gel || state.resources.stardust < definition.cost.stardust) {
    return result(false, 'notEnoughMaterials', { cost: definition.cost });
  }
  state.resources.scrap -= definition.cost.scrap;
  state.resources.gel -= definition.cost.gel;
  state.resources.stardust -= definition.cost.stardust;
  const decoration = { uid: `decoration_${nextUid(state)}`, id: decorationId, position: null };
  state.decorations.push(decoration);
  emit(state, 'decorationCrafted', { decoration });
  return result(true, 'decorationCrafted', { decoration });
}

export function placeDecoration(state, inventoryUid, position) {
  const decoration = state.decorations.find((item) => item.uid === inventoryUid);
  if (!decoration) return result(false, 'decorationNotFound');
  const definition = DECORATIONS.find((item) => item.id === decoration.id);
  const requested = position ?? definition.placement;
  const [minimum, maximum] = CONFIG.tank.coordinateMin <= CONFIG.tank.coordinateMax
    ? [CONFIG.tank.coordinateMin, CONFIG.tank.coordinateMax]
    : CONFIG.decorations.placementBounds;
  if (!Number.isFinite(requested.x) || !Number.isFinite(requested.y) || requested.x < minimum || requested.x > maximum || requested.y < minimum || requested.y > maximum) {
    return result(false, 'positionOutsideTank');
  }
  decoration.position = { ...requested, layer: requested.layer ?? definition.placement.layer, scale: requested.scale ?? definition.placement.scale };
  emit(state, 'decorationPlaced', { decoration });
  return result(true, 'decorationPlaced', { decoration });
}

export function prestige(state, { now = Date.now() } = {}) {
  const highestTier = Object.values(state.runMaxTier).reduce((highest, tier) => Math.max(highest, tier), 0);
  if (highestTier < CONFIG.economy.prestige.minimumTier) return result(false, 'tierTenNeeded');
  const tierSum = Object.values(state.runMaxTier).reduce((total, tier) => total + tier, 0);
  const completion = Math.min(1, state.codex.entries.length / CONFIG.economy.codex.totalEntries);
  const mudMultiplier = 1 + upgradeValue(state, 'mud_memory', 'mudGain') + topThreeBonus(state, 'core', 'prestigeMudRate');
  const mud = Math.max(CONFIG.economy.prestige.minimumMud, Math.floor(tierSum * completion * CONFIG.economy.prestige.mudBaseMultiplier * mudMultiplier));

  state.resources.primordialMud += mud;
  state.resources.gel = 0;
  state.slimes = [];
  state.runMaxTier = {};
  const starter = birthSlime(state, CONFIG.economy.startingSpecies, 1, now, state._rng, { allowMutation: false });
  state.meta.prestigeCount += 1;
  state.lastTickAt = toTimestamp(now);
  emit(state, 'prestige', { mud, prestigeCount: state.meta.prestigeCount, tierSum, codexCompletion: completion });
  return result(true, 'prestige', { mud, starter, prestigeCount: state.meta.prestigeCount, tierSum, codexCompletion: completion });
}

export function buyUpgrade(state, upgradeId) {
  const upgrade = UPGRADES.find((item) => item.id === upgradeId);
  if (!upgrade) return result(false, 'unknownUpgrade');
  const level = state.upgrades[upgradeId] ?? 0;
  if (level >= upgrade.maxLevel) return result(false, 'upgradeMaxed');
  const mudCost = upgrade.costs[level];
  if (state.resources.primordialMud < mudCost) return result(false, 'notEnoughMud', { mudCost });
  state.resources.primordialMud -= mudCost;
  state.upgrades[upgradeId] = level + 1;
  emit(state, 'upgradeBought', { upgradeId, level: level + 1, mudCost });
  return result(true, 'upgradeBought', { upgradeId, level: level + 1, mudCost });
}

export function poke(state, uid) {
  const slime = state.slimes.find((item) => item.uid === uid);
  if (!slime) return result(false, 'slimeNotFound');
  state.resources.gel += CONFIG.economy.pokeGel;
  state.meta.pokeCount += 1;
  state.meta.consecutivePokes += 1;
  emit(state, 'poked', { uid, gel: CONFIG.economy.pokeGel, consecutive: state.meta.consecutivePokes });
  if (state.meta.consecutivePokes >= CONFIG.economy.pokeTitleCount && !state.meta.titles.includes(CONFIG.milestones.titleId)) {
    state.meta.titles.push(CONFIG.milestones.titleId);
    emit(state, 'milestone', { id: CONFIG.milestones.titleId, count: state.meta.consecutivePokes });
  }
  return result(true, 'poked', { gel: CONFIG.economy.pokeGel, consecutive: state.meta.consecutivePokes });
}

export function computeRates(state, phase = 'day') {
  let baseProduction = 0;
  for (const slime of state.slimes) {
    const tierProduction = slime.tier ** CONFIG.economy.tierProductionExponent;
    const speciesMultiplier = slime.species === CONFIG.economy.startingSpecies ? CONFIG.economy.protoProductionMultiplier : 1;
    baseProduction += CONFIG.economy.baseGelPerSecond * tierProduction * speciesMultiplier;
  }
  const codexBonus = state.codex.entries.length * CONFIG.economy.codex.gelRatePerEntry;
  const gelUpgrade = upgradeValue(state, 'gel_garden', 'gelRate');
  const hiddenBonus = (state.meta.hiddenRecipeCount ?? 0) * CONFIG.economy.recipeHiddenGelBonus;
  const hueBonus = topThreeBonus(state, 'hue', 'gelRate');
  const phaseMultiplier = phase === 'day' ? CONFIG.time.phaseRate.dayGel : 1;
  const gelPerSecond = baseProduction * (1 + codexBonus + gelUpgrade + hiddenBonus + hueBonus) * phaseMultiplier;
  const coreMutation = topThreeBonus(state, 'core', 'mutationRate');
  const mutationMultiplier = 1 + coreMutation + upgradeValue(state, 'gentle_glimmer', 'mutationRate');
  const nightMutation = phase === 'night' ? CONFIG.time.phaseRate.nightMutation : 1;
  const glossBonus = topThreeBonus(state, 'gloss', 'offlineRate');
  const offlineCapHours = Math.min(
    CONFIG.time.maxOfflineCapHours,
    CONFIG.time.offlineCapHours + upgradeValue(state, 'longer_naps', 'offlineCapHours') + topThreeBonus(state, 'core', 'offlineCapMinutes') / 60,
  );
  return {
    phase,
    baseProduction,
    gelPerSecond,
    mutationChance: {
      hue: CONFIG.economy.mutation.hueChance * mutationMultiplier * nightMutation,
      gloss: CONFIG.economy.mutation.glossChance * mutationMultiplier * nightMutation,
      core: CONFIG.economy.mutation.coreChance * mutationMultiplier * nightMutation,
    },
    offlineEfficiency: 1 + glossBonus,
    offlineCapHours,
    codexBonus,
    hueBonus,
    glossBonus,
    hiddenBonus,
    gelMultiplier: 1 + codexBonus + gelUpgrade + hiddenBonus + hueBonus,
  };
}

export function drainEvents(state) {
  const events = state.events;
  state.events = [];
  return events;
}

export function getSpecies(speciesId) {
  return speciesById.get(speciesId);
}

function recipeMatches(recipe, first, second, state, timestamp) {
  const ingredientsMatch = (first.species === recipe.a && second.species === recipe.b && first.tier >= recipe.tierA && second.tier >= recipe.tierB)
    || (first.species === recipe.b && second.species === recipe.a && first.tier >= recipe.tierB && second.tier >= recipe.tierA);
  if (!ingredientsMatch) return false;
  if (recipe.time !== 'any' && recipe.time !== getPhase(timestamp)) return false;
  if (recipe.stage === 'run2' && state.meta.prestigeCount < 1) return false;
  if (recipe.stage === 'run1' && Math.max(...Object.values(state.runMaxTier), 0) < 3) return false;
  return true;
}

function failRecipe(state, reason) {
  const discount = upgradeValue(state, 'recipe_kindness', 'recipeFeeDiscount');
  const requestedCost = CONFIG.economy.recipeFailureGel * Math.max(0, 1 - discount);
  const gelCost = Math.min(state.resources.gel, requestedCost);
  state.resources.gel -= gelCost;
  state.resources.scrap += CONFIG.economy.recipeFailureScrap;
  emit(state, 'recipeFail', { reason, gelCost, scrap: CONFIG.economy.recipeFailureScrap });
  return result(false, reason, { gelCost, scrap: CONFIG.economy.recipeFailureScrap });
}

function birthSlime(state, speciesId, tier, now, rng, { allowMutation = true } = {}) {
  const timestamp = toTimestamp(now);
  const random = rng ?? state._rng ?? Math.random;
  const mutationLevels = { hue: 0, gloss: 0, core: 0 };
  const phase = getPhase(timestamp);
  if (allowMutation) {
    const chance = computeRates(state, phase).mutationChance;
    for (const dimension of Object.keys(mutationLevels)) {
      if (random() < chance[dimension]) mutationLevels[dimension] = chooseMutationLevel(dimension, random);
    }
  }
  const slime = {
    uid: nextUid(state), species: speciesId, tier,
    hue: mutationLevels.hue, gloss: mutationLevels.gloss, core: mutationLevels.core,
    bornAt: timestamp,
  };
  state.slimes.push(slime);
  unlockSpecies(state, speciesId);
  state.runMaxTier[speciesId] = Math.max(state.runMaxTier[speciesId] ?? 0, tier);
  emit(state, 'born', { slime });
  recordCodex(state, 'species', speciesId, timestamp);
  for (const milestoneTier of CONFIG.economy.codex.tierMilestones) {
    if (tier >= milestoneTier) recordCodex(state, 'tier', `${speciesId}:${milestoneTier}`, timestamp);
  }
  for (const dimension of Object.keys(mutationLevels)) {
    const level = mutationLevels[dimension];
    recordCodex(state, 'mutation', `${dimension}:${speciesId}:${level}`, timestamp);
    if (level > 0) emit(state, 'mutation', { uid: slime.uid, species: speciesId, dimension, level });
  }
  return slime;
}

function chooseMutationLevel(dimension, random) {
  const weights = CONFIG.economy.mutation[`${dimension}Weights`];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let draw = random() * total;
  for (let level = 1; level < weights.length; level += 1) {
    draw -= weights[level];
    if (draw < 0) return level;
  }
  return weights.length - 1;
}

function recordCodex(state, page, value, now) {
  const entryId = page === 'mutation' ? `mutation:${value}` : `${page}:${value}`;
  if (state.codex.entries.includes(entryId)) return false;
  state.codex.entries.push(entryId);
  if (page === 'species') state.codex.species.push(value);
  else if (page === 'tier') state.codex.tiers.push(value);
  else if (page === 'recipe') state.codex.recipes.push(value);
  else {
    const [dimension, ...parts] = value.split(':');
    state.codex.mutations[dimension].push(parts.join(':'));
  }
  emit(state, 'codexUnlock', { entry: { id: entryId, page, value }, count: state.codex.entries.length, gelRateBonus: CONFIG.economy.codex.gelRatePerEntry });
  const gift = CONFIG.economy.codex.giftMilestones[state.codex.entries.length];
  if (gift) {
    state.resources.stardust += gift.stardust ?? 0;
    emit(state, 'milestone', { id: `codex_${state.codex.entries.length}`, count: state.codex.entries.length, reward: gift });
  }
  return true;
}

function topThreeBonus(state, dimension, field) {
  const best = [0, 0, 0];
  for (const slime of state.slimes) {
    const level = MUTATIONS[dimension].levels[slime[dimension]];
    const value = level?.[field] ?? 0;
    if (value <= best[2]) continue;
    best[2] = value;
    if (best[2] > best[1]) [best[1], best[2]] = [best[2], best[1]];
    if (best[1] > best[0]) [best[0], best[1]] = [best[1], best[0]];
  }
  return best[0] + best[1] + best[2];
}

function upgradeValue(state, upgradeId, effect) {
  const upgrade = UPGRADES.find((item) => item.id === upgradeId);
  return (state.upgrades[upgradeId] ?? 0) * (upgrade?.effectPerLevel[effect] ?? 0);
}

function ensureRoom(state, now, rng) {
  if (state.slimes.length < CONFIG.tank.capacity) return true;
  if (state.settings.autoMerge) runAutoMerge(state, { now, rng });
  return state.slimes.length < CONFIG.tank.capacity;
}

function runAutoMerge(state, { now = Date.now(), rng } = {}) {
  let merged = true;
  while (merged) {
    merged = false;
    const counts = new Map();
    for (const slime of state.slimes) {
      if (slime.tier >= CONFIG.merge.maximumTier) continue;
      const key = `${slime.species}:${slime.tier}`;
      const group = counts.get(key) ?? [];
      group.push(slime.uid);
      counts.set(key, group);
    }
    for (const group of counts.values()) {
      if (group.length >= CONFIG.merge.requiredSlimes) {
        merge(state, group.slice(0, CONFIG.merge.requiredSlimes), { now, rng });
        merged = true;
        break;
      }
    }
  }
}

function unlockSpecies(state, speciesId) {
  if (!state.unlockedSpecies.includes(speciesId)) state.unlockedSpecies.push(speciesId);
}

function nextUid(state) {
  const uid = `slime_${state.nextUid}`;
  state.nextUid += 1;
  return uid;
}

function emit(state, type, details = {}) {
  state.events.push({ type, at: state.lastTickAt, ...details });
}

function pairKey(first, second) {
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function result(ok, reason, details = {}) {
  return { ok, reason, ...details };
}
