/* Browser app: tabs, address bar, new tab page. Pages load through BrowserNet. */
import { h, uid, isHttpUrl, isMobile, Bus } from '../core.js';
import { ICONS, MARK } from '../icons.js';
import { registerApp } from '../apps.js';
import { Settings, ENGINES, BrowserNet } from '../settings.js';
import { History, parseInput, displayUrl, labelFor, hostOf } from '../web.js';
import { Mode } from '../shell.js';

/* ---------- App: Browser ---------- */
registerApp({
  id: 'browser', name: 'Browser', description: 'Browse the web in tabs', icon: ICONS.globe, tint: '#9db4ff', size: [1040, 680],
  mount(root, ctx) {
    const tabs = [];
    let active = null;
    const off = [];

    const tabsEl = h('div', { class: 'br-tabs', role: 'tablist', 'aria-label': 'Tabs' });
    const newBtn = h('button', { class: 'br-new', 'aria-label': 'New tab', title: 'New tab', svg: ICONS.plus, onclick: ctx.guard(() => newTab()) });
    const backBtn = h('button', { class: 'ibtn', 'aria-label': 'Back', title: 'Back', svg: ICONS.back, onclick: ctx.guard(() => go(-1)) });
    const fwdBtn = h('button', { class: 'ibtn', 'aria-label': 'Forward', title: 'Forward', svg: ICONS.fwd, onclick: ctx.guard(() => go(1)) });
    const reloadBtn = h('button', { class: 'ibtn', 'aria-label': 'Reload', title: 'Reload', svg: ICONS.reload, onclick: ctx.guard(() => reloadOrStop()) });
    const homeBtn = h('button', { class: 'ibtn opt', 'aria-label': 'Home', title: 'Home', svg: ICONS.home, onclick: ctx.guard(() => goHome()) });
    const addrIcon = h('span', { svg: ICONS.search });
    const addr = h('input', { type: 'text', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Address or search', placeholder: 'Search or enter address', enterkeyhint: 'go' });
    const addrForm = h('form', { class: 'br-addr', role: 'search' }, addrIcon, addr);
    const extBtn = h('button', { class: 'ibtn', 'aria-label': 'Open in a new browser tab', title: 'Open in a new browser tab', svg: ICONS.external, onclick: ctx.guard(() => openExternal()) });
    const fsBtn = h('button', { class: 'ibtn opt', 'aria-label': 'Full screen', title: 'Full screen', svg: ICONS.expand, onclick: ctx.guard(() => toggleFs()) });
    if (!document.fullscreenEnabled) fsBtn.hidden = true;
    const hint = h('div', { class: 'br-hint', role: 'note' });
    const progress = h('div', { class: 'br-progress', 'aria-hidden': 'true' });
    const views = h('div', { class: 'br-views' });

    root.append(h('div', { class: 'br' },
      h('div', { class: 'row', style: 'flex-wrap:nowrap;gap:0' }, tabsEl, newBtn),
      h('div', { class: 'br-bar' }, backBtn, fwdBtn, reloadBtn, homeBtn, addrForm, extBtn, fsBtn),
      progress, hint, views));

    addrForm.addEventListener('submit', ctx.guard(e => {
      e.preventDefault();
      const p = parseInput(addr.value);
      if (p) { navigate(active, p); addr.blur(); }
    }));
    addr.addEventListener('focus', () => { addr.value = displayUrl(cur(active)); addr.select(); });
    addr.addEventListener('blur', () => { addr.value = labelFor(cur(active)); });
    addr.addEventListener('keydown', e => { if (e.key === 'Escape') addr.blur(); });
    root.addEventListener('keydown', ctx.guard(e => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); addr.focus(); }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    }));

    function cur(tab) { return (tab && tab.entries[tab.index]) || 'nyx://newtab'; }
    function homeUrl() { return Settings.get('homepage') || 'nyx://newtab'; }

    function newTab(url, activate = true) {
      const tab = { id: uid(), title: 'New tab', entries: [], index: -1, loading: false, error: null, slow: false, frame: null, view: h('div', { class: 'br-view', role: 'tabpanel', hidden: true }), timer: 0, hintOff: false };
      views.append(tab.view);
      tabs.push(tab);
      if (activate) select(tab);
      const p = url ? parseInput(url) : null;
      navigate(tab, p || { kind: 'internal', url: 'nyx://newtab' });
      if (activate && cur(tab) === 'nyx://newtab') setTimeout(() => { const q = tab.view.querySelector('input'); if (q && !isMobile()) q.focus(); }, 50);
      return tab;
    }
    function closeTab(tab) {
      const i = tabs.indexOf(tab);
      if (i < 0) return;
      clearTimeout(tab.timer);
      if (tab.frame) tab.frame.src = 'about:blank';
      tab.view.remove();
      tabs.splice(i, 1);
      if (!tabs.length) { if (Mode.current === 'browser') newTab(); else ctx.close(); return; }
      if (active === tab) select(tabs[Math.min(i, tabs.length - 1)]);
      else render();
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
      if (url === 'nyx://newtab') {
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
        });
        const frame = tab.frame;
        frame.addEventListener('load', () => {
          if (tab.frame !== frame || frame.src === 'about:blank' || !tab.loading) return;
          clearTimeout(tab.timer);
          tab.loading = false; tab.slow = false;
          History.add(cur(tab), tab.title);
          renderView(tab); render();
        });
        frame.addEventListener('error', () => { tab.loading = false; tab.error = { title: "This page couldn't be loaded", detail: 'The connection failed. Check your internet connection and try again.' }; renderView(tab); render(); });
      }
      renderView(tab);
      tab.frame.src = target;
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
    function goHome() { const u = homeUrl(); navigate(active, u === 'nyx://newtab' ? { kind: 'internal', url: u } : { kind: 'web', url: u }); }
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
            h('button', { class: 'btn primary', text: 'Try again', onclick: ctx.guard(() => show(tab)) }),
            isHttpUrl(url) ? h('button', { class: 'btn', text: 'Open in new tab', onclick: ctx.guard(openExternal) }) : null))));
        return;
      }
      if (url === 'nyx://newtab') { tab.view.append(newTabPage(tab)); return; }
      if (tab.frame && !tab.frame.isConnected) tab.view.append(tab.frame);
    }
    function newTabPage(tab) {
      const engine = ENGINES[Settings.get('searchEngine')];
      const q = h('input', { type: 'search', 'aria-label': `Search with ${engine.name} or enter address`, placeholder: `Search ${engine.name} or type an address`, autocomplete: 'off', enterkeyhint: 'go' });
      const form = h('form', { role: 'search' }, h('label', { class: 'search' }, h('span', { svg: ICONS.search }), q));
      form.addEventListener('submit', ctx.guard(e => { e.preventDefault(); const p = parseInput(q.value); if (p) navigate(tab, p); }));
      const recent = Settings.get('saveHistory') ? History.list().slice(0, 6) : [];
      return h('div', { class: 'ntp' },
        h('h1', null, h('span', { svg: MARK }), h('span', { class: 'wordmark' }, h('span', { class: 'wm-nyx', text: 'Nyx' }), h('span', { class: 'wm-os', text: 'OS' }))),
        form,
        recent.length ? h('div', { class: 'recent' }, h('h2', { text: 'Recently visited' }),
          recent.map(r => h('button', { onclick: ctx.guard(() => navigate(tab, { kind: 'web', url: r.url })) },
            h('b', { text: labelFor(r.url) }), h('small', { text: hostOf(r.url) })))) :
          h('p', { class: 'note', text: Settings.get('saveHistory') ? 'Pages you visit will show up here.' : 'History is off. Turn it on in Settings › Browser to see recent pages here.' }));
    }

    function render() {
      tabsEl.replaceChildren(...tabs.map(t => {
        const isA = t === active;
        const lbl = t.error ? 'Error' : t.title;
        return h('div', { class: 'br-tab' + (isA ? ' active' : '') },
          t.loading ? h('span', { class: 'spin', 'aria-hidden': 'true' }) : null,
          h('button', { class: 't', role: 'tab', 'aria-selected': String(isA), title: lbl, text: lbl, onclick: ctx.guard(() => select(t)) }),
          h('button', { class: 'x', 'aria-label': `Close tab ${lbl}`, title: 'Close tab', svg: ICONS.close, onclick: ctx.guard(e => { e.stopPropagation(); closeTab(t); }) }));
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
      progress.replaceChildren(...(t && t.loading ? [h('i')] : []));
      // Honest status bar about what this connection mode can and can't do.
      const direct = Settings.get('transport') === 'direct';
      let msg = null;
      if (t && t.slow) msg = 'This page is taking a long time. It may be blocking being shown inside another page.';
      else if (t && direct && isHttpUrl(url) && !t.error && Settings.get('embedHint') && !t.hintOff) msg = 'Blank page? Many sites refuse to be shown inside other pages. Direct mode can\u2019t get around that.';
      hint.hidden = !msg;
      if (msg) hint.replaceChildren(h('span', { text: msg }),
        h('button', { class: 'btn', text: 'Open in new tab', onclick: ctx.guard(openExternal) }),
        h('button', { class: 'btn', text: 'Dismiss', onclick: ctx.guard(() => { t.hintOff = true; t.slow = false; render(); }) }));
      ctx.setTitle(t ? (url === 'nyx://newtab' ? 'Browser' : `${t.title} \u2013 Browser`) : 'Browser');
    }

    off.push(Bus.on('settings', ({ key }) => {
      if (['searchEngine', 'saveHistory', '*', 'history'].includes(key)) tabs.filter(t => cur(t) === 'nyx://newtab' && !t.error).forEach(renderView);
      render();
    }));

    newTab((ctx.args && ctx.args.url) || (Settings.get('homepage') || undefined));
    return {
      handleArgs: (a) => { if (a && a.url) newTab(a.url); },
      destroy: () => { off.forEach(f => f()); tabs.forEach(t => { clearTimeout(t.timer); if (t.frame) t.frame.src = 'about:blank'; }); },
    };
  },
});

