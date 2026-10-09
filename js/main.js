/* Kanni entry point. index.html's classic script owns the startup watchdog
   (window.KanniBoot); this module boots the shell and reports back. */
import { $, Store, Bus, state, mq } from './core.js';
import { Settings, applyLook, motionOff, BrowserNet, reducedMq } from './settings.js';
import { registerApp } from './apps.js';
import { WM } from './wm.js';
import { Notify, reportRuntime } from './notify.js';
import { registerShortcut } from './shortcuts.js';
import { DotField, lowPower } from './dots.js';
import { LiveWallpaper } from './backdrop.js';
import { WALLPAPERS } from './settings.js';
import { accentFromCanvas } from './accent.js';
import { IDB } from './idb.js';
import { initShell, Mode } from './shell.js';
import { Tour } from './tour.js';
import { showLaunchPrompt } from './launch.js';
import { Widgets } from './widgets.js';
import { Lock } from './lock.js';
import { Sfx } from './sound.js';
import { WhatsNew } from './whatsnew.js';
import './apps/browser.js';
import './apps/settings.js';
import './apps/widgets.js';
import './apps/chat.js';
import { Account } from './account.js';

const boot = window.KanniBoot || { done() {}, fatal(e) { throw e; } };

addEventListener('error', e => { if (e.message) reportRuntime(e.message); });
addEventListener('unhandledrejection', e => reportRuntime((e.reason && e.reason.message) || e.reason || 'A background task failed.'));

// This build uses no service worker. Remove any left at this address by an
// earlier deploy so it can't serve stale files.
try {
  if (/^https?:$/.test(location.protocol) && 'serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
    const base = new URL('./', location.href).href;
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => { if (r.scope.startsWith(base)) r.unregister(); })).catch(() => {});
  }
} catch (e) { console.warn('Service worker cleanup skipped:', e); }

try {
  Settings.load();
  applyLook();
  WM.initDesktops();
  initShell();
  try { Widgets.init(); } catch (e) { console.error('Widgets disabled:', e); }
  try { Lock.initIdle(); } catch (e) { console.error('Idle lock disabled:', e); }
  try { Sfx.init(); } catch (e) { console.error('Sound disabled:', e); }

  /* One canvas (#dots), one render loop: either the interactive dot field or a
     live wallpaper is active, never both. Custom/static wallpapers use neither. */
  let dots = null, live = null;
  try { dots = new DotField($('#dots'), { ignore: '.win,.bar,.panel,.cz,#launch-prompt,#toasts,#icons .dicon' }); } catch (e) { console.error('Dot field disabled:', e); }
  try { live = new LiveWallpaper($('#dots')); } catch (e) { console.error('Live wallpaper disabled:', e); }
  const wallKind = (id) => (WALLPAPERS.find(w => w.id === id) || {}).kind || 'static';
  const configureBg = () => {
    const wall = Settings.get('wallpaper'), kind = wallKind(wall);
    const animate = !motionOff() && !lowPower;
    try {
      if (kind === 'dots') { live && live.configure({ kind: null }); dots && dots.configure({ enabled: true, motion: Settings.get('dotMotion') && animate, accent: Settings.get('accent') }); }
      else if (kind === 'live') { dots && dots.configure({ enabled: false }); live && live.configure({ kind: wall, motion: animate, accent: Settings.get('accent') }); maybeAutoAccent(); }
      else { dots && dots.configure({ enabled: false }); live && live.configure({ kind: null }); if (kind === 'custom') maybeAutoAccent(); }
    } catch (e) { console.error('Backdrop error:', e); }
  };
  /* Derive the accent from the wallpaper when the option is on. */
  function maybeAutoAccent() {
    if (!Settings.get('autoAccent')) return;
    const apply = (src) => {
      try {
        const hex = accentFromCanvas(src);
        if (hex && hex.toLowerCase() !== String(Settings.get('accent')).toLowerCase()) Settings.set('accent', hex);
      } catch {}
    };
    if (Settings.get('wallpaper') === 'custom') {
      // The custom image lives on the body, not the canvas: sample the image itself.
      IDB.get('wallpaper').then(url => {
        if (!url) return;
        const img = new Image();
        img.onload = () => apply(img);
        img.src = url;
      }).catch(() => {});
    } else {
      setTimeout(() => apply($('#dots')), 160);  // let the live wallpaper paint a frame first
    }
  }
  // Apply a saved custom wallpaper image (stored in IndexedDB) to the body.
  const applyCustomWall = () => {
    IDB.get('wallpaper').then(url => {
      document.documentElement.style.setProperty('--custom-wall', url ? `url("${url}")` : 'none');
    }).catch(() => {});
  };
  applyCustomWall();
  configureBg();
  reducedMq.addEventListener?.('change', configureBg);
  Bus.on('settings', ({ key }) => {
    applyLook();
    if (['*', 'wallpaper', 'wallpaperFit', 'dotMotion', 'reduceMotion', 'accent', 'autoAccent'].includes(key)) configureBg();
  });
  Bus.on('wallpaper-image', applyCustomWall);
  Bus.on('look-preview', configureBg);
  mq('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (Settings.get('theme') === 'auto') applyLook(); });

  Mode.set(Store.get('mode', 'os') === 'browser' ? 'browser' : 'os', { save: false });

  // Extension point for later apps: window.Kanni.registerApp({...}) (window.Nyx and window.SNAP still work).
  window.Kanni = window.Nyx = window.SNAP = Object.freeze({
    registerApp, registerShortcut, mode: m => Mode.set(m), open: (id, a) => WM.open(id, a),
    notify: (t, b) => Notify.push({ title: t, body: b }), net: BrowserNet, settings: { get: k => Settings.get(k) },
    lock: () => Lock.lock(),
  });
  state.booted = true;
  boot.done();
  // Restore a signed-in session in the background; never blocks the desktop.
  setTimeout(() => { try { Account.init(); } catch (e) { console.error(e); } }, 50);
  try { Sfx.startup(); } catch (e) { console.error(e); }

  // First run: the tips tour, then (if turned on) the about:blank prompt,
  // then — on an update — the What's new notes.
  try {
    const afterLaunch = () => { try { WhatsNew.maybeShow(); } catch (e) { console.error(e); } };
    if (Tour.shouldShow()) Tour.open({ onClose: () => { showLaunchPrompt(); afterLaunch(); } });
    else { showLaunchPrompt(); afterLaunch(); }
  } catch (e) { console.error('Tour/launch skipped:', e); }
} catch (err) { boot.fatal(err); }
