/* "What's new": a version constant and changelog. After an update (the stored
   version differs from APP_VERSION), the latest notes show once. A fresh
   install just records the version silently. The changelog also renders in
   Settings › About. */
import { $, h, Store } from './core.js';
import { ICONS, MARK, WORDMARK } from './icons.js';

export const APP_VERSION = '1.5.0';

/* Newest first. Each: { v, date, notes:[...] } */
export const CHANGELOG = [
  { v: '1.5.0', date: '2026-10', notes: [
    'New Games app: 2048, Hextris, Clumsy Bird, Tower Building, Astray and A Dark Room are built right in, plus Cube Composer. All free and open source, with credits.',
    'Invaders has been replaced by the Games app.',
  ] },
  { v: '1.4.0', date: '2026-10', notes: [
    'Spotlight: press Ctrl+K (or the search button) to find apps, settings and actions, search the web, or do math.',
    'Control Center: dark mode, Do Not Disturb, sounds, volume and accent, right above your notifications.',
    'New apps: Notes, Calculator, Clock (timer and stopwatch) and Invaders 👾.',
    'Right-click the desktop for quick actions, and dock icons to pin, unpin or quit.',
    'Keyboard shortcuts sheet: press Shift+?.',
  ] },
  { v: '1.3.0', date: '2026-10', notes: [
    'NyxOS is now Kanni 👾. Your settings, data and account carry over.',
    'A fresh look: colorful app icons, a bigger dock, an app grid, a desktop clock and a new violet accent.',
    'New visitors get a quick tips tour. Replay it from Settings › About.',
  ] },
  { v: '1.2.0', date: '2026-10', notes: [
    'Desktop widgets: Clock, Weather and Calendar, with a widget picker.',
    'Up to 4 desktops with a dock switcher, Ctrl+Alt+arrows, and move-to-desktop.',
    'Lock screen with an optional PIN and idle auto-lock.',
    'Bookmarks bar and recently closed tabs in the browser.',
    'Interface sounds and a startup chime (Settings › Sound).',
  ] },
  { v: '1.1.0', date: '2026-10', notes: [
    'Theme presets, a font picker, and custom + live wallpapers (Aurora, Rain, Stars).',
    'Accent color can be derived from your wallpaper.',
  ] },
  { v: '1.0.0', date: '2026-10', notes: [
    'NyxOS: a redesigned desktop, dock, browser and settings.',
    'Optional accounts with a public Chat and voice rooms.',
  ] },
];

export const WhatsNew = {
  maybeShow() {
    const seen = Store.get('seenVersion', null);
    if (seen === APP_VERSION) return;
    Store.set('seenVersion', APP_VERSION);
    if (seen == null) return;   // fresh install: nothing to announce
    this.open();
  },
  open() {
    if ($('#whatsnew')) return;
    const entry = CHANGELOG[0] || { notes: [] };
    const close = () => { card.classList.add('out'); setTimeout(() => card.remove(), 180); };
    const card = h('div', { id: 'whatsnew', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'What’s new' },
      h('div', { class: 'wn-card' },
        h('div', { class: 'wn-head' }, h('span', { class: 'wn-mark', svg: MARK }),
          h('div', null, h('b', { text: 'What’s new' }), h('small', { text: `Version ${entry.v}` }))),
        h('ul', { class: 'wn-list' }, entry.notes.map(n => h('li', null, h('span', { class: 'wn-dot', svg: ICONS.check }), h('span', { text: n })))),
        h('div', { class: 'row wn-foot' }, h('button', { class: 'btn primary', type: 'button', text: 'Got it', onclick: close }))));
    card.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.body.append(card);
    card.querySelector('.btn').focus({ preventScroll: true });
  },
};
