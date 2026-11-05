// Interface languages: which ones exist, loading them, the language picker, right-to-left pages.
// Built-in translations live in locales/<code>.json. A company can add any other language, or
// fix any wording, from Data and records (its text travels with its library).
import { setLanguage, dirOf, baseOf, getLanguage, t } from './core/i18n.js';
import { settings, setSetting } from './store.js';
import { html, icon, esc } from './ui.js';

/** Built-in languages. `tier`: 'full' = every screen; 'floor' = every screen a worker uses at the bench. */
export const LANGUAGES = [
  { code: 'en', native: 'English', english: 'English', tier: 'source' },
  { code: 'he', native: 'עברית', english: 'Hebrew', tier: 'full' },
  { code: 'ar', native: 'العربية', english: 'Arabic', tier: 'full' },
  { code: 'ru', native: 'Русский', english: 'Russian', tier: 'full' },
  { code: 'uk', native: 'Українська', english: 'Ukrainian', tier: 'floor' },
  { code: 'am', native: 'አማርኛ', english: 'Amharic', tier: 'floor' },
  { code: 'es', native: 'Español', english: 'Spanish', tier: 'floor' },
  { code: 'pt', native: 'Português', english: 'Portuguese', tier: 'floor' },
  { code: 'fr', native: 'Français', english: 'French', tier: 'floor' },
  { code: 'de', native: 'Deutsch', english: 'German', tier: 'floor' },
  { code: 'it', native: 'Italiano', english: 'Italian', tier: 'floor' },
  { code: 'pl', native: 'Polski', english: 'Polish', tier: 'floor' },
  { code: 'ro', native: 'Română', english: 'Romanian', tier: 'floor' },
  { code: 'tr', native: 'Türkçe', english: 'Turkish', tier: 'floor' },
  { code: 'zh', native: '中文（简体）', english: 'Chinese (Simplified)', tier: 'floor' },
  { code: 'vi', native: 'Tiếng Việt', english: 'Vietnamese', tier: 'floor' },
  { code: 'th', native: 'ไทย', english: 'Thai', tier: 'floor' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', tier: 'floor' },
  { code: 'fil', native: 'Filipino', english: 'Filipino', tier: 'floor' },
  { code: 'id', native: 'Bahasa Indonesia', english: 'Indonesian', tier: 'floor' },
];

const cache = new Map();
let company = { names: {}, ui: {} }; // languages and wording added by the current company

/** Languages to offer: the built-in ones plus any the current company added. */
export function availableLanguages() {
  const list = LANGUAGES.map((l) => ({ ...l }));
  for (const [code, name] of Object.entries(company.names || {})) {
    const known = list.find((l) => l.code === code);
    if (known) known.company = true;
    else list.push({ code, native: name || code, english: englishName(code), tier: 'company', company: true });
  }
  return list;
}

export function englishName(code) {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; } catch { return code; }
}

export function languageInfo(code = getLanguage()) {
  return availableLanguages().find((l) => l.code === code) || { code, native: code, english: englishName(code), tier: 'company' };
}

