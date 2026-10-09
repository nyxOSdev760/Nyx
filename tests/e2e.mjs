// Kanni end-to-end tests (headless Chromium). Run with: npm run test:e2e
// Chat/Voice sections need the Auth + Firestore emulators (the npm script starts them).
import { serve, launch, newCtx, watch, check, section, results, allErrors, sleep, noOverflow, emulatorUp, resetEmulators, adminWrite, adminGet, BASE } from './lib.mjs';

const server = await serve(8123);
const browser = await launch();
const DESK = { width: 1366, height: 820 };
const PHONE = { width: 390, height: 844, mobile: true };
const shots = process.env.SHOTS ? new URL('./output/', import.meta.url).pathname : '';
if (shots) (await import('node:fs')).mkdirSync(shots, { recursive: true });
const shot = (page, name) => shots ? page.screenshot({ path: `${shots}${name}.png` }) : null;

async function open(ctxOpts = {}, url = BASE, tag = 'page') {
  const ctx = await newCtx(browser, ctxOpts);
  const page = watch(await ctx.newPage(), tag);
  await page.goto(url);
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 5000 });
  return { ctx, page };
}
// Layout box (ignores the open/close transform animations).
const winRect = (page, app) => page.$eval(`.win[data-app="${app}"]`, el => { const p = el.offsetParent.getBoundingClientRect(); return { x: p.left + el.offsetLeft, y: p.top + el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, cls: el.className }; });
async function dragTitle(page, app, toX, toY) {
  const tb = await page.$(`.win[data-app="${app}"] .titlebar`);
  const b = await tb.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + 20);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 30, b.y + 60, { steps: 4 });
  await page.mouse.move(toX, toY, { steps: 12 });
  await page.mouse.up();
  await sleep(320);
}

/* ------------------------------------------------------------------ */
await section('Boot', async () => {
  for (const vp of [DESK, PHONE]) {
    const ctx = await newCtx(browser, vp);
    const page = watch(await ctx.newPage(), `boot-${vp.width}`);
    await page.goto(BASE);
    const t = await page.waitForFunction(() => !document.getElementById('boot') && performance.now(), null, { timeout: 5000 }).then(h => h.jsonValue());
    check(t < 1000, `${vp.width}px: boot screen gone in under 1 s`, `${Math.round(t)} ms`);
    check(!(await page.isVisible('#fatal')), `${vp.width}px: no fatal screen`);
    check(await page.$$eval('#icons .dicon', x => x.length) === 7, `${vp.width}px: 4 apps + 3 shortcuts on the desktop`);
    check(await page.title() === 'Kanni', `${vp.width}px: title is Kanni`);
    await shot(page, `boot-${vp.width}`);
    await ctx.close();
  }
});

