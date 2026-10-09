/* Shell: dock, panels (launcher, notifications, account), desktop icons,
   mobile home screen, clock, and the OS / Browser mode switch. */
import { $, $$, h, Store, Bus, state, isMobile, isCoarse, mq } from './core.js';
import { ICONS, MARK, WORDMARK } from './icons.js';
import { Apps, appTile } from './apps.js';
import { WM } from './wm.js';
import { Notify, reportRuntime } from './notify.js';
import { Settings } from './settings.js';
import { Shortcuts, shortcutTile } from './shortcuts.js';
import { Account } from './account.js';
import { Lock } from './lock.js';

/* ---------- Mode: OS desktop or Browser only ---------- */
export const Mode = {
  current: 'os',
  set(m, { save = true } = {}) {
    if (m !== 'os' && m !== 'browser') return;
    this.current = m;
    document.body.classList.toggle('mode-browser', m === 'browser');
    closePanels();
    if (m === 'browser') {
      const id = WM.open('browser');
      if (id) WM.restore(id);
    }
    renderModeBtn();
    if (save) Store.set('mode', m);
  },
  toggle() { this.set(this.current === 'os' ? 'browser' : 'os'); },
};
function renderModeBtn() {
  const toBrowser = Mode.current === 'os';
  const b = $('#mode-btn');
  b.replaceChildren(h('span', { class: 'swap' }, h('span', { svg: toBrowser ? ICONS.globe : ICONS.grid }), h('span', { class: 'lbl', text: toBrowser ? 'Switch to Browser' : 'Switch to OS' })));
  b.setAttribute('aria-label', toBrowser ? 'Switch to Browser only mode' : 'Switch back to the OS');
  b.title = toBrowser ? 'Browser only mode' : 'Back to the OS';
}

WM.hooks.beforeOpen = (appId) => { if (appId !== 'browser' && Mode.current === 'browser') Mode.set('os'); };
// Browser only mode always keeps a browser on screen.
WM.hooks.afterClose = (win) => { if (win.appId === 'browser' && Mode.current === 'browser') setTimeout(() => Mode.set('browser', { save: false }), 0); };
WM.hooks.inBrowserMode = () => Mode.current === 'browser';
WM.hooks.dockRect = (appId) => {
  const el = $$(`.dock-item[data-app="${appId}"]`).find(x => x.getClientRects().length) || $('#launcher-btn');
  return el && el.getClientRects().length ? el.getBoundingClientRect() : null;
};

/* ---------- Dock ---------- */
function dockClick(appId) {
  const wins = [...WM.wins.values()].filter(w => w.appId === appId);
  if (!wins.length) { WM.open(appId); return; }
  const top = wins.sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0];
  if (top.minimized || !WM.onCurrent(top)) WM.restore(top.id);
  else if (WM.focusedId === top.id) WM.minimize(top.id);
  else WM.focus(top.id);
}
export function renderDesktops() {
  const host = $('#desktops');
  if (!host) return;
  document.body.toggleAttribute('data-multi-desk', WM.desktopCount > 1);
  const pills = [];
  // Number pills only when there's more than one desktop; the + is always shown.
  if (WM.desktopCount > 1) for (let i = 0; i < WM.desktopCount; i++) {
    const p = h('button', { class: 'desk-pill' + (i === WM.desktop ? ' active' : ''), type: 'button', 'aria-label': `Desktop ${i + 1}` + (i === WM.desktop ? ', current' : ''), 'aria-pressed': String(i === WM.desktop), text: String(i + 1), onclick: () => WM.setDesktop(i) });
    // Right-click / long-press removes a desktop (keeps at least one).
    p.addEventListener('contextmenu', e => { e.preventDefault(); if (WM.desktopCount > 1) WM.removeDesktop(i); });
    let lp = 0;
    p.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') lp = setTimeout(() => { if (WM.desktopCount > 1) WM.removeDesktop(i); }, 600); });
    p.addEventListener('pointerup', () => clearTimeout(lp));
    p.addEventListener('pointercancel', () => clearTimeout(lp));
    pills.push(p);
  }
  if (WM.desktopCount < WM.MAX_DESKTOPS) pills.push(h('button', { class: 'desk-pill add', type: 'button', 'aria-label': 'Add desktop', title: 'Add desktop', svg: ICONS.plus, onclick: () => WM.addDesktop() }));
  host.replaceChildren(...pills);
}
function dockItem(app) {
  const wins = [...WM.wins.values()].filter(w => w.appId === app.id);
  const running = wins.length > 0;
  const active = wins.some(w => w.id === WM.focusedId && !w.minimized);
  return h('button', {
    class: 'dock-item' + (running ? ' running' : '') + (active ? ' active' : ''), type: 'button', 'data-app': app.id, 'data-tip': app.name,
    'aria-label': app.name + (running ? (active ? ', active' : ', running') : ''), 'aria-pressed': running ? String(active) : null,
    onclick: () => dockClick(app.id),
  }, appTile(app));
}
export function renderDock() {
  const mobile = isMobile();
  const apps = [...Apps.values()];
  const runningIds = new Set([...WM.wins.values()].map(w => w.appId));
  $('#dock-apps').replaceChildren(...apps.filter(a => a.pinned).map(dockItem));
  const extra = apps.filter(a => runningIds.has(a.id) && (mobile || !a.pinned));
  $('#dock-running').replaceChildren(...extra.map(dockItem));
  $('#dock-sep').hidden = !extra.length || mobile;
  $('#home-btn').setAttribute('aria-current', String(mobile && !document.body.classList.contains('has-win')));
}

