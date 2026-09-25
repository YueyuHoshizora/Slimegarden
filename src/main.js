import {
  backupCurrentSave,
  buyUpgrade,
  createState,
  craftDecoration,
  drainEvents,
  getPhase,
  exportBase64,
  exportSave,
  importSave,
  loadFromStorage,
  merge,
  placeDecoration,
  previewImport,
  prestige,
  restoreBackup,
  saveToStorage,
  settleOffline,
  poke,
  summon,
  tick,
  toggleAutoMerge,
  tryRecipe,
} from './core/index.js';
import { CONFIG } from './data/config.js';
import { DECORATIONS } from './data/decorations.js';
import { SPECIES } from './data/species.js';
import { FLAVOR } from './data/texts/flavor.js';
import { bgm } from './audio/bgm.js';
import { sfx } from './audio/sfx.js';
import { createTank } from './render/tank.js';
import { setLang, getLang, LANGUAGES, name, t } from './i18n/index.js';
import { canInstall, isIosInstallHint, promptInstall } from './pwa.js';
import { createUI } from './ui/view.js';

const root = document.querySelector('#app');
let state = loadFromStorage();
const hadSave = Boolean(state);
const now = Date.now();
if (!state) state = createState({ now });
if (hadSave && LANGUAGES.includes(state.settings.language) && !new URLSearchParams(location.search).has('lang')) {
  setLang(state.settings.language);
}
state.settings.language = getLang();
state.settings.bgmMuted = Boolean(state.settings.bgmMuted);
state.settings.sfxMuted = Boolean(state.settings.sfxMuted);
if (hadSave && state.settings.soundPromptSeen === undefined) state.settings.soundPromptSeen = true;
// 音量存為 0～1；沒有這個欄位時（新存檔或舊存檔）採用預設音量
for (const key of ['bgmVolume', 'sfxVolume']) {
  const value = Number(state.settings[key]);
  state.settings[key] = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : CONFIG.audio.defaultVolume;
}
sfx.setMuted(state.settings.sfxMuted);
bgm.setMuted(state.settings.bgmMuted);
sfx.setVolume(state.settings.sfxVolume);
bgm.setVolume(state.settings.bgmVolume);

let phase = getPhase(now);
let slimeSignature = '';
let decorationSignature = '';
let mergeAnimationRunning = false;
let pendingDecorationUid = null;
let lastSaveAt = now;
let offlineBreakdown = null;
let mode = 'merge';
const selectedSlimes = new Set();
// 入口畫面關閉前先把離線收穫留著，進入花園後再跳出，避免對話框蓋在入口畫面上
let enteredGarden = false;
let pendingOffline = null;

const ui = createUI(root, {
  onAction: handleAction,
  onLanguageChange: changeLanguage,
  onSelectSlime: (uid) => selectSlime(uid),
  onClearSelection: clearSelection,
  onModeChange: changeMode,
  onPreviewImport: previewImportFrom,
  onConfirmImport: confirmImport,
  onError: () => ui.toast(t('importError')),
});
const canvas = root.querySelector('#tank-canvas');
const tank = createTank(canvas);

function saveNow() {
  state.settings.language = getLang();
  try {
    saveToStorage(state);
    lastSaveAt = Date.now();
  } catch {
    ui.toast(t('importError'));
  }
}

function phaseNow() {
  return getPhase(Date.now());
}

function currentSlimeSignature() {
  return state.slimes.map((slime) => `${slime.uid}:${slime.species}:${slime.tier}:${slime.hue}:${slime.gloss}:${slime.core}`).join('|');
}

function syncTank(force = false) {
  const nextSignature = currentSlimeSignature();
  if ((force || nextSignature !== slimeSignature) && !mergeAnimationRunning) {
    tank.setSlimes(state.slimes);
    slimeSignature = nextSignature;
  }
  const nextDecorations = state.decorations
    .filter((decoration) => decoration.position)
    .map((decoration) => ({
      id: decoration.id,
      x: decoration.position.x * CONFIG.tank.canvasWidth,
      y: decoration.position.y * CONFIG.tank.canvasHeight,
      scale: decoration.position.scale,
      layer: decoration.position.layer,
    }));
  const nextDecorationSignature = nextDecorations.map((item) => `${item.id}:${item.x}:${item.y}:${item.scale}:${item.layer}`).join('|');
  if (force || nextDecorationSignature !== decorationSignature) {
    tank.setDecorations(nextDecorations);
    decorationSignature = nextDecorationSignature;
  }
}

