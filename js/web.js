/* Browser helpers shared by the Browser and Settings apps: history and address parsing. */
import { Store, isHttpUrl, hostOf } from './core.js';
import { Settings, ENGINES } from './settings.js';
import { Shortcuts } from './shortcuts.js';

export const NEWTAB = 'nyx://newtab';
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

/* ---------- Browser input parsing ---------- */
export function parseInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^(nyx|snap):\/\/newtab\/?$/i.test(s)) return { kind: 'internal', url: 'nyx://newtab' };
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
export function displayUrl(url) { return url === 'nyx://newtab' ? '' : url; }


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
