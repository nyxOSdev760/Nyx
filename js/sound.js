/* Synthesized UI sounds via the Web Audio API — no audio files. Subtle by
   default. The AudioContext starts suspended until the first user gesture, so
   we create it lazily, resume it on the first interaction, and if a sound is
   requested before then (the startup chime), it plays on that first gesture. */
import { Bus } from './core.js';
import { Settings } from './settings.js';

let actx = null;
let unlocked = false;
let pending = null;   // a sound requested before the first gesture (startup chime)

function ctx() {
  if (actx) return actx;
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; }
  return actx;
}
function vol() { return Settings.get('sounds') === false ? 0 : Math.max(0, Math.min(1, +Settings.get('volume'))); }

/* One short tone with an envelope. */
function tone(ac, t, { freq = 440, type = 'sine', dur = 0.14, gain = 0.2, glideTo = 0, attack = 0.005 }) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

/* Each sound is a tiny recipe. Master gain scales with the volume setting. */
const SOUNDS = {
  open(ac, t, m) { tone(ac, t, { freq: 420, glideTo: 680, type: 'sine', dur: 0.16, gain: 0.16 * m }); },
  close(ac, t, m) { tone(ac, t, { freq: 560, glideTo: 300, type: 'sine', dur: 0.14, gain: 0.13 * m }); },
  notify(ac, t, m) { tone(ac, t, { freq: 660, type: 'triangle', dur: 0.12, gain: 0.16 * m }); tone(ac, t + 0.1, { freq: 880, type: 'triangle', dur: 0.16, gain: 0.16 * m }); },
  error(ac, t, m) { tone(ac, t, { freq: 300, type: 'sawtooth', dur: 0.14, gain: 0.12 * m }); tone(ac, t + 0.12, { freq: 220, type: 'sawtooth', dur: 0.18, gain: 0.12 * m }); },
  lock(ac, t, m) { tone(ac, t, { freq: 520, glideTo: 260, type: 'sine', dur: 0.2, gain: 0.14 * m }); },
  unlock(ac, t, m) { tone(ac, t, { freq: 320, glideTo: 640, type: 'sine', dur: 0.18, gain: 0.14 * m }); },
  toggle(ac, t, m) { tone(ac, t, { freq: 600, type: 'sine', dur: 0.06, gain: 0.08 * m }); },
  startup(ac, t, m) { [523.25, 659.25, 783.99].forEach((f, i) => tone(ac, t + i * 0.12, { freq: f, type: 'sine', dur: 0.4, gain: 0.12 * m, attack: 0.02 })); },
};

export const Sfx = {
  play(name) {
    const m = vol();
    if (!m || !SOUNDS[name]) return;
    const ac = ctx();
    if (!ac) return;
    if (ac.state === 'suspended') { ac.resume().catch(() => {}); }
    if (ac.state !== 'running') { if (name === 'startup') pending = name; return; }
    try { SOUNDS[name](ac, ac.currentTime + 0.001, 1); } catch {}
  },
  startup() { if (Settings.get('startupSound') !== false) this.play('startup'); },
  init() {
    const onGesture = () => {
      unlocked = true;
      const ac = ctx();
      if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
      if (pending) { const n = pending; pending = null; setTimeout(() => this.play(n), 30); }
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, onGesture, { once: false, passive: true });
    // Route app events to sounds.
    Bus.on('sfx', (name) => this.play(name));
    Bus.on('notify', (n) => { if (n) this.play('notify'); });
  },
};
