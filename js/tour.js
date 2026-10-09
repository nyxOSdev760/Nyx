/* First-run tips: a short tour that spotlights the real controls one at a
   time. Skip, Esc or Done ends it and sets the 'toured' flag, so it shows
   once. Steps whose control is hidden at this screen size are left out.
   Replay it from Settings › About. Works with storage blocked. */
import { $, $$, h, Store, isCoarse } from './core.js';
import { motionOff } from './settings.js';
import { closePanels } from './shell.js';

const STEPS = [
  { title: 'Welcome to Kanni 👾', body: 'A quick look around. It takes about 20 seconds, and you can skip it anytime.' },
  { at: '#launcher-btn', title: 'All your apps', body: 'Open the app menu here. Start typing to search apps or jump to a website.' },
  { at: '#home-btn', title: 'Home screen', body: 'Tap here to get back to your home screen and apps.' },
  { at: '#dock-apps', title: 'The dock', body: 'Your pinned apps live here. Open apps show up next to them.' },
  { at: '#desktops', title: 'Desktops', body: () => `Press + to add a desktop, up to 4, and keep things tidy.${isCoarse() ? '' : ' Switch with Ctrl+Alt+← and →.'}` },
  { at: '#mode-btn', title: 'Browser mode', body: 'Flip between the desktop and a full-screen browser.' },
  { at: '#bell-btn', title: 'Notifications', body: 'Alerts and messages collect here.' },
  { at: '#avatar-btn', title: 'Your account', body: 'Sign in to join Chat and voice rooms. It’s optional.' },
  { title: 'You’re all set', body: 'Change the theme, wallpaper and more anytime in Settings › Appearance.' },
];

const shown = (el) => !!el && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;

export const Tour = {
  finish: null,
  isOpen() { return !!this.finish; },
  shouldShow() { return !Store.get('toured', false) && !Store.get('customized', false); },
  open({ onClose = null } = {}) {
    if (this.finish) return;
    closePanels();
    const steps = STEPS.filter(s => !s.at || shown($(s.at)));
    let i = 0;

    const hole = h('div', { class: 'tour-hole', 'aria-hidden': 'true' });
    const count = h('small', { class: 'tour-count' });
    const title = h('h2', { id: 'tour-title' });
    const body = h('p', { id: 'tour-body' });
    const dots = h('div', { class: 'tour-dots', 'aria-hidden': 'true' }, steps.map(() => h('i')));
    const back = h('button', { class: 'btn sm', type: 'button', text: 'Back', onclick: () => go(i - 1) });
    const next = h('button', { class: 'btn primary sm', type: 'button', onclick: () => (i < steps.length - 1 ? go(i + 1) : this.close()) });
    const skip = h('button', { class: 'btn ghost sm tour-skip', type: 'button', text: 'Skip', onclick: () => this.close() });
    const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tour-title', 'aria-describedby': 'tour-body' },
      h('div', { class: 'tour-top' }, count, skip), title, body,
      h('div', { class: 'tour-foot' }, dots, h('div', { class: 'row' }, back, next)));
    const el = h('div', { id: 'tour', class: motionOff() ? 'still' : null }, hole, card);

    const place = () => {
      const s = steps[i], t = s.at && $(s.at);
      const vw = innerWidth, vh = innerHeight, gut = 16;
      if (!t || !shown(t)) {
        hole.classList.add('off');
        card.classList.add('center');
        card.style.left = card.style.top = '';
        return;
      }
      const r = t.getBoundingClientRect(), pad = 6;
      Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      hole.classList.remove('off');
      card.classList.remove('center');
      const cw = card.offsetWidth, ch = card.offsetHeight, gap = 14;
      const left = Math.min(Math.max(gut, r.left + r.width / 2 - cw / 2), vw - cw - gut);
      const above = r.top - pad - gap - ch;
      const top = above >= gut ? above : Math.min(r.bottom + pad + gap, vh - ch - gut);
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    };

    const go = (n) => {
      i = Math.min(Math.max(n, 0), steps.length - 1);
      const s = steps[i];
      count.textContent = `${i + 1} of ${steps.length}`;
      title.textContent = s.title;
      body.textContent = typeof s.body === 'function' ? s.body() : s.body;
      back.hidden = i === 0;
      skip.hidden = i === steps.length - 1;
      next.textContent = i === 0 ? 'Show me' : i === steps.length - 1 ? 'Done' : 'Next';
      $$('i', dots).forEach((d, k) => d.classList.toggle('on', k === i));
      card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
      place();
      next.focus({ preventScroll: true });
    };

    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
      else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); go(i - 1); }
      else if (e.key === 'Tab') {
        const f = [skip, back, next].filter(b => !b.hidden);
        const a = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(a + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });
    addEventListener('resize', place);

    const behind = [$('#desktop'), ...$$('.bar')].filter(Boolean);
    behind.forEach(x => { x.inert = true; });
    document.body.append(el);
    go(0);

    this.finish = () => {
      this.finish = null;
      Store.set('toured', true);
      removeEventListener('resize', place);
      behind.forEach(x => { x.inert = false; });
      el.classList.add('out');
      setTimeout(() => el.remove(), motionOff() ? 0 : 200);
      if (onClose) { try { onClose(); } catch (err) { console.error(err); } }
    };
  },
  close() { if (this.finish) this.finish(); },
};
