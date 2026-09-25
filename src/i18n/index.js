import { UI } from '../data/texts/ui.js';

// 語系代碼採 BCP 47 語言標籤；同時作為 ?lang= 參數、<html lang> 與文案資料欄位鍵名
export const LANGUAGES = ['zh-Hant', 'en', 'ja'];
export const DEFAULT_LANGUAGE = 'en';
// 文案資料缺漏時的後備語系（正式版不允許出現後備）
const FALLBACK_LANGUAGE = 'zh-Hant';
// 語言選單顯示名稱對應的 UI 文案鍵
export const LANGUAGE_LABEL_KEYS = { 'zh-Hant': 'languageZh', en: 'languageEn', ja: 'languageJa' };
const listeners = new Set();
const LANGUAGE_STORAGE_KEY = 'slimegarden.lang';
let currentLang = detectLanguage();
applyDocumentLanguage();

function validLanguage(value) {
  return LANGUAGES.includes(value) ? value : null;
}

function queryLanguage() {
  if (typeof window === 'undefined') return null;
  return validLanguage(new URLSearchParams(window.location.search).get('lang'));
}

function savedLanguage() {
  try {
    return validLanguage(globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function browserLanguage() {
  if (typeof navigator === 'undefined') return null;
  const locale = (navigator.languages?.[0] || navigator.language || '').toLowerCase();
  if (locale.startsWith('zh')) return 'zh-Hant';
  if (locale.startsWith('ja')) return 'ja';
  if (locale.startsWith('en')) return 'en';
  return null;
}

function detectLanguage() {
  return queryLanguage() || savedLanguage() || browserLanguage() || DEFAULT_LANGUAGE;
}

function applyDocumentLanguage() {
  if (typeof document !== 'undefined') document.documentElement.lang = currentLang;
}

function notify() {
  for (const listener of listeners) listener(currentLang);
}

function syncFromUrl() {
  const lang = queryLanguage();
  if (lang && lang !== currentLang) {
    currentLang = lang;
    applyDocumentLanguage();
    try {
      globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // 儲存空間不可用時，仍保留當前頁面的語言選擇。
    }
    notify();
  }
}

if (typeof window !== 'undefined') window.addEventListener('popstate', syncFromUrl);

export function t(key, params = {}) {
  const entry = UI[key];
  let text = entry?.[currentLang] || entry?.[FALLBACK_LANGUAGE] || key;
  return text.replace(/\{([^{}]+)\}/g, (placeholder, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder
  );
}

export function name(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return value[currentLang] || value[FALLBACK_LANGUAGE] || '';
}

export function setLang(lang) {
  const nextLang = validLanguage(lang);
  if (!nextLang) return false;
  const changed = nextLang !== currentLang;
  currentLang = nextLang;
  applyDocumentLanguage();

  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, nextLang);
  } catch {
    // 語言仍會在目前頁面生效，即使瀏覽器不允許寫入儲存空間。
  }

  if (typeof window !== 'undefined' && window.history) {
    const url = new URL(window.location.href);
    url.searchParams.set('lang', nextLang);
    window.history.pushState(null, '', url);
  }
  if (changed) notify();
  return true;
}

export function onLangChange(callback) {
  if (typeof callback !== 'function') throw new TypeError('onLangChange expects a function');
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getLang() {
  return currentLang;
}
