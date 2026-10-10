/* Keyboard shortcuts sheet (Spotlight › Keyboard shortcuts, or Shift+?). */
import { $, h } from './core.js';
import { ICONS } from './icons.js';

const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = mac ? '⌘' : 'Ctrl';
const GROUPS = [
  ['Everywhere', [[[MOD, 'K'], 'Search apps, settings and the web'], [['Shift', '?'], 'Show this list'], [['Esc'], 'Close menus and panels'],
    [['Ctrl', 'Alt', '←/→'], 'Previous / next desktop'], [['Ctrl', 'Alt', '1–4'], 'Jump to a desktop']]],
  ['Browser', [[[MOD, 'L'], 'Focus the address bar'], [[MOD, 'D'], 'Bookmark this page'], [['Alt', '←/→'], 'Back / forward'], [['Alt', 'Shift', 'T'], 'Reopen a closed tab']]],
  ['Desktop', [[['Right-click'], 'Desktop menu: notes, wallpaper, widgets'], [['Double-click'], 'Open a desktop icon']]],
];

export const KeySheet = {
  open() {
    if ($('#keysheet')) return;
    const opener = document.activeElement;
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 160); if (opener && opener.isConnected) opener.focus({ preventScroll: true }); };
    const el = h('div', { id: 'keysheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ks-title', onpointerdown: e => { if (e.target === el) close(); } },
      h('div', { class: 'ks-card' },
        h('div', { class: 'ks-head' }, h('span', { class: 'ks-ico', svg: ICONS.keyboard }), h('h2', { id: 'ks-title', text: 'Keyboard shortcuts' }),
          h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Close', svg: ICONS.close, onclick: () => close() })),
        h('div', { class: 'ks-cols' }, GROUPS.map(([name, rows]) => h('section', null, h('h3', { class: 'group-title', text: name }),
          h('dl', { class: 'ks-list' }, rows.map(([keys, what]) => h('div', { class: 'ks-row' }, h('dt', null, keys.map(k => h('kbd', { class: 'kbd', text: k }))), h('dd', { text: what })))))))));
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    document.body.append(el);
    el.querySelector('.icon-btn').focus({ preventScroll: true });
  },
};