function flavor(key) {
  const lines = FLAVOR[key] ?? [];
  if (!lines.length) return '';
  return name(lines[Math.floor(Math.random() * lines.length)]);
}

function playIfAvailable(sound) {
  if (!state.settings.sfxMuted) sfx.play(sound);
}

function processEvents() {
  const events = drainEvents(state);
  for (const event of events) {
    if (event.type === 'born') tank.playBirth(event.slime);
    if (event.type === 'summoned') playIfAvailable('summon');
    if (event.type === 'merged') {
      playIfAvailable('merge');
      for (const uid of event.inputs) selectedSlimes.delete(uid);
      if (!mergeAnimationRunning) {
        mergeAnimationRunning = true;
        tank.playMerge(event.inputs, event.slime).catch(() => {}).finally(() => {
          mergeAnimationRunning = false;
          syncTank();
          ui.setSelection([...selectedSlimes]);
        });
      }
      ui.toast(flavor('merge'));
    }
    if (event.type === 'mergeFail') {
      playIfAvailable('recipeFail');
      ui.toast(flavor('recipeFail'));
    }
    if (event.type === 'recipeOk') {
      playIfAvailable('recipeOk');
      ui.toast(flavor('recipeSuccess'));
    }
    if (event.type === 'recipeFail') {
      playIfAvailable('recipeFail');
      ui.toast(flavor('recipeFail'));
    }
    if (event.type === 'mutation') {
      playIfAvailable('mutation');
      ui.toast(flavor('mutationBirth'));
    }
    if (event.type === 'prestige') {
      playIfAvailable('prestige');
      ui.toast(flavor('prestige'));
    }
    if (event.type === 'codexUnlock') {
      playIfAvailable('codex');
      if (event.entry.page !== 'mutation') {
        const species = SPECIES.find((entry) => entry.id === event.entry.value);
        ui.toast(`${t('discovered')}: ${species ? name(species.name) : event.entry.value}`);
      }
    }
    if (event.type === 'milestone') ui.toast(`${t('milestones')} · ${event.count ?? ''}`);
    if (event.type === 'poked') playIfAvailable('pop');
    if (event.type === 'decorationCrafted') ui.toast(t('decorations'));
  }
  syncTank();
}

function render() {
  ui.render(state, phase);
}

function changeLanguage(language) {
  if (!setLang(language)) return;
  state.settings.language = language;
  saveNow();
  ui.refreshLanguage(phase);
}

function clearSelection() {
  selectedSlimes.clear();
  tank.highlight([]);
  ui.setSelection([]);
}

function changeMode(nextMode) {
  const selectedMode = nextMode === 'recipe' ? 'recipe' : 'merge';
  if (selectedMode !== mode) clearSelection();
  mode = selectedMode;
}

function selectSlime(uid) {
  if (!state.slimes.some((slime) => slime.uid === uid)) return;
  const limit = mode === 'recipe' ? 2 : CONFIG.merge.requiredSlimes;
  if (selectedSlimes.has(uid)) selectedSlimes.delete(uid);
  else {
    if (selectedSlimes.size >= limit) selectedSlimes.delete(selectedSlimes.values().next().value);
    selectedSlimes.add(uid);
  }
  tank.highlight([...selectedSlimes]);
  ui.setSelection([...selectedSlimes]);
}

function updateAfterAction({ save = true } = {}) {
  processEvents();
  if (save) saveNow();
  render();
}

function notEnoughMessage(result) {
  if (result.reason === 'notEnoughMud' || result.reason === 'needsPrestige') return flavor('notEnoughMud');
  if (result.reason === 'notEnoughMaterials') {
    const cost = result.cost ?? { gel: result.gelCost ?? 0, stardust: result.stardustCost ?? 0 };
    if (state.resources.gel < cost.gel) return flavor('notEnoughGel');
    if (state.resources.stardust < cost.stardust) return flavor('notEnoughStardust');
    if (state.resources.scrap < cost.scrap) return flavor('notEnoughScraps');
  }
  if (result.reason === 'notEnoughScraps') return flavor('notEnoughScraps');
  return t('empty');
}

