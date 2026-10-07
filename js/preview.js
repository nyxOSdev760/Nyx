/* A small live preview of the desktop: wallpaper (with a real dot field on
   the Dot field wallpaper), a window in the current theme and accent, and
   the dock. Used by Settings › Appearance and the Customize screen. */
import { h } from './core.js';
import { MARK } from './icons.js';
import { resolveTheme, onAccent } from './settings.js';
import { DotField, lowPower } from './dots.js';

export function miniDesktop({ roam = false, clock = '' } = {}) {
  const canvas = h('canvas', { class: 'pv-dots', 'aria-hidden': 'true' });
  const win = h('div', { class: 'pv-win' },
    h('div', { class: 'pv-bar' }, h('i'), h('span', { text: 'Settings' })),
    h('div', { class: 'pv-body' },
      h('span', { class: 'pv-ln' }), h('span', { class: 'pv-ln s' }), h('span', { class: 'pv-ln' }),
      h('div', { class: 'pv-row' }, h('span', { class: 'pv-btn', text: 'Done' }), h('span', { class: 'switch', 'aria-checked': 'true' }))));
  const dock = h('div', { class: 'pv-dock' }, h('span', { class: 'pv-mark', svg: MARK }), h('i', { class: 'on' }), h('i'), h('i'));
  const time = h('div', { class: 'pv-clock', text: clock });
  const el = h('div', { class: 'pv', 'aria-hidden': 'true' }, canvas, win, h('div', { class: 'pv-mode' }), dock, time);
  let field = null;
  try { field = new DotField(canvas, { target: el, spacing: 16, roam }); } catch { field = null; }

  return {
    el,
    update(look, { motionOff = false } = {}) {
      el.dataset.wall = look.wallpaper;
      el.dataset.theme = resolveTheme(look.theme);
      el.style.setProperty('--accent', look.accent);
      el.style.setProperty('--on-accent', onAccent(look.accent));
      const animate = look.dotMotion && !motionOff && !lowPower;
      // Wait a frame so the canvas has its size when it first appears.
      if (field) requestAnimationFrame(() => field.configure({ enabled: look.wallpaper === 'oled', motion: animate, accent: look.accent }));
    },
    destroy() { if (field) field.destroy(); },
  };
}
