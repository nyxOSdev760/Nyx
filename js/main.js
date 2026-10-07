/* NyxOS entry point. index.html's classic script owns the startup watchdog
   (window.NyxBoot); this module boots the shell and reports back. */
import { $, Store, Bus, state, mq } from './core.js';
import { Settings, applyLook, motionOff, BrowserNet, reducedMq } from './settings.js';
import { registerApp } from './apps.js';
import { WM } from './wm.js';
import { Notify, reportRuntime } from './notify.js';
import { registerShortcut } from './shortcuts.js';
import { DotField, lowPower } from './dots.js';
import { initShell, Mode } from './shell.js';
import { Customize } from './customize.js';
import { showLaunchPrompt } from './launch.js';
import './apps/browser.js';
import './apps/settings.js';

const boot = window.NyxBoot || { done() {}, fatal(e) { throw e; } };

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
  initShell();

  let dots = null;
  try { dots = new DotField($('#dots'), { ignore: '.win,.bar,.panel,.cz,#launch-prompt,#toasts,#icons .dicon' }); } catch (e) { console.error('Dot field disabled:', e); }
  const configureDots = () => {
    if (!dots) return;
    try { dots.configure({ enabled: Settings.get('wallpaper') === 'oled', motion: Settings.get('dotMotion') && !motionOff() && !lowPower, accent: Settings.get('accent') }); }
    catch (e) { console.error('Dot field disabled:', e); }
  };
  configureDots();
  reducedMq.addEventListener?.('change', configureDots);
  Bus.on('settings', ({ key }) => {
    applyLook();
    if (['*', 'wallpaper', 'dotMotion', 'reduceMotion', 'accent'].includes(key)) configureDots();
  });
  Bus.on('look-preview', configureDots);
  mq('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (Settings.get('theme') === 'auto') applyLook(); });

  Mode.set(Store.get('mode', 'os') === 'browser' ? 'browser' : 'os', { save: false });

  // Extension point for later apps: window.Nyx.registerApp({...}) (window.SNAP still works).
  window.Nyx = window.SNAP = Object.freeze({
    registerApp, registerShortcut, mode: m => Mode.set(m), open: (id, a) => WM.open(id, a),
    notify: (t, b) => Notify.push({ title: t, body: b }), net: BrowserNet, settings: { get: k => Settings.get(k) },
  });
  state.booted = true;
  boot.done();

  // First run: the customize screen, then (if turned on) the about:blank prompt.
  try {
    if (!Store.get('customized', false)) Customize.open({ first: true, onClose: showLaunchPrompt });
    else showLaunchPrompt();
  } catch (e) { console.error('Customize/launch skipped:', e); }
} catch (err) { boot.fatal(err); }