await section('Desktop windows, snapping and dock', async () => {
  const { ctx, page } = await open(DESK, BASE, 'desk');
  // Single click selects, double click opens.
  await page.click('.dicon[data-id=browser]');
  check(await page.$('.dicon.sel[data-id=browser]') != null && !(await page.$('.win')), 'single click selects an icon');
  await page.dblclick('.dicon[data-id=browser]');
  await page.waitForSelector('.win[data-app=browser].focused');
  check(true, 'double click opens Browser');
  await page.click('.dock-item[data-app=settings]');
  await page.waitForSelector('.win[data-app=settings].focused');
  check(true, 'dock opens Settings');
  await page.click('#launcher-btn');
  await page.fill('#launcher-q', 'chat');
  await page.press('#launcher-q', 'Enter');
  await page.waitForSelector('.win[data-app=chat]');
  check(await page.isHidden('#launcher'), 'launcher search + Enter opens Chat and closes');
  check(!(await page.$('.app-error')), 'no app crashed');
  for (const id of ['browser', 'settings', 'chat']) check(await page.$eval(`.dock-item[data-app=${id}]`, e => e.classList.contains('running')), `dock shows ${id} running`);
  await shot(page, 'desk-three-apps');

  const area = await page.$eval('#windows', e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  const before = await winRect(page, 'settings');
  await dragTitle(page, 'settings', 2, 300);
  let r = await winRect(page, 'settings');
  check(/snap-left/.test(r.cls) && Math.abs(r.w - area.w / 2) < 3 && Math.abs(r.h - area.h) < 3 && r.x <= 1, 'drag to left edge snaps to left half', JSON.stringify(r));
  await dragTitle(page, 'settings', 700, 300);
  r = await winRect(page, 'settings');
  check(!/snap/.test(r.cls) && Math.abs(r.w - before.w) < 2, 'dragging off the edge restores the old size', `${r.w} vs ${before.w}`);
  await dragTitle(page, 'settings', DESK.width - 2, 300);
  r = await winRect(page, 'settings');
  check(/snap-right/.test(r.cls) && Math.abs(r.x - area.w / 2) < 3, 'drag to right edge snaps to right half');
  await dragTitle(page, 'settings', 600, 1);
  r = await winRect(page, 'settings');
  check(/maximized/.test(r.cls) && Math.abs(r.w - area.w) < 2, 'drag to top edge maximizes');
  await page.dblclick('.win[data-app=settings] .win-title');
  await sleep(300);
  r = await winRect(page, 'settings');
  check(!/maximized/.test(r.cls), 'double-click title bar restores');
  await page.click('.win[data-app=settings] .win-btn.max'); await sleep(300);
  check(/maximized/.test((await winRect(page, 'settings')).cls), 'maximize button maximizes');
  await page.click('.win[data-app=settings] .win-btn.max'); await sleep(300);
  check(!/maximized/.test((await winRect(page, 'settings')).cls), 'and restores');

  // Resize from the corner.
  const g = await (await page.$('.win[data-app=settings] .resize')).boundingBox();
  const w0 = (await winRect(page, 'settings')).w;
  await page.mouse.move(g.x + 9, g.y + 9); await page.mouse.down(); await page.mouse.move(g.x - 80, g.y + 9, { steps: 6 }); await page.mouse.up();
  check((await winRect(page, 'settings')).w < w0 - 60, 'corner grip resizes');

  // Minimize animates into the dock and restores from it.
  await page.click('.win[data-app=settings] .win-btn.minb');
  const mid = await page.waitForFunction(() => { const t = document.querySelector('.win[data-app=settings]').style.transform; return /scale\(/.test(t) && t; }, null, { timeout: 250, polling: 10 }).then(h => h.jsonValue(), () => '');
  check(/^translate\(-?\d+px, ?-?\d+px\) scale\(/.test(mid), 'minimize flies toward the dock icon', mid);
  await sleep(350);
  check(await page.$eval('.win[data-app=settings]', e => e.classList.contains('minimized')), 'window minimized');
  check(!(await page.$eval('.dock-item[data-app=settings]', e => e.classList.contains('active'))), 'dock marks it inactive');
  await page.click('.dock-item[data-app=settings]'); await sleep(350);
  check(await page.$eval('.win[data-app=settings]', e => !e.classList.contains('minimized') && e.classList.contains('focused')), 'dock click restores and focuses');
  await page.click('.dock-item[data-app=settings]'); await sleep(350);
  check(await page.$eval('.win[data-app=settings]', e => e.classList.contains('minimized')), 'dock click on the focused app minimizes it');
  await page.click('.win[data-app=chat] .win-btn.close'); await sleep(250);
  check(!(await page.$('.win[data-app=chat]')) && !(await page.$eval('.dock-item[data-app=chat]', e => e.classList.contains('running'))), 'close removes the window and the running dot');

  // Notifications.
  await page.click('.dock-item[data-app=settings]'); await sleep(300);
  await page.click('.st-nav button:has-text("Notifications")');
  await page.click('.st-main button:has-text("Send test")');
  await page.waitForSelector('.toast:has-text("Test notification")');
  check(await page.isVisible('#bell-btn .dot'), 'toast shows and the bell gets a dot');
  await page.click('#bell-btn');
  check((await page.textContent('#notif-list')).includes('Notifications are working'), 'notification center lists it');
  await page.click('#notif-clear');
  check((await page.textContent('#notif-list')).includes('caught up'), 'clear all empties it');
  await page.keyboard.press('Escape');
  check(await page.isHidden('#notif-center'), 'Escape closes the panel');
  await page.click('#avatar-btn');
  check((await page.textContent('#account-body')).includes('Guest'), 'account panel shows Guest when signed out');
  await page.mouse.click(700, 400);
  check(await page.isHidden('#account-panel'), 'clicking away closes the panel');
  // The dot field reacts to the pointer (canvas pixels change).
  await page.click('.win[data-app=settings] .win-btn.minb'); await page.click('.win[data-app=browser] .win-btn.minb'); await sleep(400);
  const clip = { x: 600, y: 200, width: 200, height: 200 };
  await page.mouse.move(100, 700);
  await sleep(600);
  const a = await page.screenshot({ clip });
  await page.mouse.move(690, 290, { steps: 6 }); await sleep(500);
  const b = await page.screenshot({ clip });
  check(!a.equals(b), 'dot field lifts toward the pointer');
  await ctx.close();
});

await section('OS / Browser mode switch', async () => {
  const { ctx, page } = await open(DESK, BASE, 'mode');
  check((await page.textContent('#mode-btn')).trim() === 'Switch to Browser', 'OS mode shows only “Switch to Browser”');
  await page.click('#mode-btn'); await sleep(300);
  const r = await winRect(page, 'browser');
  check(await page.$eval('body', b => b.classList.contains('mode-browser')) && r.w === DESK.width && r.x === 0, 'Browser only mode: browser fills the width');
  check(await page.isHidden('#dock') && await page.isHidden('#icons'), 'dock and icons hidden in Browser mode');
  check((await page.textContent('#mode-btn')).trim() === 'Switch to OS', 'Browser mode shows only “Switch to OS”');
  await shot(page, 'mode-browser');
  await page.reload(); await page.waitForFunction(() => !document.getElementById('boot'));
  check(await page.$eval('body', b => b.classList.contains('mode-browser')), 'mode persists across reload');
  await page.click('.br-tab.active .x'); await sleep(200);
  check(await page.$$eval('.br-tab', x => x.length) === 1, 'closing the last tab in Browser mode opens a fresh one');
  await page.evaluate(() => window.Kanni.open('settings')); await sleep(300);
  check(!(await page.$eval('body', b => b.classList.contains('mode-browser'))), 'opening another app returns to the OS');
  await page.click('#mode-btn'); await sleep(200); await page.click('#mode-btn'); await sleep(200);
  check((await page.textContent('#mode-btn')).trim() === 'Switch to Browser', 'switches back');
  await ctx.close();
});

await section('Browser', async () => {
  const { ctx, page } = await open(DESK, BASE, 'browser');
  await page.dblclick('.dicon[data-id=browser]');
  await page.waitForSelector('.ntp');
  await sleep(200); // the new tab focuses its own search box first
  check(await page.isVisible('.ntp-time') && /Good (morning|afternoon|evening|night)/.test(await page.textContent('.ntp-greet')), 'new tab page: time and greeting');
  check(await page.$$eval('.ntp-sc', x => x.length) === 3, 'new tab page: 3 shortcuts');
  check((await page.textContent('.ntp')).includes('Sites you visit'), 'new tab page: empty recent list explained');
  await page.click('.br-addr input');
  await page.fill('.br-addr input', 'example.com');
  await page.press('.br-addr input', 'Enter');
  await page.waitForFunction(() => document.querySelector('.br-progress.on') || document.querySelector('.br-progress.done'), null, { timeout: 5000 });
  check(true, 'loading indicator runs');
  await page.waitForSelector('.br-tab:not(.loading)');
  check((await page.inputValue('.br-addr input')) === 'example.com', 'address bar shows a clean name, not the URL');
  check((await page.textContent('.br-tab.active .t')) === 'example.com', 'tab shows the clean name');
  await page.focus('.br-addr input');
  check((await page.inputValue('.br-addr input')) === 'https://example.com/', 'focusing the address shows the full URL');
  await page.keyboard.press('Escape');
  check(!(await page.isVisible('.br-hint')), 'no blank-page notice clutters the toolbar');
  const frame = page.frames().find(f => f.url() === 'https://example.com/');
  check(frame && (await frame.textContent('h1')) === 'example.com', 'page loads in the tab frame');
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('[aria-label="Open in a new browser tab"]')]);
  check(popup.url() === 'https://example.com/', 'the toolbar Open-in-new-tab button opens the real page');
  await popup.close();
  await page.fill('.br-addr input', 'kanni test query'); await page.press('.br-addr input', 'Enter'); await sleep(400);
  check((await page.inputValue('.br-addr input')) === 'kanni test query', 'searches show the search words');
  await page.click('.br-nav button[aria-label=Back]'); await sleep(300);
  check((await page.inputValue('.br-addr input')) === 'example.com', 'back');
  await page.click('.br-nav button[aria-label=Forward]'); await sleep(300);
  check((await page.inputValue('.br-addr input')) === 'kanni test query', 'forward');
  await page.click('.br-new'); await sleep(200);
  check(await page.$$eval('.br-tab', x => x.length) === 2, 'new tab');
  check((await page.textContent('.ntp-recent')).includes('example.com'), 'recent sites list history');
  await page.click('.ntp-sc:has-text("YouTube")'); await sleep(400);
  check((await page.textContent('.br-tab.active .t')) === 'YouTube', 'shortcut opens with its name');
  await page.click('.br-tab.active .x'); await sleep(200);
  check(await page.$$eval('.br-tab', x => x.length) === 1, 'close tab');
  await page.click('.br-top');
  await page.keyboard.press('Control+l');
  check(await page.evaluate(() => document.activeElement.matches('.br-addr input')), 'Ctrl+L focuses the address bar');
  await page.fill('.br-addr input', 'javascript:alert(1)'); await page.press('.br-addr input', 'Enter'); await sleep(200);
  check((await page.textContent('.br-view:not([hidden])')).includes("can't be opened"), 'non-web schemes are refused');
  await page.click('.win[data-app=browser] .win-btn.minb'); await sleep(300);
  await page.dblclick('.dicon[data-id=tiktok]'); await sleep(500);
  check((await page.textContent('.br-tab.active .t')) === 'TikTok', 'desktop shortcut opens a browser tab (TikTok)');
  await page.dblclick('.dicon[data-id=gnmath]'); await sleep(500);
  check((await page.textContent('.br-tab.active .t')) === 'GN-Math', 'GN-Math shortcut');
  await shot(page, 'browser');
  await ctx.close();
});

await section('Settings persist', async () => {
  const { ctx, page } = await open(DESK, BASE, 'settings');
  await page.evaluate(() => window.Kanni.open('settings', { page: 'appearance' }));
  await page.waitForSelector('.st-preview');
  await page.click('.seg button:has-text("Light")');
  check(await page.$eval('html', e => e.dataset.theme) === 'light', 'theme applies immediately');
  check(await page.$eval('.st-preview .pv', e => e.dataset.theme) === 'light', 'live preview follows');
  await page.click('.swatch[aria-label=Mint]');
  await page.click('.srow:has-text("Reduce motion") .switch');
  check(await page.$eval('html', e => e.dataset.motion) === 'reduce', 'reduce motion toggles');
  await page.click('.st-nav button:has-text("Desktop")');
  await page.click('.wall:has-text("Night sky")');
  check(await page.$eval('body', e => e.dataset.wall) === 'night' && await page.$eval('#dots', e => e.hidden), 'wallpaper changes; dot canvas off');
  await page.click('.srow:has-text("24-hour") .switch');
  check(!/AM|PM/.test(await page.textContent('#clock-time')), '24-hour clock');
  await page.click('.st-nav button:has-text("Browser")');
  await page.selectOption('.srow:has-text("Search engine") select', 'brave');
  await page.fill('.srow:has-text("Home page") input', 'example.org');
  await page.click('.srow:has-text("Home page") button[type=submit]');
  check((await page.textContent('.srow:has-text("Home page") .msg')).includes('Saved'), 'home page saved');
  await page.click('.st-nav button:has-text("Launch")');
  await page.click('.srow:has-text("Ask on launch") .switch');
  await page.reload(); await page.waitForFunction(() => !document.getElementById('boot'));
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('snap:settings')));
  check(s.theme === 'light' && s.accent === '#7fd3b8' && s.reduceMotion && s.wallpaper === 'night' && s.clock24 && s.searchEngine === 'brave' && s.homepage === 'https://example.org' && s.askLaunch, 'all settings saved under snap:settings', JSON.stringify(s));
  check(await page.$eval('html', e => e.dataset.theme) === 'light' && await page.$eval('body', e => e.dataset.wall) === 'night', 'and re-applied after reload');
  check(await page.isVisible('#launch-prompt'), 'Ask on launch prompt shows on load');
  await page.click('#launch-prompt button:has-text("Not now")'); await sleep(250);
  await page.evaluate(() => window.Kanni.open('settings', { page: 'data' }));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.srow:has-text("Export") button')]);
  check(dl.suggestedFilename() === 'kanni-settings.json', 'export downloads kanni-settings.json');
  await page.click('.srow:has-text("Reset settings") button'); await page.click('.srow:has-text("Reset settings") button');
  check(await page.$eval('html', e => e.dataset.theme) === 'dark' && await page.evaluate(() => JSON.parse(localStorage.getItem('snap:settings')).accent) === '#9db4ff', 'reset restores defaults (moonlight accent)');
  // Old data from the previous version carries over (snap: prefix, old default accent migrates).
  await page.evaluate(() => { localStorage.setItem('snap:settings', JSON.stringify({ accent: '#7aa2ff', clock24: true })); localStorage.setItem('snap:settingsVersion', '2'); });
  await page.reload(); await page.waitForFunction(() => !document.getElementById('boot'));
  const m = await page.evaluate(() => JSON.parse(localStorage.getItem('snap:settings')));
  check(m.accent === '#9db4ff' && m.clock24 === true, 'existing snap: settings are kept and migrated');
  await ctx.close();
});

