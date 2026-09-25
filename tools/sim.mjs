import { CONFIG } from '../src/data/config.js';
import { MUTATIONS } from '../src/data/mutations.js';
import { RECIPES } from '../src/data/recipes.js';
import { SPECIES } from '../src/data/species.js';
import { createState, drainEvents, getPhase, prestige, summon, tick, toggleAutoMerge, tryRecipe } from '../src/core/index.js';

const maximumMs = CONFIG.pacing.firstPrestigeMs[1] + CONFIG.time.hourMs;
const secondMs = CONFIG.time.secondMs;
const start = new Date(2026, 8, 25, 9, 0, 0).getTime();
const random = seededRandom(0x51_1e_6a);
const state = createState({ now: start, rng: random });
toggleAutoMerge(state, true);
const baseSpecies = SPECIES.filter((species) => species.kind === 'base');
const introRecipes = RECIPES.filter((recipe) => recipe.stage === 'intro');
const milestones = { firstMergeMs: null, allBaseSpeciesMs: null, firstMutationMs: null, firstRareMutationMs: null, introRecipesMs: null, firstPrestigeMs: null };

for (let elapsed = secondMs; elapsed <= maximumMs; elapsed += secondMs) {
  const now = start + elapsed;
  tick(state, secondMs, now);

  const nextBase = baseSpecies.find((species) => !state.unlockedSpecies.includes(species.id));
  if (nextBase) summon(state, nextBase.id, { now, rng: random });

  for (const recipe of introRecipes) {
    if (state.codex.recipes.includes(recipe.id)) continue;
    if (recipe.time !== 'any' && recipe.time !== getPhase(now)) continue;
    const first = ensureIngredient(state, recipe.a, recipe.tierA, now, random);
    const second = ensureIngredient(state, recipe.b, recipe.tierB, now, random);
    if (!first || !second) continue;
    tryRecipe(state, first.uid, second.uid, { now, rng: random });
  }

  if ((state.runMaxTier.proto ?? 0) < 10) summon(state, 'proto', { now, rng: random });

  const events = drainEvents(state);
  if (milestones.firstMergeMs === null && events.some((event) => event.type === 'merged')) milestones.firstMergeMs = elapsed;
  if (milestones.firstMutationMs === null && events.some((event) => event.type === 'mutation')) milestones.firstMutationMs = elapsed;
  if (milestones.firstRareMutationMs === null && events.some((event) => event.type === 'mutation' && isRareMutation(event))) milestones.firstRareMutationMs = elapsed;
  if (milestones.introRecipesMs === null && introRecipes.every((recipe) => state.codex.recipes.includes(recipe.id))) milestones.introRecipesMs = elapsed;
  if (milestones.allBaseSpeciesMs === null && baseSpecies.every((species) => state.unlockedSpecies.includes(species.id))) milestones.allBaseSpeciesMs = elapsed;

  if (milestones.firstPrestigeMs === null && (state.runMaxTier.proto ?? 0) >= 10) {
    const outcome = prestige(state, { now });
    if (outcome.ok) milestones.firstPrestigeMs = elapsed;
  }
  if (Object.values(milestones).every((value) => value !== null)) break;
}

for (const [name, time] of Object.entries(milestones)) console.log(`${name}: ${time === null ? 'not reached' : formatDuration(time)}`);
console.log(`codex entries: ${state.codex.entries.length}`);
console.log(`gel at finish: ${Math.floor(state.resources.gel)}`);
console.log(`base species unlocked: ${baseSpecies.filter((species) => state.unlockedSpecies.includes(species.id)).length}/${baseSpecies.length}`);
console.log(`intro recipes discovered: ${introRecipes.filter((recipe) => state.codex.recipes.includes(recipe.id)).length}/${introRecipes.length}`);
console.log(`missing intro recipes: ${introRecipes.filter((recipe) => !state.codex.recipes.includes(recipe.id)).map((recipe) => recipe.id).join(', ') || 'none'}`);
console.log(`live slimes: ${state.slimes.length}; proto max tier this run: ${state.runMaxTier.proto ?? 0}`);

function ensureIngredient(game, speciesId, requiredTier, now, rng) {
  const existing = game.slimes.find((slime) => slime.species === speciesId && slime.tier >= requiredTier);
  if (existing) return existing;
  if (!game.unlockedSpecies.includes(speciesId)) return null;
  summon(game, speciesId, { now, rng });
  return game.slimes.find((slime) => slime.species === speciesId && slime.tier >= requiredTier) ?? null;
}

function isRareMutation(event) {
  const rareLevel = event.dimension === 'hue'
    ? CONFIG.economy.mutation.rareHueLevel
    : MUTATIONS[event.dimension].levels.length - 1;
  return event.level >= rareLevel;
}

function formatDuration(durationMs) {
  const totalMinutes = Math.floor(durationMs / CONFIG.time.minuteMs);
  const hours = Math.floor(totalMinutes * CONFIG.time.minuteMs / CONFIG.time.hourMs);
  const minutes = Math.floor((durationMs % CONFIG.time.hourMs) / CONFIG.time.minuteMs);
  const seconds = Math.floor((durationMs % CONFIG.time.minuteMs) / CONFIG.time.secondMs);
  return `${hours}h ${minutes}m ${seconds}s`;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
