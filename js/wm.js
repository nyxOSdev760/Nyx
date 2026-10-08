/* Window manager: open/close/focus, drag, resize, edge snapping, minimize to dock. */
import { $, $$, h, uid, clamp, isMobile, Bus } from './core.js';
import { ICONS } from './icons.js';
import { Apps, appTile } from './apps.js';
import { Notify } from './notify.js';
import { motionOff } from './settings.js';

const SNAP_EDGE = 10;   // px from an edge that triggers a snap
const DRAG_SLOP = 4;    // px before a press on the title bar becomes a drag

export const WM = {
  wins: new Map(), z: 10, focusedId: null,
  /* Set by the shell: hooks keep this module free of shell imports. */
  hooks: { beforeOpen: () => {}, afterClose: () => {}, dockRect: () => null, inBrowserMode: () => false },
  area: () => $('#windows').getBoundingClientRect(),
  changed() { document.body.classList.toggle('has-win', [...this.wins.values()].some(w => !w.minimized)); Bus.emit('wm'); },

  open(appId, args) {
    const app = Apps.get(appId);
    if (!app) { Notify.push({ title: 'App not found', body: `Nothing is installed with the id "${appId}".` }); return null; }
    this.hooks.beforeOpen(appId);
    if (app.single) {
      const ex = [...this.wins.values()].find(w => w.appId === appId);
      if (ex) {
        this.restore(ex.id);
        if (args && ex.instance && ex.instance.handleArgs) { try { ex.instance.handleArgs(args); } catch (e) { this.appError(ex, e); } }
        return ex.id;
      }
    }
    const id = uid(), a = this.area();
    const w = Math.min(app.size[0], a.width - 32), ht = Math.min(app.size[1], a.height - 32);
    const off = (this.wins.size % 6) * 28;
    const left = Math.max(16, Math.round((a.width - w) / 2 - 56 + off));
    const top = Math.max(16, Math.round((a.height - ht) / 2 - 24 + off));

    const titleEl = h('span', { class: 'win-title', text: app.name });
    const maxBtn = h('button', { class: 'win-btn max', type: 'button', 'aria-label': 'Maximize', title: 'Maximize', svg: ICONS.max });
    const titlebar = h('header', { class: 'titlebar' },
      h('button', { class: 'win-home', type: 'button', 'aria-label': 'Back to home screen', onclick: () => this.minimize(id) }, h('span', { svg: ICONS.back }), 'Home'),
      appTile(app, 'sm'), titleEl,
      h('div', { class: 'win-controls' },
        h('button', { class: 'win-btn minb', type: 'button', 'aria-label': 'Minimize', title: 'Minimize', svg: ICONS.min, onclick: () => this.minimize(id) }),
        maxBtn,
        h('button', { class: 'win-btn close', type: 'button', 'aria-label': 'Close', title: 'Close', svg: ICONS.close, onclick: () => this.close(id) })));
    const body = h('div', { class: 'win-body' });
    const grip = h('div', { class: 'resize', 'aria-hidden': 'true' });
    const el = h('section', { class: 'win opening', role: 'dialog', 'aria-label': app.name, tabindex: '-1', 'data-app': appId }, titlebar, body, grip);
    Object.assign(el.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: ht + 'px' });
    $('#windows').append(el);
    // Open from the launching icon (dock or desktop): point the scale origin at it.
    try {
      const src = $$(`.dock-item[data-app="${appId}"], .dicon[data-id="${appId}"]`).find(x => x.getClientRects().length);
      if (src) {
        const s = src.getBoundingClientRect(), r = el.getBoundingClientRect();
        el.style.setProperty('--ox', Math.round(clamp(s.left + s.width / 2 - r.left, 0, r.width)) + 'px');
        el.style.setProperty('--oy', Math.round(clamp(s.top + s.height / 2 - r.top, 0, r.height)) + 'px');
      }
    } catch {}

    const win = { id, appId, el, body, titleEl, maxBtn, minimized: false, state: 'normal', prev: null, instance: null };
    this.wins.set(id, win);
    maxBtn.addEventListener('click', () => this.toggleMax(id));
    titlebar.addEventListener('dblclick', e => { if (!e.target.closest('button')) this.toggleMax(id); });
    el.addEventListener('pointerdown', () => { if (this.focusedId !== id) this.focus(id); }, true);
    el.addEventListener('focusin', () => { if (this.focusedId !== id) this.focus(id); });
    this.enableDrag(win, titlebar);
    this.enableResize(win, grip);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('opening')));
    this.focus(id);
    this.mount(win, args);
    this.changed();
    return id;
  },

  mount(win, args) {
    const app = Apps.get(win.appId);
    if (win.instance && win.instance.destroy) { try { win.instance.destroy(); } catch {} }
    win.body.replaceChildren();
    const ctx = {
      winId: win.id, el: win.el, args,
      setTitle: t => { win.titleEl.textContent = t ? `${t}` : app.name; },
      notify: (title, body) => Notify.push({ title, body, app: app.name }),
      close: () => this.close(win.id),
      fail: err => this.appError(win, err),
      guard: fn => (...a) => { try { return fn(...a); } catch (e) { this.appError(win, e); } },
    };
    try { win.instance = app.mount(win.body, ctx) || {}; }
    catch (err) { this.appError(win, err); }
  },

  appError(win, err) {
    console.error(err);
    const app = Apps.get(win.appId);
    if (win.instance && win.instance.destroy) { try { win.instance.destroy(); } catch {} }
    win.instance = null;
    win.body.replaceChildren(h('div', { class: 'app-error', role: 'alert' },
      h('h2', { text: `${app.name} stopped working` }),
      h('p', { text: (err && err.message) || String(err) }),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', text: 'Restart app', onclick: () => this.mount(win) }),
        h('button', { class: 'btn', text: 'Close window', onclick: () => this.close(win.id) }))));
  },

  focus(id) {
    const win = this.wins.get(id);
    if (!win) return;
    this.focusedId = id;
    win.el.style.zIndex = ++this.z;
    for (const w of this.wins.values()) w.el.classList.toggle('focused', w.id === id);
    Bus.emit('wm');
  },
  focusTop() {
    const vis = [...this.wins.values()].filter(w => !w.minimized).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex);
    if (vis[0]) this.focus(vis[0].id); else { this.focusedId = null; Bus.emit('wm'); }
  },
  close(id) {
    const win = this.wins.get(id);
    if (!win) return;
    if (win.instance && win.instance.destroy) { try { win.instance.destroy(); } catch (e) { console.error(e); } }
    this.wins.delete(id);
    if (motionOff()) win.el.remove();
    else { win.el.classList.add('closing'); setTimeout(() => win.el.remove(), 160); }
    this.focusTop();
    this.changed();
    this.hooks.afterClose(win);
  },

  /* Genie-lite: the window shrinks and slides into its dock icon. */
  flyTransform(win) {
    const t = this.hooks.dockRect(win.appId), r = win.el.getBoundingClientRect();
    if (!t || !r.width) return 'translateY(40px) scale(.9)';
    const tx = t.left + t.width / 2 - (r.left + r.width / 2), ty = t.top + t.height / 2 - (r.top + r.height / 2);
    return `translate(${Math.round(tx)}px,${Math.round(ty)}px) scale(${Math.max(0.04, t.width / r.width).toFixed(3)})`;
  },
  minimize(id) {
    const win = this.wins.get(id);
    if (!win || win.minimized) return;
    win.minimized = true;
    const el = win.el;
    const done = () => { if (win.minimized) el.classList.add('minimized'); el.classList.remove('genie'); el.style.transform = ''; el.style.opacity = ''; el.style.transformOrigin = ''; };
    if (motionOff() || isMobile()) done();
    else {
      el.style.transformOrigin = '50% 50%';
      el.classList.add('genie');
      const tf = this.flyTransform(win);
      requestAnimationFrame(() => { el.style.transform = tf; el.style.opacity = '0'; });
      setTimeout(done, 260);
    }
    this.focusTop();
    this.changed();
  },
  restore(id) {
    const win = this.wins.get(id);
    if (!win) return;
    if (win.minimized) {
      win.minimized = false;
      const el = win.el;
      el.classList.remove('minimized', 'genie');
      if (!motionOff() && !isMobile()) {
        el.style.transformOrigin = '50% 50%';
        el.style.transition = 'none';
        el.style.transform = this.flyTransform(win);
        el.style.opacity = '0';
        void el.offsetWidth;
        el.style.transition = '';
        el.classList.add('genie');
        requestAnimationFrame(() => { el.style.transform = ''; el.style.opacity = ''; });
        setTimeout(() => { if (!win.minimized) { el.classList.remove('genie'); el.style.transformOrigin = ''; } }, 260);
      }
    }
    this.focus(id);
    this.changed();
  },
  minimizeAll() { for (const w of this.wins.values()) if (!w.minimized) this.minimize(w.id); },

  /* Window states: normal | max | left | right. */
  setState(win, state, animate = true) {
    if (win.state === state) return;
    if (win.state === 'normal') win.prev = { left: win.el.style.left, top: win.el.style.top, width: win.el.style.width, height: win.el.style.height };
    if (animate && !motionOff()) { win.el.classList.add('geom'); clearTimeout(win.geomT); win.geomT = setTimeout(() => win.el.classList.remove('geom'), 260); }
    win.el.classList.remove('maximized', 'snap-left', 'snap-right');
    if (state === 'max') win.el.classList.add('maximized');
    if (state === 'left') win.el.classList.add('snap-left');
    if (state === 'right') win.el.classList.add('snap-right');
    if (state === 'normal' && win.prev) Object.assign(win.el.style, win.prev);
    win.state = state;
    const big = state !== 'normal';
    win.maxBtn.innerHTML = big ? ICONS.restore : ICONS.max;
    win.maxBtn.setAttribute('aria-label', big ? 'Restore size' : 'Maximize');
    win.maxBtn.title = big ? 'Restore size' : 'Maximize';
  },
  toggleMax(id) {
    const win = this.wins.get(id);
    if (!win || isMobile()) return;
    this.setState(win, win.state === 'normal' ? 'max' : 'normal');
  },
  snapZone(x, y, a) {
    if (y - a.top <= SNAP_EDGE) return 'max';
    if (x - a.left <= SNAP_EDGE) return 'left';
    if (a.right - x <= SNAP_EDGE) return 'right';
    return null;
  },
  showPreview(zone, a) {
    let p = $('#snap-preview');
    if (!p) { p = h('div', { id: 'snap-preview', 'aria-hidden': 'true' }); $('#windows').prepend(p); }
    if (!zone) { p.classList.remove('on'); return; }
    const g = { max: [0, 0, a.width, a.height], left: [0, 0, a.width / 2, a.height], right: [a.width / 2, 0, a.width / 2, a.height] }[zone];
    const pad = 6;
    Object.assign(p.style, { left: g[0] + pad + 'px', top: g[1] + pad + 'px', width: g[2] - pad * 2 + 'px', height: g[3] - pad * 2 + 'px', zIndex: this.z + 1 });
    p.classList.add('on');
  },

  enableDrag(win, bar) {
    bar.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button') || isMobile() || this.hooks.inBrowserMode()) return;
      e.preventDefault();
      const a = this.area();
      let r = win.el.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY;
      let ox = r.left - a.left, oy = r.top - a.top, w = r.width;
      let moved = false, zone = null;
      bar.setPointerCapture(e.pointerId);
      const move = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved) {
          if (Math.hypot(dx, dy) < DRAG_SLOP) return;
          moved = true;
          document.body.classList.add('wm-dragging');
          if (win.state !== 'normal') {
            // Pull a snapped or maximized window off the edge at its old size, under the cursor.
            const rel = (sx - r.left) / r.width;
            this.setState(win, 'normal', false);
            w = parseFloat(win.el.style.width) || 640;
            ox = sx - a.left - rel * w; oy = Math.max(0, sy - a.top - 20);
          }
        }
        win.el.style.left = clamp(ox + dx, 100 - w, a.width - 100) + 'px';
        win.el.style.top = clamp(oy + dy, 0, a.height - 40) + 'px';
        zone = this.snapZone(ev.clientX, ev.clientY, a);
        this.showPreview(zone, a);
      };
      const up = () => {
        bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up);
        document.body.classList.remove('wm-dragging');
        this.showPreview(null, a);
        if (moved && zone) this.setState(win, zone);
      };
      bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
  },
  enableResize(win, grip) {
    grip.addEventListener('pointerdown', e => {
      if (e.button !== 0 || win.state !== 'normal' || isMobile()) return;
      e.preventDefault(); e.stopPropagation();
      const r = win.el.getBoundingClientRect(), a = this.area(), sx = e.clientX, sy = e.clientY;
      grip.setPointerCapture(e.pointerId);
      document.body.classList.add('wm-dragging');
      const move = ev => {
        win.el.style.width = Math.max(320, Math.min(r.width + ev.clientX - sx, a.right - r.left)) + 'px';
        win.el.style.height = Math.max(240, Math.min(r.height + ev.clientY - sy, a.bottom - r.top)) + 'px';
      };
      const up = () => {
        grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
        document.body.classList.remove('wm-dragging');
      };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
  },
  clampAll() {
    if (isMobile()) return;
    const a = this.area();
    for (const w of this.wins.values()) {
      if (w.state !== 'normal' || (this.hooks.inBrowserMode() && w.appId === 'browser')) continue;
      const r = w.el.getBoundingClientRect();
      if (r.width > a.width) w.el.style.width = Math.max(320, a.width - 24) + 'px';
      if (r.height > a.height) w.el.style.height = Math.max(240, a.height - 24) + 'px';
      const x = parseFloat(w.el.style.left), y = parseFloat(w.el.style.top);
      w.el.style.left = clamp(x, 100 - r.width, a.width - 100) + 'px';
      w.el.style.top = clamp(y, 0, a.height - 40) + 'px';
    }
  },
};
let resizeRaf = 0;
addEventListener('resize', () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(() => WM.clampAll()); });
