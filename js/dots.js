/* The interactive dot field: the signature Kanni desktop.
   A grid of dots on pure black. Near the pointer the dots lift, brighten and
   pick up the accent, with a faint accent glow at the peak. The falloff is a
   smooth compact kernel (1 - d²/R²)³, so lifted dots fade out with no edge.
   The resting grid is pre-rendered once; each frame redraws only what moves,
   and the loop stops as soon as everything is still. */
import { isCoarse } from './core.js';

export const lowPower = isCoarse() && ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 2);

function rgb(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return isNaN(n) ? [157, 180, 255] : [n >> 16 & 255, n >> 8 & 255, n & 255];
}

export class DotField {
  /* target: element (or window) whose pointer events drive the field.
     ignore: selector of UI that should calm the field when hovered.
     roam: drift the peak on its own while the pointer is away (previews). */
  constructor(canvas, { target = window, ignore = '', spacing = 0, roam = false } = {}) {
    this.cv = canvas;
    try { this.ctx = canvas.getContext('2d', { alpha: false }); } catch { this.ctx = null; }
    this.target = target; this.ignore = ignore; this.roam = roam;
    this.S = spacing || (isCoarse() ? 30 : 26);
    this.W = 0; this.H = 0; this.dpr = 1; this.n = 0;
    this.px = -1e5; this.py = -1e5; this.strength = 0; this.goal = 0;
    this.enabled = false; this.motion = false; this.color = [157, 180, 255];
    this.running = false; this.raf = 0; this.last = 0; this.inside = false; this.touching = false;
    this.base = null;
    this.frame = this.frame.bind(this);
    this.listen();
  }

