/* Browser helpers shared by the Browser and Settings apps: history and address parsing. */
import { Store, isHttpUrl, hostOf, Bus } from './core.js';
import { Settings, ENGINES } from './settings.js';
import { Shortcuts } from './shortcuts.js';

export const NEWTAB = 'kanni://newtab';
/* ---------- Browser history store ---------- */
export const History = {
  list() { const v = Store.get('history', []); return Array.isArray(v) ? v.filter(x => x && isHttpUrl(x.url)) : []; },
  add(url, title) {
    if (!Settings.get('saveHistory') || !isHttpUrl(url)) return;
    const list = this.list().filter(x => x.url !== url);
    list.unshift({ url, title: String(title || '').slice(0, 200), t: Date.now() });
    Store.set('history', list.slice(0, 200));
  },
  clear() { Store.remove('history'); },
};

/* ---------- Bookmarks (persisted) ---------- */
export const Bookmarks = {
  list() { const v = Store.get('bookmarks', []); return Array.isArray(v) ? v.filter(x => x && isHttpUrl(x.url)).map(x => ({ url: x.url, title: String(x.title || '').slice(0, 120) })) : []; },
  save(list) { Store.set('bookmarks', list.slice(0, 100)); Bus.emit('bookmarks'); },
  has(url) { return this.list().some(b => b.url === url); },
  add(url, title) { if (!isHttpUrl(url) || this.has(url)) return; const l = this.list(); l.push({ url, title: String(title || hostOf(url)).slice(0, 120) }); this.save(l); },
  remove(url) { this.save(this.list().filter(b => b.url !== url)); },
  toggle(url, title) { this.has(url) ? this.remove(url) : this.add(url, title); return this.has(url); },
  rename(url, title) { const l = this.list(); const b = l.find(x => x.url === url); if (b) { b.title = String(title || hostOf(url)).slice(0, 120); this.save(l); } },
  reorder(from, to) { const l = this.list(); if (from < 0 || from >= l.length || to < 0 || to >= l.length) return; const [m] = l.splice(from, 1); l.splice(to, 0, m); this.save(l); },
};

/* ---------- Browser input parsing ---------- */
export function parseInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^(kanni|nyx|snap):\/\/newtab\/?$/i.test(s)) return { kind: 'internal', url: NEWTAB };
  const hostLike = /^(localhost|\d{1,3}(\.\d{1,3}){3}|[^\s/:?#]+\.[a-z][a-z0-9-]+)(:\d{1,5})?([/?#]\S*)?$/i;
  const scheme = s.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme && !hostLike.test(s)) {
    const p = scheme[1].toLowerCase();
    if (p === 'http' || p === 'https') {
      try { return { kind: 'web', url: new URL(s).href }; } catch { /* fall through to search */ }
    } else if (!/\s/.test(s)) {
      return { kind: 'blocked', url: s, scheme: p };
    }
  }
  if (!/\s/.test(s) && hostLike.test(s)) {
    const local = /^(localhost|\d{1,3}(\.\d{1,3}){3})/i.test(s);
    try { return { kind: 'web', url: new URL((local ? 'http://' : 'https://') + s).href }; } catch {}
  }
  return { kind: 'web', url: ENGINES[Settings.get('searchEngine')].url + encodeURIComponent(s), search: true };
}
export function displayUrl(url) { return url === NEWTAB ? '' : url; }


/* What the address bar and tab show: a site name, the search words, or the bare host. */
export function labelFor(url) {
  if (!url || url === NEWTAB) return '';
  for (const e of Object.values(ENGINES)) {
    if (url.startsWith(e.url)) { try { return decodeURIComponent(url.slice(e.url.length).split('&')[0].replace(/\+/g, ' ')); } catch { break; } }
  }
  try {
    const host = new URL(url).hostname;
    const sc = Shortcuts.find(s => { try { return new URL(s.url).hostname === host; } catch { return false; } });
    if (sc) return sc.name;
  } catch {}
  return hostOf(url);
}
export { hostOf };
