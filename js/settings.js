/* Settings schema, persistence, appearance, and the browser transport layer. */
import { Store, Bus, isHttpUrl, mq } from './core.js';
import { Notify } from './notify.js';

export const ENGINES = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
};

/* ---------- Browser networking layer (separate from the browser UI) ----------
   A transport turns a target URL into the URL the tab frame actually loads.
   'direct' embeds the site as-is: no proxying happens. Sites that send
   X-Frame-Options or a frame-ancestors CSP will refuse to show.
   'prefix' hands the URL to a proxy server you run yourself. Register more
   transports with BrowserNet.register(id, {label, description, resolve}). */
export const BrowserNet = {
  transports: {
    direct: {
      label: 'Direct',
      description: 'Loads sites straight into the tab. No proxy is involved, so sites that block embedding stay blank.',
      resolve: (url) => url,
    },
    prefix: {
      label: 'Your proxy server',
      description: 'Sends each address to a server you run, appended to its address as an encoded URL.',
      resolve: (url) => {
        const p = Settings.get('proxyPrefix');
        if (!p) throw Object.assign(new Error('No proxy server is set.'), { hint: 'Add your server address in Settings › Browser, or switch the connection back to Direct.' });
        return p + encodeURIComponent(url);
      },
    },
  },
  register(id, t) {
    if (!id || !t || typeof t.resolve !== 'function') throw new Error('A transport needs an id and a resolve(url) function.');
    this.transports[id] = t;
  },
  current() { return this.transports[Settings.get('transport')] || this.transports.direct; },
  resolve(url) { return this.current().resolve(url); },
};

const bool = v => typeof v === 'boolean';
/* kind: 'dots' = the interactive dot field; 'live' = an animated canvas
   backdrop; 'custom' = the user's uploaded image; others are static CSS. */