/* ---------- Panels ---------- */
const PANELS = [['#launcher', '#launcher-btn'], ['#notif-center', '#bell-btn'], ['#account-panel', '#avatar-btn']];
export function closePanels(except) {
  for (const [p, b] of PANELS) {
    if (p === except) continue;
    if (!$(p).hidden) { $(p).hidden = true; $(b).setAttribute('aria-expanded', 'false'); }
  }
}
export function togglePanel(sel, open) {
  const panel = $(sel), btn = $(PANELS.find(x => x[0] === sel)[1]);
  const willOpen = open == null ? panel.hidden : open;
  closePanels(sel);
  panel.hidden = !willOpen;
  btn.setAttribute('aria-expanded', String(willOpen));
  if (!willOpen) return;
  if (sel === '#launcher') { $('#launcher-q').value = ''; renderLauncher(); setTimeout(() => $('#launcher-q').focus(), 30); }
  if (sel === '#notif-center') renderNotifs();
  if (sel === '#account-panel') renderAccountPanel();
}

/* Launcher: every app, then site shortcuts. */
function launchItems() {
  return [...Apps.values()].map(app => ({ name: app.name, desc: app.description, tile: () => appTile(app, 'md'), open: () => WM.open(app.id), label: `Open ${app.name}` }))
    .concat(Shortcuts.map(sc => ({ name: sc.name, desc: 'Opens in the browser', tile: () => shortcutTile(sc, 'md'), open: () => WM.open('browser', { url: sc.url }), label: `Open ${sc.name} in the browser` })));
}
export function renderLauncher() {
  const q = $('#launcher-q').value.trim().toLowerCase();
  const list = launchItems().filter(a => !q || a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q));
  $('#launcher-list').replaceChildren(...(list.length ? list.map(it => h('button', {
    class: 'app-row', type: 'button', 'aria-label': it.label, onclick: () => { togglePanel('#launcher', false); it.open(); },
  }, it.tile(), h('span', null, h('b', { text: it.name }), h('small', { text: it.desc })))) :
    [h('p', { class: 'empty', text: `No apps match "${q}".` })]));
}

