import { UI } from '../data/texts/ui.js';

const LANGUAGES = ['zh', 'en', 'ja'];
const listeners = new Set();
const LANGUAGE_STORAGE_KEY = 'slimegarden.lang';
let currentLang = detectLanguage();

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
  if (locale.startsWith('zh')) return 'zh';
  if (locale.startsWith('ja')) return 'ja';
  if (locale.startsWith('en')) return 'en';
  return null;
}

function detectLanguage() {
  return queryLanguage() || savedLanguage() || browserLanguage() || 'en';
}

function notify() {
  for (const listener of listeners) listener(currentLang);
}

function syncFromUrl() {
  const lang = queryLanguage();
  if (lang && lang !== currentLang) {
    currentLang = lang;
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
  let text = entry?.[currentLang] || entry?.zh || key;
  return text.replace(/\{([^{}]+)\}/g, (placeholder, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder
  );
}

export function name(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return value[currentLang] || value.zh || '';
}

export function setLang(lang) {
  const nextLang = validLanguage(lang);
  if (!nextLang) return false;
  const changed = nextLang !== currentLang;
  currentLang = nextLang;

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
