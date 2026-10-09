/* Lock screen: a big clock and date over the wallpaper, an optional PIN, and
   idle auto-lock. The PIN is a privacy screen, not real security: it's hashed
   with SHA-256 (SubtleCrypto) and kept in this browser, and anyone can reset
   it via "Forgot PIN", which erases Kanni data. */
import { $, h, Store, Bus, uid } from './core.js';
import { ICONS, MARK } from './icons.js';
import { Settings } from './settings.js';
import { fmtTime } from './shell.js';

const subtle = () => (window.crypto && crypto.subtle) || null;
async function hash(pin, salt) {
  const data = new TextEncoder().encode(`nyxos:${salt}:${pin}`);   // pre-Kanni prefix, kept so saved PINs still match
  const buf = await subtle().digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const Lock = {
  locked: false,
  el: null,
  idleTimer: 0,

  hasPin() { const l = Store.get('lock', null); return !!(l && l.hash); },
  pinSupported() { return !!subtle(); },
  pinLength() { const l = Store.get('lock', null); return l && l.len ? l.len : 6; },
  async setPin(pin) {
    if (!/^\d{4,6}$/.test(pin)) throw new Error('Use 4 to 6 digits.');
    if (!subtle()) throw new Error('This browser can’t store a PIN here.');
    const salt = uid() + uid();
    Store.set('lock', { hash: await hash(pin, salt), salt, len: pin.length });
  },
  clearPin() { Store.remove('lock'); },
  async verify(pin) {
    const l = Store.get('lock', null);
    if (!l || !l.hash || !subtle()) return false;
    try { return await hash(pin, l.salt) === l.hash; } catch { return false; }
  },

  lock() {
    if (this.locked) return;
    this.locked = true;
    document.body.classList.add('locked');
    Bus.emit('sfx', 'lock');
    this.render();
  },
  unlock() {
    if (!this.locked) return;
    this.locked = false;
    document.body.classList.remove('locked');
    Bus.emit('sfx', 'unlock');
    if (this.el) { this.el.classList.add('out'); const el = this.el; this.el = null; setTimeout(() => el.remove(), 220); }
    this.kickIdle();
  },

  render() {
    if (this.el) this.el.remove();
    const hasPin = this.hasPin();
    const time = h('div', { class: 'lock-time tnum' });
    const date = h('div', { class: 'lock-date' });
    const tick = () => { const d = new Date(); const [hm, ap] = fmtTime(d).split(/\s(?=[AP]M$)/i); time.replaceChildren(hm, ap ? h('span', { class: 'lock-ampm', text: ap }) : ''); date.textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); };
    tick();
    const offTick = Bus.on('tick', tick);

    const dots = h('div', { class: 'lock-dots' });
    const msg = h('p', { class: 'lock-msg', role: 'alert', 'aria-live': 'assertive' });
    let entry = '';
    const pinMax = this.pinLength();
    const drawDots = () => dots.replaceChildren(...Array.from({ length: pinMax }, (_, i) => h('span', { class: 'lock-dot' + (i < entry.length ? ' on' : '') })));
    const reset = () => { entry = ''; drawDots(); };

    const submit = async () => {
      if (await this.verify(entry)) { offTick(); this.unlock(); }
      else { msg.textContent = 'Wrong PIN. Try again.'; pad.classList.add('shake'); setTimeout(() => pad.classList.remove('shake'), 400); reset(); }
    };
    const press = (dgt) => { if (entry.length >= pinMax) return; entry += dgt; drawDots(); msg.textContent = ''; if (entry.length === pinMax) submit(); };
    const back = () => { entry = entry.slice(0, -1); drawDots(); };

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];
    const pad = h('div', { class: 'lock-pad' }, keys.map(k => k === '' ? h('span')
      : k === 'back' ? h('button', { class: 'lock-key', type: 'button', 'aria-label': 'Delete', svg: ICONS.back, onclick: back })
      : h('button', { class: 'lock-key', type: 'button', text: k, onclick: () => press(k) })));
    const enterBtn = h('button', { class: 'btn primary lock-enter', type: 'button', text: 'Unlock', onclick: submit });

    const hint = h('button', { class: 'lock-hint', type: 'button' }, hasPin ? 'Enter PIN to unlock' : 'Tap or press any key to unlock');
    const unlockNoPin = () => { offTick(); this.unlock(); };
    if (!hasPin) hint.addEventListener('click', unlockNoPin);

    const forgot = h('button', { class: 'lock-forgot', type: 'button', text: 'Forgot PIN?', onclick: () => {
      if (confirm('Reset the PIN? This erases all Kanni data in this browser (settings, history, widgets) and reloads.')) { Store.clearAll(); location.reload(); }
    } });

    const card = h('div', { class: 'lock-card' },
      h('span', { class: 'lock-mark', svg: MARK }),
      hasPin ? h('div', { class: 'lock-pin' }, dots, msg, pad, h('div', { class: 'lock-actions' }, enterBtn), forgot) : h('div', { class: 'lock-pin' }, hint));

    this.el = h('div', { class: 'lock', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Locked', tabindex: '-1' },
      h('div', { class: 'lock-clock' }, time, date), card);

    this.el.addEventListener('keydown', e => {
      if (!hasPin) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); unlockNoPin(); } return; }
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); back(); }
      else if (e.key === 'Enter' && entry.length >= 4) { e.preventDefault(); submit(); }
    });
    document.body.append(this.el);
    drawDots();
    this.el.focus({ preventScroll: true });
  },

  /* Idle auto-lock. */
  kickIdle() {
    clearTimeout(this.idleTimer);
    const mins = +Settings.get('idleLock') || 0;
    if (!mins || this.locked) return;
    this.idleTimer = setTimeout(() => this.lock(), mins * 60000);
  },
  initIdle() {
    const reset = () => { if (!this.locked) this.kickIdle(); };
    for (const ev of ['pointerdown', 'keydown', 'pointermove', 'wheel', 'touchstart']) addEventListener(ev, reset, { passive: true });
    Bus.on('settings', ({ key }) => { if (key === '*' || key === 'idleLock') this.kickIdle(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.kickIdle(); });
    this.kickIdle();
  },
};
