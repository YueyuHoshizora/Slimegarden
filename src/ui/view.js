import { CONFIG } from '../data/config.js';
import { DECORATIONS } from '../data/decorations.js';
import { MUTATIONS } from '../data/mutations.js';
import { RECIPES } from '../data/recipes.js';
import { SPECIES } from '../data/species.js';
import { CLUES } from '../data/texts/clues.js';
import { OBSERVATIONS } from '../data/texts/observations.js';
import { UPGRADES } from '../data/upgrades.js';
import { exportCardPng, downloadBlob } from '../art/card.js';
import { silhouetteSvg, slimeSvg } from '../art/slimeSvg.js';
import { getLang, LANGUAGE_LABEL_KEYS, LANGUAGES, name, t } from '../i18n/index.js';
import { previewPrestigeMud } from '../core/engine.js';

const SPECIES_BY_ID = new Map(SPECIES.map((species) => [species.id, species]));
const UPGRADE_LABELS = {
  gel_garden: ['upgradeSalesName', 'upgradeSalesDescription'],
  longer_naps: ['upgradeOfflineName', 'upgradeOfflineDescription'],
  gentle_glimmer: ['upgradeMutationName', 'upgradeMutationDescription'],
  soft_summons: ['upgradeSummonName', 'upgradeSummonDescription'],
  mud_memory: ['upgradeMudName', 'upgradeMudDescription'],
  recipe_kindness: ['upgradeRecipeName', 'upgradeRecipeDescription'],
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const formatNumber = (value) => new Intl.NumberFormat(getLang(), { maximumFractionDigits: 1 }).format(Number(value) || 0);
const getLabel = (key, params) => escapeHtml(t(key, params));
const localName = (value) => escapeHtml(name(value));

export function createUI(root, handlers) {
  let state = null;
  let activePanel = 'recipes';
  let codexTab = 'species';
  let mutationDimension = 'hue';
  let recipePage = 0;
  let codexPage = 0;
  let slimePage = 0;
  let summonSpecies = CONFIG.economy.startingSpecies;
  let summonTier = 1;
  let activeRecipe = RECIPES[0]?.id;
  let mode = 'merge';
  let pendingImport = null;
  let lastOffline = null;
  let dialogKind = null;
  let dialogData = null;
  const rootHtml = `
    <header class="topbar">
      <div class="brand"><span class="brand-mark" aria-hidden="true">●</span><span class="brand-title" data-ui="gameTitle"></span></div>
      <div class="resource-row" aria-label="">
        <div class="resource-chip"><span class="resource-icon" aria-hidden="true">💧</span><span class="resource-label" data-ui="gel"></span><strong class="resource-value" id="resource-gel">0</strong></div>
        <div class="resource-chip"><span class="resource-icon" aria-hidden="true">✦</span><span class="resource-label" data-ui="stardust"></span><strong class="resource-value" id="resource-stardust">0</strong></div>
        <div class="resource-chip"><span class="resource-icon" aria-hidden="true">◈</span><span class="resource-label" data-ui="primalMud"></span><strong class="resource-value" id="resource-mud">0</strong></div>
        <div class="resource-chip"><span class="resource-icon" aria-hidden="true">❋</span><span class="resource-label" data-ui="scraps"></span><strong class="resource-value" id="resource-scrap">0</strong></div>
      </div>
      <div class="top-controls">
        <span class="phase-chip" id="phase-chip"><span id="phase-icon">☀️</span><span class="phase-label" data-ui="phase"></span><strong id="phase-name"></strong></span>
        <select data-language aria-label="Language"></select>
        <button class="icon-button" type="button" data-action="open-settings" aria-label="Settings" title="Settings">⚙</button>
      </div>
    </header>
    <main class="layout">
      <section class="panel recipe-panel active" id="recipe-panel" aria-label="Recipe book">
        <div class="panel-head"><h2 class="panel-title" data-ui="recipeBook"></h2><span class="panel-subtitle" id="recipe-progress"></span></div>
        <div class="panel-tools"><span class="subtle" data-ui="recipeHint"></span><span class="subtle" id="recipe-selection-count"></span></div>
        <div class="recipe-list" id="recipe-list"></div>
        <div class="pager"><button type="button" data-action="recipe-page" data-step="-1" aria-label="Previous">‹</button><span class="subtle" id="recipe-page-label"></span><button type="button" data-action="recipe-page" data-step="1" aria-label="Next">›</button></div>
        <div class="selected-action"><span id="recipe-selected-label"></span><button type="button" class="primary" data-action="try-recipe" id="try-recipe-button"></button><button type="button" data-action="clear-selection" data-mode="recipe" title="Clear selection">×</button></div>
        <button type="button" class="recipe-achievement" data-action="download-recipe-card" data-id="" id="recipe-achievement" hidden></button>
      </section>
      <section class="garden-stage" aria-label="Garden tank">
        <div class="stage-head"><h1 class="stage-title" data-ui="garden"></h1><div class="stage-switch"><button type="button" data-action="switch-panel" data-panel="recipes"></button><button type="button" data-action="switch-panel" data-panel="codex"></button></div></div>
        <div class="tank-frame"><canvas id="tank-canvas" aria-label="Living slime garden"></canvas><div class="sound-prompt" id="sound-prompt" hidden><span data-ui="soundWelcome"></span><button class="primary" type="button" data-action="enable-sound" aria-label="Enable sound">♪</button><button type="button" data-action="dismiss-sound" aria-label="Close">×</button></div></div>
        <div class="tank-caption"><span id="tank-count"></span><span id="mode-caption"></span></div>
      </section>
      <div class="side-stack">
        <nav class="side-route-nav" aria-label="Garden pages"><button type="button" data-action="switch-panel" data-panel="recipes"></button><button type="button" data-action="switch-panel" data-panel="codex"></button></nav>
        <section class="panel codex-panel active" id="codex-panel" aria-label="Garden codex">
          <div class="panel-head"><h2 class="panel-title" data-ui="codex"></h2><span class="panel-subtitle" id="codex-progress"></span></div>
          <div class="tab-row" role="tablist"><button class="tab-button" type="button" data-action="codex-tab" data-tab="species" role="tab"></button><button class="tab-button" type="button" data-action="codex-tab" data-tab="mutations" role="tab"></button><button class="tab-button" type="button" data-action="codex-tab" data-tab="recipes" role="tab"></button></div>
          <div class="tab-row mutation-tabs" id="mutation-tabs"><button class="tab-button" type="button" data-action="mutation-tab" data-dimension="hue"></button><button class="tab-button" type="button" data-action="mutation-tab" data-dimension="gloss"></button><button class="tab-button" type="button" data-action="mutation-tab" data-dimension="core"></button></div>
          <div class="codex-grid" id="codex-grid"></div>
          <div class="pager"><button type="button" data-action="codex-page" data-step="-1" aria-label="Previous">‹</button><span class="subtle" id="codex-page-label"></span><button type="button" data-action="codex-page" data-step="1" aria-label="Next">›</button></div>
          <div class="codex-footer"><span class="subtle" id="codex-footer-label"></span><button type="button" data-action="download-codex"></button></div>
          <div class="milestones" id="milestones"></div>
        </section>
        <section class="panel merge-panel" id="merge-panel" aria-label="Summon and merge">
          <div class="panel-head"><h2 class="panel-title" data-ui="mergeNow"></h2><span class="panel-subtitle" data-ui="mergeHint"></span></div>
          <div class="merge-summon"></div>
          <div class="panel-tools"><button type="button" data-action="set-mode" data-mode="merge"></button><button type="button" data-action="set-mode" data-mode="recipe"></button><span class="subtle" id="merge-selection-count"></span></div>
          <div class="selected-action"><button type="button" class="primary" data-action="merge-selected" id="merge-selected-button"></button><button type="button" data-action="clear-selection" data-mode="merge"></button></div>
          <div class="slime-list" id="slime-list"></div>
          <div class="pager"><button type="button" data-action="slime-page" data-step="-1" aria-label="Previous">‹</button><span class="subtle" id="slime-page-label"></span><button type="button" data-action="slime-page" data-step="1" aria-label="Next">›</button></div>
          <div class="merge-tools"><label class="toggle"><input type="checkbox" data-setting="autoMerge"><span data-ui="autoMerge"></span></label><button type="button" data-action="open-decorations" data-ui="decorations"></button><button type="button" data-action="open-offline" data-ui="offlineEntry"></button><button type="button" data-action="open-prestige" data-ui="prestige"></button></div>
        </section>
        <section class="panel settings-panel" id="settings-panel" aria-label="Settings"><div class="panel-head"><h2 class="panel-title" data-ui="settings"></h2></div><div class="settings-host inline-settings" data-settings-host></div></section>
      </div>
    </main>
    <footer class="actionbar">
      <div class="action-group summon-tools"><select data-summon-species class="summon-select" aria-label="Summon species"></select><select data-summon-tier aria-label="Summon tier"></select><button type="button" class="primary" data-action="summon" data-ui="summon"></button></div>
      <div class="action-group"><span class="selected-inline" id="selected-inline"></span><button type="button" class="primary" data-action="merge-selected" id="merge-footer-button"></button><button type="button" data-action="clear-selection" data-mode="merge" data-ui="clearSelection"></button></div>
      <div class="action-group"><label class="toggle"><input type="checkbox" data-setting="autoMerge"><span class="auto-label" data-ui="autoMerge"></span></label><button type="button" class="action-secondary" data-action="open-decorations" data-ui="decorations"></button><button type="button" data-action="open-offline" data-ui="offlineEntry"></button><button type="button" data-action="open-prestige" data-ui="prestige"></button></div>
    </footer>
    <nav class="mobile-tabs" aria-label="Garden pages"><button type="button" data-action="switch-panel" data-panel="recipes"></button><button type="button" data-action="switch-panel" data-panel="codex"></button><button type="button" data-action="switch-panel" data-panel="merge"></button><button type="button" data-action="switch-panel" data-panel="settings"></button></nav>
    <dialog class="dialog-shell" id="feature-dialog"><div class="dialog-content" id="dialog-content"></div></dialog>
    <div class="toast-stack" id="toast-stack" aria-live="polite"></div>`;
  root.innerHTML = rootHtml;
  const sideStack = root.querySelector('.side-stack');
  sideStack.prepend(root.querySelector('#recipe-panel'));
  sideStack.prepend(sideStack.querySelector('.side-route-nav'));
  const dialog = root.querySelector('#feature-dialog');
  const dialogContent = root.querySelector('#dialog-content');
  dialog.addEventListener('close', () => { dialogKind = null; pendingImport = null; });

  function localizedShell() {
    root.querySelectorAll('[data-ui]').forEach((element) => { element.textContent = t(element.dataset.ui); });
    root.querySelectorAll('[data-action="open-settings"]').forEach((button) => { button.setAttribute('aria-label', t('settings')); button.title = t('settings'); });
    root.querySelectorAll('[data-language]').forEach((select) => select.setAttribute('aria-label', t('language')));
    root.querySelector('#tank-canvas').setAttribute('aria-label', t('garden'));
    root.querySelector('#recipe-panel').setAttribute('aria-label', t('recipeBook'));
    root.querySelector('#codex-panel').setAttribute('aria-label', t('codex'));
    root.querySelector('#merge-panel').setAttribute('aria-label', t('narrowMerge'));
    root.querySelector('#settings-panel').setAttribute('aria-label', t('settings'));
    root.querySelectorAll('.pager button[data-step="-1"]').forEach((button) => button.setAttribute('aria-label', '‹'));
    root.querySelectorAll('.pager button[data-step="1"]').forEach((button) => button.setAttribute('aria-label', '›'));
    root.querySelectorAll('.stage-switch [data-panel="recipes"], .side-route-nav [data-panel="recipes"], .mobile-tabs [data-panel="recipes"]').forEach((button) => { button.textContent = t('recipes'); });
    root.querySelectorAll('.stage-switch [data-panel="codex"], .side-route-nav [data-panel="codex"], .mobile-tabs [data-panel="codex"]').forEach((button) => { button.textContent = t('codex'); });
    root.querySelector('.mobile-tabs [data-panel="merge"]').textContent = t('narrowMerge');
    root.querySelector('.mobile-tabs [data-panel="settings"]').textContent = t('narrowSettings');
    const tabLabels = { species: 'speciesTab', mutations: 'mutationsTab', recipes: 'recipesTab' };
    root.querySelectorAll('[data-action="codex-tab"]').forEach((button) => { button.textContent = t(tabLabels[button.dataset.tab]); button.setAttribute('aria-selected', String(button.dataset.tab === codexTab)); });
    root.querySelectorAll('[data-action="mutation-tab"]').forEach((button) => { button.textContent = t(button.dataset.dimension); button.classList.toggle('active', button.dataset.dimension === mutationDimension); });
    root.querySelectorAll('[data-action="set-mode"]').forEach((button) => { button.textContent = t(button.dataset.mode === 'merge' ? 'modeMerge' : 'modeRecipe'); button.classList.toggle('active', button.dataset.mode === mode); });
    root.querySelectorAll('[data-language]').forEach((select) => {
      if (!select.options.length) select.innerHTML = LANGUAGES.map((lang) => `<option value="${lang}">${t(LANGUAGE_LABEL_KEYS[lang])}</option>`).join('');
      else Array.from(select.options).forEach((option) => { option.textContent = t(LANGUAGE_LABEL_KEYS[option.value]); });
      select.setAttribute('aria-label', t('language'));
      if (document.activeElement !== select) select.value = getLang();
    });
  }

  function renderSettings(host, refreshFocused = false) {
    if (!host || !state) return;
    const focused = host.contains(document.activeElement) && ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName);
    if (focused && !refreshFocused) return;
    const activeElement = focused ? document.activeElement : null;
    const importValue = host.querySelector('[data-import-paste]')?.value ?? '';
    const musicMuted = Boolean(state.settings.bgmMuted);
    const effectsMuted = Boolean(state.settings.sfxMuted);
    host.innerHTML = `
      <div class="setting-row"><span>${getLabel('language')}</span><select data-language aria-label="${getLabel('language')}"></select></div>
      <div class="setting-row"><span>${getLabel('music')}</span><button type="button" data-action="toggle-music">${getLabel(musicMuted ? 'off' : 'on')}</button></div>
      <div class="setting-row"><span>${getLabel('soundEffects')}</span><button type="button" data-action="toggle-effects">${getLabel(effectsMuted ? 'off' : 'on')}</button></div>
      <div class="settings-actions">
        <button type="button" data-action="export-json">${getLabel('exportJson')}</button>
        <button type="button" data-action="export-base64">${getLabel('exportBase64')}</button>
        <label class="file-button" for="import-file-${host.id || 'settings'}">${getLabel('importFile')}<input id="import-file-${host.id || 'settings'}" class="import-file" type="file" accept="application/json,.json" data-import-file></label>
        <button type="button" data-action="preview-import">${getLabel('importPreview')}</button>
        <button type="button" class="wide-action" data-action="restore-backup">${getLabel('backupRestore')}</button>
        <button type="button" class="wide-action" data-action="install-invite">${getLabel('install')}</button>
      </div>
      <textarea class="save-code" data-import-paste placeholder="${getLabel('importPasteHint')}" aria-label="${getLabel('importPaste')}"></textarea>
      <p class="dialog-copy settings-inline-copy">${getLabel('importSummary')}</p>`;
    const langSelect = host.querySelector('[data-language]');
    langSelect.innerHTML = LANGUAGES.map((lang) => `<option value="${lang}">${t(LANGUAGE_LABEL_KEYS[lang])}</option>`).join('');
    langSelect.value = getLang();
    const paste = host.querySelector('[data-import-paste]');
    paste.value = importValue;
    if (activeElement?.matches('[data-language]')) langSelect.focus();
    if (activeElement?.matches('[data-import-paste]')) { paste.focus(); paste.setSelectionRange(importValue.length, importValue.length); }
  }

  function setPanel(panel) {
    activePanel = panel;
    root.querySelectorAll('.mobile-tabs [data-panel]').forEach((button) => button.classList.toggle('active', button.dataset.panel === panel));
    root.querySelectorAll('.side-route-nav [data-panel]').forEach((button) => button.classList.toggle('active', button.dataset.panel === panel));
    root.querySelector('#recipe-panel').classList.toggle('active', panel === 'recipes');
    root.querySelector('#codex-panel').classList.toggle('active', panel === 'codex');
    root.querySelector('#merge-panel').classList.toggle('active', panel === 'merge');
    root.querySelector('#settings-panel').classList.toggle('active', panel === 'settings');
  }

  function openDialog(kind, title, body, actions = '') {
    dialogKind = kind;
    dialogContent.innerHTML = `<div class="dialog-head"><h2>${escapeHtml(title)}</h2><button type="button" class="icon-button" data-action="dialog-close" aria-label="${getLabel('close')}">×</button></div><div class="dialog-body">${body}</div>${actions ? `<div class="dialog-actions">${actions}</div>` : ''}`;
    if (!dialog.open) dialog.showModal();
    if (kind === 'settings') renderSettings(dialogContent.querySelector('[data-settings-host]'));
  }

  function renderSettingsDialog() {
    openDialog('settings', t('settings'), '<div class="settings-host inline-settings" data-settings-host></div>');
  }

  function renderSummonControls(host) {
    if (!host || !state || host.contains(document.activeElement)) return;
    const speciesOptions = SPECIES.map((species) => {
      const unlocked = state.unlockedSpecies.includes(species.id);
      const unavailable = species.kind === 'primal' && state.meta.prestigeCount < 1;
      const cost = CONFIG.economy.summonUnlockCosts[species.id];
      const suffix = species.kind === 'base' && !unlocked ? ` · ${formatNumber(cost)} ${t('gel')}` : unavailable ? ` · ${t('prestige')}` : '';
      return `<option value="${escapeHtml(species.id)}"${unavailable ? ' disabled' : ''}>${localName(species.name)}${escapeHtml(suffix)}</option>`;
    }).join('');
    const tiers = Array.from({ length: CONFIG.merge.maximumTier }, (_, index) => index + 1)
      .map((tier) => `<option value="${tier}">${getLabel('tier', { n: tier })}</option>`).join('');
    host.innerHTML = `<select data-summon-species class="summon-select" aria-label="${getLabel('summonSpecies')}">${speciesOptions}</select><select data-summon-tier aria-label="${getLabel('summonTier')}">${tiers}</select><button type="button" class="primary" data-action="summon">${getLabel('summon')}</button>`;
    root.querySelectorAll('[data-summon-species]').forEach((select) => { select.value = SPECIES_BY_ID.has(summonSpecies) ? summonSpecies : CONFIG.economy.startingSpecies; });
    root.querySelectorAll('[data-summon-tier]').forEach((select) => { select.value = String(summonTier); });
  }

  function recipeIngredient(recipe, side) {
    const id = recipe[side];
    const species = SPECIES_BY_ID.get(id);
    const tier = recipe[`tier${side.toUpperCase()}`];
    return `${localName(species?.name)} ${getLabel('tier', { n: tier })}`;
  }

  function renderRecipes() {
    const list = root.querySelector('#recipe-list');
    const available = RECIPES;
    const compact = window.matchMedia('(max-width: 599px)').matches;
    const rowHeight = compact ? CONFIG.ui.compactRecipeRowHeight : CONFIG.ui.recipeRowHeight;
    const size = Math.max(1, Math.floor(list.clientHeight / rowHeight));
    const pages = Math.max(1, Math.ceil(available.length / size));
    recipePage = Math.min(recipePage, pages - 1);
    const shown = available.slice(recipePage * size, (recipePage + 1) * size);
    list.innerHTML = shown.map((recipe) => {
      const found = state.codex.recipes.includes(recipe.id);
      const accessible = recipe.stage !== 'run2' || state.meta.prestigeCount > 0;
      const clue = recipe.hidden ? localName(CLUES[recipe.id]) : '';
      const title = recipe.hidden && !found ? clue : localName(SPECIES_BY_ID.get(recipe.id)?.name);
      const ingredients = recipe.hidden && !found ? getLabel('recipeHint') : `${recipeIngredient(recipe, 'a')} + ${recipeIngredient(recipe, 'b')}`;
      const time = recipe.time === 'any' ? t('timeAny') : t(recipe.time);
      const label = recipe.hidden ? t('hiddenRecipes') : recipe.stage === 'run2' ? t('primalMud') : t('knownRecipes');
      return `<article class="recipe-card${activeRecipe === recipe.id ? ' selected' : ''}" data-recipe="${escapeHtml(recipe.id)}">
        <button class="recipe-copy" type="button" data-action="select-recipe" data-id="${escapeHtml(recipe.id)}" aria-pressed="${activeRecipe === recipe.id}">
          <span class="recipe-name"><span>${title}</span><span class="tag ${recipe.hidden ? 'hidden-tag' : ''} ${found ? 'found' : ''}">${escapeHtml(label)}</span></span>
          <span class="recipe-details ${recipe.hidden && !found ? 'recipe-clue' : ''}">${ingredients}<br>${getLabel('phase')}: ${escapeHtml(time)}${!accessible ? ` · ${getLabel('recipeLocked')}` : ''}</span>
        </button>
        <button type="button" class="recipe-select" data-action="select-recipe" data-id="${escapeHtml(recipe.id)}" aria-label="${getLabel('selectSlimes')}">${found ? '✓' : '♡'}</button>
      </article>`;
    }).join('');
    root.querySelector('#recipe-progress').textContent = t('recipeProgress', { n: state.codex.recipes.length, total: RECIPES.length });
    root.querySelector('#recipe-page-label').textContent = `${recipePage + 1} / ${pages}`;
    root.querySelectorAll('[data-action="recipe-page"]').forEach((button) => { button.disabled = Number(button.dataset.step) < 0 ? recipePage === 0 : recipePage >= pages - 1; });
    const hiddenSuccess = RECIPES.find((recipe) => recipe.hidden && state.codex.recipes.includes(recipe.id));
    const achievement = root.querySelector('#recipe-achievement');
    achievement.hidden = !hiddenSuccess;
    achievement.dataset.id = hiddenSuccess?.id ?? '';
    achievement.textContent = hiddenSuccess ? t('downloadRecipeCard') : '';
    const selected = state.slimes.filter((slime) => selectedUids.has(slime.uid));
    root.querySelector('#recipe-selection-count').textContent = t('selectedCount', { n: selected.length });
    root.querySelector('#recipe-selected-label').textContent = selected.map((slime) => localName(SPECIES_BY_ID.get(slime.species)?.name)).join(' · ') || t('selectSlimes');
    root.querySelector('#try-recipe-button').textContent = t('recipeTry');
    root.querySelector('#try-recipe-button').disabled = selected.length !== 2;
  }

  const selectedUids = new Set();

  function pageSizeForGrid(grid, cardWidth, cardHeight) {
    const columns = Math.max(1, Math.floor((grid.clientWidth + 6) / cardWidth));
    const rows = Math.max(1, Math.floor((grid.clientHeight + 6) / cardHeight));
    return columns * rows;
  }

  function codexItems() {
    if (codexTab === 'species') return SPECIES.map((species) => ({ type: 'species', species, found: state.codex.species.includes(species.id) || state.unlockedSpecies.includes(species.id) }));
    if (codexTab === 'recipes') return RECIPES.map((recipe) => ({ type: 'recipe', recipe, found: state.codex.recipes.includes(recipe.id) }));
    const dimensions = MUTATIONS[mutationDimension];
    return SPECIES.flatMap((species) => dimensions.levels.map((level) => ({ type: 'mutation', species, level, found: (state.codex.mutations[mutationDimension] ?? []).includes(`${species.id}:${level.id}`) })));
  }

  function renderCodex() {
    const grid = root.querySelector('#codex-grid');
    const items = codexItems();
    const compact = window.matchMedia('(max-width: 599px)').matches;
    const pageSize = pageSizeForGrid(grid, compact ? CONFIG.ui.codex.compactCardWidth : CONFIG.ui.codex.cardWidth, compact ? CONFIG.ui.codex.compactCardHeight : CONFIG.ui.codex.cardHeight);
    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    codexPage = Math.min(codexPage, pages - 1);
    const current = items.slice(codexPage * pageSize, (codexPage + 1) * pageSize);
    grid.className = `codex-grid${codexTab === 'mutations' ? ' mutation-grid' : ''}`;
    root.querySelector('#mutation-tabs').hidden = codexTab !== 'mutations';
    grid.innerHTML = current.map((item) => {
      if (item.type === 'species') {
        const label = item.found ? localName(item.species.name) : t('unknown');
        const illustration = item.found ? slimeSvg(item.species, { size: CONFIG.ui.codex.illustrationSize }) : silhouetteSvg(CONFIG.ui.codex.illustrationSize);
        return `<button type="button" class="codex-card${item.found ? ' discovered' : ''}" data-action="codex-detail" data-id="${escapeHtml(item.species.id)}" aria-label="${label}"><span class="codex-illustration">${illustration}</span><span class="codex-card-name">${label}</span></button>`;
      }
      if (item.type === 'recipe') {
        const label = item.found ? localName(SPECIES_BY_ID.get(item.recipe.id)?.name) : t('unknown');
        const illustration = item.found ? slimeSvg(SPECIES_BY_ID.get(item.recipe.id), { size: CONFIG.ui.codex.illustrationSize }) : silhouetteSvg(CONFIG.ui.codex.illustrationSize);
        return `<button type="button" class="codex-card${item.found ? ' discovered' : ''}" data-action="codex-detail" data-id="${escapeHtml(item.recipe.id)}" aria-label="${label}"><span class="codex-illustration">${illustration}</span><span class="codex-card-name">${label}</span></button>`;
      }
      const appearance = {
        size: CONFIG.ui.codex.illustrationSize,
        hue: mutationDimension === 'hue' ? item.level.id : 0,
        gloss: mutationDimension === 'gloss' ? item.level.id : 0,
        core: mutationDimension === 'core' ? item.level.id : 0,
      };
      const label = item.found ? `${localName(item.species.name)} · ${localName(item.level.name)}` : t('unknown');
      const illustration = item.found ? slimeSvg(item.species, appearance) : silhouetteSvg(CONFIG.ui.codex.illustrationSize);
      return `<button type="button" class="codex-card${item.found ? ' discovered' : ''}" data-action="codex-detail" data-id="${escapeHtml(item.species.id)}" data-dimension="${escapeHtml(mutationDimension)}" data-level="${item.level.id}" aria-label="${label}"><span class="codex-illustration">${illustration}</span><span class="codex-card-name">${label}</span></button>`;
    }).join('');
    root.querySelector('#codex-page-label').textContent = `${codexPage + 1} / ${pages}`;
    root.querySelectorAll('[data-action="codex-page"]').forEach((button) => { button.disabled = Number(button.dataset.step) < 0 ? codexPage === 0 : codexPage >= pages - 1; });
    const recipeCount = state.codex.recipes.length;
    const mutationCount = Object.values(state.codex.mutations).reduce((count, values) => count + values.length, 0);
    const speciesCount = state.codex.species.length;
    const progress = codexTab === 'species'
      ? t('speciesProgress', { n: speciesCount, total: SPECIES.length })
      : codexTab === 'recipes'
        ? t('recipeProgress', { n: recipeCount, total: RECIPES.length })
        : t('mutationProgress', { n: mutationCount, total: CONFIG.economy.codex.totalEntries - SPECIES.length - RECIPES.length });
    root.querySelector('#codex-footer-label').textContent = progress;
    root.querySelector('#codex-progress').textContent = t('total', { n: state.codex.entries.length });
    root.querySelector('[data-action="download-codex"]').textContent = t('downloadCodex');
    root.querySelector('#milestones').innerHTML = Object.entries(CONFIG.economy.codex.giftMilestones).map(([count]) => `<span class="milestone${state.codex.entries.length >= Number(count) ? ' done' : ''}">${count}</span>`).join('');
  }

  function renderSlimeList() {
    const list = root.querySelector('#slime-list');
    if (!list || !state) return;
    const compact = window.matchMedia('(max-width: 599px)').matches;
    const cardSize = compact ? CONFIG.ui.compactSlimeCardWidth : CONFIG.ui.slimeCardWidth;
    const rowHeight = compact ? CONFIG.ui.compactSlimeCardHeight : CONFIG.ui.slimeCardHeight;
    const capacity = Math.max(1, Math.floor((list.clientWidth + 7) / cardSize) * Math.floor((list.clientHeight + 7) / rowHeight));
    const pages = Math.max(1, Math.ceil(state.slimes.length / capacity));
    slimePage = Math.min(slimePage, pages - 1);
    const current = state.slimes.slice(slimePage * capacity, (slimePage + 1) * capacity);
    list.innerHTML = current.map((slime) => {
      const selected = selectedUids.has(slime.uid);
      return `<button type="button" class="slime-option${selected ? ' selected' : ''}" data-action="select-slime" data-id="${escapeHtml(slime.uid)}" aria-pressed="${selected}"><span>${localName(SPECIES_BY_ID.get(slime.species)?.name)}</span><strong>${getLabel('tier', { n: slime.tier })}</strong></button>`;
    }).join('') || `<p class="empty-list">${getLabel('noSlimes')}</p>`;
    root.querySelector('#slime-page-label').textContent = `${slimePage + 1} / ${pages}`;
    root.querySelectorAll('[data-action="slime-page"]').forEach((button) => { button.disabled = Number(button.dataset.step) < 0 ? slimePage === 0 : slimePage >= pages - 1; });
    const count = selectedUids.size;
    const selectedLabel = t('selectedCount', { n: count });
    root.querySelector('#merge-selection-count').textContent = selectedLabel;
    root.querySelector('#selected-inline').textContent = selectedLabel;
    root.querySelector('#merge-selected-button').textContent = t('mergeNow');
    root.querySelector('#merge-footer-button').textContent = t('mergeNow');
    root.querySelector('#merge-selected-button').disabled = count !== CONFIG.merge.requiredSlimes;
    root.querySelector('#merge-footer-button').disabled = count !== CONFIG.merge.requiredSlimes;
    root.querySelector('#tank-count').textContent = t('count', { n: state.slimes.length });
    root.querySelector('#mode-caption').textContent = t(mode === 'merge' ? 'modeMerge' : 'modeRecipe');
  }

  function renderDecorationsDialog() {
    const placed = state.decorations.filter((decoration) => decoration.position);
    const stored = state.decorations.filter((decoration) => !decoration.position);
    const decorationName = (id) => localName(DECORATIONS.find((item) => item.id === id)?.name ?? id);
    const costLabel = (cost) => `${formatNumber(cost.scrap)} ${t('scraps')} · ${formatNumber(cost.gel)} ${t('gel')}${cost.stardust ? ` · ${formatNumber(cost.stardust)} ${t('stardust')}` : ''}`;
    const cards = DECORATIONS.map((decoration) => `<article class="decoration-card"><strong>${decorationName(decoration.id)}</strong><span class="cost">${escapeHtml(costLabel(decoration.cost))}</span><button type="button" data-action="craft-decoration" data-id="${escapeHtml(decoration.id)}">${getLabel('confirm')}</button></article>`).join('');
    const inventory = state.decorations.map((decoration) => `<div class="inventory-item"><span>${decorationName(decoration.id)}</span><button type="button" data-action="${decoration.position ? 'store-decoration' : 'place-decoration'}" data-id="${escapeHtml(decoration.uid)}">${getLabel(decoration.position ? 'store' : 'place')}</button></div>`).join('') || `<span class="subtle">${getLabel('empty')}</span>`;
    const body = `<p class="dialog-copy">${getLabel('decorationPanel')} · ${getLabel('inventory')}: ${stored.length} · ${getLabel('place')}: ${placed.length}</p><div class="decoration-grid">${cards}</div><div class="inventory-list">${inventory}</div>`;
    openDialog('decorations', t('decorations'), body, `<button type="button" data-action="dialog-close">${getLabel('close')}</button>`);
  }

  function renderPrestigeDialog() {
    const highestTier = Math.max(0, ...Object.values(state.runMaxTier));
    const ready = highestTier >= CONFIG.economy.prestige.minimumTier;
    const cards = UPGRADES.map((upgrade) => {
      const level = state.upgrades[upgrade.id] ?? 0;
      const cost = upgrade.costs[level];
      const [title, description] = UPGRADE_LABELS[upgrade.id];
      return `<article class="upgrade-card"><strong>${getLabel(title)}</strong><p>${getLabel(description)}</p><span>${getLabel('upgradeLevel', { n: level })} / ${upgrade.maxLevel}</span><button type="button" data-action="buy-upgrade" data-id="${escapeHtml(upgrade.id)}" ${level >= upgrade.maxLevel || state.resources.primordialMud < cost ? 'disabled' : ''}>${level >= upgrade.maxLevel ? getLabel('unlocked') : getLabel('upgradeCost', { n: cost })}</button></article>`;
    }).join('');
    const gain = ready ? `<p class="dialog-copy">${getLabel('prestigeGain', { n: previewPrestigeMud(state).mud })}</p>` : '';
    const body = `<p class="dialog-copy">${getLabel(ready ? 'prestigeReady' : 'tier', ready ? {} : { n: CONFIG.economy.prestige.minimumTier })} ${getLabel('prestigeConfirm')}</p><p class="dialog-copy">${getLabel('tier', { n: highestTier })}</p>${gain}<h3 class="panel-title">${getLabel('upgrades')}</h3><div class="upgrade-grid">${cards}</div>`;
    openDialog('prestige', t('prestige'), body, `<button type="button" data-action="dialog-close">${getLabel('cancel')}</button><button type="button" class="primary" data-action="prestige" ${ready ? '' : 'disabled'}>${getLabel('prestige')}</button>`);
  }

  function renderOfflineDialog(breakdown = lastOffline) {
    const duration = breakdown?.requestedTo && breakdown?.requestedFrom ? Math.max(0, breakdown.requestedTo - breakdown.requestedFrom) : 0;
    const phases = breakdown?.segments?.map((segment) => `<div class="summary-item">${getLabel(segment.phase)}<strong>${formatNumber(segment.gel)} ${getLabel('gel')}</strong></div>`).join('') ?? '';
    const body = `<p class="dialog-copy">${getLabel('offlineIntro')}</p><p class="dialog-copy">${getLabel('offlineDuration', { time: formatDuration(duration) })}</p><div class="summary-grid">${phases || `<div class="summary-item">${getLabel('offlineDay')}<strong>0 ${getLabel('gel')}</strong></div><div class="summary-item">${getLabel('offlineNight')}<strong>0 ${getLabel('gel')}</strong></div>`}</div><p class="dialog-copy">${getLabel('offlineEarned', { n: formatNumber(breakdown?.gelEarned ?? 0) })}</p>`;
    openDialog('offline', t('offlineTitle'), body, `<button type="button" class="primary" data-action="dialog-close">${getLabel('collect')}</button>`);
  }

  function formatDuration(milliseconds) {
    const minutes = Math.floor(milliseconds / CONFIG.time.minuteMs);
    const hours = Math.floor(minutes / (CONFIG.time.hourMs / CONFIG.time.minuteMs));
    const rest = minutes % (CONFIG.time.hourMs / CONFIG.time.minuteMs);
    const hourLabel = new Intl.NumberFormat(getLang(), { style: 'unit', unit: 'hour', unitDisplay: 'short' }).format(hours);
    const minuteLabel = new Intl.NumberFormat(getLang(), { style: 'unit', unit: 'minute', unitDisplay: 'short' }).format(rest);
    return `${hourLabel} ${minuteLabel}`;
  }

  function showImportPreview(preview) {
    pendingImport = preview;
    const summary = preview.summary;
    const highest = summary.topSpecies.map((item) => `${localName(item.name)} × ${item.count}`).join(' · ') || t('empty');
    const body = `<p class="dialog-copy">${getLabel('importSummary')}</p><div class="summary-grid"><div class="summary-item">${getLabel('playTime')}<strong>${escapeHtml(formatDuration(summary.playMs))}</strong></div><div class="summary-item">${getLabel('highestSpecies')}<strong>${escapeHtml(highest)}</strong></div><div class="summary-item">${getLabel('codexCount')}<strong>${formatNumber(summary.codexCount)}</strong></div><div class="summary-item">${getLabel('prestigeCount')}<strong>${formatNumber(summary.prestigeCount)}</strong></div></div>`;
    openDialog('import-preview', t('importPreview'), body, `<button type="button" data-action="dialog-close">${getLabel('cancel')}</button><button type="button" class="primary" data-action="confirm-import">${getLabel('importConfirm')}</button>`);
  }

  function renderInstallMessage(canPrompt = false) {
    const body = `<p class="dialog-copy">${getLabel('installInvitation')}</p>${canPrompt ? '' : `<p class="dialog-copy">${getLabel('installUnavailable')}</p>`}`;
    const actions = `${canPrompt ? `<button type="button" class="primary" data-action="prompt-install">${getLabel('install')}</button>` : ''}<button type="button" data-action="dialog-close">${getLabel('installLater')}</button>`;
    openDialog('install', t('installInvitation'), body, actions);
  }
  async function showCodexDetail(id, detail) {
    const species = SPECIES_BY_ID.get(id);
    const mutationFound = detail?.dimension
      && (state.codex.mutations[detail.dimension] ?? []).includes(`${id}:${detail.level}`);
    const found = mutationFound || state.unlockedSpecies.includes(id) || state.codex.species.includes(id) || state.codex.recipes.includes(id);
    const title = found ? localName(species?.name) : t('unknown');
    const observation = found ? localName(OBSERVATIONS[id]) : t('speciesLocked');
    const appearance = {
      tier: detail?.tier ?? 1,
      hue: detail?.dimension === 'hue' ? Number(detail.level) : detail?.hue ?? 0,
      gloss: detail?.dimension === 'gloss' ? Number(detail.level) : detail?.gloss ?? 0,
      core: detail?.dimension === 'core' ? Number(detail.level) : detail?.core ?? 0,
      size: 140,
    };
    const svg = found && species ? slimeSvg(species, appearance) : silhouetteSvg(140);
    const tiers = state.codex.tiers.filter((value) => value.startsWith(`${id}:`)).map((value) => value.split(':')[1]);
    const body = `<div style="display:grid;grid-template-columns:minmax(100px,150px) 1fr;align-items:center;gap:14px"><div>${svg}</div><div><p class="dialog-copy">${getLabel('codexObserved')}</p><p>${observation}</p><p class="dialog-copy">${getLabel('tier', { n: tiers.join(' · ') || 1 })}</p></div></div>`;
    dialogData = { id, detail: { ...detail } };
    openDialog('codex-detail', title, body, `<button type="button" data-action="dialog-close">${getLabel('close')}</button>`);
  }
  function refreshDialogLanguage() {
    if (!dialog.open) return;
    if (dialogKind === 'settings') {
      const title = dialogContent.querySelector('.dialog-head h2');
      if (title) title.textContent = t('settings');
      renderSettings(dialogContent.querySelector('[data-settings-host]'), true);
    } else if (dialogKind === 'decorations') renderDecorationsDialog();
    else if (dialogKind === 'prestige') renderPrestigeDialog();
    else if (dialogKind === 'offline') renderOfflineDialog();
    else if (dialogKind === 'import-preview' && pendingImport) showImportPreview(pendingImport);
    else if (dialogKind === 'codex-detail' && dialogData) showCodexDetail(dialogData.id, dialogData.detail);
    else if (dialogKind === 'install') renderInstallMessage(dialogData?.canPrompt ?? false);
  }

  function toast(message) {
    const stack = root.querySelector('#toast-stack');
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    stack.append(node);
    setTimeout(() => node.remove(), CONFIG.ui.toastMs);
  }

  function setMode(nextMode) {
    mode = nextMode === 'recipe' ? 'recipe' : 'merge';
    root.querySelectorAll('[data-action="set-mode"]').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
    root.querySelector('#mode-caption').textContent = t(mode === 'merge' ? 'modeMerge' : 'modeRecipe');
    handlers.onModeChange?.(mode);
  }

  function render(nextState, phase, refreshFocusedSettings = false) {
    state = nextState;
    localizedShell();
    setPanel(activePanel);
    const formatResource = (value) => formatNumber(value);
    root.querySelector('#resource-gel').textContent = formatResource(state.resources.gel);
    root.querySelector('#resource-stardust').textContent = formatResource(state.resources.stardust);
    root.querySelector('#resource-mud').textContent = formatResource(state.resources.primordialMud);
    root.querySelector('#resource-scrap').textContent = formatResource(state.resources.scrap);
    root.querySelector('#phase-chip').classList.toggle('night', phase === 'night');
    root.querySelector('#phase-icon').textContent = phase === 'day' ? '☀️' : '🌙';
    root.querySelector('#phase-name').textContent = t(phase);
    root.querySelectorAll('[data-setting="autoMerge"]').forEach((input) => { input.checked = state.settings.autoMerge; });
    root.querySelectorAll('[data-language]').forEach((select) => { if (!select.options.length) select.innerHTML = LANGUAGES.map((lang) => `<option value="${lang}">${t(LANGUAGE_LABEL_KEYS[lang])}</option>`).join(''); if (document.activeElement !== select) select.value = getLang(); });
    renderSummonControls(root.querySelector('.actionbar .summon-tools'));
    renderSummonControls(root.querySelector('.merge-summon'));
    renderRecipes();
    renderCodex();
    renderSlimeList();
    const settingsHost = root.querySelector('#settings-panel [data-settings-host]');
    renderSettings(settingsHost, refreshFocusedSettings);
    if (dialog.open && dialogKind === 'settings') renderSettings(dialogContent.querySelector('[data-settings-host]'));
    const hasShownSound = Boolean(state.settings.soundPromptSeen);
    root.querySelector('#sound-prompt').hidden = hasShownSound;
  }

  root.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    if (action === 'switch-panel') { setPanel(target.dataset.panel); if (state) render(state, root.querySelector('#phase-chip').classList.contains('night') ? 'night' : 'day'); return; }
    if (action === 'codex-tab') { codexTab = target.dataset.tab; codexPage = 0; render(state, root.querySelector('#phase-chip').classList.contains('night') ? 'night' : 'day'); return; }
    if (action === 'mutation-tab') { mutationDimension = target.dataset.dimension; codexPage = 0; render(state, root.querySelector('#phase-chip').classList.contains('night') ? 'night' : 'day'); return; }
    if (action === 'recipe-page') { recipePage = Math.max(0, recipePage + Number(target.dataset.step)); render(state, root.querySelector('#phase-chip').classList.contains('night') ? 'night' : 'day'); return; }
    if (action === 'codex-page') { codexPage = Math.max(0, codexPage + Number(target.dataset.step)); render(state, root.querySelector('#phase-chip').classList.contains('night') ? 'night' : 'day'); return; }
    if (action === 'slime-page') { slimePage = Math.max(0, slimePage + Number(target.dataset.step)); render(state, root.querySelector('#phase-chip').classList.contains('night') ? 'night' : 'day'); return; }
    if (action === 'set-mode') { setMode(target.dataset.mode); return; }
    if (action === 'select-recipe') { activeRecipe = target.dataset.id; setMode('recipe'); handlers.onRecipeSelect?.(activeRecipe); render(state, root.querySelector('#phase-chip').classList.contains('night') ? 'night' : 'day'); return; }
    if (action === 'select-slime') { handlers.onSelectSlime?.(target.dataset.id, mode); return; }
    if (action === 'clear-selection') { handlers.onClearSelection?.(target.dataset.mode || mode); return; }
    if (action === 'open-settings') { renderSettingsDialog(); return; }
    if (action === 'open-decorations') { renderDecorationsDialog(); return; }
    if (action === 'open-prestige') { renderPrestigeDialog(); return; }
    if (action === 'open-offline') { renderOfflineDialog(); return; }
    if (action === 'dialog-close') { dialog.close(); dialogKind = null; return; }
    if (action === 'codex-detail') { await showCodexDetail(target.dataset.id, target.dataset); return; }
    if (action === 'download-codex') {
      try {
        const entries = state.codex.species.map((id) => {
          const species = SPECIES_BY_ID.get(id);
          return species ? { svg: slimeSvg(species, { tier: 1, hue: 0, gloss: 0, core: 0, size: 150 }), name: name(species.name), note: name(OBSERVATIONS[id]) } : null;
        }).filter(Boolean);
        downloadBlob(await exportCardPng({ title: t('codex'), entries, footer: t('speciesProgress', { n: entries.length, total: SPECIES.length }) }), 'slimegarden-codex.png');
      } catch (error) { handlers.onError?.(error); }
      return;
    }
    if (action === 'download-recipe-card') {
      const id = target.dataset.id;
      const species = SPECIES_BY_ID.get(id);
      const recipe = RECIPES.find((item) => item.id === id);
      if (species && recipe && state.codex.recipes.includes(id)) {
        try { downloadBlob(await exportCardPng({ title: t('recipeCardTitle'), entries: [{ svg: slimeSvg(species, { tier: 1, hue: 0, gloss: 0, core: 0, size: 150 }), name: name(species.name), note: name(OBSERVATIONS[id]) }], footer: recipe.hidden ? t('hiddenRecipes') : t('recipes') }), `slimegarden-${id}.png`); }
        catch (error) { handlers.onError?.(error); }
      }
      return;
    }
    if (action === 'preview-import') { handlers.onPreviewImport?.(target.closest('[data-settings-host]')?.querySelector('[data-import-paste]')?.value ?? ''); return; }
    if (action === 'confirm-import') { if (pendingImport) handlers.onConfirmImport?.(pendingImport); pendingImport = null; dialog.close(); return; }
    if (action === 'craft-decoration') { handlers.onAction?.(action, target.dataset.id); return; }
    if (action === 'place-decoration') { handlers.onAction?.(action, target.dataset.id); dialog.close(); return; }
    if (action === 'store-decoration') { handlers.onAction?.(action, target.dataset.id); return; }
    if (action === 'install-invite') { handlers.onAction?.(action); return; }
    if (action === 'enable-sound') { handlers.onAction?.(action); return; }
    if (action === 'dismiss-sound') { handlers.onAction?.(action); return; }
    if (action === 'merge-selected') { handlers.onAction?.(action); return; }
    if (action === 'try-recipe') { handlers.onAction?.(action, activeRecipe); return; }
    if (action === 'summon') { handlers.onAction?.(action, { species: summonSpecies, tier: summonTier }); return; }
    if (action === 'toggle-music' || action === 'toggle-effects') { handlers.onAction?.(action); return; }
    if (action === 'export-json' || action === 'export-base64' || action === 'restore-backup' || action === 'prestige' || action === 'buy-upgrade') { handlers.onAction?.(action, target.dataset.id); return; }
    handlers.onAction?.(action, target.dataset.id);
  });

  root.addEventListener('change', async (event) => {
    const target = event.target;
    if (target.matches('[data-language]')) { handlers.onLanguageChange?.(target.value); return; }
    if (target.matches('[data-setting="autoMerge"]')) { handlers.onAction?.('toggle-auto-merge', target.checked); return; }
    if (target.matches('[data-summon-species]')) { summonSpecies = target.value; root.querySelectorAll('[data-summon-species]').forEach((select) => { select.value = summonSpecies; }); return; }
    if (target.matches('[data-summon-tier]')) { summonTier = Number(target.value); root.querySelectorAll('[data-summon-tier]').forEach((select) => { select.value = String(summonTier); }); return; }
    if (target.matches('[data-import-file]')) {
      const file = target.files?.[0];
      if (file) handlers.onPreviewImport?.(await file.text());
    }
  });

  root.addEventListener('click', (event) => {
    if (event.target === dialog) { dialog.close(); dialogKind = null; }
  });

  const resizeObserver = new ResizeObserver(() => { if (state) render(state, root.querySelector('#phase-chip').classList.contains('night') ? 'night' : 'day'); });
  resizeObserver.observe(root.querySelector('#recipe-panel'));
  resizeObserver.observe(root.querySelector('#codex-panel'));
  window.addEventListener('resize', () => { if (state) render(state, root.querySelector('#phase-chip').classList.contains('night') ? 'night' : 'day'); });

  return {
    render,
    refreshLanguage(phase) { render(state, phase, true); refreshDialogLanguage(); },
    toast,
    openDialog,
    openSettings: renderSettingsDialog,
    openDecorations: renderDecorationsDialog,
    openPrestige: renderPrestigeDialog,
    openOffline(breakdown) { lastOffline = breakdown; renderOfflineDialog(breakdown); },
    showImportPreview,
    closeDialog() { dialog.close(); dialogKind = null; dialogData = null; },
    showInstallMessage(canPrompt = false) { dialogData = { canPrompt }; renderInstallMessage(canPrompt); },
    updateState(nextState, phase) { render(nextState, phase); },
    selectedUids,
    getMode() { return mode; },
    getActiveRecipe() { return activeRecipe; },
    getSummonChoice() { return { species: summonSpecies, tier: summonTier }; },
    setSelection(uids) { selectedUids.clear(); for (const uid of uids) selectedUids.add(uid); if (state) render(state, root.querySelector('#phase-chip').classList.contains('night') ? 'night' : 'day'); },
    addSelection(uid) { if (selectedUids.has(uid)) selectedUids.delete(uid); else selectedUids.add(uid); if (state) render(state, root.querySelector('#phase-chip').classList.contains('night') ? 'night' : 'day'); },
    setSoundPromptSeen() { if (state) { state.settings.soundPromptSeen = true; root.querySelector('#sound-prompt').hidden = true; } },
    showRecipeCard(id) { const button = root.querySelector('#recipe-achievement'); button.hidden = false; button.dataset.id = id; },
    destroy() { resizeObserver.disconnect(); },
  };
}
