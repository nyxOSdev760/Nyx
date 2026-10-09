/* App registry. Apps call registerApp({id, name, icon, mount, ...}). */
import { h, Bus } from './core.js';

export const Apps = new Map();
export function registerApp(def) {
  for (const k of ['id', 'name', 'icon', 'mount']) if (!def[k]) throw new Error(`App definition is missing "${k}".`);
  if (Apps.has(def.id)) throw new Error(`An app with id "${def.id}" is already registered.`);
  Apps.set(def.id, Object.assign({ single: true, size: [900, 620], description: '', tint: '#8b6cf0', pinned: true }, def));
  Bus.emit('apps');
}
/* App glyph tile: a glossy squircle in the app's tint with a white glyph. */
export const appTile = (app, size = '') => h('span', { class: 'tile' + (size ? ' ' + size : ''), style: `--tint:${app.tint}`, 'aria-hidden': 'true', svg: app.icon });
