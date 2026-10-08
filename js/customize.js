/* Customize screen: shown full-screen on first visit, and from
   Settings › Appearance. It edits a draft of the look and previews it live
   (on the whole UI and on a mini desktop). Done saves the draft; Skip or
   Cancel restores the saved look. Both set the 'customized' flag, so the
   first-run screen doesn't come back. Works with storage blocked. */
import { $, $$, h, Store, Bus } from './core.js';
import { ICONS, MARK, WORDMARK } from './icons.js';
import { Settings, WALLPAPERS, ACCENTS, FONTS, PRESETS, applyLook, motionOff, resolveTheme } from './settings.js';
import { Notify } from './notify.js';
import { lowPower } from './dots.js';
import { closePanels, fmtTime } from './shell.js';
import { miniDesktop } from './preview.js';

export const LOOK_KEYS = ['theme', 'accent', 'wallpaper', 'font', 'dotMotion', 'sounds'];

export const Customize = {
  finish: null,
  isOpen() { return !!this.finish; },
  open({ first = false, onClose = null } = {}) {
    if (this.finish) return;
    const opener = document.activeElement;
    const draft = Object.fromEntries(LOOK_KEYS.map(k => [k, Settings.get(k)]));
    closePanels();

    const pv = miniDesktop({ roam: true, clock: fmtTime(new Date(), false) });
    const radio = (group, v, label, extra = {}) => h('button', { type: 'button', role: 'radio', 'data-v': v, 'aria-label': extra.aria || null, title: extra.title || null, class: extra.class || null, style: extra.style || null, onclick: () => { draft[group] = v; update(); } }, ...(extra.kids || [label]));

    const themeBtns = [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Auto']].map(([v, n]) => radio('theme', v, n));
    const accentBtns = ACCENTS.map(a => radio('accent', a.v, null, { class: 'swatch', style: `background:${a.v}`, aria: a.n, title: a.n, kids: [] }));
    const picker = h('input', { type: 'color', value: draft.accent.toLowerCase(), 'aria-label': 'Custom accent color', title: 'Pick any color' });
    const custom = h('span', { class: 'swatch swatch-custom' }, picker);
    const pick = () => { draft.accent = picker.value.toLowerCase(); update(); };
    picker.addEventListener('input', pick);
    picker.addEventListener('change', pick);
    const accentName = h('span', { class: 'cz-val' });
    const wallBtns = WALLPAPERS.map(w => radio('wallpaper', w.id, null, { class: 'wall', kids: [h('i', { 'data-wall': w.id }, h('span', { class: 'wall-check', svg: ICONS.check })), h('span', { text: w.name })] }));
    const dotSw = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-labelledby': 'cz-dots-t', 'aria-describedby': 'cz-dots-d', onclick: () => { draft.dotMotion = !draft.dotMotion; update(); } });
    const dotNote = h('small', { id: 'cz-dots-d' });
    const presetBtns = PRESETS.map(p => h('button', { type: 'button', class: 'preset', 'data-wall': p.wallpaper, style: `--pa:${p.accent}`, onclick: () => { Object.assign(draft, { theme: p.theme, accent: p.accent, wallpaper: p.wallpaper, font: p.font }); update(); } }, h('span', { class: 'preset-sw' }), h('span', { text: p.n })));
    const fontSel = h('select', { class: 'select', 'aria-label': 'Interface font' }, FONTS.map(f => h('option', { value: f.id, text: f.n })));
    fontSel.addEventListener('change', () => { draft.font = fontSel.value; update(); });
    const soundSw = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-labelledby': 'cz-snd-t', onclick: () => { draft.sounds = !draft.sounds; update(); } });

    const sec = (n, title, ...kids) => h('section', { class: 'cz-sec' }, h('h2', null, h('span', { class: 'cz-n', text: n }), title), ...kids);
    const storageOk = Store.available();
    const el = h('div', { class: 'cz scroll', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cz-title', 'aria-describedby': 'cz-desc', tabindex: '-1' },
      h('div', { class: 'cz-in' },
        h('header', { class: 'cz-top' }, h('span', { class: 'cz-brand', svg: MARK + WORDMARK }),
          first ? h('button', { class: 'btn ghost sm', type: 'button', text: 'Skip', onclick: () => this.close(false) }) : null),
        h('div', { class: 'cz-grid' },
          h('div', { class: 'cz-left' },
            h('h1', { id: 'cz-title', text: first ? 'Make it yours.' : 'Customize' }),
            h('p', { id: 'cz-desc', text: first ? 'Pick a look for your desktop. Everything here can be changed later in Settings › Appearance.' : 'Changes preview live. Done keeps them, Cancel puts things back.' }),
            h('figure', { class: 'cz-prev' }, pv.el, h('figcaption', { text: 'Live preview. Move your pointer over it.' }))),
          h('div', { class: 'cz-opts' },
            sec('1', 'Preset', h('div', { class: 'presets', role: 'group', 'aria-label': 'Theme presets' }, presetBtns)),
            sec('2', 'Theme', h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Theme' }, themeBtns)),
            sec('3', 'Accent', h('div', { class: 'cz-line' }, h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Accent color' }, accentBtns, custom), accentName)),
            sec('4', 'Wallpaper', h('div', { class: 'walls', role: 'radiogroup', 'aria-label': 'Wallpaper' }, wallBtns)),
            sec('5', 'Font', h('div', { class: 'cz-line' }, h('div', { class: 'lbl' }, h('b', { text: 'Interface font' }), h('small', { text: 'Loaded only when chosen.' })), fontSel)),
            sec('6', 'Effects', h('div', { class: 'cz-line' }, h('div', { class: 'lbl' }, h('b', { id: 'cz-dots-t', text: 'Animate the dot field' }), dotNote), dotSw),
              h('div', { class: 'cz-line' }, h('div', { class: 'lbl' }, h('b', { id: 'cz-snd-t', text: 'Interface sounds' }), h('small', { text: 'Soft clicks and chimes.' })), soundSw))))),
      h('footer', { class: 'cz-foot' },
        h('div', { class: 'cz-foot-in' },
          h('p', { class: 'note', text: storageOk ? '' : 'This browser is blocking storage, so your choices last until you reload.' }),
          h('button', { class: 'btn lg', type: 'button', text: first ? 'Skip' : 'Cancel', onclick: () => this.close(false) }),
          h('button', { class: 'btn primary lg', type: 'button', onclick: () => this.close(true) }, h('span', { svg: ICONS.check }), 'Done'))));

    function update() {
      const preset = ACCENTS.find(a => a.v === draft.accent);
      applyLook({ ...Settings.values, ...draft });
      themeBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === draft.theme)));
      accentBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === draft.accent)));
      custom.classList.toggle('on', !preset);
      custom.style.background = preset ? '' : draft.accent;
      if (picker.value !== draft.accent.toLowerCase()) picker.value = draft.accent.toLowerCase();
      accentName.textContent = preset ? preset.n : draft.accent.toUpperCase();
      wallBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === draft.wallpaper)));
      if (fontSel.value !== draft.font) fontSel.value = draft.font;
      dotSw.setAttribute('aria-checked', String(draft.dotMotion));
      soundSw.setAttribute('aria-checked', String(draft.sounds !== false));
      const oled = draft.wallpaper === 'oled';
      dotNote.textContent = !oled ? 'Shows on the Dot field wallpaper.' : lowPower ? 'Off automatically on this device to save power.'
        : motionOff() ? 'Paused while reduced motion is on.' : 'Dots lift and glow toward your pointer.';
      pv.update(draft, { motionOff: motionOff() });
      el.dataset.theme = resolveTheme(draft.theme);
    }

    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(false); return; }
      if (e.key !== 'Tab') return;
      const f = $$('button,input', el).filter(x => !x.disabled && x.getClientRects().length);
      if (!f.length) return;
      const a = document.activeElement;
      if (e.shiftKey && (a === f[0] || a === el)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });

    const behind = [$('#desktop'), ...$$('.bar'), $('#launch-prompt')].filter(Boolean);
    behind.forEach(x => { x.inert = true; });
    document.body.append(el);
    update();
    el.focus({ preventScroll: true });

    this.finish = (save) => {
      this.finish = null;
      if (save) { try { Settings.setMany(draft); } catch (err) { applyLook(); Notify.push({ title: 'Look not saved', body: err.message }); } }
      else applyLook();
      Bus.emit('look-preview');
      Store.set('customized', true);
      pv.destroy();
      el.classList.add('out');
      setTimeout(() => el.remove(), motionOff() ? 0 : 200);
      behind.forEach(x => { x.inert = false; });
      const back = opener && opener !== document.body && opener.isConnected ? opener : $('[data-customize]');
      if (back) back.focus({ preventScroll: true });
      if (onClose) { try { onClose(); } catch (err) { console.error(err); } }
    };
  },
  close(save) { if (this.finish) this.finish(save); },
};
