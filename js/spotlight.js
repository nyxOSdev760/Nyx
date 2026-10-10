/* Spotlight: one search box for everything. Ctrl/Cmd+K (or the search button)
   opens it. It finds apps, sites, Settings pages and actions, does arithmetic,
   and falls back to a web search or an address in the Browser. */
import { $, h, Bus, isMobile } from './core.js';
import { ICONS } from './icons.js';
import { Apps, appTile } from './apps.js';
import { WM } from './wm.js';
import { Settings, ACCENTS } from './settings.js';
import { Shortcuts, shortcutTile } from './shortcuts.js';
import { parseInput, labelFor } from './web.js';
import { evaluate, looksLikeMath, fmtNum } from './calc.js';
import { Mode, closePanels } from './shell.js';
import { Lock } from './lock.js';
import { Notify } from './notify.js';
import { Widgets } from './widgets.js';
import { GAMES, thumbOf } from './apps/games.js';

const PAGES = [
  ['appearance', 'Appearance', ICONS.paint, 'theme dark light accent color wallpaper font look'],
  ['desktop', 'Desktop', ICONS.monitor, 'clock icons 24 hour seconds date'],
  ['browser', 'Browser', ICONS.globe, 'search engine homepage history bookmarks proxy'],
  ['launch', 'Launch', ICONS.window, 'about blank cloak popup'],
  ['account', 'Account', ICONS.user, 'sign in username chat'],
  ['notifications', 'Notifications', ICONS.bell, 'alerts toasts do not disturb'],
  ['sound', 'Sound', ICONS.headphones, 'volume chime audio'],
  ['lock', 'Lock', ICONS.lock, 'pin password idle'],
  ['data', 'Data', ICONS.db, 'export import reset erase backup'],
  ['about', 'About', ICONS.info, 'version changelog what is new tips'],
];
const secTile = (id, icon) => h('span', { class: 'sp-sec', 'data-sec': id }, h('span', { class: 'st-ico', svg: icon }));
const actTile = (icon) => h('span', { class: 'sp-act', svg: icon });

function actions() {
  const dark = Settings.get('theme') !== 'light';
  const list = [
    { title: dark ? 'Switch to light mode' : 'Switch to dark mode', icon: ICONS.sun, kw: 'theme dark light mode appearance', run: () => Settings.set('theme', dark ? 'light' : 'dark') },
    { title: 'Lock screen', icon: ICONS.lock, kw: 'lock away', run: () => Lock.lock() },
    { title: Settings.get('notifications') ? 'Turn on Do Not Disturb' : 'Turn off Do Not Disturb', icon: ICONS.moonOff, kw: 'dnd quiet notifications focus', run: () => Settings.set('notifications', !Settings.get('notifications')) },
    { title: Settings.get('sounds') ? 'Mute sounds' : 'Turn sounds on', icon: ICONS.volume, kw: 'sound audio mute volume', run: () => Settings.set('sounds', !Settings.get('sounds')) },
    { title: 'New browser tab', icon: ICONS.plus, kw: 'browser web tab internet', run: () => WM.open('browser', { newTab: true }) },
    { title: Mode.current === 'os' ? 'Browser only mode' : 'Back to the desktop', icon: ICONS.expand, kw: 'mode browser fullscreen os', run: () => Mode.toggle() },
    { title: 'Add a desktop', icon: ICONS.grid, kw: 'desktop workspace space', run: () => WM.addDesktop() },
    { title: 'Show desktop', icon: ICONS.home, kw: 'minimize hide windows home', run: () => WM.minimizeAll() },
    ...['clock', 'weather', 'calendar'].filter(t => !Widgets.has(t)).map(t => ({ title: `Add ${t} widget`, icon: ICONS.widgets, kw: `widget ${t}`, run: () => Widgets.add(t) })),
    { title: 'Keyboard shortcuts', icon: ICONS.keyboard, kw: 'keys hotkeys help shortcuts', run: () => Bus.emit('shortcut-sheet') },
    { title: 'Show tips again', icon: ICONS.info, kw: 'tour help tips guide', run: () => Bus.emit('tour') },
  ];
  if (Apps.has('clock')) for (const m of [5, 10, 25]) list.push({ title: `Start a ${m} minute timer`, icon: ICONS.timer, kw: `timer countdown clock ${m} minutes pomodoro`, run: () => WM.open('clock', { timer: m }) });
  if (Apps.has('notes')) list.splice(4, 0, { title: 'New note', icon: ICONS.note, kw: 'note write text memo', run: () => WM.open('notes', { new: true }) });
  for (const a of ACCENTS) list.push({ title: `Accent color: ${a.n}`, icon: null, swatch: a.v, kw: `accent color ${a.n}`, run: () => Settings.set('accent', a.v) });
  return list;
}

/* Score how well text matches the query: prefix > word prefix > substring. */
function score(q, title, kw = '') {
  const t = title.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s:-]+/).some(w => w.startsWith(q))) return 60;
  if (t.includes(q)) return 40;
  if (q.length > 1 && kw.split(' ').some(w => w.startsWith(q))) return 30;
  return 0;
}

