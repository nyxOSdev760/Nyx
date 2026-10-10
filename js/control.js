/* Control Center: quick toggles, volume and accent above the notification
   list (the bell button opens both). Every control is a normal setting. */
import { $, h, Bus } from './core.js';
import { ICONS } from './icons.js';
import { Settings, ACCENTS } from './settings.js';
import { WM } from './wm.js';
import { Lock } from './lock.js';
import { closePanels } from './shell.js';

const TOGGLES = [
  { id: 'dark', name: 'Dark mode', icon: ICONS.moon, on: () => Settings.get('theme') !== 'light', flip: (v) => Settings.set('theme', v ? 'light' : 'dark') },
  { id: 'dnd', name: 'Do Not Disturb', icon: ICONS.moonOff, on: () => !Settings.get('notifications'), flip: (v) => Settings.set('notifications', v) },
  { id: 'sounds', name: 'Sounds', icon: ICONS.volume, on: () => Settings.get('sounds') !== false, flip: (v) => Settings.set('sounds', !v) },
  { id: 'motion', name: 'Reduce motion', icon: ICONS.motion, on: () => Settings.get('reduceMotion'), flip: (v) => Settings.set('reduceMotion', !v) },
];

export function renderControl() {
  const host = $('#cc');
  if (!host) return;
  const vol = h('input', { class: 'range cc-vol', type: 'range', min: '0', max: '1', step: '0.05', value: String(Settings.get('volume')), 'aria-label': 'Volume' });
  vol.addEventListener('input', () => Settings.set('volume', +vol.value));
  const accent = Settings.get('accent').toLowerCase();
  host.replaceChildren(
    h('div', { class: 'cc-grid' }, TOGGLES.map(t => {
      const on = !!t.on();
      return h('button', { class: 'cc-tog' + (on ? ' on' : ''), type: 'button', 'data-tog': t.id, 'aria-pressed': String(on), onclick: () => t.flip(on) },
        h('span', { class: 'cc-ico', svg: t.icon }), h('span', { class: 'cc-name', text: t.name }), h('small', { text: on ? 'On' : 'Off' }));
    })),
    h('div', { class: 'cc-card' },
      h('div', { class: 'cc-line' }, h('span', { class: 'cc-lico', svg: ICONS.volume }), vol),
      h('div', { class: 'cc-line cc-swatches', role: 'group', 'aria-label': 'Accent color' }, ACCENTS.map(a => h('button', {
        class: 'cc-sw' + (a.v.toLowerCase() === accent ? ' on' : ''), type: 'button', title: a.n, 'aria-label': `Accent: ${a.n}`, 'aria-pressed': String(a.v.toLowerCase() === accent), style: `--sw:${a.v}`, onclick: () => Settings.set('accent', a.v),
      })))),
    h('div', { class: 'cc-actions' },
      h('button', { class: 'btn sm', type: 'button', onclick: () => { closePanels(); Lock.lock(); } }, h('span', { svg: ICONS.lock }), 'Lock'),
      h('button', { class: 'btn sm', type: 'button', onclick: () => { closePanels(); Bus.emit('spotlight'); } }, h('span', { svg: ICONS.search }), 'Search'),
      h('button', { class: 'btn sm', type: 'button', onclick: () => { closePanels(); WM.open('settings'); } }, h('span', { svg: ICONS.sliders }), 'Settings')));
}

export function initControl() {
  renderControl();
  // Re-render on any change except volume, so dragging the slider isn't interrupted.
  Bus.on('settings', ({ key }) => { if (key !== 'volume') renderControl(); });
}