  listen() {
    const t = this.target, opt = { passive: true };
    this.onMove = (e) => {
      if (!this.enabled || !this.motion) return;
      if (e.pointerType === 'touch' && e.type === 'pointermove' && !this.touching) return;
      const r = this.rect();
      this.px = e.clientX - r.left; this.py = e.clientY - r.top;
      const overUi = this.ignore && e.target && e.target.closest && e.target.closest(this.ignore);
      this.inside = !overUi;
      this.goal = overUi ? 0 : 1;
      this.kick();
    };
    this.onDown = (e) => { if (e.pointerType === 'touch') this.touching = true; this.onMove(e); };
    this.onUp = (e) => { if (e.pointerType === 'touch') { this.touching = false; this.leave(); } };
    this.onLeave = () => this.leave();
    t.addEventListener('pointermove', this.onMove, opt);
    t.addEventListener('pointerdown', this.onDown, opt);
    t.addEventListener('pointerup', this.onUp, opt);
    t.addEventListener('pointercancel', this.onUp, opt);
    if (t === window) {
      this.onOut = (e) => { if (!e.relatedTarget) this.leave(); };
      document.addEventListener('mouseout', this.onOut);
      addEventListener('blur', this.onLeave);
    } else t.addEventListener('pointerleave', this.onLeave, opt);
    this.onVis = () => {
      if (document.hidden) { cancelAnimationFrame(this.raf); this.running = false; }
      else if (this.enabled) { this.goal = 0; this.kick(); this.draw(); }
    };
    document.addEventListener('visibilitychange', this.onVis);
    if (t === window) {
      let rz = 0;
      this.onResize = () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (this.enabled) this.layout(); }); };
      addEventListener('resize', this.onResize);
    } else if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => { if (this.enabled) this.layout(); });
      this.ro.observe(this.cv);
    }
  }
  destroy() {
    cancelAnimationFrame(this.raf); this.running = false;
    const t = this.target;
    t.removeEventListener('pointermove', this.onMove); t.removeEventListener('pointerdown', this.onDown);
    t.removeEventListener('pointerup', this.onUp); t.removeEventListener('pointercancel', this.onUp);
    t.removeEventListener('pointerleave', this.onLeave);
    if (this.onOut) document.removeEventListener('mouseout', this.onOut);
    removeEventListener('blur', this.onLeave);
    if (this.onResize) removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVis);
    if (this.ro) this.ro.disconnect();
  }
  leave() { this.inside = false; this.goal = 0; this.kick(); }
  rect() { return this.target === window ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : this.cv.getBoundingClientRect(); }

  configure({ enabled, motion, accent }) {
    this.enabled = !!this.ctx && !!enabled;
    this.motion = this.enabled && !!motion;
    this.cv.hidden = !this.enabled;
    const c = rgb(accent);
    const recolor = c.join() !== this.color.join();
    this.color = c;
    if (!this.enabled) { cancelAnimationFrame(this.raf); this.running = false; return; }
    const r = this.rect();
    if (!this.lift || recolor || Math.round(r.width) !== this.W || Math.round(r.height) !== this.H) this.layout();
    if (!this.motion) { this.lift.fill(0); this.goal = this.strength = 0; }
    this.draw();
    if (this.motion && this.roam) this.kick();
  }

  layout() {
    if (!this.ctx) return;
    const r = this.rect();
    const S = this.S;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(1, Math.round(r.width)); this.H = Math.max(1, Math.round(r.height));
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
    const cols = Math.floor(this.W / S) + 1, rows = Math.floor(this.H / S) + 1;
    const ox = (this.W - (cols - 1) * S) / 2, oy = (this.H - (rows - 1) * S) / 2;
    this.n = cols * rows;
    this.xs = new Float32Array(this.n); this.ys = new Float32Array(this.n);
    const old = this.lift; this.lift = new Float32Array(this.n);
    if (old && old.length === this.n) this.lift.set(old);
    for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < cols; x++, i++) { this.xs[i] = ox + x * S; this.ys[i] = oy + y * S; }
    // Pre-render the backdrop (black with a soft accent glow) and the resting grid once.
    const [cr, cg, cb] = this.color;
    const plain = document.createElement('canvas');
    plain.width = this.cv.width; plain.height = this.cv.height;
    const pg = plain.getContext('2d');
    pg.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    pg.fillStyle = '#000'; pg.fillRect(0, 0, this.W, this.H);
    const M = Math.max(this.W, this.H);
    for (const [x, y, rad, a] of [[0.12, -0.08, 0.75, 0.2], [1.02, 1.08, 0.7, 0.14]]) {
      const gr = pg.createRadialGradient(this.W * x, this.H * y, 0, this.W * x, this.H * y, M * rad);
      gr.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
      gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      pg.fillStyle = gr; pg.fillRect(0, 0, this.W, this.H);
    }
    this.plain = plain;
    const b = document.createElement('canvas');
    b.width = this.cv.width; b.height = this.cv.height;
    const g = b.getContext('2d');
    g.drawImage(plain, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath();
    for (let i = 0; i < this.n; i++) { g.moveTo(this.xs[i] + 1, this.ys[i]); g.arc(this.xs[i], this.ys[i], 1, 0, Math.PI * 2); }
    g.fill();
    this.base = b;
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || !this.base) return;
    const { W, H, xs, ys, lift, n, dpr } = this;
    const [cr, cg, cb] = this.color;
    const TAU = Math.PI * 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.strength > 0.01) {
      // A faint accent glow under the peak.
      const R = this.S * 4.5;
      const gr = ctx.createRadialGradient(this.px, this.py, 0, this.px, this.py, R);
      gr.addColorStop(0, `rgba(${cr},${cg},${cb},${(0.11 * this.strength).toFixed(3)})`);
      gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(this.px - R, this.py - R, R * 2, R * 2);
    }
    for (let i = 0; i < n; i++) {
      const l = lift[i];
      if (l < 0.02) continue;
      const x0 = xs[i], y0 = ys[i];
      // Cover the resting dot with the backdrop, leave a soft shadow where it sat.
      ctx.globalAlpha = 1;
      ctx.drawImage(this.plain, (x0 - 2) * dpr, (y0 - 2) * dpr, 4 * dpr, 4 * dpr, x0 - 2, y0 - 2, 4, 4);
      ctx.globalAlpha = 0.09 * l; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x0, y0 + 1, 1 + l * 0.9, 0, TAU); ctx.fill();
      // The lifted dot: brighter, larger, tinted toward the accent near the peak.
      const t = Math.min(1, Math.max(0, (l - 0.3) / 0.7)), m = t * t * (3 - 2 * t);
      const r = Math.round(255 + (cr - 255) * m), g = Math.round(255 + (cg - 255) * m), b = Math.round(255 + (cb - 255) * m);
      ctx.globalAlpha = Math.min(1, 0.18 + l * 0.82);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath(); ctx.arc(x0 + (this.px - x0) * 0.035 * l, y0 - l * 7, 1 + l * 1.6, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  frame(now) {
    const dt = Math.min(64, now - (this.last || now)) || 16.7;
    this.last = now;
    if (this.roam && !this.inside && this.motion) {
      // Slow drift so previews show the effect without a pointer.
      const s = now / 1000;
      this.px = this.W * (0.5 + 0.32 * Math.sin(s * 0.55)); this.py = this.H * (0.5 + 0.28 * Math.sin(s * 0.83 + 1));
      this.goal = 0.85;
    }
    const k = 1 - Math.pow(1 - 0.14, dt / 16.7);
    this.strength += (this.goal - this.strength) * k;
    if (Math.abs(this.goal - this.strength) < 0.002) this.strength = this.goal;
    const R = this.S * 4.2, R2 = R * R;
    let moving = this.strength !== this.goal || (this.roam && this.motion && !this.inside);
    const { xs, ys, lift, n, px, py, strength } = this;
    const kl = 1 - Math.pow(1 - 0.18, dt / 16.7);
    for (let i = 0; i < n; i++) {
      let t = 0;
      if (strength > 0.002) {
        const dx = xs[i] - px, dy = ys[i] - py, d2 = dx * dx + dy * dy;
        if (d2 < R2) { const u = 1 - d2 / R2; t = strength * u * u * u; }
      }
      const cur = lift[i];
      if (cur === t) continue;
      const nv = cur + (t - cur) * kl;
      if (Math.abs(nv - t) < 0.002) lift[i] = t; else { lift[i] = nv; moving = true; }
    }
    this.draw();
    if (moving && this.enabled && this.motion) this.raf = requestAnimationFrame(this.frame);
    else { this.running = false; this.last = 0; }
  }
  kick() {
    if (!this.running && this.enabled && this.motion && this.ctx && !document.hidden) {
      this.running = true; this.raf = requestAnimationFrame(this.frame);
    }
  }
}