export const WALLPAPERS = [
  { id: 'oled', name: 'Dot field', kind: 'dots' },
  { id: 'aurora', name: 'Aurora', kind: 'live' }, { id: 'rain', name: 'Rain', kind: 'live' }, { id: 'stars', name: 'Stars', kind: 'live' },
  { id: 'night', name: 'Night sky' }, { id: 'dusk', name: 'Dusk' },
  { id: 'slate', name: 'Graphite' }, { id: 'dots', name: 'Still dots' }, { id: 'mist', name: 'Mist' },
  { id: 'custom', name: 'Your image', kind: 'custom' },
];
export const DEFAULT_ACCENT = '#a78bfa';
export const ACCENTS = [
  { v: '#a78bfa', n: 'Kanni' }, { v: '#9db4ff', n: 'Moonlight' }, { v: '#d5d9e2', n: 'Silver' }, { v: '#7fd3b8', n: 'Mint' },
  { v: '#eeb868', n: 'Amber' }, { v: '#ee93a9', n: 'Rose' }, { v: '#b7a8f5', n: 'Lilac' },
];
/* Curated UI fonts, loaded from Google Fonts on demand (see loadFont). */
export const FONTS = [
  { id: 'geist', n: 'Geist', stack: "'Geist',ui-sans-serif,system-ui,sans-serif", g: null },
  { id: 'inter', n: 'Inter', stack: "'Inter',ui-sans-serif,system-ui,sans-serif", g: 'Inter:wght@400;500;600;700' },
  { id: 'figtree', n: 'Figtree', stack: "'Figtree',ui-sans-serif,system-ui,sans-serif", g: 'Figtree:wght@400;500;600;700' },
  { id: 'spacegrotesk', n: 'Space Grotesk', stack: "'Space Grotesk',ui-sans-serif,system-ui,sans-serif", g: 'Space+Grotesk:wght@400;500;600;700' },
  { id: 'ibmplex', n: 'IBM Plex Sans', stack: "'IBM Plex Sans',ui-sans-serif,system-ui,sans-serif", g: 'IBM+Plex+Sans:wght@400;500;600;700' },
  { id: 'jetbrains', n: 'JetBrains Mono', stack: "'JetBrains Mono',ui-monospace,monospace", g: 'JetBrains+Mono:wght@400;500;600;700' },
];
/* One-tap looks: accent + wallpaper + font together. Users can still tweak. */
export const PRESETS = [
  { id: 'kanni', n: 'Kanni', theme: 'dark', accent: '#a78bfa', wallpaper: 'oled', font: 'geist' },
  { id: 'midnight', n: 'Midnight', theme: 'dark', accent: '#9db4ff', wallpaper: 'oled', font: 'geist' },
  { id: 'mono', n: 'Mono', theme: 'dark', accent: '#d5d9e2', wallpaper: 'slate', font: 'jetbrains' },
  { id: 'neon', n: 'Neon', theme: 'dark', accent: '#7fd3b8', wallpaper: 'rain', font: 'spacegrotesk' },
  { id: 'moonlight', n: 'Moonlight', theme: 'dark', accent: '#b7a8f5', wallpaper: 'stars', font: 'inter' },
  { id: 'ember', n: 'Ember', theme: 'dark', accent: '#eeb868', wallpaper: 'aurora', font: 'figtree' },
];
const fontById = id => FONTS.find(f => f.id === id) || FONTS[0];
/* Load a Google-hosted UI font once, on demand. */
const loadedFonts = new Set();
export function loadFont(id) {
  const f = fontById(id);
  if (!f || !f.g || loadedFonts.has(f.id)) return;
  loadedFonts.add(f.id);
  try {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${f.g}&display=swap`;
    document.head.append(l);
  } catch {}
}
export const SCHEMA = {
  theme: { def: 'dark', valid: v => ['auto', 'light', 'dark'].includes(v) },
  accent: { def: DEFAULT_ACCENT, valid: v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) },
  glass: { def: true, valid: bool },
  reduceMotion: { def: false, valid: bool },
  wallpaper: { def: 'oled', valid: v => WALLPAPERS.some(w => w.id === v) },
  wallpaperFit: { def: 'fill', valid: v => v === 'fill' || v === 'fit' },
  font: { def: 'geist', valid: v => FONTS.some(f => f.id === v) },
  autoAccent: { def: false, valid: bool },
  sounds: { def: true, valid: bool },
  startupSound: { def: true, valid: bool },
  volume: { def: 0.4, valid: v => typeof v === 'number' && v >= 0 && v <= 1 },
  dotMotion: { def: true, valid: bool },
  desktopIcons: { def: true, valid: bool },
  clock24: { def: false, valid: bool },
  clockSeconds: { def: false, valid: bool },
  showDate: { def: true, valid: bool },
  searchEngine: { def: 'duckduckgo', valid: v => Object.prototype.hasOwnProperty.call(ENGINES, v) },
  homepage: { def: '', valid: v => v === '' || isHttpUrl(v) },
  saveHistory: { def: true, valid: bool },
  showBookmarks: { def: true, valid: bool },
  transport: { def: 'direct', valid: v => Object.prototype.hasOwnProperty.call(BrowserNet.transports, v) },
  proxyPrefix: { def: '', valid: v => v === '' || isHttpUrl(v) },
  notifications: { def: true, valid: bool },
  askLaunch: { def: false, valid: bool },
  idleLock: { def: 0, valid: v => [0, 5, 15, 30].includes(v) },
};

const storageWarning = () => Notify.push({ title: 'Settings not saved', body: 'This browser is blocking storage. Changes last until you reload.' });

export const Settings = {
  values: {},
  load() {
    const saved = Store.get('settings', {});
    for (const [k, s] of Object.entries(SCHEMA)) {
      const v = saved && typeof saved === 'object' ? saved[k] : undefined;
      this.values[k] = v !== undefined && s.valid(v) ? v : s.def;
    }
    const ver = Store.get('settingsVersion', 1);
    // v2: one-time move to the OLED look for settings saved by version 1.
    if (ver < 2 && saved && Object.keys(saved).length) { this.values.theme = 'dark'; this.values.wallpaper = 'oled'; }
    // v3 (NyxOS): people still on the old default accent get the new moonlight default.
    if (ver < 3 && this.values.accent.toLowerCase() === '#7aa2ff') this.values.accent = '#9db4ff';
    if (ver < 3) {
      if (saved && Object.keys(saved).length) Store.set('settings', this.values);
      Store.set('settingsVersion', 3);
    }
  },
  get(k) { return this.values[k]; },
  set(k, v) {
    const s = SCHEMA[k];
    if (!s) throw new Error(`Unknown setting "${k}".`);
    if (!s.valid(v)) throw new Error(`That value isn't allowed for this setting.`);
    this.values[k] = v;
    if (!Store.set('settings', this.values)) storageWarning();
    Bus.emit('settings', { key: k, value: v });
  },
  // Several values in one write: one storage warning at most, one bulk 'settings' event.
  setMany(obj) {
    for (const [k, v] of Object.entries(obj)) {
      if (!SCHEMA[k]) throw new Error(`Unknown setting "${k}".`);
      if (!SCHEMA[k].valid(v)) throw new Error(`That value isn't allowed for this setting.`);
    }
    Object.assign(this.values, obj);
    if (!Store.set('settings', this.values)) storageWarning();
    Bus.emit('settings', { key: '*' });
  },
  import(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('That file has no settings in it.');
    const src = obj.settings && typeof obj.settings === 'object' ? obj.settings : obj;
    let applied = 0, skipped = 0;
    for (const [k, v] of Object.entries(src)) {
      if (SCHEMA[k] && SCHEMA[k].valid(v)) { this.values[k] = v; applied++; } else skipped++;
    }
    if (!applied) throw new Error('None of the values in that file match this version.');
    Store.set('settings', this.values);
    Bus.emit('settings', { key: '*' });
    return { applied, skipped };
  },
  reset() {
    for (const [k, s] of Object.entries(SCHEMA)) this.values[k] = s.def;
    Store.set('settings', this.values);
    Bus.emit('settings', { key: '*' });
  },
};

/* ---------- Appearance ---------- */
export const darkMq = mq('(prefers-color-scheme: dark)');
export const reducedMq = mq('(prefers-reduced-motion: reduce)');
export function onAccent(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0b0f1c' : '#ffffff';
}
export const resolveTheme = (t) => t === 'auto' ? (darkMq.matches ? 'dark' : 'light') : t;
/* Applies theme and accent to the document. `look` lets the customize
   screen preview a draft without saving it. */
export function applyLook(look = Settings.values) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(look.theme);
  root.style.setProperty('--accent', look.accent);
  root.style.setProperty('--on-accent', onAccent(look.accent));
  root.dataset.glass = look.glass === false ? 'off' : 'on';
  root.dataset.motion = look.reduceMotion ? 'reduce' : 'full';
  const f = fontById(look.font);
  if (f) { loadFont(f.id); root.style.setProperty('--font-ui', f.stack); }
  document.body.dataset.wall = look.wallpaper;
  document.body.dataset.fit = look.wallpaperFit || 'fill';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = root.dataset.theme === 'light' ? '#f3f3f5' : '#000000';
}
export const motionOff = () => Settings.get('reduceMotion') || reducedMq.matches;
