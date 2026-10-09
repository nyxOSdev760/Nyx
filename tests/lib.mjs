// Shared helpers for the Kanni end-to-end tests.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const FB_DIR = new URL('./node_modules/firebase/', import.meta.url).pathname;
// 16x16 PNG, served for favicon requests so tests never hit the network.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGklEQVR4nGOYu+X/f0oww6gBowaMGjBcDAAAKFhPLhT5GegAAAAASUVORK5CYII=', 'base64');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

/* Tiny static server for the site. */
export function serve(port = 8123) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}

export const BASE = 'http://127.0.0.1:8123/';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function launch(args = []) {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  return chromium.launch({ executablePath, args });
}

/* A browser context with every outside request answered locally:
   fonts (empty CSS), favicons (tiny PNG), the Firebase CDN (from
   node_modules/firebase, same version), and any other site (a stub page). */
export async function newCtx(browser, { width = 1366, height = 820, mobile = false, customized = true, settings = null, reducedMotion = 'no-preference', blockPopups = false, storage = 'ok' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, reducedMotion, deviceScaleFactor: 1, acceptDownloads: true });
  await ctx.route(/^https:\/\//, async route => {
    const req = route.request(), url = req.url();
    const fb = url.match(/^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+\.js)$/);
    if (fb && fs.existsSync(FB_DIR + fb[1])) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(FB_DIR + fb[1], 'utf8'), headers: { 'access-control-allow-origin': '*' } });
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (req.resourceType() === 'image' || /favicon/.test(url)) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (req.resourceType() === 'document') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Stub</title><h1>${new URL(url).hostname}</h1>` });
    return route.fulfill({ status: 204, body: '' });
  });
  await ctx.addInitScript(({ customized, settings, storage, blockPopups }) => {
    if (storage === 'blocked') { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); return; }
    try {
      if (window === window.top && !sessionStorage.getItem('kanni-test-seeded')) {
        sessionStorage.setItem('kanni-test-seeded', '1');
        if (customized) localStorage.setItem('snap:customized', 'true');
        if (settings) { localStorage.setItem('snap:settings', JSON.stringify(settings)); localStorage.setItem('snap:settingsVersion', '3'); }
      }
    } catch {}
    if (blockPopups && window === window.top) window.open = () => null;
  }, { customized, settings, storage, blockPopups });
  return ctx;
}

/* Collect console errors/warnings and page errors. */
export const allErrors = [];
export function watch(page, tag) {
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') allErrors.push(`[${tag}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => allErrors.push(`[${tag}] pageerror: ${e.message}`));
  return page;
}

let pass = 0, fail = 0;
export const results = () => ({ pass, fail });
export function check(cond, label, detail = '') {
  if (cond) pass++; else fail++;
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${!cond && detail ? `  (${detail})` : ''}`);
  return cond;
}
export async function section(name, fn) {
  console.log(`\n${name}`);
  try { await fn(); } catch (e) { fail++; console.log(`  ✗ ${name} threw: ${e.message.split('\n')[0]}`); }
}

/* Nothing sticks out sideways at phone width. */
export async function noOverflow(page) {
  return page.evaluate(() => {
    const W = innerWidth;
    if (document.documentElement.scrollWidth > W || document.body.scrollWidth > W) return 'page scrolls sideways';
    for (const el of document.querySelectorAll('body *')) {
      if (!el.getClientRects().length || el.closest('.br-tabs,#dock-running,.chat-list,.ntp,.st-main,.scroll,canvas,.br-views,.toast')) continue;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > W + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed') return `${el.tagName.toLowerCase()}.${el.className} overflows (${Math.round(r.left)}..${Math.round(r.right)})`;
    }
    return '';
  });
}
export async function emulatorUp() {
  try { await fetch('http://127.0.0.1:9099/'); await fetch('http://127.0.0.1:8080/'); return true; } catch { return false; }
}
export async function resetEmulators() {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-kanni/databases/(default)/documents', { method: 'DELETE' });
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-kanni/accounts', { method: 'DELETE' });
}
export async function adminWrite(path, fields) {
  const r = await fetch(`http://127.0.0.1:8080/v1/projects/demo-kanni/databases/(default)/documents/${path}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  return r.json();
}
export async function adminGet(path) {
  const r = await fetch(`http://127.0.0.1:8080/v1/projects/demo-kanni/databases/(default)/documents/${path}`, { headers: { Authorization: 'Bearer owner' } });
  return r.json();
}
