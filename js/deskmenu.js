/* Right-click (or long-press) on the empty desktop: a small menu of handy actions. */
import { $, $$, h, Bus } from './core.js';
import { ICONS } from './icons.js';
import { Apps } from './apps.js';
import { WM } from './wm.js';
import { Settings } from './settings.js';
import { Lock } from './lock.js';

export function closeDeskMenu() { $$('.ctx-menu').forEach(m => m.remove()); }

/* Show a menu at (x, y). items: [icon, label, run] or 'sep' (falsy entries are skipped). */
export function showMenu(x, y, items, label = 'Menu', { above = false } = {}) {
  closeDeskMenu();
  const menu = h('div', { class: 'desk-menu ctx-menu', role: 'menu', 'aria-label': label },
    items.filter(Boolean).map(it => it === 'sep' ? h('div', { class: 'ctx-sep', role: 'separator' })
      : h('button', { type: 'button', role: 'menuitem', class: it[3] || null, onclick: () => { closeDeskMenu(); it[2](); } }, h('span', { svg: it[0] }), it[1])));
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(above ? y - r.height : y, innerHeight - r.height - 8))}px`;
  menu.querySelector('button').focus({ preventScroll: true });
  menu.addEventListener('keydown', e => {
    const btns = $$('button', menu), i = btns.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeDeskMenu(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length].focus(); }
  });
  return menu;
}

function openMenu(x, y) {
  showMenu(x, y, [
    Apps.has('notes') && [ICONS.note, 'New note', () => WM.open('notes', { new: true })],
    [ICONS.search, 'Search…', () => Bus.emit('spotlight')],
    [ICONS.plus, 'New browser tab', () => WM.open('browser', { newTab: true })],
    'sep',
    [ICONS.paint, 'Change wallpaper…', () => WM.open('settings', { page: 'appearance' })],
    Apps.has('widgets') && [ICONS.widgets, 'Add widgets…', () => WM.open('widgets')],
    [ICONS.grid, Settings.get('desktopIcons') ? 'Hide desktop icons' : 'Show desktop icons', () => Settings.set('desktopIcons', !Settings.get('desktopIcons'))],
    'sep',
    [ICONS.lock, 'Lock screen', () => Lock.lock()],
    [ICONS.sliders, 'Settings', () => WM.open('settings')],
  ], 'Desktop');
}

export function initDeskMenu() {
  $('#desktop').addEventListener('contextmenu', e => {
    if (e.target.closest('.win,.widget,input,textarea,a')) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.ctx-menu')) closeDeskMenu(); });
  addEventListener('blur', closeDeskMenu);
  Bus.on('wm', closeDeskMenu);
}