export function renderNotifs() {
  const list = $('#notif-list');
  list.replaceChildren(...(Notify.log.length ? Notify.log.map(n => h('div', { class: 'notif' },
    h('b', { text: n.title }), n.body ? h('p', { text: n.body }) : null,
    h('time', { text: (n.app ? n.app + ' · ' : '') + new Date(n.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })))
    : [h('p', { class: 'empty', text: 'You’re all caught up.' })]));
  $('#bell-btn .dot').hidden = !($('#notif-center').hidden && Notify.log.length > 0);
  $('#notif-clear').disabled = !Notify.log.length;
}

/* Account avatar in the dock and its panel. Details live in account.js. */
export function renderAvatar() {
  const u = Account.user;
  const b = $('#avatar-btn');
  b.replaceChildren(Account.avatar(u));
  b.setAttribute('aria-label', u ? `Account: ${u.name}` : 'Account: not signed in');
  b.title = u ? u.name : 'Sign in';
}
function renderAccountPanel() {
  const u = Account.user;
  const body = $('#account-body');
  const open = () => { togglePanel('#account-panel', false); WM.open('chat'); };
  const lockRow = h('button', { class: 'btn', type: 'button', onclick: () => { togglePanel('#account-panel', false); Lock.lock(); } }, h('span', { svg: ICONS.lock }), 'Lock screen');
  if (u) {
    body.replaceChildren(h('div', { class: 'acct' },
      h('div', { class: 'acct-id' }, Account.avatar(u, 'lg'), h('div', null, h('b', { text: u.name }), h('small', { text: 'Signed in' }))),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: open }, h('span', { svg: ICONS.chat }), 'Open Chat'),
        h('button', { class: 'btn', type: 'button', onclick: async () => { togglePanel('#account-panel', false); await Account.signOut(); } }, h('span', { svg: ICONS.logout }), 'Sign out')),
      h('div', { class: 'row' }, lockRow)));
  } else {
    body.replaceChildren(h('div', { class: 'acct' },
      h('div', { class: 'acct-id' }, Account.avatar(null, 'lg'), h('div', null, h('b', { text: 'Guest' }), h('small', { text: Account.available() ? 'Sign in to use Chat and Voice.' : 'Accounts aren’t set up on this site.' }))),
      Apps.has('chat') ? h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: open }, h('span', { svg: ICONS.login }), Account.available() ? 'Sign in or sign up' : 'Open Chat')) : null,
      h('div', { class: 'row' }, lockRow)));
  }
}

/* ---------- Desktop icons / home grid ---------- */
export function renderIcons() {
  const items = [...Apps.values()].map(app => ({ id: app.id, name: app.name, label: `Open ${app.name}`, tile: () => appTile(app), open: () => WM.open(app.id) }))
    .concat(Shortcuts.map(sc => ({ id: sc.id, name: sc.name, label: `Open ${sc.name} in the browser`, tile: () => shortcutTile(sc), open: () => WM.open('browser', { url: sc.url }) })));
  $('#icons').replaceChildren(...items.map(it => {
    const b = h('button', { class: 'dicon', type: 'button', 'aria-label': it.label, title: it.name, 'data-id': it.id }, it.tile(), h('span', { text: it.name }));
    const run = () => { try { it.open(); } catch (e) { reportRuntime(e.message); } };
    // Mouse: click selects, double-click opens. Touch, pen and keyboard: one tap opens.
    b.addEventListener('click', e => {
      const touch = isCoarse() || isMobile() || (e.pointerType && e.pointerType !== 'mouse') || e.detail === 0;
      if (touch) { run(); return; }
      $$('.dicon.sel').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
    });
    b.addEventListener('dblclick', run);
    b.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    return b;
  }));
}

/* ---------- Clock (single timer, aligned to the minute/second) ---------- */
let clockTimer = 0;
export const greeting = (d = new Date()) => { const hr = d.getHours(); return hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };
export const fmtTime = (d, seconds = Settings.get('clockSeconds')) => {
  const o = { hour: 'numeric', minute: '2-digit', hour12: !Settings.get('clock24') };
  if (seconds) o.second = '2-digit';
  return d.toLocaleTimeString([], o);
};
function tickClock() {
  const d = new Date();
  $('#clock-time').textContent = fmtTime(d);
  $('#clock-date').textContent = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  $('#clock-date').hidden = !Settings.get('showDate');
  $('#home-time').textContent = fmtTime(d, false).replace(/\s?[AP]M$/i, '');
  $('#home-date').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  Bus.emit('tick', d);
}
export function startClock() {
  clearTimeout(clockTimer);
  const loop = () => {
    tickClock();
    const step = Settings.get('clockSeconds') ? 1000 : 60000;
    clockTimer = setTimeout(loop, step - (Date.now() % step) + 15);
  };
  loop();
}