function attemptMerge() {
  const result = merge(state, [...selectedSlimes], { now: Date.now() });
  if (!result.ok && result.reason === 'selectThreeSlimes') ui.toast(t('mergeHint'));
  if (!result.ok && result.scrap === undefined && result.reason !== 'selectThreeSlimes') ui.toast(t('mergeHint'));
  if (result.ok) selectedSlimes.clear();
  updateAfterAction();
}

function attemptRecipe() {
  const uids = [...selectedSlimes];
  if (uids.length !== 2) { ui.toast(t('selectSlimes')); return; }
  const result = tryRecipe(state, uids[0], uids[1], { now: Date.now() });
  if (result.ok) selectedSlimes.clear();
  updateAfterAction();
}

async function enableAudio() {
  state.settings.soundPromptSeen = true;
  state.settings.soundEnabled = true;
  ui.setSoundPromptSeen();
  try {
    await Promise.all([sfx.unlock(), bgm.unlock()]);
    sfx.setMuted(Boolean(state.settings.sfxMuted));
    bgm.setMuted(Boolean(state.settings.bgmMuted));
    if (!state.settings.bgmMuted && !bgm.isPlaying()) await bgm.play(phase);
  } catch {
    ui.toast(t('soundWelcome'));
  }
  saveNow();
}

// 瀏覽器要求使用者手勢才能發聲：回訪玩家已同意過音效，第一次點擊畫面時自動解鎖
function unlockAudioOnGesture() {
  document.removeEventListener('pointerdown', unlockAudioOnGesture, true);
  document.removeEventListener('keydown', unlockAudioOnGesture, true);
  if (state.settings.soundEnabled !== false && state.settings.soundPromptSeen) enableAudio();
}
document.addEventListener('pointerdown', unlockAudioOnGesture, true);
document.addEventListener('keydown', unlockAudioOnGesture, true);

