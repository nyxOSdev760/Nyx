/* Notifications: toasts plus a log shown in the notification center. */
import { $, h, uid, state, Bus } from './core.js';
import { ICONS } from './icons.js';
import { Settings } from './settings.js';

export const Notify = {
  log: [],
  push({ title, body = '', app = '' }) {
    const n = { id: uid(), title, body, app, t: Date.now() };
    this.log.unshift(n);
    this.log.length = Math.min(this.log.length, 50);
    if (Settings.get('notifications') !== false) showToast(n);
    Bus.emit('notify', n);
    return n.id;
  },
  clear() { this.log = []; Bus.emit('notify', null); },
};

function showToast(n) {
  const host = $('#toasts');
  if (!host) return;
  const t = h('div', { class: 'toast', role: 'status' },
    h('span', { class: 'toast-dot', 'aria-hidden': 'true' }),
    h('div', { class: 'toast-body' }, h('b', { text: n.title }), n.body ? h('p', { text: n.body }) : null),
    h('button', { class: 'icon-btn sm', 'aria-label': 'Dismiss', svg: ICONS.close, onclick: () => dismiss() }));
  let gone = false;
  const dismiss = () => { if (gone) return; gone = true; t.classList.add('out'); setTimeout(() => t.remove(), 200); };
  host.append(t);
  while (host.children.length > 4) host.firstElementChild.remove();
  setTimeout(dismiss, 5000);
}

/* Runtime errors outside an app's own error handling: report, keep the OS running. */
let lastErr = 0;
export function reportRuntime(msg) {
  console.error(msg);
  if (!state.booted) return;
  if (Date.now() - lastErr < 3000) return;
  lastErr = Date.now();
  Notify.push({ title: 'Something went wrong', body: String(msg).slice(0, 160) });
}
