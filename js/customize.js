/* Customize screen: first run, and Settings > Appearance. */
import { $, h, Store } from './core.js';
import { ICONS } from './icons.js';
import { Settings, WALLPAPERS, ACCENTS, darkMq, onAccent, applyLook, motionOff } from './settings.js';
import { Notify } from './notify.js';
import { lowPower } from './dots.js';
import { closePanels } from './shell.js';

/* ---------- Customize screen ----------
   Shown once on first run and from Settings › Appearance. Edits a draft of
   the look settings and previews it live; Done saves the draft through
   Settings, Skip/Cancel puts the saved look back. Either way the
   'customized' flag stops the first-run screen from coming back. */
export const LOOK_KEYS = ['theme', 'accent', 'wallpaper', 'dotMotion'];
export const Customize = {
  finish: null,
  open({ first = false, onClose = null } = {}) {
    if (this.finish) return;
    const opener = document.activeElement;
    const draft = Object.fromEntries(LOOK_KEYS.map(k => [k, Settings.get(k)]));
    const theme = () => draft.theme === 'auto' ? (darkMq.matches ? 'dark' : 'light') : draft.theme;
    closePanels();

    const themeBtns = [['dark', 'Dark'], ['light', 'Light']].map(([v, n]) =>
      h('button', { type: 'button', role: 'radio', 'data-v': v, text: n, onclick: () => { draft.theme = v; update(); } }));
    const accentBtns = ACCENTS.map(a => h('button', { type: 'button', class: 'swatch', role: 'radio', 'data-v': a.v, style: `background:${a.v}`, 'aria-label': a.n, title: a.n, onclick: () => { draft.accent = a.v; update(); } }));
    const picker = h('input', { type: 'color', value: draft.accent.toLowerCase(), 'aria-label': 'Custom accent color', title: 'Custom color' });
    const custom = h('span', { class: 'swatch cz-custom' }, picker);
    const pick = () => { draft.accent = picker.value.toLowerCase(); update(); };
    picker.addEventListener('input', pick);
    picker.addEventListener('change', pick);
    const wallBtns = WALLPAPERS.map(w => {
      const sample = h('i', { 'data-wall': w.id });
      return h('button', { type: 'button', class: 'wall', role: 'radio', 'data-v': w.id, onclick: () => { draft.wallpaper = w.id; update(); } }, sample, w.name);
    });
    const dotSw = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-labelledby': 'cz-dots-t', onclick: () => { draft.dotMotion = !draft.dotMotion; update(); } });
    const dotNote = h('small');

    const glow = h('div', { class: 'cz-glow' });
    const clock = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !Settings.get('clock24') });
    const wall = h('div', { class: 'cz-wall', 'aria-hidden': 'true' }, glow,
      h('div', { class: 'cz-win glass' },
        h('header', null, h('i'), h('i'), h('i'), h('span', { text: 'Settings' })),
        h('div', { class: 'body' }, h('span', { class: 'ln' }), h('span', { class: 'ln s' }), h('span', { class: 'ln' }),
          h('div', { class: 'row' }, h('span', { class: 'pill', text: 'Button' }), h('span', { class: 'switch', 'aria-checked': 'true' })))),
      h('div', { class: 'cz-tb glass' }, h('span', { svg: ICONS.logo }), h('i', { class: 'on' }), h('i'), h('time', { text: clock })));
    // Lifted dots follow the pointer over the preview, and roam on their own otherwise.
    wall.addEventListener('pointermove', e => {
      const r = wall.getBoundingClientRect();
      glow.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      glow.style.setProperty('--my', (e.clientY - r.top) + 'px');
      wall.classList.add('live');
    });
    wall.addEventListener('pointerleave', () => wall.classList.remove('live'));

    const sec = (title, ...kids) => h('section', { class: 'cz-sec' }, h('h2', { text: title }), ...kids);
    const storageOk = Store.available();
    const el = h('div', { class: 'cz', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cz-title', 'aria-describedby': 'cz-desc', tabindex: '-1' },
      h('div', { class: 'cz-in' },
        h('header', { class: 'cz-head' }, h('span', { svg: ICONS.logo }), h('div', null,
          h('h1', { id: 'cz-title', text: first ? 'Make it yours' : 'Customize' }),
          h('p', { id: 'cz-desc', text: 'Pick a look. You can change it any time in Settings › Appearance.' }))),
        h('div', { class: 'cz-grid' },
          h('figure', { class: 'cz-prev', style: 'margin:0' }, wall, h('figcaption', { text: 'Live preview' })),
          h('div', { class: 'cz-opts' },
            sec('Theme', h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Theme' }, themeBtns)),
            sec('Accent color', h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Accent color' }, accentBtns, custom)),
            sec('Wallpaper', h('div', { class: 'walls', role: 'radiogroup', 'aria-label': 'Wallpaper' }, wallBtns)),
            sec('Effects', h('div', { class: 'cz-line' }, h('div', { class: 'lbl' }, h('b', { id: 'cz-dots-t', text: 'Dot animation' }), dotNote), dotSw)))),
        h('footer', { class: 'cz-foot' },
          storageOk ? null : h('p', { class: 'note', text: 'This browser is blocking storage, so your choices last until you reload.' }),
          h('button', { class: 'btn', type: 'button', text: first ? 'Skip' : 'Cancel', onclick: () => this.close(false) }),
          h('button', { class: 'btn primary', type: 'button', text: 'Done', onclick: () => this.close(true) }))));

    function update() {
      const t = theme(), root = document.documentElement, preset = ACCENTS.some(a => a.v === draft.accent);
      root.dataset.theme = t;
      root.style.setProperty('--accent', draft.accent);
      root.style.setProperty('--on-accent', onAccent(draft.accent));
      themeBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === t)));
      accentBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === draft.accent)));
      custom.classList.toggle('on', !preset);
      custom.style.background = preset ? '' : draft.accent;
      if (picker.value !== draft.accent.toLowerCase()) picker.value = draft.accent.toLowerCase();
      wallBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === draft.wallpaper)));
      wall.dataset.wall = draft.wallpaper;
      dotSw.setAttribute('aria-checked', String(draft.dotMotion));
      const oled = draft.wallpaper === 'oled';
      glow.hidden = !(oled && draft.dotMotion && !motionOff() && !lowPower);
      dotNote.textContent = !oled ? 'Shows on the OLED dots wallpaper.' : lowPower ? 'Off automatically on this device to save power.'
        : motionOff() ? 'Paused while reduced motion is on.' : 'Dots lift toward your pointer.';
    }

    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(false); return; }
      if (e.key !== 'Tab') return;
      const f = [...el.querySelectorAll('button,input')].filter(x => !x.disabled && x.getClientRects().length);
      if (!f.length) return;
      const a = document.activeElement;
      if (e.shiftKey && (a === f[0] || a === el)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });

    const behind = [$('#desktop'), ...document.querySelectorAll('.bar'), $('#launch-prompt')].filter(Boolean);
    behind.forEach(x => { x.inert = true; });
    document.body.append(el);
    update();
    el.focus({ preventScroll: true });

    this.finish = (save) => {
      this.finish = null;
      if (save) { try { Settings.setMany(draft); } catch (err) { applyLook(); Notify.push({ title: 'Look not saved', body: err.message }); } }
      else applyLook();
      Store.set('customized', true);
      el.remove();
      behind.forEach(x => { x.inert = false; });
      const back = opener && opener !== document.body && opener.isConnected ? opener : $('[data-customize]');
      if (back) back.focus({ preventScroll: true });
      if (onClose) { try { onClose(); } catch (err) { console.error(err); } }
    };
  },
  close(save) { if (this.finish) this.finish(save); },
};