async function handleAction(action, value) {
  if (action === 'summon') {
    const result = summon(state, value.species, { tier: value.tier, now: Date.now() });
    if (!result.ok) ui.toast(notEnoughMessage(result));
    updateAfterAction();
    return;
  }
  if (action === 'merge-selected') { attemptMerge(); return; }
  if (action === 'try-recipe') { attemptRecipe(); return; }
  if (action === 'toggle-auto-merge') {
    toggleAutoMerge(state, value);
    updateAfterAction();
    return;
  }
  if (action === 'toggle-music') {
    state.settings.bgmMuted = !state.settings.bgmMuted;
    bgm.setMuted(state.settings.bgmMuted);
    // 開啟即視為同意音效，順便解鎖（音訊需使用者手勢）
    if (!state.settings.bgmMuted) await enableAudio();
    updateAfterAction();
    return;
  }
  if (action === 'toggle-effects') {
    state.settings.sfxMuted = !state.settings.sfxMuted;
    sfx.setMuted(state.settings.sfxMuted);
    if (!state.settings.sfxMuted) await enableAudio();
    updateAfterAction();
    return;
  }
  if (action === 'set-volume') {
    const { channel, volume, commit } = value;
    state.settings[channel === 'music' ? 'bgmVolume' : 'sfxVolume'] = volume;
    (channel === 'music' ? bgm : sfx).setVolume(volume);
    if (commit) {
      if (channel === 'effects') playIfAvailable('button');
      saveNow();
    }
    return;
  }
  if (action === 'enable-sound') { await enableAudio(); render(); return; }
  if (action === 'enter-garden') {
    if (enteredGarden) return;
    enteredGarden = true;
    ui.hideTitle();
    if (pendingOffline) { ui.openOffline(pendingOffline); pendingOffline = null; }
    return;
  }
  if (action === 'dismiss-sound') { state.settings.soundPromptSeen = true; state.settings.soundEnabled = false; ui.setSoundPromptSeen(); saveNow(); return; }
  if (action === 'craft-decoration') {
    const result = craftDecoration(state, value);
    if (!result.ok) ui.toast(notEnoughMessage(result));
    updateAfterAction();
    ui.openDecorations();
    return;
  }
  if (action === 'place-decoration') {
    pendingDecorationUid = value;
    ui.toast(t('place'));
    return;
  }
  if (action === 'store-decoration') {
    const decoration = state.decorations.find((item) => item.uid === value);
    if (decoration) decoration.position = null;
    updateAfterAction();
    ui.openDecorations();
    return;
  }
  if (action === 'prestige') {
    ui.closeDialog();
    await tank.playPrestige();
    const result = prestige(state, { now: Date.now() });
    if (!result.ok) ui.toast(t('prestigeReady'));
    selectedSlimes.clear();
    updateAfterAction();
    return;
  }
  if (action === 'buy-upgrade') {
    const result = buyUpgrade(state, value);
    if (!result.ok) ui.toast(notEnoughMessage(result));
    updateAfterAction();
    ui.openPrestige();
    return;
  }
  if (action === 'export-json') {
    downloadText(exportSave(state), 'application/json', 'slimegarden-save.json');
    return;
  }
  if (action === 'export-base64') {
    const code = exportBase64(state);
    if (await copyText(code)) {
      ui.toast(t('copied'));
      return;
    }
    // 剪貼簿不可用時，把存檔碼放進匯入欄並選取，讓玩家手動複製
    const field = [...document.querySelectorAll('[data-import-paste]')].find((element) => element.offsetParent !== null);
    if (field) { field.value = code; field.select(); }
    ui.toast(t('copyManual'));
    return;
  }
  if (action === 'restore-backup') {
    const restored = restoreBackup();
    if (!restored) ui.toast(t('backupMissing'));
    else { state = restored; setLang(state.settings.language); ui.toast(t('backupReady')); render(); }
    saveNow();
    return;
  }
  if (action === 'confirm-restart') {
    // 先存下目前進度並備份，玩家反悔時可用「還原上次備份」找回；語言與音訊設定沿用
    saveNow();
    backupCurrentSave();
    const settings = state.settings;
    state = createState({ now: Date.now() });
    state.settings = settings;
    selectedSlimes.clear();
    syncTank(true);
    pendingDecorationUid = null;
    offlineBreakdown = null;
    saveNow();
    ui.toast(t('restartDone'));
    render();
    return;
  }
  if (action === 'install-invite') {
    ui.showInstallMessage(canInstall(), isIosInstallHint());
    return;
  }
  if (action === 'prompt-install') {
    try {
      const choice = await promptInstall();
      if (!choice) ui.toast(t('installUnavailable'));
      else ui.closeDialog();
    } catch { ui.toast(t('installUnavailable')); }
  }
}

async function previewImportFrom(payload) {
  try {
    ui.showImportPreview(previewImport(payload));
  } catch {
    ui.toast(t('importError'));
  }
}

function confirmImport(preview) {
  try {
    const imported = importSave(JSON.stringify(preview.state));
    state = imported.state;
    setLang(state.settings.language);
    state.settings.language = getLang();
    selectedSlimes.clear();
    syncTank(true);
    processEvents();
    saveNow();
    render();
  } catch {
    ui.toast(t('importError'));
  }
}

function downloadText(text, type, filename) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), CONFIG.time.minuteMs);
}

// 回傳是否成功複製；Clipboard API 被拒時退回 execCommand
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }
}

function onTankClick(event) {
  if (!pendingDecorationUid) return;
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / CONFIG.tank.canvasWidth, rect.height / CONFIG.tank.canvasHeight);
  const offsetX = (rect.width - CONFIG.tank.canvasWidth * scale) / 2;
  const offsetY = (rect.height - CONFIG.tank.canvasHeight * scale) / 2;
  const [minimum, maximum] = CONFIG.tank.coordinateMin <= CONFIG.tank.coordinateMax
    ? [CONFIG.tank.coordinateMin, CONFIG.tank.coordinateMax]
    : CONFIG.decorations.placementBounds;
  const x = Math.max(minimum, Math.min(maximum, (event.clientX - rect.left - offsetX) / (CONFIG.tank.canvasWidth * scale)));
  const y = Math.max(minimum, Math.min(maximum, (event.clientY - rect.top - offsetY) / (CONFIG.tank.canvasHeight * scale)));
  const definition = DECORATIONS.find((item) => item.id === state.decorations.find((entry) => entry.uid === pendingDecorationUid)?.id);
  const placement = definition?.placement ?? { layer: 'ground', scale: 1 };
  const result = placeDecoration(state, pendingDecorationUid, { x, y, layer: placement.layer, scale: placement.scale });
  pendingDecorationUid = null;
  if (!result.ok) ui.toast(t('empty'));
  updateAfterAction();
}