function results(raw) {
  const q = raw.trim().toLowerCase();
  const groups = [];
  const apps = [...Apps.values()].map(a => ({ title: a.name, sub: a.description, tile: () => appTile(a, 'md'), run: () => WM.open(a.id), s: q ? score(q, a.name, a.description.toLowerCase()) : 1 }))
    .concat(Shortcuts.map(sc => ({ title: sc.name, sub: 'Website · opens in the Browser', tile: () => shortcutTile(sc, 'md'), run: () => WM.open('browser', { url: sc.url }), s: q ? score(q, sc.name) : 1 })));
  if (!q) {
    groups.push(['Apps', apps.slice(0, 12), 'grid']);
    groups.push(['Quick actions', actions().slice(0, 5).map(a => ({ ...a, tile: () => actTile(a.icon) }))]);
    return groups;
  }
  if (looksLikeMath(raw)) {
    try {
      const v = fmtNum(evaluate(raw));
      groups.push(['Calculator', [{ title: `= ${v}`, sub: 'Press Enter to copy', tile: () => actTile(ICONS.calc), big: true, run: () => { try { navigator.clipboard.writeText(v.replace(/,/g, '')); Notify.push({ title: 'Copied', body: v }); } catch {} } }]]);
    } catch {}
  }
  const top = (list) => list.filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  const a = top(apps);
  if (a.length) groups.push(['Apps', a]);
  const games = top(GAMES.map(g => ({ title: `Play ${g.name}`, sub: `${g.kind} game · ${g.license}`, tile: () => h('span', { class: 'sp-act sp-game' }, h('img', { src: thumbOf(g), alt: '' })), run: () => WM.open('games', { game: g.id }), s: score(q, g.name, `game play ${g.kind.toLowerCase()}`) })));
  if (games.length) groups.push(['Games', games.slice(0, 4)]);
  const pages = top(PAGES.map(([id, name, icon, kw]) => ({ title: name, sub: 'Settings', tile: () => secTile(id, icon), run: () => WM.open('settings', { page: id }), s: score(q, name, kw) })));
  if (pages.length) groups.push(['Settings', pages]);
  const acts = top(actions().map(x => ({ ...x, tile: () => x.swatch ? h('span', { class: 'sp-act' }, h('i', { class: 'sp-sw', style: `background:${x.swatch}` })) : actTile(x.icon), s: score(q, x.title, x.kw) })));
  if (acts.length) groups.push(['Actions', acts.slice(0, 6)]);
  const p = parseInput(raw);
  if (p && p.kind === 'web') groups.push(['Web', [{ title: p.search ? `Search the web for “${raw.trim()}”` : `Open ${labelFor(p.url) || p.url}`, sub: p.search ? Settings.get('searchEngine') : p.url, tile: () => actTile(p.search ? ICONS.search : ICONS.globe), run: () => WM.open('browser', { url: p.url }) }]]);
  return groups;
}

export const Spotlight = {
  el: null,
  isOpen() { return !!this.el; },
  toggle() { this.isOpen() ? this.close() : this.open(); },
  open(initial = '') {
    if (this.el || document.body.classList.contains('locked') || $('#tour')) return;
    closePanels();
    const opener = document.activeElement;
    const input = h('input', { type: 'text', placeholder: 'Search apps, settings, actions, the web… or do math', 'aria-label': 'Search', autocomplete: 'off', spellcheck: 'false', 'aria-controls': 'sp-list', 'aria-autocomplete': 'list' });
    const list = h('div', { id: 'sp-list', class: 'sp-list scroll', role: 'listbox', 'aria-label': 'Results' });
    const hint = h('div', { class: 'sp-foot' }, h('span', null, h('span', { class: 'kbd', text: '↑↓' }), ' move'), h('span', null, h('span', { class: 'kbd', text: 'Enter' }), ' open'), h('span', null, h('span', { class: 'kbd', text: 'Esc' }), ' close'));
    const box = h('div', { class: 'sp-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Spotlight search' },
      h('label', { class: 'sp-field' }, h('span', { svg: ICONS.search }), input), list, isMobile() ? null : hint);
    const el = h('div', { id: 'spotlight' }, box);
    let items = [], sel = 0;
    const draw = () => {
      items = [];
      const groups = results(input.value);
      list.replaceChildren(...groups.map(([name, rows, layout]) => h('div', { class: 'sp-group' + (layout ? ' ' + layout : '') },
        h('div', { class: 'sp-gt', text: name }),
        h('div', { class: 'sp-rows' }, rows.map(r => {
          const i = items.length;
          const b = h('button', { class: 'sp-row' + (r.big ? ' big' : ''), type: 'button', role: 'option', id: `sp-${i}`, tabindex: '-1', onclick: () => run(i), onpointermove: () => { if (sel !== i) { sel = i; mark(); } } },
            r.tile(), h('span', { class: 'sp-txt' }, h('b', { text: r.title }), r.sub && layout !== 'grid' ? h('small', { text: r.sub }) : null));
          items.push({ r, b });
          return b;
        })))));
      if (!items.length) list.replaceChildren(h('p', { class: 'empty', text: 'No results.' }));
      sel = 0; mark();
    };
    const mark = () => {
      items.forEach((it, i) => it.b.setAttribute('aria-selected', String(i === sel)));
      const cur = items[sel];
      if (cur) { input.setAttribute('aria-activedescendant', cur.b.id); cur.b.scrollIntoView({ block: 'nearest' }); }
    };
    const run = (i) => { const it = items[i]; if (!it) return; this.close(); try { it.r.run(); } catch (e) { Notify.push({ title: 'That didn’t work', body: e.message }); } };
    input.addEventListener('input', draw);
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, Math.min(items.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
      else if (e.key === 'Tab') e.preventDefault();
    });
    el.addEventListener('pointerdown', e => { if (e.target === el) this.close(); });
    document.body.append(el);
    this.el = el; this.opener = opener;
    input.value = initial;
    draw();
    input.focus();
  },
  close() {
    const el = this.el;
    if (!el) return;
    this.el = null;
    el.classList.add('out');
    setTimeout(() => el.remove(), 160);
    if (this.opener && this.opener.isConnected && this.opener !== document.body) this.opener.focus({ preventScroll: true });
  },
};
