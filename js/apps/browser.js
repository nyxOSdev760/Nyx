/* Browser app: pill tabs, a compact toolbar, and the new tab page.
   Pages load through BrowserNet (settings.js), never by moving NyxOS away. */
import { h, uid, isHttpUrl, isMobile, Bus } from '../core.js';
import { ICONS } from '../icons.js';
import { registerApp } from '../apps.js';
import { Settings, ENGINES, BrowserNet } from '../settings.js';
import { History, Bookmarks, parseInput, displayUrl, labelFor, hostOf, NEWTAB } from '../web.js';
import { Shortcuts, shortcutTile, favicon } from '../shortcuts.js';
import { Mode, greeting, fmtTime } from '../shell.js';
import { Account } from '../account.js';

/* Small favicon for a tab or a recent site; a globe until it loads. */
function siteIcon(url) {
  const box = h('span', { class: 'site-ico', 'aria-hidden': 'true', svg: ICONS.globe });
  let host = '';
  try { host = new URL(url).hostname; } catch { return box; }
  const img = new Image();
  img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  img.onload = () => { if (img.naturalWidth >= 8) box.replaceChildren(img); };
  img.src = favicon(host)[0];
  return box;
}

registerApp({
  id: 'browser', name: 'Browser', description: 'Browse the web in tabs', icon: ICONS.globe, tint: '#9db4ff', size: [1080, 700],
  mount(root, ctx) {
    const tabs = [];
    let active = null;
    const off = [];

    const tabsEl = h('div', { class: 'br-tabs', role: 'tablist', 'aria-label': 'Tabs' });
    const newBtn = h('button', { class: 'icon-btn sm br-new', type: 'button', 'aria-label': 'New tab', title: 'New tab', svg: ICONS.plus, onclick: ctx.guard(() => newTab()) });
    const backBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back', title: 'Back', svg: ICONS.back, onclick: ctx.guard(() => go(-1)) });
    const fwdBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Forward', title: 'Forward', svg: ICONS.fwd, onclick: ctx.guard(() => go(1)) });
    const reloadBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Reload', title: 'Reload', svg: ICONS.reload, onclick: ctx.guard(() => reloadOrStop()) });
    const homeBtn = h('button', { class: 'icon-btn opt', type: 'button', 'aria-label': 'Home', title: 'Home', svg: ICONS.home, onclick: ctx.guard(() => goHome()) });
    const addrIcon = h('span', { class: 'br-addr-ico', svg: ICONS.search });
    const addr = h('input', { type: 'text', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Address or search', placeholder: 'Search or enter address', enterkeyhint: 'go' });
    const starBtn = h('button', { class: 'br-star', type: 'button', 'aria-label': 'Bookmark this page', title: 'Bookmark this page', svg: ICONS.star, onclick: ctx.guard(() => toggleBookmark()) });
    const addrForm = h('form', { class: 'br-addr', role: 'search' }, addrIcon, addr, starBtn);
    const recentBtn = h('button', { class: 'icon-btn opt', type: 'button', 'aria-label': 'Recently closed tabs', title: 'Recently closed tabs', 'aria-haspopup': 'menu', svg: ICONS.history, onclick: ctx.guard(e => recentMenu(e.currentTarget)) });
    const extBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Open in a new browser tab', title: 'Open in a new browser tab', svg: ICONS.external, onclick: ctx.guard(() => openExternal()) });
    const fsBtn = h('button', { class: 'icon-btn opt', type: 'button', 'aria-label': 'Full screen', title: 'Full screen', svg: ICONS.expand, onclick: ctx.guard(() => toggleFs()) });
    if (!document.fullscreenEnabled) fsBtn.hidden = true;
    const progress = h('div', { class: 'br-progress', 'aria-hidden': 'true' }, h('i'));
    const status = h('span', { class: 'sr', role: 'status', 'aria-live': 'polite' });
    const hint = h('div', { class: 'br-hint', role: 'note' });
    const views = h('div', { class: 'br-views' });
    const bookmarksBar = h('div', { class: 'br-bookmarks', role: 'toolbar', 'aria-label': 'Bookmarks' });

    root.append(h('div', { class: 'br' },
      h('div', { class: 'br-top' }, tabsEl, newBtn),
      h('div', { class: 'br-bar' }, h('div', { class: 'br-nav' }, backBtn, fwdBtn, reloadBtn, homeBtn), addrForm, h('div', { class: 'br-nav' }, recentBtn, extBtn, fsBtn), progress),
      bookmarksBar, hint, status, views));

    addrForm.addEventListener('submit', ctx.guard(e => {
      e.preventDefault();
      const p = parseInput(addr.value);
      if (p) { navigate(active, p); addr.blur(); }
    }));
    addr.addEventListener('focus', () => { addr.value = displayUrl(cur(active)); addr.select(); });
    addr.addEventListener('blur', () => { addr.value = labelFor(cur(active)); });
    addr.addEventListener('keydown', e => { if (e.key === 'Escape') addr.blur(); });
    // On the whole window, so shortcuts work after clicking its title bar or tabs.
    const onKey = ctx.guard(e => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); addr.focus(); }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      // Reopen last closed tab: Alt+Shift+T (the real browser uses Ctrl+Shift+T).
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); reopenClosed(); }
      // Bookmark the page: Ctrl/Cmd+D.
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); toggleBookmark(); }
    });
    ctx.el.addEventListener('keydown', onKey);

    const cur = (tab) => (tab && tab.entries[tab.index]) || NEWTAB;
    const homeUrl = () => Settings.get('homepage') || NEWTAB;

    function newTab(url, activate = true) {
      const tab = { id: uid(), title: 'New tab', entries: [], index: -1, loading: false, error: null, slow: false, frame: null, view: h('div', { class: 'br-view', role: 'tabpanel', hidden: true }), timer: 0, hintOff: false };
      views.append(tab.view);
      tabs.push(tab);
      if (activate) select(tab);
      const p = url ? parseInput(url) : null;
      navigate(tab, p || { kind: 'internal', url: NEWTAB });
      if (activate && cur(tab) === NEWTAB) setTimeout(() => { const q = tab.view.querySelector('input'); if (q && !isMobile()) q.focus(); }, 50);
      return tab;
    }
    const closed = [];   // recently closed tabs this session: {url, title}
    function closeTab(tab) {
      const i = tabs.indexOf(tab);
      if (i < 0) return;
      const u = cur(tab);
      if (isHttpUrl(u)) { closed.unshift({ url: u, title: tab.title || labelFor(u) }); closed.length = Math.min(closed.length, 10); }
      clearTimeout(tab.timer);
      if (tab.frame) tab.frame.src = 'about:blank';
      tab.view.remove();
      tabs.splice(i, 1);
      if (!tabs.length) { if (Mode.current === 'browser') newTab(); else ctx.close(); return; }
      if (active === tab) select(tabs[Math.min(i, tabs.length - 1)]);
      else render();
    }
    function reopenClosed() {
      const last = closed.shift();
      if (last) newTab(last.url); else ctx.notify('Nothing to reopen', 'No recently closed tabs.');
    }
    function recentMenu(anchor) {
      brMenu(anchor, closed.length ? closed.map(c => ({ icon: siteIcon(c.url), label: c.title || hostOf(c.url), run: () => { const i = closed.indexOf(c); if (i >= 0) closed.splice(i, 1); newTab(c.url); } }))
        : [{ label: 'No recently closed tabs', disabled: true }]);
    }
    function select(tab) {
      active = tab;
      for (const t of tabs) t.view.hidden = t !== tab;
      render();
    }
    function navigate(tab, p, push = true) {
      if (!tab || !p) return;
      tab.error = null;
      if (p.kind === 'blocked') {
        tab.error = { title: "This address can't be opened", detail: `Links starting with "${p.scheme}:" don't load here. Use an address that starts with http:// or https://.` };
        renderView(tab); render(); return;
      }
      if (push) { tab.entries = tab.entries.slice(0, tab.index + 1); tab.entries.push(p.url); tab.index = tab.entries.length - 1; }
      show(tab);
    }
    function show(tab) {
      const url = cur(tab);
      clearTimeout(tab.timer);
      tab.error = null; tab.slow = false;
      if (url === NEWTAB) {
        tab.loading = false; tab.title = 'New tab';
        if (tab.frame) { tab.frame.src = 'about:blank'; tab.frame.remove(); tab.frame = null; }
        renderView(tab); render(); return;
      }
      let target;
      try { target = BrowserNet.resolve(url); }
      catch (err) { tab.loading = false; tab.error = { title: err.message || "This page couldn't be loaded", detail: err.hint || 'Check the address and try again.' }; renderView(tab); render(); return; }
      if (!isHttpUrl(target)) { tab.loading = false; tab.error = { title: "This page couldn't be loaded", detail: 'The connection setting produced an invalid address. Check Settings › Browser.' }; renderView(tab); render(); return; }
      tab.loading = true; tab.title = labelFor(url);
      if (!tab.frame) {
        tab.frame = h('iframe', {
          title: 'Page content', referrerpolicy: 'no-referrer',
          sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads',
          allow: 'fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write',
        });
        const frame = tab.frame;
        frame.addEventListener('load', () => {
          // Ignore the initial about:blank load a new iframe fires when it's attached.
          if (tab.frame !== frame || !frame.getAttribute('src') || frame.src === 'about:blank' || !tab.loading) return;
          clearTimeout(tab.timer);
          tab.loading = false; tab.slow = false;
          History.add(cur(tab), tab.title);
          status.textContent = `${tab.title} loaded`;
          renderView(tab); render();
        });
        frame.addEventListener('error', () => { tab.loading = false; tab.error = { title: "This page couldn't be loaded", detail: 'The connection failed. Check your internet connection and try again.' }; renderView(tab); render(); });
      }
      tab.frame.src = target;
      renderView(tab);
      tab.timer = setTimeout(() => { if (tab.loading) { tab.slow = true; render(); } }, 15000);
      render();
    }
    function go(d) {
      const t = active;
      if (!t) return;
      const ni = t.index + d;
      if (ni < 0 || ni >= t.entries.length) return;
      t.index = ni;
      show(t);
    }
    function reloadOrStop() {
      const t = active;
      if (!t) return;
      if (t.loading && t.frame) { t.frame.src = 'about:blank'; t.loading = false; clearTimeout(t.timer); render(); return; }
      show(t);
    }
    function goHome() { const u = homeUrl(); navigate(active, u === NEWTAB ? { kind: 'internal', url: u } : { kind: 'web', url: u }); }
    function openExternal() {
      const u = cur(active);
      if (!isHttpUrl(u)) { ctx.notify('Nothing to open', 'Open a web page first, then use this button to open it in a separate browser tab.'); return; }
      const w = window.open(u, '_blank', 'noopener,noreferrer');
      if (!w) ctx.notify('Pop-up blocked', 'Allow pop-ups for this site to open pages in a separate tab.');
    }
    function toggleFs() {
      if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
      const r = ctx.el.requestFullscreen && ctx.el.requestFullscreen();
      if (r && r.catch) r.catch(() => ctx.notify("Full screen isn't available", 'This browser blocked full screen for this page.'));
    }

    function renderView(tab) {
      const url = cur(tab);
      [...tab.view.children].forEach(c => { if (c !== tab.frame) c.remove(); });
      if (tab.error) {
        tab.view.append(h('div', { class: 'err' }, h('div', { class: 'app-error', role: 'alert' },
          h('h2', { text: tab.error.title }), h('p', { text: tab.error.detail }),
          h('div', { class: 'row' },
            h('button', { class: 'btn primary', type: 'button', text: 'Try again', onclick: ctx.guard(() => show(tab)) }),
            isHttpUrl(url) ? h('button', { class: 'btn', type: 'button', text: 'Open in new tab', onclick: ctx.guard(openExternal) }) : null))));
        return;
      }
      if (url === NEWTAB) { tab.view.append(newTabPage(tab)); return; }
      if (tab.frame && !tab.frame.isConnected) tab.view.append(tab.frame);
    }

    /* New tab page: time, greeting, search, shortcuts, recent sites. */
    function newTabPage(tab) {
      const engine = ENGINES[Settings.get('searchEngine')];
      const q = h('input', { type: 'search', 'aria-label': `Search with ${engine.name} or enter address`, placeholder: `Search ${engine.name} or type an address`, autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go' });
      const form = h('form', { role: 'search', class: 'ntp-search' }, h('label', { class: 'search' }, h('span', { svg: ICONS.search }), q, h('span', { class: 'kbd', text: '↵' })));
      form.addEventListener('submit', ctx.guard(e => { e.preventDefault(); const p = parseInput(q.value); if (p) navigate(tab, p); }));
      const now = new Date();
      const user = Account.user;
      const recent = Settings.get('saveHistory') ? History.list().slice(0, 6) : [];
      const tiles = Shortcuts.map(sc => h('button', { class: 'ntp-sc', type: 'button', 'aria-label': `Open ${sc.name}`, onclick: ctx.guard(() => navigate(tab, { kind: 'web', url: sc.url })) }, shortcutTile(sc, 'lg'), h('span', { text: sc.name })));
      return h('div', { class: 'ntp scroll' },
        h('div', { class: 'ntp-in' },
          h('div', { class: 'ntp-time tnum', text: fmtTime(now, false) }),
          h('h1', { class: 'ntp-greet', text: user ? `${greeting(now)}, ${user.name}.` : `${greeting(now)}.` }),
          form,
          tiles.length ? h('section', { class: 'ntp-sec', 'aria-label': 'Shortcuts' }, h('div', { class: 'ntp-scs' }, tiles)) : null,
          h('section', { class: 'ntp-sec', 'aria-labelledby': `rec-${tab.id}` },
            h('h2', { id: `rec-${tab.id}`, text: 'Recent' }),
            recent.length ? h('div', { class: 'ntp-recent' }, recent.map(r => h('button', { type: 'button', class: 'ntp-rec', title: r.url, onclick: ctx.guard(() => navigate(tab, { kind: 'web', url: r.url })) },
              siteIcon(r.url), h('span', null, h('b', { text: labelFor(r.url) }), h('small', { text: hostOf(r.url) })))))
              : h('p', { class: 'ntp-note', text: Settings.get('saveHistory') ? 'Sites you visit will show up here.' : 'History is off. Turn it on in Settings › Browser to see recent sites here.' }))));
    }

    /* ---------- Bookmarks ---------- */
    function toggleBookmark() {
      const u = cur(active);
      if (!isHttpUrl(u)) { ctx.notify('Nothing to bookmark', 'Open a web page first.'); return; }
      Bookmarks.toggle(u, active.title || labelFor(u));
    }
    function renderBookmarks() {
      const on = Settings.get('showBookmarks');
      bookmarksBar.hidden = !on;
      if (!on) return;
      const list = Bookmarks.list();
      if (!list.length) { bookmarksBar.replaceChildren(h('span', { class: 'br-bm-empty', text: 'Bookmark a page with the star to pin it here.' })); return; }
      bookmarksBar.replaceChildren(...list.map((b, idx) => {
        const el = h('button', { class: 'br-bm', type: 'button', draggable: 'true', title: b.title + ' — ' + b.url, 'data-i': idx, onclick: ctx.guard(() => navigate(active, { kind: 'web', url: b.url })) },
          siteIcon(b.url), h('span', { class: 'br-bm-t', text: b.title }));
        el.addEventListener('contextmenu', e => { e.preventDefault(); bookmarkMenu(el, b); });
        let lp = 0;
        el.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') lp = setTimeout(() => bookmarkMenu(el, b), 550); });
        el.addEventListener('pointerup', () => clearTimeout(lp));
        el.addEventListener('pointercancel', () => clearTimeout(lp));
        el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', String(idx)); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
        el.addEventListener('dragend', () => el.classList.remove('dragging'));
        el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
        el.addEventListener('drop', e => { e.preventDefault(); const from = +e.dataTransfer.getData('text/plain'); if (!isNaN(from) && from !== idx) Bookmarks.reorder(from, idx); });
        return el;
      }));
    }
    function bookmarkMenu(anchor, b) {
      brMenu(anchor, [
        { icon: h('span', { class: 'site-ico', svg: ICONS.external }), label: 'Open', run: () => navigate(active, { kind: 'web', url: b.url }) },
        { icon: h('span', { class: 'site-ico', svg: ICONS.sliders }), label: 'Rename', run: () => { const name = prompt('Bookmark name', b.title); if (name != null) Bookmarks.rename(b.url, name.trim() || b.title); } },
        { icon: h('span', { class: 'site-ico', svg: ICONS.trash }), label: 'Delete', danger: true, run: () => Bookmarks.remove(b.url) },
      ]);
    }
    /* A small floating menu used by bookmarks and recently-closed. */
    function brMenu(anchor, items) {
      root.querySelectorAll('.br-menu').forEach(m => m.remove());
      const r = anchor.getBoundingClientRect(), base = root.getBoundingClientRect();
      const menu = h('div', { class: 'br-menu', role: 'menu' }, items.map(it => h('button', { class: 'br-menu-item' + (it.danger ? ' danger' : ''), type: 'button', role: 'menuitem', disabled: it.disabled || false, onclick: () => { menu.remove(); if (it.run) it.run(); } }, it.icon || null, h('span', { class: 'br-menu-t', text: it.label }))));
      root.append(menu);
      menu.style.top = Math.round(Math.min(r.bottom - base.top + 4, base.height - menu.offsetHeight - 8)) + 'px';
      menu.style.left = Math.round(Math.min(r.left - base.left, base.width - menu.offsetWidth - 8)) + 'px';
      const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', close, true); } };
      setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
      const first = menu.querySelector('button:not([disabled])'); if (first) first.focus();
    }

    function render() {
      tabsEl.replaceChildren(...tabs.map(t => {
        const isA = t === active, url = cur(t);
        const lbl = t.error ? 'Error' : t.title;
        return h('div', { class: 'br-tab' + (isA ? ' active' : '') + (t.loading ? ' loading' : '') },
          t.loading ? h('span', { class: 'spinner', 'aria-hidden': 'true' }) : url === NEWTAB ? h('span', { class: 'site-ico', 'aria-hidden': 'true', svg: ICONS.sparkle }) : siteIcon(url),
          h('button', { class: 't', type: 'button', role: 'tab', 'aria-selected': String(isA), title: lbl, text: lbl, onclick: ctx.guard(() => select(t)) }),
          h('button', { class: 'x', type: 'button', 'aria-label': `Close tab ${lbl}`, title: 'Close tab', svg: ICONS.close, onclick: ctx.guard(e => { e.stopPropagation(); closeTab(t); }) }));
      }));
      const t = active, url = cur(t);
      backBtn.disabled = !t || t.index <= 0;
      fwdBtn.disabled = !t || t.index >= t.entries.length - 1;
      reloadBtn.innerHTML = t && t.loading ? ICONS.stop : ICONS.reload;
      reloadBtn.setAttribute('aria-label', t && t.loading ? 'Stop loading' : 'Reload');
      reloadBtn.title = t && t.loading ? 'Stop loading' : 'Reload';
      extBtn.disabled = !isHttpUrl(url);
      if (document.activeElement !== addr) addr.value = labelFor(url);
      addrIcon.innerHTML = url && url.startsWith('https://') ? ICONS.lock : ICONS.search;
      const marked = isHttpUrl(url) && Bookmarks.has(url);
      starBtn.disabled = !isHttpUrl(url);
      starBtn.classList.toggle('on', marked);
      starBtn.innerHTML = marked ? ICONS.starFill : ICONS.star;
      starBtn.setAttribute('aria-label', marked ? 'Remove bookmark' : 'Bookmark this page');
      starBtn.title = marked ? 'Remove bookmark' : 'Bookmark this page';
      // Restart the progress animation for each new load.
      const loading = !!(t && t.loading);
      if (loading && !progress.classList.contains('on')) { progress.classList.remove('done'); void progress.offsetWidth; progress.classList.add('on'); }
      if (!loading && progress.classList.contains('on')) { progress.classList.remove('on'); progress.classList.add('done'); }
      // Honest status bar about what this connection mode can and can't do.
      const direct = Settings.get('transport') === 'direct';
      let msg = null;
      if (t && t.slow) msg = 'This page is taking a long time. It may be blocking being shown inside another page.';
      else if (t && direct && isHttpUrl(url) && !t.error && Settings.get('embedHint') && !t.hintOff) msg = 'Blank page? Many sites refuse to be shown inside other pages. Direct mode can’t get around that.';
      hint.hidden = !msg;
      if (msg) hint.replaceChildren(h('span', { class: 'br-hint-ico', svg: ICONS.info }), h('span', { class: 'br-hint-t', text: msg }),
        h('button', { class: 'btn sm', type: 'button', onclick: ctx.guard(openExternal) }, h('span', { svg: ICONS.external }), 'Open in new tab'),
        h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Dismiss tip', title: 'Dismiss', svg: ICONS.close, onclick: ctx.guard(() => { t.hintOff = true; t.slow = false; render(); }) }));
      ctx.setTitle(t ? (url === NEWTAB ? 'Browser' : `${t.title} – Browser`) : 'Browser');
    }

    const refreshNewTabs = () => tabs.filter(t => cur(t) === NEWTAB && !t.error).forEach(renderView);
    off.push(Bus.on('settings', ({ key }) => {
      if (['searchEngine', 'saveHistory', '*', 'history', 'clock24'].includes(key)) refreshNewTabs();
      if (['showBookmarks', '*'].includes(key)) renderBookmarks();
      render();
    }));
    off.push(Bus.on('bookmarks', () => { renderBookmarks(); render(); }));
    off.push(Bus.on('account', refreshNewTabs));
    off.push(Bus.on('tick', d => { for (const el of root.querySelectorAll('.ntp-time')) el.textContent = fmtTime(d, false); }));

    renderBookmarks();
    newTab((ctx.args && ctx.args.url) || (Settings.get('homepage') || undefined));
    return {
      handleArgs: (a) => { if (a && a.url) newTab(a.url); },
      destroy: () => { ctx.el.removeEventListener('keydown', onKey); off.forEach(f => f()); tabs.forEach(t => { clearTimeout(t.timer); if (t.frame) t.frame.src = 'about:blank'; }); },
    };
  },
});