function onSlimeDrop(fromUid, toUid) {
  if (mode === 'recipe') {
    selectedSlimes.clear();
    selectedSlimes.add(fromUid);
    selectedSlimes.add(toUid);
    ui.setSelection([...selectedSlimes]);
    attemptRecipe();
    return;
  }
  const from = state.slimes.find((slime) => slime.uid === fromUid);
  const to = state.slimes.find((slime) => slime.uid === toUid);
  const third = state.slimes.find((slime) => slime.uid !== fromUid && slime.uid !== toUid && slime.species === from?.species && slime.tier === from?.tier);
  if (from && to && third && from.species === to.species && from.tier === to.tier) {
    selectedSlimes.clear();
    selectedSlimes.add(fromUid);
    selectedSlimes.add(toUid);
    selectedSlimes.add(third.uid);
    attemptMerge();
  } else {
    selectedSlimes.clear();
    selectedSlimes.add(fromUid);
    selectedSlimes.add(toUid);
    ui.setSelection([...selectedSlimes]);
    ui.toast(t('mergeHint'));
  }
}

tank.onSlimeTap((uid) => {
  if (!state.slimes.some((slime) => slime.uid === uid)) return;
  poke(state, uid);
  processEvents();
  selectSlime(uid);
});
tank.onSlimeLongPress(() => playIfAvailable('purr'));
tank.onSlimeDrop(onSlimeDrop);
canvas.addEventListener('click', onTankClick);

function resumeOffline() {
  const startedAt = state.lastTickAt;
  const endAt = Date.now();
  if (endAt <= startedAt) return;
  offlineBreakdown = settleOffline(state, startedAt, endAt);
  processEvents();
  syncTank();
  saveNow();
  if (endAt - startedAt >= CONFIG.ui.offlinePromptMs) {
    if (enteredGarden) ui.openOffline(offlineBreakdown);
    else pendingOffline = offlineBreakdown;
  }
  render();
}

// 鎖定右鍵／長按選單；文字輸入欄保留，才能貼上存檔碼
document.addEventListener('contextmenu', (event) => {
  if (!event.target.closest?.('textarea, input, select')) event.preventDefault();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveNow();
  else resumeOffline();
});
window.addEventListener('pagehide', saveNow);

if (hadSave) {
  offlineBreakdown = settleOffline(state, state.lastTickAt, now);
  drainEvents(state);
  syncTank(true);
  saveNow();
  if (offlineBreakdown.requestedTo - offlineBreakdown.requestedFrom >= CONFIG.ui.offlinePromptMs) pendingOffline = offlineBreakdown;
} else {
  drainEvents(state);
  syncTank(true);
}
// 初次載入直接呈現當下時段，不播放晝夜轉場
tank.setPhase(phase, 0);
render();
ui.showTitle(hadSave);

let lastRenderAt = now;
const loopHandle = setInterval(() => {
  if (document.hidden) return;
  const timestamp = Date.now();
  const nextPhase = getPhase(timestamp);
  if (nextPhase !== phase) {
    phase = nextPhase;
    tank.setPhase(phase, CONFIG.ui.phaseTransitionMs);
    if (!state.settings.bgmMuted) bgm.play(phase).catch(() => {});
  }
  const elapsed = Math.max(0, timestamp - state.lastTickAt);
  if (elapsed) tick(state, elapsed, timestamp);
  processEvents();
  syncTank();
  if (timestamp - lastRenderAt >= CONFIG.ui.renderMs) {
    render();
    lastRenderAt = timestamp;
  }
  if (timestamp - lastSaveAt >= CONFIG.ui.autosaveMs) saveNow();
}, CONFIG.ui.renderMs);

window.addEventListener('pagehide', () => clearInterval(loopHandle), { once: true });