/* ---------- Wiring ---------- */
export function initShell() {
  $('#launcher-btn').innerHTML = MARK;
  $('#launcher-foot').innerHTML = MARK + WORDMARK;
  $('#home-btn').innerHTML = ICONS.grid;
  $('#bell-btn').insertAdjacentHTML('afterbegin', ICONS.bell);
  $('#launcher-search-ico').innerHTML = ICONS.search;

  $('#mode-btn').addEventListener('click', () => Mode.toggle());
  $('#launcher-btn').addEventListener('click', () => togglePanel('#launcher'));
  $('#home-btn').addEventListener('click', () => { closePanels(); WM.minimizeAll(); });
  $('#bell-btn').addEventListener('click', () => togglePanel('#notif-center'));
  $('#avatar-btn').addEventListener('click', () => togglePanel('#account-panel'));
  $('#notif-clear').addEventListener('click', () => Notify.clear());
  $('#clock').addEventListener('click', () => WM.open('settings', { page: 'desktop' }));
  $('#launcher-q').addEventListener('input', renderLauncher);
  $('#launcher-q').addEventListener('keydown', e => {
    if (e.key === 'Enter') { const first = $('#launcher-list .app-row'); if (first) first.click(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); const first = $('#launcher-list .app-row'); if (first) first.focus(); }
  });
  $('#launcher-list').addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const rows = $$('#launcher-list .app-row'), i = rows.indexOf(document.activeElement);
    const n = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (n) n.focus(); else if (e.key === 'ArrowUp') $('#launcher-q').focus();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const open = PANELS.find(([p]) => !$(p).hidden);
      if (open) { togglePanel(open[0], false); $(open[1]).focus(); }
      return;
    }
    // Desktop switching: Ctrl+Alt+Arrows (move between) and Ctrl+Alt+1..4 (jump).
    // Chosen to avoid the browser's own Ctrl+number / Alt+Arrow shortcuts.
    if (e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey) {
      if (e.key === 'ArrowRight') { e.preventDefault(); WM.setDesktop(Math.min(WM.desktop + 1, WM.desktopCount - 1)); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); WM.setDesktop(Math.max(WM.desktop - 1, 0)); }
      else if (/^[1-4]$/.test(e.key)) { const i = +e.key - 1; if (i < WM.desktopCount) { e.preventDefault(); WM.setDesktop(i); } }
    }
  });
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('.panel,#launcher-btn,#bell-btn,#avatar-btn')) closePanels();
    if (!e.target.closest('.dicon')) $$('.dicon.sel').forEach(x => x.classList.remove('sel'));
  });

  Bus.on('wm', renderDock);
  Bus.on('desktops', () => { renderDesktops(); renderDock(); });
  Bus.on('apps', () => { if (state.booted) { renderIcons(); renderLauncher(); renderDock(); } });
  Bus.on('notify', renderNotifs);
  Bus.on('account', () => { renderAvatar(); if (!$('#account-panel').hidden) renderAccountPanel(); });
  Bus.on('settings', ({ key }) => {
    if (key === '*' || key === 'clock24' || key === 'clockSeconds' || key === 'showDate') startClock();
    if (key === '*' || key === 'desktopIcons') document.body.classList.toggle('no-icons', !Settings.get('desktopIcons'));
  });
  mq('(max-width: 720px)').addEventListener('change', () => { renderDock(); closePanels(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) startClock(); });

  document.body.classList.toggle('no-icons', !Settings.get('desktopIcons'));
  renderIcons();
  renderLauncher();
  renderDock();
  renderDesktops();
  renderNotifs();
  renderAvatar();
  startClock();
}