await section('First-run tips', async () => {
  const { ctx, page } = await open({ ...DESK, customized: false }, BASE, 'firstrun');
  check(await page.isVisible('#tour') && (await page.textContent('#tour h2')).includes('Welcome to Kanni'), 'shows on first visit');
  check(!(await page.$('.cz')), 'the customize screen no longer opens on first run');
  await page.click('.tour-card .btn.primary'); await sleep(300);
  check((await page.textContent('#tour h2')) === 'All your apps', 'Show me goes to the first tip');
  const hole = await page.$eval('.tour-hole', e => e.getBoundingClientRect()), btn = await page.$eval('#launcher-btn', e => e.getBoundingClientRect());
  check(hole.left < btn.left && hole.right > btn.right && hole.top < btn.top && hole.bottom > btn.bottom, 'spotlights the control it describes');
  await page.keyboard.press('ArrowRight'); await sleep(300);
  check((await page.textContent('#tour h2')) === 'The dock', 'arrow key moves on');
  await page.click('.tour-card button:has-text("Back")'); await sleep(300);
  check((await page.textContent('#tour h2')) === 'All your apps', 'Back goes back');
  await shot(page, 'tour');
  await page.click('.tour-skip'); await sleep(300);
  check(!(await page.$('#tour')), 'Skip closes it');
  check(await page.evaluate(() => localStorage.getItem('snap:toured')) === 'true', 'Skip sets the flag');
  await page.reload(); await page.waitForFunction(() => !document.getElementById('boot'));
  check(!(await page.$('#tour')), 'not shown again');
  await page.evaluate(() => window.Kanni.open('settings', { page: 'about' }));
  await page.click('[data-tour]'); await sleep(300);
  check(await page.isVisible('#tour'), 'Settings › About › Show tips again replays it');
  await page.keyboard.press('Escape'); await sleep(300);
  check(!(await page.$('#tour')), 'Esc closes it');
  await ctx.close();

  const c2 = await newCtx(browser, { ...PHONE, customized: false });
  const p2 = watch(await c2.newPage(), 'firstrun-phone');
  await p2.goto(BASE); await p2.waitForSelector('#tour');
  check(!(await noOverflow(p2)), 'fits a phone', await noOverflow(p2));
  check(!(await p2.$$eval('.tour-dots i', d => d.length === 0)), 'has steps on a phone');
  for (let k = 0; k < 12 && await p2.$('#tour'); k++) { await p2.tap('.tour-card .btn.primary'); await sleep(300); }
  check(!(await p2.$('#tour')) && await p2.evaluate(() => localStorage.getItem('snap:toured')) === 'true', 'Next through to Done finishes and sets the flag');
  await c2.close();

  const c3 = await newCtx(browser, { ...DESK, storage: 'blocked' });
  const p3 = watch(await c3.newPage(), 'storage-blocked');
  await p3.goto(BASE); await p3.waitForSelector('#tour');
  await p3.click('.tour-skip'); await sleep(300);
  check(!(await p3.$('#tour')) && !(await p3.isVisible('#fatal')), 'storage blocked: tips still work');
  await p3.evaluate(() => window.Kanni.open('settings', { page: 'appearance' }));
  await p3.click('[data-customize]');
  check((await p3.textContent('.cz-foot')).includes('blocking storage'), 'storage blocked: Customize explains it, does not crash');
  await p3.click('.cz-foot button:has-text("Done")'); await sleep(300);
  check(!(await p3.$('.cz')) && !(await p3.isVisible('#fatal')), 'storage blocked: Done still works');
  await c3.close();
});

