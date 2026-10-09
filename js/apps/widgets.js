/* Widgets app: add or remove the desktop widgets. */
import { h, Bus } from '../core.js';
import { ICONS } from '../icons.js';
import { registerApp } from '../apps.js';
import { Widgets, WIDGET_TYPES } from '../widgets.js';
import { appTile } from '../apps.js';

registerApp({
  id: 'widgets', name: 'Widgets', description: 'Add clock, weather and calendar to the desktop', icon: ICONS.widgets, tint: '#f0a02c', size: [460, 420], pinned: false,
  mount(root, ctx) {
    const list = h('div', { class: 'wgpick' });
    root.append(h('div', { class: 'wgpick-wrap scroll' }, h('header', { class: 'st-head', style: 'padding:20px 20px 0' }, h('h2', { text: 'Widgets' }), h('p', { class: 'lede', text: 'Add these to the desktop. Drag to position; they stack on phones.' })), list));
    const draw = () => list.replaceChildren(...WIDGET_TYPES.map(t => {
      const on = Widgets.has(t.id);
      return h('div', { class: 'wgpick-row' },
        h('span', { class: 'wgpick-ico', 'data-type': t.id, svg: t.icon }),
        h('div', { class: 'wgpick-main' }, h('b', { text: t.name })),
        h('button', { class: 'btn sm' + (on ? '' : ' primary'), type: 'button', text: on ? 'Remove' : 'Add', onclick: () => { on ? Widgets.remove(t.id) : Widgets.add(t.id); } }));
    }));
    draw();
    const off = Bus.on('widgets', draw);
    return { destroy: off };
  },
});
