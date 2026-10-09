/* Settings app. Every option maps to a key in SCHEMA (settings.js).
   Desktop: sidebar + page. Phones: a list of sections, then the page. */
import { h, Store, Bus, isMobile } from '../core.js';
import { ICONS, MARK, WORDMARK } from '../icons.js';
import { registerApp } from '../apps.js';
import { Settings, ENGINES, BrowserNet, WALLPAPERS, ACCENTS, FONTS, PRESETS, motionOff } from '../settings.js';
import { setCustomWallpaper, removeCustomWallpaper, hasCustomWallpaper } from '../wallpaper.js';
import { History } from '../web.js';
import { Customize } from '../customize.js';
import { Launch } from '../launch.js';
import { Lock } from '../lock.js';
import { miniDesktop } from '../preview.js';
import { lowPower } from '../dots.js';
import { fmtTime } from '../shell.js';

/* Extra pages other modules can add (e.g. Account). {id, name, icon, after, render(ui)} */
export const extraSections = [];

registerApp({
  id: 'settings', name: 'Settings', description: 'Appearance, desktop, browser, launch and data', icon: ICONS.sliders, tint: '#c9cdd8', size: [920, 640],
  mount(root, ctx) {
    const cleanups = [];
    const save = (key, value, msgEl) => {
      try { Settings.set(key, value); if (msgEl) { msgEl.textContent = ''; msgEl.className = 'msg'; } return true; }
      catch (err) { if (msgEl) { msgEl.textContent = err.message; msgEl.className = 'msg err'; } else ctx.notify("Setting wasn't changed", err.message); return false; }
    };
    const lbl = (title, desc) => h('div', { class: 'lbl' }, h('b', { text: title }), desc ? h('small', { text: desc }) : null);
    const srow = (title, desc, ...ctl) => h('div', { class: 'srow' }, lbl(title, desc), ...ctl);
    const toggle = (key, title, desc) => {
      const sw = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(Settings.get(key)), 'aria-label': title });
      sw.addEventListener('click', () => { if (save(key, !Settings.get(key))) sw.setAttribute('aria-checked', String(Settings.get(key))); });
      return srow(title, desc, sw);
    };
    const segmented = (key, title, desc, opts) => {
      const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': title });
      const draw = () => seg.replaceChildren(...opts.map(([v, n]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(Settings.get(key) === v), text: n, onclick: () => { if (save(key, v)) draw(); } })));
      draw();
      return srow(title, desc, seg);
    };
    const select = (key, title, desc, opts, num = false) => {
      const cur = Settings.get(key);
      const s = h('select', { class: 'select', 'aria-label': title }, opts.map(([v, n]) => h('option', { value: v, text: n, selected: cur === v })));
      s.addEventListener('change', () => { if (!save(key, num ? +s.value : s.value)) s.value = Settings.get(key); });
      return srow(title, desc, s);
    };
    const urlField = (key, title, desc, placeholder, emptyLabel) => {
      const input = h('input', { class: 'field', type: 'url', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', placeholder, value: Settings.get(key), 'aria-label': title, style: 'flex:1' });
      const msg = h('p', { class: 'msg', 'aria-live': 'polite' });
      const form = h('form', { class: 'row nowrap', novalidate: true }, input, h('button', { class: 'btn primary', type: 'submit', text: 'Save' }),
        h('button', { class: 'btn', type: 'button', text: emptyLabel, onclick: () => { input.value = ''; if (save(key, '', msg)) { msg.textContent = 'Cleared.'; msg.className = 'msg ok'; } } }));
      form.addEventListener('submit', e => {
        e.preventDefault();
        let v = input.value.trim();
        if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
        if (v && !isHttp(v)) { msg.textContent = 'Enter a full web address, like https://example.com'; msg.className = 'msg err'; return; }
        input.value = v;
        if (save(key, v, msg)) { msg.textContent = 'Saved.'; msg.className = 'msg ok'; }
      });
      return h('div', { class: 'srow stack' }, lbl(title, desc), form, msg);
    };
    const isHttp = v => { try { const u = new URL(v); return /^https?:$/.test(u.protocol); } catch { return false; } };
    const group = (title, ...rows) => h('section', { class: 'sgroup' }, title ? h('h3', { class: 'group-title', text: title }) : null, h('div', { class: 'group' }, rows));
    const confirmBtn = (text, confirmText, fn, cls = 'btn danger') => {
      const b = h('button', { class: cls, type: 'button', text });
      let armed = false, t = 0;
      b.addEventListener('click', () => {
        if (!armed) { armed = true; b.textContent = confirmText; b.classList.add('armed'); t = setTimeout(() => { armed = false; b.textContent = text; b.classList.remove('armed'); }, 4000); return; }
        clearTimeout(t); armed = false; b.textContent = text; b.classList.remove('armed'); fn();
      });
      return b;
    };
    const head = (title, lede) => h('header', { class: 'st-head' }, h('h2', { text: title }), lede ? h('p', { class: 'lede', text: lede }) : null);
    const ui = { save, lbl, srow, toggle, segmented, select, urlField, group, confirmBtn, head, ctx };

    // Live preview of the look: re-renders as settings change.
    function lookPreview() {
      const pv = miniDesktop({ clock: fmtTime(new Date(), false) });
      const upd = () => pv.update(Settings.values, { motionOff: motionOff() });
      upd();
      const offA = Bus.on('settings', upd);
      cleanups.push(() => { offA(); pv.destroy(); });
      return h('figure', { class: 'st-preview' }, pv.el,
        h('figcaption', null, h('span', { text: 'Live preview' }),
          h('button', { class: 'btn sm', type: 'button', 'data-customize': '', onclick: () => Customize.open() }, h('span', { svg: ICONS.wand }), 'Customize')));
    }
    function accentPicker() {
      const wrap = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Accent color' });
      const picker = h('input', { type: 'color', 'aria-label': 'Custom accent color', title: 'Pick any color' });
      const custom = h('span', { class: 'swatch swatch-custom' }, picker);
      const draw = () => {
        const a = Settings.get('accent'), preset = ACCENTS.some(x => x.v === a);
        wrap.replaceChildren(...ACCENTS.map(x => h('button', { class: 'swatch', type: 'button', role: 'radio', style: `background:${x.v}`, 'aria-label': x.n, title: x.n, 'aria-checked': String(a === x.v), onclick: () => { if (save('accent', x.v)) draw(); } })), custom);
        custom.classList.toggle('on', !preset);
        custom.style.background = preset ? '' : a;
        picker.value = a.toLowerCase();
      };
      picker.addEventListener('change', () => { if (save('accent', picker.value.toLowerCase())) draw(); });
      picker.addEventListener('input', () => { custom.style.background = picker.value; });
      draw();
      return h('div', { class: 'srow stack' }, lbl('Accent color', 'Used sparingly: buttons, focus rings, the active window marker.'), wrap);
    }
    function presetRow() {
      const wrap = h('div', { class: 'presets', role: 'group', 'aria-label': 'Theme presets' },
        PRESETS.map(p => h('button', { class: 'preset', type: 'button', 'data-wall': p.wallpaper, style: `--pa:${p.accent}`, onclick: () => {
          try { Settings.setMany({ theme: p.theme, accent: p.accent, wallpaper: p.wallpaper, font: p.font }); } catch (e) { ctx.notify('Preset not applied', e.message); }
        } }, h('span', { class: 'preset-sw' }), h('span', { text: p.n }))));
      return h('div', { class: 'srow stack' }, lbl('Presets', 'One tap sets theme, accent, wallpaper and font together. Tweak anything after.'), wrap);
    }
    function fontRow() {
      const s = h('select', { class: 'select', 'aria-label': 'Interface font' }, FONTS.map(f => h('option', { value: f.id, text: f.n, selected: Settings.get('font') === f.id })));
      s.addEventListener('change', () => { if (!save('font', s.value)) s.value = Settings.get('font'); });
      return srow('Font', 'The interface typeface. Loaded only when chosen.', s);
    }
    function customWallRow() {
      const msg = h('p', { class: 'msg', 'aria-live': 'polite' });
      const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
      const fit = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Image fit' });
      const removeBtn = h('button', { class: 'btn sm', type: 'button', text: 'Remove', onclick: () => removeCustomWallpaper().then(() => { msg.textContent = 'Removed.'; msg.className = 'msg ok'; refresh(); }) });
      const drawFit = () => fit.replaceChildren(...[['fill', 'Fill'], ['fit', 'Fit']].map(([v, n]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(Settings.get('wallpaperFit') === v), text: n, onclick: () => { if (save('wallpaperFit', v)) drawFit(); } })));
      const row = h('div', { class: 'srow stack' });
      const refresh = () => hasCustomWallpaper().then(has => {
        drawFit();
        row.replaceChildren(lbl('Your image', 'Upload a photo; it’s downscaled and kept in this browser only (up to 10 MB).'),
          h('div', { class: 'row' },
            h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, h('span', { svg: ICONS.external }), has ? 'Replace' : 'Upload'),
            has ? removeBtn : null, has ? fit : null, file),
          msg);
      });
      file.addEventListener('change', () => {
        const f = file.files && file.files[0]; file.value = '';
        if (!f) return;
        msg.textContent = 'Processing…'; msg.className = 'msg';
        setCustomWallpaper(f).then(() => { msg.textContent = 'Wallpaper set.'; msg.className = 'msg ok'; refresh(); })
          .catch(err => { msg.textContent = err.message; msg.className = 'msg err'; });
      });
      refresh();
      return row;
    }
    function clockRow() {
      const out = h('span', { class: 'clock-pv tnum' });
      const upd = () => { const d = new Date(); out.textContent = fmtTime(d) + (Settings.get('showDate') ? ' · ' + d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : ''); };
      upd();
      const t = setInterval(upd, 1000);
      const o = Bus.on('settings', upd);
      cleanups.push(() => { clearInterval(t); o(); });
      return srow('Preview', 'How the clock in the dock looks.', out);
    }

    const SECTIONS = [
      { id: 'appearance', name: 'Appearance', icon: ICONS.paint, render: () => [
        head('Appearance', 'Presets, theme, accent, font and effects.'),
        lookPreview(),
        group('Presets', presetRow()),
        group(null,
          segmented('theme', 'Theme', 'Auto follows your device.', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]),
          accentPicker(),
          toggle('autoAccent', 'Accent from wallpaper', 'Pick the accent from the current wallpaper’s colors.'),
          fontRow(),
          toggle('glass', 'Translucent surfaces', 'Blur what’s behind windows, the dock and panels. Turn off for better performance.'),
          toggle('reduceMotion', 'Reduce motion', 'Turn off window, dock and panel animations and the moving dot field.')),
      ] },
      { id: 'desktop', name: 'Desktop', icon: ICONS.monitor, render: () => [
        head('Desktop', 'Wallpaper, icons and the dock clock.'),
        (() => {
          const g = h('div', { class: 'walls', role: 'radiogroup', 'aria-label': 'Wallpaper' });
          const draw = () => g.replaceChildren(...WALLPAPERS.map(w => h('button', { class: 'wall', type: 'button', role: 'radio', 'aria-checked': String(Settings.get('wallpaper') === w.id), onclick: () => { if (save('wallpaper', w.id)) draw(); } },
            h('i', { 'data-wall': w.id }, h('span', { class: 'wall-check', svg: ICONS.check })), h('span', { text: w.name }))));
          draw();
          return h('section', { class: 'sgroup' }, h('h3', { class: 'group-title', text: 'Wallpaper' }), g);
        })(),
        group('Your image', customWallRow()),
        group('Desktop',
          toggle('desktopIcons', 'Show desktop icons', 'Apps and shortcuts down the left edge. Phones always show the home screen.'),
          toggle('dotMotion', 'Animate the dot field', lowPower ? 'Off automatically on this device to save power.' : 'Dots lift toward your pointer on the Dot field wallpaper. Paused while reduced motion is on.')),
        group('Clock', clockRow(), toggle('clock24', '24-hour time'), toggle('clockSeconds', 'Show seconds'), toggle('showDate', 'Show date', 'Hidden automatically on phones.')),
      ] },
      { id: 'browser', name: 'Browser', icon: ICONS.globe, render: () => {
        const t = BrowserNet.transports;
        const histMsg = h('p', { class: 'msg', 'aria-live': 'polite' });
        return [
          head('Browser', 'Search, home page, history and how pages load.'),
          group('Search and home',
            select('searchEngine', 'Search engine', 'Used when what you type isn’t an address.', Object.entries(ENGINES).map(([k, e]) => [k, e.name])),
            urlField('homepage', 'Home page', 'Leave empty to use the new tab page.', 'https://example.com', 'Use new tab')),
          group('History',
            toggle('saveHistory', 'Save browsing history', 'Stored only in this browser. Feeds the Recent list on new tabs.'),
            srow('Clear history', `${History.list().length} saved pages.`,
              h('div', { class: 'row' }, histMsg, confirmBtn('Clear', 'Tap again to clear', () => { History.clear(); Bus.emit('settings', { key: 'history' }); histMsg.textContent = 'History cleared.'; histMsg.className = 'msg ok'; })))),
          group('Connection',
            select('transport', 'Connection mode', t[Settings.get('transport')] ? t[Settings.get('transport')].description : '', Object.entries(t).map(([k, v]) => [k, v.label])),
            urlField('proxyPrefix', 'Proxy server address', 'Only used in “Your proxy server” mode. The page address is appended, URL-encoded. Use a server you run or trust: it sees every page you load.', 'https://your-server.example/proxy/', 'Clear'),
            toggle('embedHint', 'Show blank-page tip', 'The note under the address bar explaining why some sites stay blank.')),
        ];
      } },
      { id: 'launch', name: 'Launch', icon: ICONS.window, render: () => {
        const msg = h('p', { class: 'msg', 'aria-live': 'polite' });
        const openBtn = h('button', { class: 'btn primary', type: 'button', disabled: Launch.framed, onclick: () => {
          if (Launch.open()) { msg.textContent = 'Opened in a new tab.'; msg.className = 'msg ok'; }
          else { msg.textContent = 'Pop-ups are blocked. Allow pop-ups for this site, then try again.'; msg.className = 'msg err'; }
        } }, h('span', { svg: ICONS.external }), 'Open in about:blank');
        return [
          head('Launch', 'Run NyxOS inside an about:blank tab, so the tab’s address bar shows about:blank instead of this site.'),
          h('div', { class: 'launch-card' },
            h('div', { class: 'launch-pv', 'aria-hidden': 'true' }, h('div', { class: 'launch-url' }, h('span', { svg: ICONS.lock }), 'about:blank'), h('div', { class: 'launch-body', svg: MARK })),
            h('div', { class: 'launch-txt' },
              h('b', { text: Launch.framed ? 'Already running in about:blank' : 'Open in about:blank' }),
              h('small', { text: Launch.framed ? 'This copy is inside an about:blank tab or another page.' : 'Opens a new tab at about:blank with NyxOS filling it. Your browser may ask you to allow pop-ups.' }),
              h('div', { class: 'row' }, openBtn), msg)),
          group(null,
            toggle('askLaunch', 'Ask on launch', 'When NyxOS loads, show a small prompt with a button to open it in about:blank. A click is needed because browsers block pop-ups opened without one. Never shown inside the about:blank tab.')),
        ];
      } },
      { id: 'notifications', name: 'Notifications', icon: ICONS.bell, render: () => [
        head('Notifications', 'Messages from apps and the system.'),
        group(null,
          toggle('notifications', 'Show pop-ups', 'When off, notifications still collect behind the bell in the dock.'),
          srow('Test', 'Send a sample notification.', h('button', { class: 'btn', type: 'button', text: 'Send test', onclick: () => ctx.notify('Test notification', 'Notifications are working.') }))),
      ] },
      { id: 'lock', name: 'Lock', icon: ICONS.lock, render: () => {
        const msg = h('p', { class: 'msg', 'aria-live': 'polite' });
        const pinRow = h('div', { class: 'srow stack' });
        const drawPin = () => {
          const has = Lock.hasPin();
          if (!Lock.pinSupported()) { pinRow.replaceChildren(lbl('PIN', 'This browser can’t store a PIN here (needs a secure page).')); return; }
          const btns = h('div', { class: 'row' },
            h('button', { class: 'btn', type: 'button', text: has ? 'Change PIN' : 'Set a PIN', onclick: setForm }),
            has ? confirmBtn('Remove PIN', 'Tap again to remove', () => { Lock.clearPin(); msg.textContent = 'PIN removed.'; msg.className = 'msg ok'; drawPin(); }, 'btn danger') : null);
          pinRow.replaceChildren(lbl('PIN', has ? 'A 4–6 digit PIN unlocks the screen. It’s a privacy screen, not real security.' : 'Add a 4–6 digit PIN to unlock. It’s a privacy screen, not real security.'), btns);
        };
        const setForm = () => {
          const pin = h('input', { class: 'field', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '6', placeholder: '4–6 digits', 'aria-label': 'New PIN', style: 'flex:1' });
          const pin2 = h('input', { class: 'field', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '6', placeholder: 'Confirm', 'aria-label': 'Confirm PIN', style: 'flex:1' });
          [pin, pin2].forEach(i => i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '').slice(0, 6); }));
          const form = h('form', { class: 'row nowrap' }, pin, pin2,
            h('button', { class: 'btn primary', type: 'submit', text: 'Save' }),
            h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: drawPin }));
          form.addEventListener('submit', async e => {
            e.preventDefault();
            if (pin.value !== pin2.value) { msg.textContent = 'The two PINs don’t match.'; msg.className = 'msg err'; return; }
            try { await Lock.setPin(pin.value); msg.textContent = 'PIN set.'; msg.className = 'msg ok'; drawPin(); }
            catch (err) { msg.textContent = err.message; msg.className = 'msg err'; }
          });
          pinRow.replaceChildren(lbl('PIN', 'Enter a 4–6 digit PIN, twice.'), form);
          setTimeout(() => pin.focus(), 30);
        };
        drawPin();
        return [
          head('Lock', 'A lock screen with a clock over your wallpaper. The PIN is a privacy screen, not real security.'),
          group('Lock now', srow('Lock screen', 'Blur the desktop behind a clock.', h('button', { class: 'btn', type: 'button', onclick: () => Lock.lock() }, h('span', { svg: ICONS.lock }), 'Lock now'))),
          group('Auto-lock', select('idleLock', 'Lock when idle', 'Lock automatically after no activity.', [[0, 'Off'], [5, 'After 5 min'], [15, 'After 15 min'], [30, 'After 30 min']], true)),
          group('PIN', pinRow, msg),
        ];
      } },
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
              msg.textContent = `Imported ${res.applied} settings${res.skipped ? `, skipped ${res.skipped} that didn’t match` : ''}.`; msg.className = 'msg ok';
            } catch (err) { msg.textContent = err instanceof SyntaxError ? 'That file isn’t valid JSON.' : err.message; msg.className = 'msg err'; }
            file.value = '';
          };
          r.onerror = () => { msg.textContent = 'The file couldn’t be read.'; msg.className = 'msg err'; };
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
          head('Data', `Settings and history are stored in this browser only. About ${Math.max(1, Math.round(Store.bytes() / 1024))} KB in use.`),
          msg,
          group('Settings',
            srow('Export settings', 'Download your settings as a file.', h('button', { class: 'btn', type: 'button', text: 'Export', onclick: exportSettings })),
            srow('Import settings', 'Load settings from an exported file.', h('button', { class: 'btn', type: 'button', text: 'Import', onclick: () => file.click() }), file),
            srow('Reset settings', 'Put every setting back to its default.', confirmBtn('Reset', 'Tap again to reset', () => { Settings.reset(); msg.textContent = 'Settings reset.'; msg.className = 'msg ok'; }))),
          group('Everything',
            srow('Erase all data', 'Removes settings and history from this browser, then reloads.', confirmBtn('Erase all', 'Tap again to erase', () => { Store.clearAll(); location.reload(); }))),
        ];
      } },
      { id: 'about', name: 'About', icon: ICONS.info, render: () => [
        h('div', { class: 'about-hero' }, h('span', { class: 'about-mark', svg: MARK }), h('div', null, h('div', { class: 'about-wm', svg: WORDMARK }), h('small', { text: 'Version 1.0.0' }))),
        h('div', { class: 'prose' },
          h('p', { text: 'NyxOS is a quiet desktop for the web, named for Nyx, the Greek goddess of night. It runs entirely in your browser as a static site, with no server of its own and no service worker.' }),
          h('p', null, 'Inspired by ', h('a', { href: 'https://github.com/whosrogo/GalaxyV7', target: '_blank', rel: 'noopener noreferrer', text: 'GalaxyV7' }), ' by whosrogo. NyxOS is written from scratch and contains no GalaxyV7 code.'),
          h('p', { text: 'Shortcuts open in the built-in browser. YouTube and TikTok refuse to be shown inside other pages, so in Direct mode use Open in new tab for those.' }),
          h('p', { text: 'In Direct mode the browser embeds pages as they are. It is not a proxy, and sites that block embedding will not display. A proxy server you run can be connected in Settings › Browser.' })),
      ] },
    ];
    for (const x of extraSections) SECTIONS.splice(Math.max(0, SECTIONS.findIndex(s => s.id === x.after) + 1) || SECTIONS.length, 0, { ...x, render: () => x.render(ui) });

    let current = (ctx.args && ctx.args.page) || Store.get('settingsPage', 'appearance');
    if (!SECTIONS.some(s => s.id === current)) current = 'appearance';
    const startList = isMobile() && !(ctx.args && ctx.args.page);
    let mobileList = false;
    const nav = h('nav', { class: 'st-nav scroll', 'aria-label': 'Settings sections' });
    const main = h('div', { class: 'st-main scroll', tabindex: '-1' });
    const shell = h('div', { class: 'st' }, nav, main);
    root.append(shell);

    function drawNav() {
      nav.replaceChildren(h('div', { class: 'st-nav-head' }, h('h1', { text: 'Settings' })),
        ...SECTIONS.map(s => h('button', { type: 'button', 'aria-current': s.id === current && !mobileList ? 'page' : null, onclick: () => show(s.id, true) },
          h('span', { class: 'st-ico', svg: s.icon }), h('span', { class: 'st-name', text: s.name }), h('span', { class: 'st-chev', svg: ICONS.chevRight }))));
    }
    function show(id, focus) {
      cleanups.splice(0).forEach(f => { try { f(); } catch {} });
      current = id; mobileList = false;
      Store.set('settingsPage', id);
      shell.classList.remove('list');
      drawNav();
      const sec = SECTIONS.find(s => s.id === id);
      const back = h('button', { class: 'st-back', type: 'button', onclick: () => { mobileList = true; shell.classList.add('list'); drawNav(); } }, h('span', { svg: ICONS.back }), 'Settings');
      try { main.replaceChildren(back, h('div', { class: 'st-page' }, ...sec.render().flat().filter(x => x != null))); }
      catch (err) { console.error(err); main.replaceChildren(back, h('div', { class: 'app-error', role: 'alert' }, h('h2', { text: `The ${sec.name} page couldn’t load` }), h('p', { text: err.message }), h('button', { class: 'btn primary', type: 'button', text: 'Try again', onclick: () => show(id) }))); }
      main.scrollTop = 0;
      if (focus) main.focus({ preventScroll: true });
    }
    // Redraw when settings change in bulk (import, reset) or the connection mode changes its description.
    const off = Bus.on('settings', ({ key }) => { if (key === '*' || key === 'transport') show(current); });
    const offA = Bus.on('account', () => { if (current === 'account') show(current); });
    const offB = Bus.on('blocks', () => { if (current === 'account') show(current); });
    show(current);
    if (startList) { mobileList = true; shell.classList.add('list'); drawNav(); }
    return {
      handleArgs: a => { if (a && a.page && SECTIONS.some(s => s.id === a.page)) show(a.page); },
      destroy: () => { off(); offA(); offB(); cleanups.splice(0).forEach(f => { try { f(); } catch {} }); },
    };
  },
});