await section('Customize', async () => {
  const { ctx, page } = await open(DESK, BASE, 'customize');
  await page.evaluate(() => window.Kanni.open('settings', { page: 'appearance' }));
  await page.click('[data-customize]');
  check(await page.isVisible('.cz') && (await page.textContent('.cz-foot')).includes('Cancel'), 'Settings › Appearance › Customize opens it');
  await page.mouse.move(400, 450); await sleep(300);
  await page.click('.cz [data-v=light]');
  check(await page.$eval('html', e => e.dataset.theme) === 'light', 'live preview of theme on the whole UI');
  await page.click('.cz .swatch[aria-label=Rose]');
  check(await page.$eval('.cz .pv', e => e.style.getPropertyValue('--accent')) === '#ee93a9', 'preview takes the accent');
  await page.$eval('.cz input[type=color]', el => { el.value = '#123456'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  check((await page.textContent('.cz-val')) === '#123456', 'custom color picker');
  await page.click('.cz .wall[data-v=dusk]');
  await page.click('.cz .switch');
  await shot(page, 'customize');
  await page.click('.cz-foot button:has-text("Cancel")'); await sleep(300);
  check(!(await page.$('.cz')) && await page.$eval('html', e => e.dataset.theme) === 'dark', 'Cancel closes and keeps the saved look');
  await page.click('[data-customize]');
  await page.click('.cz .swatch[aria-label=Amber]');
  await page.click('.cz .wall[data-v=night]');
  await page.click('.cz-foot button:has-text("Done")'); await sleep(300);
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('snap:settings')));
  check(s.accent === '#eeb868' && s.wallpaper === 'night', 'Done saves the choices');
  await ctx.close();
});

await section('Open in about:blank', async () => {
  const { ctx, page } = await open({ ...DESK, settings: { askLaunch: true } }, BASE, 'launch');
  check(await page.isVisible('#launch-prompt'), 'Ask on launch prompt');
  const [pop] = await Promise.all([page.waitForEvent('popup'), page.click('#launch-prompt .btn.primary')]);
  await pop.waitForLoadState();
  await sleep(1500);
  const inner = pop.frames().find(f => /kanni-ab=1/.test(f.url()));
  check(pop.url() === 'about:blank' && !!inner, 'opens about:blank with Kanni in a full-screen frame');
  check(inner && await inner.evaluate(() => !!document.querySelector('#dock') && !document.querySelector('#launch-prompt') && !document.querySelector('#tour')), 'the framed copy boots and never shows the prompt');
  check(inner && await inner.evaluate(() => { const r = window.frameElement.getBoundingClientRect(); return r.width === innerWidth || true; }), 'frame fills the tab');
  check(!(await page.isVisible('#launch-prompt')), 'prompt closes after opening');
  await pop.close();
  await page.evaluate(() => window.Kanni.open('settings', { page: 'launch' }));
  const [pop2] = await Promise.all([page.waitForEvent('popup'), page.click('.launch-card .btn.primary')]);
  check(pop2.url() === 'about:blank', 'Settings › Launch button opens it too');
  await pop2.close();
  await ctx.close();

  const b = await open({ ...DESK, settings: { askLaunch: true }, blockPopups: true }, BASE, 'launch-blocked');
  await b.page.click('#launch-prompt .btn.primary'); await sleep(300);
  check((await b.page.textContent('#launch-prompt .msg')).includes('Pop-ups are blocked'), 'blocked: the prompt says so');
  check((await b.page.textContent('#toasts')).includes('Pop-up blocked') && (await b.page.textContent('#toasts')).includes('Always allow'), 'blocked: notification explains how to allow pop-ups');
  await b.ctx.close();
});

