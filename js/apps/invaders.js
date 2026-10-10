/* Invaders: a tiny 👾 shooter. Arrows or A/D to move, Space to fire, P to
   pause. On touch screens: drag to move, tap to fire (or use the buttons). */
import { h, Store, Bus, isCoarse } from '../core.js';
import { ICONS } from '../icons.js';
import { registerApp } from '../apps.js';

const EMOJI_FONT = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
const ROW_HUES = [0, 300, 200, 120, 40];   // hue-rotate per row (where canvas filters exist)

registerApp({
  id: 'invaders', name: 'Invaders', description: 'Defend the desktop from 👾', icon: ICONS.game, tint: '#8b5cf6', size: [560, 640], pinned: false,
  mount(root) {
    const cv = h('canvas', { class: 'inv-cv', tabindex: '0', 'aria-label': 'Invaders game. Arrow keys to move, Space to fire, P to pause.' });
    const btn = (label, cls, ...kids) => h('button', { class: 'inv-btn ' + cls, type: 'button', tabindex: '-1', 'aria-label': label, onmousedown: e => e.preventDefault() }, ...kids);
    const left = btn('Move left', 'l', h('span', { svg: ICONS.back })), right = btn('Move right', 'r', h('span', { svg: ICONS.fwd })), fire = btn('Fire', 'f', 'FIRE');
    const pad = h('div', { class: 'inv-pad' + (isCoarse() ? '' : ' hidden') }, left, fire, right);
    const el = h('div', { class: 'inv' }, cv, pad);
    root.append(el);
    const g = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1, raf = 0, last = 0;
    let state = 'ready', score = 0, high = +Store.get('invadersHigh', 0) || 0, lives = 3, wave = 1;
    let ship, shots, bombs, aliens, dir, stepT, sparks, stars, flash = 0;
    const keys = new Set();
    const touch = { x: null, fire: false };

    function size() {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = Math.max(240, r.width); H = Math.max(240, r.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (ship) ship.y = H - 46;
      if (!stars) stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() }));
      draw();
    }
    function newWave() {
      const cols = Math.max(5, Math.min(10, Math.floor((W - 60) / 46))), rows = 5;
      const gap = Math.min(48, (W - 60) / cols);
      aliens = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) aliens.push({ x: 30 + c * gap + gap / 2, y: 70 + r * 38, r, alive: true, wob: Math.random() * 6 });
      dir = 1; stepT = 0; shots = []; bombs = [];
    }
    function reset() {
      score = 0; lives = 3; wave = 1; sparks = [];
      ship = { x: W / 2, y: H - 46, w: 34, cool: 0, hit: 0 };
      newWave();
    }
    function start() { if (state === 'over' || state === 'ready') reset(); state = 'play'; cv.focus({ preventScroll: true }); loop(); }
    function pause() { if (state === 'play') { state = 'paused'; draw(); } }
    function boom(x, y, n = 14, hue = 280) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 160; sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, hue }); } }

    function update(dt) {
      const speed = 300;
      let mv = (keys.has('ArrowLeft') || keys.has('a') ? -1 : 0) + (keys.has('ArrowRight') || keys.has('d') ? 1 : 0);
      if (touch.x != null) { const d = touch.x - ship.x; mv = Math.abs(d) < 4 ? 0 : Math.sign(d) * Math.min(1, Math.abs(d) / 30); }
      ship.x = Math.max(24, Math.min(W - 24, ship.x + mv * speed * dt));
      ship.cool -= dt; ship.hit = Math.max(0, ship.hit - dt);
      if ((keys.has(' ') || keys.has('ArrowUp') || touch.fire) && ship.cool <= 0 && shots.length < 3) {
        shots.push({ x: ship.x, y: ship.y - 16 }); ship.cool = 0.32; Bus.emit('sfx', 'laser'); touch.fire = false;
      }
      shots.forEach(s => { s.y -= 560 * dt; });
      shots = shots.filter(s => s.y > -10);
      // Formation: move sideways, drop and turn at the edges. Faster as fewer remain.
      const alive = aliens.filter(a => a.alive);
      const pace = (36 + wave * 10) * (1 + (1 - alive.length / aliens.length) * 2.6);
      let edge = false;
      for (const a of alive) { a.x += dir * pace * dt; if (a.x < 22 || a.x > W - 22) edge = true; }
      if (edge) { dir *= -1; for (const a of alive) { a.x += dir * pace * dt * 2; a.y += 18; } }
      // Bombs from the lowest alien in a random column.
      if (alive.length && Math.random() < dt * (0.7 + wave * 0.25)) {
        const shooter = alive[Math.floor(Math.random() * alive.length)];
        const below = alive.filter(a => Math.abs(a.x - shooter.x) < 10 && a.y > shooter.y);
        const s = below.length ? below.sort((p, q) => q.y - p.y)[0] : shooter;
        bombs.push({ x: s.x, y: s.y + 14, v: 150 + wave * 18 });
      }
      bombs.forEach(b => { b.y += b.v * dt; });
      bombs = bombs.filter(b => b.y < H + 10);
      // Hits.
      for (const s of shots) for (const a of alive) {
        if (a.alive && Math.abs(s.x - a.x) < 17 && Math.abs(s.y - a.y) < 15) {
          a.alive = false; s.y = -99; score += (5 - a.r) * 10; boom(a.x, a.y, 16, 260 + ROW_HUES[a.r]); Bus.emit('sfx', 'boom');
        }
      }
      if (!ship.hit) for (const b of bombs) {
        if (Math.abs(b.x - ship.x) < 18 && Math.abs(b.y - ship.y) < 14) {
          b.y = H + 99; lives--; ship.hit = 1.4; flash = 0.25; boom(ship.x, ship.y, 26, 10); Bus.emit('sfx', 'hurt');
          if (lives <= 0) return gameOver();
        }
      }
      if (alive.some(a => a.y > ship.y - 26)) return gameOver();
      if (!aliens.some(a => a.alive)) { wave++; score += 100; newWave(); Bus.emit('sfx', 'wave'); }
      sparks.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.life -= dt; });
      sparks = sparks.filter(p => p.life > 0);
      flash = Math.max(0, flash - dt);
    }
    function gameOver() {
      state = 'over';
      if (score > high) { high = score; Store.set('invadersHigh', high); }
    }

    let uiFont = '';
    function text(t, x, y, size, color = '#fff', weight = 700, align = 'center') {
      g.font = `${weight} ${size}px ${uiFont}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(t, x, y);
    }
    function draw() {
      if (!W) return;
      uiFont = uiFont || getComputedStyle(cv).fontFamily;
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#0b0717'); grd.addColorStop(1, '#030208');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      const t = performance.now() / 1000;
      for (const s of stars) { g.globalAlpha = 0.25 + s.z * 0.6; g.fillStyle = '#cfc6ff'; g.fillRect(s.x * W, ((s.y + t * 0.01 * (0.3 + s.z)) % 1) * H, 1 + s.z, 1 + s.z); }
      g.globalAlpha = 1;
      if (flash) { g.fillStyle = `rgba(255,60,80,${flash})`; g.fillRect(0, 0, W, H); }
      if (aliens && state !== 'ready') {
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `28px ${EMOJI_FONT}`;
        for (const a of aliens) {
          if (!a.alive) continue;
          if ('filter' in g) g.filter = `hue-rotate(${ROW_HUES[a.r]}deg)`;
          g.fillText('👾', a.x, a.y + Math.sin(t * 6 + a.wob) * 1.5);
        }
        if ('filter' in g) g.filter = 'none';
        g.fillStyle = '#ff6b8b'; for (const b of bombs) { g.beginPath(); g.ellipse(b.x, b.y, 2.5, 6, 0, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#b8f7ff'; g.shadowColor = '#7df9ff'; g.shadowBlur = 10; for (const s of shots) g.fillRect(s.x - 1.5, s.y - 9, 3, 14); g.shadowBlur = 0;
        for (const p of sparks) { g.globalAlpha = Math.max(0, p.life * 1.8); g.fillStyle = `hsl(${p.hue},95%,65%)`; g.fillRect(p.x, p.y, 3, 3); }
        g.globalAlpha = 1;
        if (ship && !(ship.hit && Math.floor(t * 12) % 2)) drawShip(ship.x, ship.y, 1);
        // HUD
        text(`${score}`, 16, 24, 20, '#fff', 700, 'left');
        text(`BEST ${high}`, W / 2, 24, 12, 'rgba(255,255,255,.55)', 600);
        for (let i = 0; i < lives; i++) drawShip(W - 22 - i * 26, 24, 0.5);
        text(`WAVE ${wave}`, 16, 46, 11, 'rgba(255,255,255,.45)', 600, 'left');
        g.fillStyle = 'rgba(167,139,250,.35)'; g.fillRect(0, H - 18, W, 1);
      }
      if (state !== 'play') {
        g.fillStyle = 'rgba(5,3,12,.55)'; g.fillRect(0, 0, W, H);
        const tap = isCoarse() ? 'Tap' : 'Press Space';
        if (state === 'ready') { g.font = `64px ${EMOJI_FONT}`; g.textAlign = 'center'; g.fillText('👾', W / 2, H / 2 - 70); text('INVADERS', W / 2, H / 2, 34); text(`${tap} to start`, W / 2, H / 2 + 40, 15, 'rgba(255,255,255,.7)', 500); if (high) text(`Best ${high}`, W / 2, H / 2 + 66, 13, 'rgba(255,255,255,.45)', 500); }
        else if (state === 'paused') { text('Paused', W / 2, H / 2 - 10, 30); text(`${tap} to resume`, W / 2, H / 2 + 26, 15, 'rgba(255,255,255,.7)', 500); }
        else { text('Game over', W / 2, H / 2 - 30, 34); text(`Score ${score}${score >= high && score ? ' · new best!' : ''}`, W / 2, H / 2 + 8, 17, '#c4b5fd', 600); text(`${tap} to play again`, W / 2, H / 2 + 40, 15, 'rgba(255,255,255,.7)', 500); }
      }
    }
    function drawShip(x, y, s) {
      g.save(); g.translate(x, y); g.scale(s, s);
      const grd = g.createLinearGradient(0, -14, 0, 12); grd.addColorStop(0, '#e9e3ff'); grd.addColorStop(1, '#8b5cf6');
      g.fillStyle = grd; g.shadowColor = '#a78bfa'; g.shadowBlur = 14 * s;
      g.beginPath(); g.moveTo(0, -15); g.lineTo(6, -5); g.lineTo(17, 6); g.lineTo(17, 11); g.lineTo(-17, 11); g.lineTo(-17, 6); g.lineTo(-6, -5); g.closePath(); g.fill();
      g.restore();
    }
    function loop() {
      cancelAnimationFrame(raf);
      last = performance.now();
      const step = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (state === 'play') update(dt);
        draw();
        if (state === 'play' || sparks && sparks.length) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }

    const act = () => { if (state === 'play') touch.fire = true; else start(); };
    cv.addEventListener('keydown', e => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === 'p' || k === 'Escape') { if (state === 'play') { e.preventDefault(); pause(); } else if (state === 'paused' && k === 'p') start(); return; }
      if (k === ' ' || k === 'Enter') { e.preventDefault(); if (state !== 'play') { start(); return; } }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'a', 'd'].includes(k)) { e.preventDefault(); keys.add(k); }
    });
    cv.addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    cv.addEventListener('blur', e => { if (e.relatedTarget && el.contains(e.relatedTarget)) return; keys.clear(); pause(); });
    cv.addEventListener('pointerdown', e => {
      cv.focus({ preventScroll: true });
      if (e.pointerType === 'mouse') { act(); return; }
      const r = cv.getBoundingClientRect(); touch.x = e.clientX - r.left; act();
    });
    cv.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse' && e.buttons) { const r = cv.getBoundingClientRect(); touch.x = e.clientX - r.left; } });
    const endTouch = () => { touch.x = null; };
    cv.addEventListener('pointerup', endTouch); cv.addEventListener('pointercancel', endTouch);
    const hold = (b, k) => {
      b.addEventListener('pointerdown', e => { e.preventDefault(); if (state !== 'play') start(); keys.add(k); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => keys.delete(k));
    };
    hold(left, 'ArrowLeft'); hold(right, 'ArrowRight'); hold(fire, ' ');
    const onVis = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', onVis);
    const ro = new ResizeObserver(size); ro.observe(cv);
    size();
    setTimeout(() => cv.focus({ preventScroll: true }), 60);
    return { destroy: () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); } };
  },
});
