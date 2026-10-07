/* Site shortcuts (desktop, home screen, new tab page).
   Each opens its URL in a browser tab, never by navigating NyxOS away. Icons
   load in the background; a letter tile shows until (or instead of) the
   real favicon. */
import { h, isHttpUrl, state, Bus } from './core.js';

export const GN_MATH_URL = 'https://gn-math.dev/';
export const favicon = (domain, origin) => [`https://www.google.com/s2/favicons?domain=${domain}&sz=128`, `${origin}/favicon.ico`];
export const Shortcuts = [];

export function registerShortcut(def) {
  if (!def || !def.id || !def.name || !isHttpUrl(def.url)) throw new Error('A shortcut needs an id, a name and an http(s) url.');
  if (Shortcuts.some(s => s.id === def.id)) throw new Error(`A shortcut with id "${def.id}" already exists.`);
  Shortcuts.push(Object.assign({ icons: [], letter: def.name[0] }, def));
  if (state.booted) Bus.emit('apps');
}

/* A tile that starts as a tinted letter and swaps in the first favicon that loads. */
export function iconWithFallback(sources, letter, tint, size = '') {
  const box = h('span', { class: 'tile' + (size ? ' ' + size : ''), 'aria-hidden': 'true', style: `--tint:${tint || '#9db4ff'}` }, h('span', { class: 'letter', text: letter }));
  let i = 0, timer = 0;
  const img = new Image();
  img.alt = ''; img.decoding = 'async'; img.draggable = false; img.referrerPolicy = 'no-referrer';
  const next = () => {
    clearTimeout(timer);
    if (i >= sources.length) return; // keep the letter tile
    img.src = sources[i++];
    timer = setTimeout(next, 6000);
  };
  img.onload = () => {
    clearTimeout(timer);
    if (img.naturalWidth < 8) { next(); return; } // placeholder or empty icon
    box.classList.add('has-img');
    box.replaceChildren(img);
  };
  img.onerror = next;
  next();
  return box;
}
export const shortcutTile = (sc, size) => iconWithFallback(sc.icons, sc.letter, sc.tint, size);

registerShortcut({ id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/', tint: '#ff4e45', icons: favicon('youtube.com', 'https://www.youtube.com') });
registerShortcut({ id: 'tiktok', name: 'TikTok', url: 'https://www.tiktok.com/', tint: '#5ee8e4', icons: favicon('tiktok.com', 'https://www.tiktok.com') });
registerShortcut({ id: 'gnmath', name: 'GN-Math', url: GN_MATH_URL, tint: '#5fd08c', icons: favicon('gn-math.dev', 'https://gn-math.dev') });
