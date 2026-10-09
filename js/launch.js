/* Open Kanni inside an about:blank tab, and the optional prompt on load. */
import { $, h } from './core.js';
import { ICONS } from './icons.js';
import { Settings } from './settings.js';
import { Notify } from './notify.js';

/* ---------- Launch: open this site inside an about:blank tab ----------
   The new tab stays at about:blank and holds a full-screen iframe of this
   page. The frame copy gets ?kanni-ab=1 and also checks whether it is framed,
   so it never shows the launch prompt again. */
export const Launch = {
  framed: (() => {
    try { if (window.top !== window.self) return true; } catch { return true; }
    try { const q = new URLSearchParams(location.search); return ['kanni-ab', 'nyx-ab', 'snap-ab'].some(k => q.get(k) === '1'); } catch { return false; }
  })(),
  frameUrl() { const u = new URL(location.href); u.hash = ''; u.searchParams.set('kanni-ab', '1'); return u.href; },
  open() {
    let w = null;
    try { w = window.open('about:blank', '_blank'); } catch {}
    if (!w || w.closed) {
      Notify.push({ title: 'Pop-up blocked', body: 'Your browser stopped the new tab. Click the blocked pop-up icon at the right end of the address bar (Chrome, Edge) or the bar under it (Firefox), choose “Always allow pop-ups” for this site, then try again. In Safari: Settings › Websites › Pop-up Windows › Allow.' });
      return false;
    }
    try {
      const d = w.document;
      if (!d.head) d.documentElement.prepend(d.createElement('head'));
      if (!d.body) d.documentElement.append(d.createElement('body'));
      d.title = document.title;
      const meta = d.createElement('meta');
      meta.name = 'viewport'; meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
      const icon = d.createElement('link');
      icon.rel = 'icon'; icon.href = ($('link[rel="icon"]') || {}).href || '';
      d.head.append(meta, icon);
      d.documentElement.style.cssText = 'height:100%;background:#000';
      d.body.style.cssText = 'margin:0;height:100%;overflow:hidden;background:#000';
      const f = d.createElement('iframe');
      f.title = document.title;
      f.allow = 'fullscreen; clipboard-read; clipboard-write; autoplay; encrypted-media; picture-in-picture';
      f.allowFullscreen = true;
      f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;display:block;background:#000';
      f.src = this.frameUrl();
      d.body.append(f);
      try { w.focus(); } catch {}
      return true;
    } catch (err) {
      console.error(err);
      try { w.close(); } catch {}
      Notify.push({ title: 'Couldn’t open about:blank', body: 'The new tab couldn’t be set up. This site keeps working here.' });
      return false;
    }
  },
};
// Ask on launch: a click is needed, because browsers block pop-ups opened without one.
export function showLaunchPrompt() {
  if (Launch.framed || !Settings.get('askLaunch') || $('#launch-prompt')) return;
  const msg = h('p', { class: 'msg', 'aria-live': 'polite' });
  const close = () => { card.classList.add('out'); setTimeout(() => card.remove(), 160); };
  const openBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => {
    if (Launch.open()) close();
    else { msg.textContent = 'Pop-ups are blocked. Allow pop-ups for this site, then try again.'; msg.className = 'msg err'; }
  } }, h('span', { svg: ICONS.external }), 'Open in about:blank');
  const card = h('div', { id: 'launch-prompt', role: 'dialog', 'aria-labelledby': 'lp-title', 'aria-describedby': 'lp-desc' },
    h('span', { class: 'lp-ico', svg: ICONS.window }),
    h('div', { class: 'lp-main' },
      h('div', null, h('b', { id: 'lp-title', text: 'Open in about:blank?' }),
        h('p', { id: 'lp-desc', text: 'Runs Kanni in a new tab whose address bar shows about:blank. You can turn this off in Settings › Launch.' }), msg),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', text: 'Not now', onclick: close }), openBtn)));
  card.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.body.append(card);
  openBtn.focus({ preventScroll: true });
}
