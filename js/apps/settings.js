/* Settings app. Every option maps to a key in SCHEMA (settings.js). */
import { h, Store, Bus } from '../core.js';
import { ICONS, MARK } from '../icons.js';
import { registerApp } from '../apps.js';
import { Settings, ENGINES, BrowserNet, WALLPAPERS, ACCENTS } from '../settings.js';
import { History } from '../web.js';
import { Customize } from '../customize.js';
import { Launch } from '../launch.js';

/* ---------- App: Settings ---------- */
registerApp({
  id: 'settings', name: 'Settings', description: 'Appearance, desktop, browser and data', icon: ICONS.sliders, tint: '#c9cdd8', size: [860, 600],
  mount(root, ctx) {
    const save = (key, value, msgEl) => {
      try { Settings.set(key, value); if (msgEl) { msgEl.textContent = ''; msgEl.className = 'msg'; } return true; }
      catch (err) { if (msgEl) { msgEl.textContent = err.message; msgEl.className = 'msg err'; } else ctx.notify("Setting wasn't changed", err.message); return false; }
    };
    const lbl = (title, desc) => h('div', { class: 'lbl' }, h('b', { text: title }), desc ? h('small', { text: desc }) : null);
    const toggle = (key, title, desc) => {
      const sw = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(Settings.get(key)), 'aria-label': title });
      sw.addEventListener('click', () => { if (save(key, !Settings.get(key))) sw.setAttribute('aria-checked', String(Settings.get(key))); });
      return h('div', { class: 'srow' }, lbl(title, desc), sw);
    };
    const segmented = (key, title, desc, opts) => {
      const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': title });
      const draw = () => seg.replaceChildren(...opts.map(([v, n]) => h('button', { role: 'radio', 'aria-checked': String(Settings.get(key) === v), text: n, onclick: () => { if (save(key, v)) draw(); } })));
      draw();
      return h('div', { class: 'srow' }, lbl(title, desc), seg);
    };
    const select = (key, title, desc, opts) => {
      const s = h('select', { class: 'select', 'aria-label': title }, opts.map(([v, n]) => h('option', { value: v, text: n, selected: Settings.get(key) === v })));
      s.addEventListener('change', () => { if (!save(key, s.value)) s.value = Settings.get(key); });
      return h('div', { class: 'srow' }, lbl(title, desc), s);
    };
    const urlField = (key, title, desc, placeholder, emptyLabel) => {
      const input = h('input', { class: 'field', type: 'url', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', placeholder, value: Settings.get(key), 'aria-label': title, style: 'flex:1' });
      const msg = h('p', { class: 'msg', 'aria-live': 'polite' });
      const form = h('form', { class: 'row' }, input, h('button', { class: 'btn primary', type: 'submit', text: 'Save' }),
        h('button', { class: 'btn', type: 'button', text: emptyLabel, onclick: () => { input.value = ''; if (save(key, '', msg)) { msg.textContent = 'Cleared.'; msg.className = 'msg ok'; } } }));
      form.addEventListener('submit', e => {
        e.preventDefault();
        let v = input.value.trim();
        if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
        if (v && !isHttpUrl(v)) { msg.textContent = 'Enter a full web address, like https://example.com'; msg.className = 'msg err'; return; }
        input.value = v;
        if (save(key, v, msg)) { msg.textContent = 'Saved.'; msg.className = 'msg ok'; }
      });
      return h('div', { class: 'srow stack' }, lbl(title, desc), form, msg);
    };
    const group = (title, ...rows) => [title ? h('h3', { class: 'group-title', text: title }) : null, h('div', { class: 'group' }, rows)];
    const confirmBtn = (text, confirmText, fn, cls = 'btn danger') => {
      const b = h('button', { class: cls, text });
      let armed = false, t = 0;
      b.addEventListener('click', () => {
        if (!armed) { armed = true; b.textContent = confirmText; t = setTimeout(() => { armed = false; b.textContent = text; }, 4000); return; }
        clearTimeout(t); armed = false; b.textContent = text; fn();
      });
      return b;
    };

    const SECTIONS = [
      { id: 'appearance', name: 'Appearance', icon: ICONS.paint, render: () => [
        h('h2', { text: 'Appearance' }), h('p', { class: 'lede', text: 'Theme, accent color and visual effects.' }),
        group(null,
          h('div', { class: 'srow' }, lbl('Customize', 'Theme, accent, wallpaper and dot animation in one place, with a live preview.'),
            h('button', { class: 'btn', type: 'button', 'data-customize': '', text: 'Customize', onclick: () => Customize.open() })),
          segmented('theme', 'Theme', 'Auto follows your device setting.', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]),
          (() => {
            const sw = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Accent color' });
            const draw = () => sw.replaceChildren(...ACCENTS.map(a => h('button', { class: 'swatch', role: 'radio', style: `background:${a.v}`, 'aria-label': a.n, title: a.n, 'aria-checked': String(Settings.get('accent') === a.v), onclick: () => { if (save('accent', a.v)) draw(); } })));
            draw();
            return h('div', { class: 'srow stack' }, lbl('Accent color', 'Used for buttons, focus rings and highlights.'), sw);
          })(),
          toggle('glass', 'Translucent windows', 'Blur the desktop behind windows and panels. Turn off for better performance.'),
          toggle('reduceMotion', 'Reduce motion', 'Turn off window and panel animations.')),
      ] },
      { id: 'desktop', name: 'Desktop', icon: ICONS.monitor, render: () => [
        h('h2', { text: 'Desktop' }), h('p', { class: 'lede', text: 'Wallpaper, desktop icons and the taskbar clock.' }),
        h('h3', { class: 'group-title', text: 'Wallpaper' }),
        (() => {
          const g = h('div', { class: 'walls', role: 'radiogroup', 'aria-label': 'Wallpaper', style: 'margin-bottom:18px' });
          const draw = () => g.replaceChildren(...WALLPAPERS.map(w => {
            const sample = h('i', { 'data-wall': w.id });
            return h('button', { class: 'wall', role: 'radio', 'aria-checked': String(Settings.get('wallpaper') === w.id), onclick: () => { if (save('wallpaper', w.id)) draw(); } }, sample, w.name);
          }));
          draw();
          return g;
        })(),
        group('Desktop', toggle('desktopIcons', 'Show desktop icons', 'App shortcuts in the top-left corner.'),
          toggle('dotMotion', 'Animate dot field', 'Dots lift toward your pointer on the OLED dots wallpaper. Turns off automatically on low-power phones and when reduced motion is on.')),
        group('Clock', toggle('clock24', '24-hour time'), toggle('clockSeconds', 'Show seconds'), toggle('showDate', 'Show date', 'Hidden automatically on small screens.')),
      ] },
      { id: 'browser', name: 'Browser', icon: ICONS.globe, render: () => {
        const t = BrowserNet.transports;
        const histMsg = h('p', { class: 'msg', 'aria-live': 'polite' });
        return [
          h('h2', { text: 'Browser' }), h('p', { class: 'lede', text: 'Search, home page, history and how pages are loaded.' }),
          group('Search and home',
            select('searchEngine', 'Search engine', 'Used when you type something that isn\u2019t an address.', Object.entries(ENGINES).map(([k, e]) => [k, e.name])),
            urlField('homepage', 'Home page', 'Leave empty to use the new tab page.', 'https://example.com', 'Use new tab')),
          group('History',
            toggle('saveHistory', 'Save browsing history', 'Stored only in this browser. Used for the recent list on new tabs.'),
            h('div', { class: 'srow' }, lbl('Clear history', `${History.list().length} saved pages.`),
              h('div', { class: 'row' }, histMsg, confirmBtn('Clear history', 'Tap again to clear', () => { History.clear(); Bus.emit('settings', { key: 'history' }); histMsg.textContent = 'History cleared.'; histMsg.className = 'msg ok'; })))),
          group('Connection',
            select('transport', 'Connection mode', t[Settings.get('transport')] ? t[Settings.get('transport')].description : '', Object.entries(t).map(([k, v]) => [k, v.label])),
            urlField('proxyPrefix', 'Proxy server address', 'Only used in \u201cYour proxy server\u201d mode. The page address is appended, URL-encoded. Use a server you run or trust: it sees every page you load.', 'https://your-server.example/proxy/', 'Clear'),
            toggle('embedHint', 'Show blank-page tip', 'The note under the address bar explaining why some sites stay blank.')),
        ];
      } },
      { id: 'launch', name: 'Launch', icon: ICONS.external, render: () => {
        const msg = h('p', { class: 'msg', 'aria-live': 'polite' });
        const openBtn = h('button', { class: 'btn primary', type: 'button', text: 'Open in about:blank', disabled: Launch.framed, onclick: () => {
          if (Launch.open()) { msg.textContent = 'Opened in a new tab.'; msg.className = 'msg ok'; }
          else { msg.textContent = 'Pop-ups are blocked. Allow pop-ups for this site, then try again.'; msg.className = 'msg err'; }
        } });
        return [
          h('h2', { text: 'Launch' }), h('p', { class: 'lede', text: 'Run NyxOS inside an about:blank tab, so its real address doesn\u2019t show in that tab\u2019s address bar.' }),
          group(null,
            h('div', { class: 'srow' }, lbl('Open in about:blank', Launch.framed ? 'Already running inside an about:blank tab or another page.' : 'Opens a new tab at about:blank with this site filling it. Your browser may ask you to allow pop-ups.'),
              h('div', { class: 'row' }, msg, openBtn)),
            toggle('askLaunch', 'Ask on launch', 'When the site loads, show a prompt with a button to open it in about:blank. Never shown inside the about:blank tab.')),
        ];
      } },
      { id: 'notifications', name: 'Notifications', icon: ICONS.bell, render: () => [
        h('h2', { text: 'Notifications' }), h('p', { class: 'lede', text: 'Pop-up messages from apps and the system.' }),
        group(null,
          toggle('notifications', 'Show pop-ups', 'When off, notifications still collect in the bell menu on the taskbar.'),
          h('div', { class: 'srow' }, lbl('Test', 'Send a sample notification.'), h('button', { class: 'btn', text: 'Send test', onclick: () => ctx.notify('Test notification', 'Notifications are working.') }))),
      ] },
      { id: 'data', name: 'Data', icon: ICONS.db, render: () => {
        const msg = h('p', { class: 'msg', 'aria-live': 'polite' });
        const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
        file.addEventListener('change', () => {
          const f = file.files && file.files[0];
          if (!f) return;
          if (f.size > 200000) { msg.textContent = 'That file is too large to be a settings file.'; msg.className = 'msg err'; return; }
          const r = new FileReader();
          r.onload = () => {
            try {
              const res = Settings.import(JSON.parse(String(r.result)));
              msg.textContent = `Imported ${res.applied} settings${res.skipped ? `, skipped ${res.skipped} that didn\u2019t match` : ''}.`; msg.className = 'msg ok';
            } catch (err) { msg.textContent = err instanceof SyntaxError ? 'That file isn\u2019t valid JSON.' : err.message; msg.className = 'msg err'; }
            file.value = '';
          };
          r.onerror = () => { msg.textContent = 'The file couldn\u2019t be read.'; msg.className = 'msg err'; };
          r.readAsText(f);
        });
        const exportSettings = () => {
          const blob = new Blob([JSON.stringify({ app: 'NyxOS', version: 1, settings: Settings.values }, null, 2)], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: 'nyxos-settings.json' });
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          msg.textContent = 'Settings exported.'; msg.className = 'msg ok';
        };
        return [
          h('h2', { text: 'Data' }), h('p', { class: 'lede', text: `Everything is stored in this browser only. About ${Math.max(1, Math.round(Store.bytes() / 1024))} KB in use.` }),
          group('Settings',
            h('div', { class: 'srow' }, lbl('Export settings', 'Download your settings as a file.'), h('button', { class: 'btn', text: 'Export', onclick: exportSettings })),
            h('div', { class: 'srow' }, lbl('Import settings', 'Load settings from an exported file.'), h('button', { class: 'btn', text: 'Import', onclick: () => file.click() }), file),
            h('div', { class: 'srow' }, lbl('Reset settings', 'Put every setting back to its default.'), confirmBtn('Reset', 'Tap again to reset', () => { Settings.reset(); msg.textContent = 'Settings reset.'; msg.className = 'msg ok'; }))),
          group('Everything',
            h('div', { class: 'srow' }, lbl('Erase all data', 'Removes settings and history, then reloads.'), confirmBtn('Erase all', 'Tap again to erase', () => { Store.clearAll(); location.reload(); }))),
          msg,
        ];
      } },
      { id: 'about', name: 'About', icon: ICONS.info, render: () => [
        h('div', { class: 'about-mark' }, h('span', { svg: MARK }), h('div', null, h('b', { class: 'wordmark' }, h('span', { class: 'wm-nyx', text: 'Nyx' }), h('span', { class: 'wm-os', text: 'OS' })), h('small', { text: 'Version 1.0.0' }))),
        h('p', { text: 'NyxOS is a desktop-style web environment named for Nyx, the Greek goddess of night. It runs entirely in your browser as a static site, with no server of its own and no service worker.' }),
        h('p', null, 'Inspired by ', h('a', { href: 'https://github.com/whosrogo/GalaxyV7', target: '_blank', rel: 'noopener noreferrer', text: 'GalaxyV7' }), ' by whosrogo. NyxOS is written from scratch and contains no GalaxyV7 code.'),
        h('p', { text: 'Home screen shortcuts open in the browser. YouTube and TikTok refuse to be shown inside other pages, so in Direct mode use Open in new tab for those.' }),
        h('p', { text: 'In Direct mode the browser embeds pages as they are. It is not a proxy, and sites that block embedding will not display. A proxy server you run can be connected in Settings › Browser.' }),
      ] },
    ];

    let current = (ctx.args && ctx.args.page) || Store.get('settingsPage', 'appearance');
    if (!SECTIONS.some(s => s.id === current)) current = 'appearance';
    const nav = h('nav', { class: 'st-nav', 'aria-label': 'Settings sections' });
    const main = h('div', { class: 'st-main', tabindex: '-1' });
    root.append(h('div', { class: 'st' }, nav, main));

    function show(id, focus) {
      current = id;
      Store.set('settingsPage', id);
      nav.replaceChildren(...SECTIONS.map(s => h('button', { 'aria-current': s.id === id ? 'page' : null, onclick: () => show(s.id, true) }, h('span', { svg: s.icon }), s.name)));
      const sec = SECTIONS.find(s => s.id === id);
      try { main.replaceChildren(...sec.render().flat().filter(x => x != null)); }
      catch (err) { console.error(err); main.replaceChildren(h('div', { class: 'app-error', role: 'alert' }, h('h2', { text: `The ${sec.name} page couldn\u2019t load` }), h('p', { text: err.message }), h('button', { class: 'btn primary', text: 'Try again', onclick: () => show(id) }))); }
      main.scrollTop = 0;
      if (focus) main.focus({ preventScroll: true });
    }
    // Redraw when settings change in bulk (import, reset) or the connection mode changes its description.
    const off = Bus.on('settings', ({ key }) => { if (key === '*' || key === 'transport') show(current); });
    show(current);
    return { handleArgs: a => { if (a && a.page && SECTIONS.some(s => s.id === a.page)) show(a.page); }, destroy: off };
  },
});