async function fetchLocale(code) {
  if (code === 'en') return { messages: {} };
  if (cache.has(code)) return cache.get(code);
  if (!LANGUAGES.some((l) => l.code === code)) return { messages: {} };
  try {
    const res = await fetch(`locales/${code}.json`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    cache.set(code, data);
    return data;
  } catch {
    return { messages: {} };
  }
}

/** Built-in translations of a language (for the "export interface text" spreadsheet). */
export async function builtInMessages(code) {
  return (await fetchLocale(code)).messages || {};
}

/** Every interface string, in English: locales/en.json, built by tools/i18n.mjs. */
export async function catalog() {
  try { const res = await fetch('locales/en.json'); return Object.keys((await res.json()).messages || {}); } catch { return []; }
}

/** The saved choice, or the device's own language when RightPart offers it. */
export function initialLanguage() {
  const saved = settings().lang;
  const codes = new Set(availableLanguages().map((l) => l.code));
  if (saved && (codes.has(saved) || saved === 'en')) return saved;
  for (const want of navigator.languages || [navigator.language || 'en']) {
    const w = String(want).toLowerCase();
    if (codes.has(w)) return w;
    const b = baseOf(w) === 'tl' ? 'fil' : baseOf(w) === 'iw' ? 'he' : baseOf(w);
    if (codes.has(b)) return b;
  }
  return 'en';
}

/** Company languages and wording come with the library: lib.languages = { names: {code: name}, ui: {code: {english: text}} }. */
export function setCompanyLanguages(lib) {
  company = { names: { ...(lib?.languages?.names || {}) }, ui: { ...(lib?.languages?.ui || {}) } };
  // Re-apply the current language at once with this company's wording (the built-in file is cached).
  const code = getLanguage();
  setLanguage(code, cache.get(code)?.messages || {}, company.ui?.[code] || {});
}

/** Load and switch to a language. Sets <html lang dir>. Does not re-render: the app does that. */
export async function applyLanguage(code) {
  const data = await fetchLocale(code);
  setLanguage(code, data.messages || {}, company.ui?.[code] || {});
  const root = document.documentElement;
  root.lang = code;
  root.dir = dirOf(code);
  return data;
}

export function saveLanguage(code) { setSetting('lang', code); }

export function tierLabel(tier) {
  return tier === 'full' ? t('Every screen') : tier === 'floor' ? t('Build screens') : tier === 'company' ? t('Added by this company') : '';
}

/** Coverage of a built-in language, read from its file (0..1), or null before it is loaded. */
export async function coverage(code) {
  if (code === 'en') return 1;
  const d = await fetchLocale(code);
  return typeof d.coverage === 'number' ? d.coverage : null;
}

/**
 * The language picker: native names first (a worker who cannot read English must still find
 * their own language), a filter box, and a plain statement of how much is translated.
 * Resolves with the chosen code, or null.
 */
export function languageDialog() {
  return new Promise((resolve) => {
    const current = getLanguage();
    const list = availableLanguages();
    const d = document.createElement('dialog');
    d.className = 'dlg lang-dlg';
    d.setAttribute('aria-label', t('Language'));
    const row = (l) => html`<button type="button" class="lang-item" data-code="${l.code}" lang="${l.code}" dir="${dirOf(l.code)}" ${l.code === current ? html`aria-current="true"` : ''}>
        <span class="n">${l.native}</span>
        <span class="e" lang="${getLanguage()}" dir="auto">${l.code === 'en' ? '' : l.english}${l.tier !== 'source' ? html` · ${tierLabel(l.tier)}` : ''}</span>
        ${l.code === current ? icon('check', 'ok') : ''}
      </button>`;
    d.innerHTML = String(html`<div class="dh"><h2>${icon('globe')} ${t('Language')}</h2><button class="icon-btn" type="button" data-close aria-label="${t('Close')}">${icon('x')}</button></div>
      <div class="db">
        <input type="search" class="lang-filter" placeholder="${t('Find a language')}" aria-label="${t('Find a language')}" autocomplete="off" spellcheck="false">
        <div class="lang-list" role="list">${list.map(row)}</div>
        <p class="tiny muted" style="margin-top:12px">${t('Translations are drafts until someone who speaks the language checks them. Part codes, numbers, torques and sizes are never translated: they stay exactly as on the drawings and bin labels. A company can add any other language or correct any wording in Data and records.')}</p>
      </div>`);
    document.body.append(d);
    let result = null;
    d.addEventListener('close', () => { d.remove(); resolve(result); });
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-close]')) { d.close(); return; }
      const b = e.target.closest('[data-code]');
      if (b) { result = b.dataset.code; d.close(); }
    });
    const filter = d.querySelector('.lang-filter');
    filter.addEventListener('input', () => {
      const q = filter.value.trim().toLowerCase();
      for (const b of d.querySelectorAll('[data-code]')) {
        const l = list.find((x) => x.code === b.dataset.code);
        b.hidden = !!q && !`${l.native} ${l.english} ${l.code}`.toLowerCase().includes(q);
      }
    });
    d.showModal();
    // On a phone the keyboard would cover the list: focus the current language, not the filter.
    d.querySelector('[aria-current="true"]')?.focus();
  });
}

void esc;