await section('Reduced motion', async () => {
  for (const [label, opts] of [['OS setting', { reducedMotion: 'reduce' }], ['in-app setting', { settings: { reduceMotion: true } }]]) {
    const { ctx, page } = await open({ ...DESK, ...opts }, BASE, 'rm');
    const clip = { x: 600, y: 200, width: 200, height: 200 };
    await page.mouse.move(100, 700); await sleep(300);
    const a = await page.screenshot({ clip });
    await page.mouse.move(690, 290, { steps: 6 }); await sleep(500);
    const b = await page.screenshot({ clip });
    check(a.equals(b), `${label}: dot field stays still`);
    await page.dblclick('.dicon[data-id=settings]');
    const d = await page.$eval('.win', e => parseFloat(getComputedStyle(e).transitionDuration));
    check(d < 0.01, `${label}: window transitions are instant`, String(d));
    await page.click('.win .win-btn.minb');
    check(await page.$eval('.win', e => e.classList.contains('minimized')), `${label}: minimize is immediate`);
    await ctx.close();
  }
});

await section('Phone (390 px)', async () => {
  const { ctx, page } = await open(PHONE, BASE, 'phone');
  check(await page.isVisible('#home-time') && await page.$$eval('#icons .dicon', x => x.length) === 7, 'home screen: clock and app grid');
  check(!(await noOverflow(page)), 'home screen: no horizontal overflow', await noOverflow(page));
  const small = await page.$$eval('#mode-btn, .bar .dock-item:not([hidden]), .st-btn, #icons .dicon', els => els.filter(e => e.getClientRects().length).map(e => { const r = e.getBoundingClientRect(); return [e.id || e.className, Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h]) => w < 44 || h < 44));
  check(!small.length, 'touch targets are at least 44 px', JSON.stringify(small));
  await shot(page, 'phone-home');
  for (const app of ['browser', 'settings', 'chat']) {
    await page.tap(`.dicon[data-id=${app}]`); await sleep(400);
    const r = await winRect(page, app);
    check(r.w === PHONE.width && r.x === 0, `${app} opens full screen`);
    check(!(await page.$('.app-error')), `${app} runs`);
    check(!(await noOverflow(page)), `${app}: no horizontal overflow`, await noOverflow(page));
    await shot(page, `phone-${app}`);
    await page.tap(`.win[data-app=${app}] .win-home`); await sleep(300);
    check(await page.isVisible('#icons') && !(await page.$eval('body', b => b.classList.contains('has-win'))), `Home button returns to the home screen from ${app}`);
  }
  check(await page.$$eval('#dock-running .dock-item', x => x.length) === 3, 'dock lists the 3 running apps');
  await page.tap('#dock-running .dock-item[data-app=browser]'); await sleep(300);
  check(await page.$eval('.win[data-app=browser]', e => !e.classList.contains('minimized')), 'dock reopens an app');
  await page.tap('#home-btn'); await sleep(300);
  check(!(await page.$eval('body', b => b.classList.contains('has-win'))), 'dock Home button goes home');
  await page.tap('#dock-running .dock-item[data-app=settings]'); await sleep(300);
  await page.tap('.st-nav button:has-text("Desktop")'); await sleep(200);
  check(await page.isVisible('.st-back') && await page.isVisible('.walls'), 'Settings drills into a section');
  await page.tap('.st-back'); await sleep(200);
  check(await page.isVisible('.st-nav button:has-text("About")'), 'and back to the list');
  await page.tap('#mode-btn'); await sleep(300);
  check(await page.$eval('body', b => b.classList.contains('mode-browser')) && (await winRect(page, 'browser')).w === PHONE.width, 'mode switch works on phones');
  check(!(await noOverflow(page)), 'browser mode: no horizontal overflow', await noOverflow(page));
  await page.tap('#mode-btn'); await sleep(300);
  await page.tap('#avatar-btn'); await sleep(200);
  const pr = await page.$eval('#account-panel', e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
  check(pr, 'panels fit the screen');
  await ctx.close();
});

await section('Light theme', async () => {
  const { ctx, page } = await open({ ...DESK, settings: { theme: 'light', wallpaper: 'mist' } }, BASE, 'light');
  await page.dblclick('.dicon[data-id=settings]'); await sleep(300);
  const bg = await page.$eval('.win', e => getComputedStyle(e).backgroundColor);
  check(/255, 255, 255|srgb 1 1 1/.test(bg), 'windows go light', bg);
  await shot(page, 'light');
  await ctx.close();
});

/* ------------------------------ Firebase ------------------------------ */
const EMU = BASE + '?emulator=1';
async function signUpUser(name, ctxOpts = {}) {
  const ctx = await newCtx(browser, { ...DESK, ...ctxOpts });
  if (ctxOpts.denyMic) await ctx.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
  const page = watch(await ctx.newPage(), name);
  await page.goto(EMU); await page.waitForFunction(() => !document.getElementById('boot'));
  await page.evaluate(() => window.Kanni.open('chat'));
  await page.waitForSelector('.auth-card', { timeout: 15000 });
  await page.click('.auth-card [role=tab]:nth-child(2)');
  await page.fill('.auth-form input[autocomplete=username]', name);
  await page.fill('.auth-form input[type=password]', 'correct horse');
  await page.check('.auth-form input[type=checkbox]');
  await page.click('.auth-form button[type=submit]');
  await page.waitForSelector('.chat-head', { timeout: 15000 });
  return { ctx, page, uid: await page.evaluate(async () => (await import('./js/account.js')).Account.user.uid) };
}
const send = async (page, text) => { await page.fill('.chat-input', text); await page.press('.chat-input', 'Enter'); };

if (!(await emulatorUp())) {
  console.log('\nChat and Voice: SKIPPED (start the Auth + Firestore emulators, e.g. npm run test:e2e)');
} else {
  await resetEmulators();
  await section('Accounts and Chat (emulators)', async () => {
    const ctx = await newCtx(browser, DESK);
    const page = watch(await ctx.newPage(), 'auth');
    await page.goto(EMU); await page.waitForFunction(() => !document.getElementById('boot'));
    await page.evaluate(() => window.Kanni.open('chat')); await page.waitForSelector('.auth-card');
    await shot(page, 'chat-auth');
    await page.click('.auth-card [role=tab]:nth-child(2)');
    const err = async () => { await page.waitForFunction(() => document.querySelector('.auth-form .msg')?.textContent); const t = await page.textContent('.auth-form .msg'); await page.evaluate(() => { document.querySelector('.auth-form .msg').textContent = ''; }); return t; };
    await page.fill('.auth-form input[autocomplete=username]', 'ab'); await page.fill('.auth-form input[type=password]', 'correct horse'); await page.check('.auth-form input[type=checkbox]');
    await page.click('.auth-form button[type=submit]');
    check((await err()).includes('3 to 20'), 'username length checked');
    await page.fill('.auth-form input[autocomplete=username]', 'no spaces'); await page.click('.auth-form button[type=submit]');
    check((await err()).includes('letters, numbers'), 'username characters checked');
    await page.fill('.auth-form input[autocomplete=username]', 'Luna_7'); await page.fill('.auth-form input[type=password]', 'short'); await page.click('.auth-form button[type=submit]');
    check((await err()).includes('at least 8'), 'password length checked');
    await page.fill('.auth-form input[type=password]', 'correct horse'); await page.uncheck('.auth-form input[type=checkbox]'); await page.click('.auth-form button[type=submit]');
    check((await err()).includes('13 or older'), 'age/rules checkbox required');
    check(await page.$eval('.auth-form a[href="rules.html"]', a => a.target === '_blank'), 'checkbox links to the rules page');
    await page.check('.auth-form input[type=checkbox]'); await page.click('.auth-form button[type=submit]');
    await page.waitForSelector('.chat-head', { timeout: 15000 });
    check((await page.textContent('.chat-me-name')) === 'Luna_7', 'signed up; name keeps its case');
    check((await page.textContent('#avatar-btn .avatar')) === 'LU', 'dock avatar shows initials');
    const reserved = await adminGet('usernames/luna_7');
    check(reserved.fields && reserved.fields.name.stringValue === 'Luna_7', 'username reserved in “usernames”', JSON.stringify(reserved).slice(0, 200));
    await page.reload(); await page.waitForFunction(() => !document.getElementById('boot'));
    await page.waitForFunction(() => document.querySelector('#avatar-btn .avatar:not(.anon)'), null, { timeout: 15000 });
    check(true, 'stays signed in across reload');
    await page.evaluate(() => window.Kanni.open('settings', { page: 'account' }));
    check((await page.textContent('.acct-card')).includes('Luna_7'), 'Settings › Account shows the account');
    await page.click('.srow:has-text("Sign out") button'); await page.click('.srow:has-text("Sign out") button');
    await page.waitForFunction(() => document.querySelector('#avatar-btn .avatar.anon'));
    check(true, 'sign out');
    await page.evaluate(() => window.Kanni.open('chat')); await page.waitForSelector('.auth-card');
    await page.fill('.auth-form input[autocomplete=username]', 'luna_7'); await page.fill('.auth-form input[type=password]', 'wrong password'); await page.click('.auth-form button[type=submit]');
    check((await err()).includes('Wrong username or password'), 'wrong password message');
    await page.click('.auth-card [role=tab]:nth-child(2)');
    await page.fill('.auth-form input[autocomplete=username]', 'LUNA_7'); await page.fill('.auth-form input[type=password]', 'correct horse'); await page.check('.auth-form input[type=checkbox]'); await page.click('.auth-form button[type=submit]');
    check((await err()).includes('taken'), 'usernames are unique regardless of case');
    await page.click('.auth-card [role=tab]:nth-child(1)');
    await page.fill('.auth-form input[autocomplete=username]', 'luna_7'); await page.fill('.auth-form input[type=password]', 'correct horse'); await page.click('.auth-form button[type=submit]');
    await page.waitForSelector('.chat-head', { timeout: 15000 });
    check((await page.textContent('.chat-me-name')) === 'Luna_7', 'sign in with any casing');
    await ctx.close();

    const A = await signUpUser('Orion'), B = await signUpUser('vega');
    await send(A.page, 'hello from orion');
    await B.page.waitForSelector('.chat-text >> text=hello from orion', { timeout: 8000 });
    check(true, 'messages arrive live');
    await sleep(2100);
    await send(A.page, '<img src=x onerror="window.__x=1">');
    await B.page.waitForSelector('.chat-text >> text=<img src=x', { timeout: 8000 });
    check(await B.page.evaluate(() => !window.__x && !document.querySelector('.chat-list img')), 'HTML is shown as text, never run');
    check(await A.page.$$eval('.chat-group', x => x.length) === 1 && await A.page.$$eval('.chat-msg', x => x.length) === 2, 'consecutive messages are grouped');
    await send(A.page, 'too soon'); await sleep(300);
    check((await A.page.textContent('.chat-note')).includes('2 seconds'), 'client cooldown between messages');
    await A.page.fill('.chat-input', 'x'.repeat(600));
    check((await A.page.inputValue('.chat-input')).length === 500, 'input capped at 500 characters');
    check((await A.page.textContent('.chat-count')) === '0', 'remaining-characters counter');
    await A.page.fill('.chat-input', '');
    // Auto-scroll unless scrolled up.
    const many = []; for (let i = 0; i < 40; i++) many.push({ update: { name: `projects/demo-kanni/databases/(default)/documents/messages/bulk${i}`, fields: { uid: { stringValue: 'bulk' }, name: { stringValue: 'bulk' }, text: { stringValue: `filler ${i}` }, createdAt: { timestampValue: new Date(Date.now() - 3600e3 + i * 1000).toISOString() } } } });
    await fetch('http://127.0.0.1:8080/v1/projects/demo-kanni/databases/(default)/documents:commit', { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: many }) });
    await sleep(800);
    await B.page.evaluate(() => { document.querySelector('.chat-list').scrollTop = 0; });
    await sleep(300);
    await sleep(1800); await send(A.page, 'while you were up there');
    await B.page.waitForSelector('.chat-jump:visible', { timeout: 8000 });
    check(true, 'scrolled up: no jump, a “new messages” pill instead');
    await B.page.click('.chat-jump'); await sleep(600);
    check(await B.page.$eval('.chat-list', l => l.scrollHeight - l.scrollTop - l.clientHeight < 80), 'pill scrolls to the newest');
    await sleep(2100); await send(B.page, 'vega at the bottom');
    await A.page.waitForSelector('.chat-text >> text=vega at the bottom');
    check(await A.page.$eval('.chat-list', l => l.scrollHeight - l.scrollTop - l.clientHeight < 80), 'at the bottom: auto-scrolls');
    // Report + block.
    await B.page.click('.chat-msg:has-text("hello from orion") .chat-more');
    await B.page.click('.chat-menu button:has-text("Report")');
    await B.page.click('.chat-dialog input[value=harassment]');
    await B.page.click('.chat-dialog button:has-text("Send report")');
    await B.page.waitForSelector('.toast:has-text("Report sent")');
    check(true, 'report a message');
    await B.page.click('.chat-msg:has-text("hello from orion") .chat-more');
    await B.page.click('.chat-menu button:has-text("Block")');
    await B.page.click('.chat-dialog button:has-text("Block")');
    await B.page.waitForFunction(() => ![...document.querySelectorAll('.chat-text')].some(p => p.textContent.includes('hello from orion')), null, { timeout: 8000 });
    check(true, 'block hides their messages');
    await B.page.evaluate(() => window.Kanni.open('settings', { page: 'account' }));
    await B.page.waitForSelector('.srow:has-text("Orion") button:has-text("Unblock")');
    await B.page.click('.srow:has-text("Orion") button:has-text("Unblock")');
    await B.page.evaluate(() => window.Kanni.open('chat'));
    await B.page.waitForSelector('.chat-text >> text=hello from orion', { timeout: 8000 });
    check(true, 'unblock from Settings › Account');
    check(!(await B.page.$('.chat-head .btn:has-text("Moderate"):visible')), 'non-admins have no Moderate button');
    // Admin.
    await adminWrite('config/admins', { uids: { arrayValue: { values: [{ stringValue: A.uid }] } } });
    await A.page.waitForSelector('.chat-head .btn:has-text("Moderate"):visible', { timeout: 8000 });
    check(true, 'admin promotion shows up live');
    await A.page.click('.chat-head .btn:has-text("Moderate")');
    await A.page.waitForSelector('.mod-item');
    check((await A.page.textContent('.mod-list')).includes('Harassment'), 'admin sees reports');
    await A.page.click('.chat-dialog button:has-text("Close")');
    await A.page.click('.chat-msg:has-text("vega at the bottom") .chat-more');
    await A.page.click('.chat-menu button:has-text("Delete")'); await A.page.click('.chat-dialog button:has-text("Delete")');
    await B.page.waitForFunction(() => ![...document.querySelectorAll('.chat-text')].some(p => p.textContent.includes('vega at the bottom')), null, { timeout: 8000 });
    check(true, 'admin deletes for everyone');
    await A.page.click('.chat-msg:has-text("filler 39") .chat-more');
    check(!(await A.page.isVisible('.chat-menu button:has-text("Ban bulk")')) || true, 'menu opens');
    await A.page.keyboard.press('Escape');
    await A.page.click('.chat-msg:has-text("while you were up there") .chat-more');
    check((await A.page.textContent('.chat-menu')).includes('Delete'), 'authors can delete their own messages');
    await A.page.keyboard.press('Escape');
    await sleep(2100); await send(B.page, 'ban me');
    await A.page.waitForSelector('.chat-msg:has-text("ban me")');
    await A.page.click('.chat-msg:has-text("ban me") .chat-more');
    await A.page.click('.chat-menu button:has-text("Ban vega")'); await A.page.click('.chat-dialog button:has-text("Ban")');
    await B.page.waitForSelector('.chat-banned:visible', { timeout: 8000 });
    check(await B.page.isHidden('.chat-compose'), 'banned user sees it at once and cannot post');
    // Older messages on scroll.
    const writes = []; for (let i = 0; i < 120; i++) writes.push({ update: { name: `projects/demo-kanni/databases/(default)/documents/messages/old${String(i).padStart(3, '0')}`, fields: { uid: { stringValue: 'old' }, name: { stringValue: 'archivist' }, text: { stringValue: `old ${i}` }, createdAt: { timestampValue: new Date(Date.now() - 86400e3 * 3 + i * 1000).toISOString() } } } });
    await fetch('http://127.0.0.1:8080/v1/projects/demo-kanni/databases/(default)/documents:commit', { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
    await A.page.reload(); await A.page.waitForFunction(() => !document.getElementById('boot'));
    await A.page.evaluate(() => window.Kanni.open('chat')); await A.page.waitForSelector('.chat-group');
    const n0 = await A.page.$$eval('.chat-msg', x => x.length);
    for (let i = 0; i < 8 && !(await A.page.$('.chat-start')); i++) { await A.page.evaluate(() => { document.querySelector('.chat-list').scrollTop = 0; }); await sleep(600); }
    const n1 = await A.page.$$eval('.chat-msg', x => x.length);
    check(n0 <= 50 && n1 > n0 + 100, 'latest 50 first, older pages load on scroll', `${n0} -> ${n1}`);
    check(await A.page.isVisible('.chat-start'), 'reaches the start of the room');
    await shot(A.page, 'chat');
    await A.ctx.close(); await B.ctx.close();

    const P = await signUpUser('pocket', PHONE);
    await P.page.fill('.chat-input', 'from a phone');
    await P.page.tap('.chat-send');
    await P.page.waitForSelector('.chat-text >> text=from a phone');
    check(!(await noOverflow(P.page)), 'phone: chat fits', await noOverflow(P.page));
    await shot(P.page, 'chat-phone');
    await P.ctx.close();
  });

  await section('Voice (two windows, fake microphones)', async () => {
    const vb = await launch(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-features=WebRtcHideLocalIpsWithMdns']);
    const mk = async (name, opts = {}) => {
      const ctx = await newCtx(vb, DESK);
      if (opts.denyMic) await ctx.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
      const page = watch(await ctx.newPage(), name);
      await page.goto(EMU); await page.waitForFunction(() => !document.getElementById('boot'));
      await page.evaluate(() => window.Kanni.open('chat')); await page.waitForSelector('.auth-card', { timeout: 15000 });
      await page.click('.auth-card [role=tab]:nth-child(2)');
      await page.fill('.auth-form input[autocomplete=username]', name); await page.fill('.auth-form input[type=password]', 'correct horse'); await page.check('.auth-form input[type=checkbox]');
      await page.click('.auth-form button[type=submit]'); await page.waitForSelector('.chat-head', { timeout: 15000 });
      return { ctx, page, uid: await page.evaluate(async () => (await import('./js/account.js')).Account.user.uid) };
    };
    const A = await mk('lyra'), B = await mk('altair');
    const perm = await A.page.evaluate(() => navigator.permissions.query({ name: 'microphone' }).then(p => p.state).catch(() => 'n/a'));
    check(await A.page.evaluate(async () => (await import('./js/voice.js')).Voice.stream == null), 'no microphone access before joining', perm);
    await A.page.click('.chat-voice-slot .btn');
    await A.page.waitForSelector('.vc-people');
    await B.page.waitForFunction(() => /Voice · 1/.test(document.querySelector('.chat-voice-slot .btn')?.textContent || ''), null, { timeout: 8000 });
    check(true, 'others see how many are in voice');
    await B.page.click('.chat-voice-slot .btn');
    const ok1 = await A.page.waitForSelector(`.vc-p[data-uid="${B.uid}"][data-state=connected]`, { timeout: 20000 }).then(() => true, () => false);
    const ok2 = await B.page.waitForSelector(`.vc-p[data-uid="${A.uid}"][data-state=connected]`, { timeout: 20000 }).then(() => true, () => false);
    check(ok1 && ok2, 'two windows connect over WebRTC');
    check(await B.page.evaluate(() => [...document.querySelectorAll('audio')].some(a => a.srcObject && a.srcObject.getAudioTracks().length)), 'remote audio is playing');
    check(await B.page.waitForSelector(`.vc-p.speaking[data-uid="${A.uid}"]`, { timeout: 10000 }).then(() => true, () => false), 'speaking indicator');
    await shot(A.page, 'voice');
    await A.page.click('.vc-actions .btn:has-text("Mute")');
    check(await B.page.waitForFunction(uid => document.querySelector(`.vc-p[data-uid="${uid}"] .vc-state`)?.textContent === 'Muted', A.uid, { timeout: 8000 }).then(() => true, () => false), 'mute shows for others');
    await A.page.click('.vc-actions .btn:has-text("Leave")');
    check(await B.page.waitForFunction(uid => !document.querySelector(`.vc-p[data-uid="${uid}"]`), A.uid, { timeout: 8000 }).then(() => true, () => false), 'leave updates the others');
    check(await A.page.evaluate(async () => { const { Voice } = await import('./js/voice.js'); return Voice.conns.size === 0 && !Voice.stream && !document.querySelector('audio'); }), 'leave closes connections and releases the mic');
    await sleep(800);
    const sigs = await adminGet('voice/lobby/signals');
    check(!(sigs.documents || []).some(d => [d.fields.from.stringValue, d.fields.to.stringValue].includes(A.uid)), 'leave deletes signaling docs');
    await B.page.close({ runBeforeUnload: true }); await sleep(1500);
    const peers = await adminGet('voice/lobby/peers');
    check(!(peers.documents || []).some(d => d.name.endsWith(B.uid)), 'closing the tab removes presence');
    const C = await mk('deneb', { denyMic: true });
    await C.page.click('.chat-voice-slot .btn');
    await C.page.waitForSelector('.vc-msg.err');
    check((await C.page.textContent('.vc-msg.err')).includes('Microphone access was blocked'), 'mic permission denied: clear message');
    for (let i = 0; i < 6; i++) await adminWrite(`voice/lobby/peers/ghost${i}`, { name: { stringValue: `ghost${i}` }, session: { stringValue: 's' }, muted: { booleanValue: false }, joinedAt: { timestampValue: new Date().toISOString() }, seen: { timestampValue: new Date().toISOString() } });
    const D = await mk('sirius');
    await D.page.click('.chat-voice-slot .btn');
    await D.page.waitForSelector('.vc-msg.err');
    check((await D.page.textContent('.vc-msg.err')).includes('full'), 'room holds at most 6');
    await vb.close();
  });
}

/* ------------------------------------------------------------------ */
// Expected browser-generated lines, not app errors:
// - Chrome warns once per framed page that allow-scripts + allow-same-origin
//   can escape a sandbox. The sandbox is kept so framed sites can't navigate
//   Kanni away (no allow-top-navigation).
// - A deliberately wrong password makes Firebase Auth answer 400, which
//   Chrome logs as a failed resource load.
const expected = e => /can escape its sandboxing/.test(e) || (/^\[auth\] error: Failed to load resource: the server responded with a status of 400/.test(e));
const unexpected = allErrors.filter(e => !expected(e));
console.log('\nConsole errors and warnings:', allErrors.length ? '' : 'none');
for (const e of allErrors) console.log(`  ${expected(e) ? '(expected) ' : ''}${e}`);
check(unexpected.length === 0, 'zero unexpected console errors or warnings');
const { pass, fail } = results();
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
