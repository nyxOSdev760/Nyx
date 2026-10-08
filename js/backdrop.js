/* Live wallpapers: Aurora, Rain and Stars, drawn on the same #dots canvas the
   dot field uses. Only one animated background runs at a time (main.js enables
   either the dot field or this), so the desktop never has two render loops.
   Pauses when the tab is hidden; draws a single static frame under reduced
   motion or on low-power devices. */
function rgb(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return isNaN(n) ? [157, 180, 255] : [n >> 16 & 255, n >> 8 & 255, n & 255];
}
const rand = (a, b) => a + Math.random() * (b - a);

export class LiveWallpaper {
  constructor(canvas) {
    this.cv = canvas;
    try { this.ctx = canvas.getContext('2d', { alpha: false }); } catch { this.ctx = null; }
    this.kind = null; this.motion = false; this.enabled = false;
    this.color = [157, 180, 255];
    this.W = this.H = 0; this.dpr = 1;
    this.raf = 0; this.running = false; this.last = 0; this.t = 0;
    this.stars = null; this.drops = null;
    this.frame = this.frame.bind(this);
    this.onVis = () => { if (document.hidden) this.stop(); else if (this.enabled && this.motion) this.kick(); };
    document.addEventListener('visibilitychange', this.onVis);
    let rz = 0;
    this.onResize = () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (this.enabled) { this.layout(); this.draw(); } }); };
    addEventListener('resize', this.onResize);
  }
  destroy() { this.stop(); document.removeEventListener('visibilitychange', this.onVis); removeEventListener('resize', this.onResize); }

  configure({ kind, motion, accent }) {
    const KINDS = ['aurora', 'rain', 'stars'];
    this.enabled = !!this.ctx && KINDS.includes(kind);
    this.color = rgb(accent);
    if (!this.enabled) { this.stop(); this.cv.hidden = true; this.kind = null; return; }
    const changed = kind !== this.kind;
    this.kind = kind;
    this.motion = !!motion;
    this.cv.hidden = false;
    this.layout(changed);
    this.draw();
    if (this.motion) this.kick(); else this.stop();
  }

  layout(reseed = true) {
    if (!this.ctx) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(1, innerWidth); this.H = Math.max(1, innerHeight);
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (reseed || !this.stars) this.seed();
  }
  seed() {
    const area = this.W * this.H;
    if (this.kind === 'stars') {
      const n = Math.min(220, Math.round(area / 7000));
      this.stars = Array.from({ length: n }, () => ({ x: rand(0, this.W), y: rand(0, this.H), r: rand(0.4, 1.5), p: rand(0, Math.PI * 2), s: rand(0.4, 1.4), vx: rand(-4, 4) / 60 }));
    } else if (this.kind === 'rain') {
      const n = Math.min(260, Math.round(area / 6000));
      this.drops = Array.from({ length: n }, () => ({ x: rand(0, this.W), y: rand(0, this.H), len: rand(8, 22), v: rand(260, 620), w: rand(0.6, 1.4) }));
    }
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    if (this.kind === 'aurora') this.drawAurora(ctx);
    else if (this.kind === 'stars') this.drawStars(ctx);
    else if (this.kind === 'rain') this.drawRain(ctx, true);
  }

  drawAurora(ctx) {
    const { W, H, t } = this, [r, g, b] = this.color;
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const band = (cx, cy, rad, col, a) => {
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a})`);
      gr.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      ctx.fillStyle = gr; ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    };
    ctx.globalCompositeOperation = 'lighter';
    const c2 = [Math.min(255, r + 10), Math.max(0, g - 30), Math.min(255, b + 40)];
    const c3 = [Math.max(0, r - 60), Math.min(255, g + 50), b];
    band(W * (0.3 + 0.18 * Math.sin(t * 0.0003)), H * (0.32 + 0.08 * Math.sin(t * 0.0004)), Math.max(W, H) * 0.5, this.color, 0.1);
    band(W * (0.7 + 0.16 * Math.sin(t * 0.00025 + 2)), H * (0.28 + 0.1 * Math.cos(t * 0.0003)), Math.max(W, H) * 0.42, c2, 0.09);
    band(W * (0.5 + 0.2 * Math.sin(t * 0.0002 + 4)), H * (0.5 + 0.12 * Math.sin(t * 0.00035 + 1)), Math.max(W, H) * 0.45, c3, 0.07);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  drawStars(ctx) {
    const { W, H } = this;
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const [r, g, b] = this.color;
    for (const s of this.stars) {
      const tw = this.motion ? 0.55 + 0.45 * Math.sin(this.t * 0.002 * s.s + s.p) : 0.8;
      ctx.globalAlpha = tw;
      ctx.fillStyle = s.r > 1.1 ? `rgb(${r},${g},${b})` : '#eef1ff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  drawRain(ctx, fresh) {
    const { W, H } = this;
    if (fresh) { ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, H); }
    else { ctx.fillStyle = 'rgba(5,6,10,.28)'; ctx.fillRect(0, 0, W, H); }
    const [r, g, b] = this.color;
    ctx.strokeStyle = `rgba(${r},${g},${b},.5)`; ctx.lineCap = 'round';
    for (const d of this.drops) {
      ctx.lineWidth = d.w;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.len * 0.18, d.y + d.len); ctx.stroke();
    }
  }

  frame(now) {
    const dt = Math.min(64, now - (this.last || now)) || 16.7;
    this.last = now; this.t = now;
    if (this.kind === 'rain') {
      this.drawRain(this.ctx, false);
      for (const d of this.drops) {
        d.y += d.v * dt / 1000; d.x -= d.v * 0.18 * dt / 1000;
        if (d.y > this.H + 20) { d.y = -20; d.x = rand(0, this.W + 40); }
      }
    } else if (this.kind === 'stars') {
      for (const s of this.stars) { s.x += s.vx; if (s.x < 0) s.x += this.W; else if (s.x > this.W) s.x -= this.W; }
      this.drawStars(this.ctx);
    } else {
      this.drawAurora(this.ctx);
    }
    if (this.enabled && this.motion && !document.hidden) this.raf = requestAnimationFrame(this.frame);
    else { this.running = false; this.last = 0; }
  }
  kick() { if (!this.running && this.enabled && this.motion && this.ctx && !document.hidden) { this.running = true; this.raf = requestAnimationFrame(this.frame); } }
  stop() { cancelAnimationFrame(this.raf); this.running = false; this.last = 0; }
}

/* Live wallpapers that this engine animates (used by the schema/CSS). */
export const LIVE_WALLPAPERS = ['aurora', 'rain', 'stars'];
