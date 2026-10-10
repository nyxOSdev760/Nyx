// New-feature end-to-end tests (widgets, desktops, lock, bookmarks, sounds,
// personalization, what's new) at 1440px and 390px. Run: node phase7.mjs
import { serve, launch, newCtx, watch, check, section, results, allErrors, sleep, noOverflow, BASE } from './lib.mjs';

const server = await serve(8123);
const browser = await launch(['--autoplay-policy=no-user-gesture-required']);
const DESK = { width: 1440, height: 860 };
const PHONE = { width: 390, height: 844, mobile: true };
const EMU = BASE;

async function open(opts = {}, tag = 'p7', seed) {
  const ctx = await newCtx(browser, opts);
  if (seed) await ctx.addInitScript(seed);
  const page = watch(await ctx.newPage(), tag);
  // Abort Open-Meteo so weather shows its offline state deterministically.
  await ctx.route(/open-meteo\.com/, r => r.abort());
  await page.goto(BASE);
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 6000 });
  return { ctx, page };
}
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAA0UlEQVR4nNXG4UYDAACF0e8h7rNNkklmMkmSJMkkk0wmmUySySRJ0vu1+xrfj8Mhf8t/M/LbiJGfRox8N2LkqxEjn40Y+WjEyKYRI++NGFk3YuStESOvjRh5acTIqhEjz40YWTZi5KkRI4+NGFk0YuShESPzRozcN2LkrhEjs0aM3DZi5KYRI9NGjFw3YuSqESOXjRi5aMTIeSNGzhoxctqIkZNGjBw3YuSoESOTRowcNmJk3IiRUSNGDhoxst+IkWEjRvYaMbLbiJGdRowMGrEtBwifHu8+MF0AAAAASUVORK5CYII=';

await section('Boot has no console warnings (AudioContext deferred)', async () => {
  const { ctx, page } = await open(DESK, 'boot');
  await sleep(600);
  const audioWarn = allErrors.some(e => /AudioContext/.test(e));
  check(!audioWarn, 'no AudioContext warning before a gesture');
  await page.mouse.click(700, 400); await sleep(100);
  check(await page.evaluate(() => !document.getElementById('boot')), 'desktop is up');
  await ctx.close();
});

await section('Personalization: live wallpaper + reduced motion + fonts', async () => {
  const { ctx, page } = await open({ ...DESK, settings: { wallpaper: 'rain', font: 'spacegrotesk' } }, 'live');
  await sleep(400);
  check(await page.$eval('#dots', c => !c.hidden), 'live wallpaper canvas is shown');
  check(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-ui').includes('Space Grotesk')), 'chosen font applied');
  // One backdrop at a time: switch to the dot field, canvas still present, live off.
  await page.evaluate(() => window.Kanni.open('settings', { page: 'desktop' })); await sleep(300);
  await page.click('.wall:has-text("Dot field")'); await sleep(300);
  check(await page.$eval('body', b => b.dataset.wall) === 'oled', 'switched to dot field');
  await ctx.close();

  // Reduced motion: the backdrop must not animate (frames identical over time).
  const r = await open({ ...DESK, settings: { wallpaper: 'aurora' }, reducedMotion: 'reduce' }, 'rm-live');
  await sleep(300);
  const a = await r.page.screenshot({ clip: { x: 500, y: 300, width: 200, height: 200 } });
  await sleep(500);
  const b = await r.page.screenshot({ clip: { x: 500, y: 300, width: 200, height: 200 } });
  check(a.equals(b), 'reduced motion: live wallpaper is static');
  await r.ctx.close();
});

await section('Personalization: custom wallpaper + auto accent', async () => {
  const { ctx, page } = await open(DESK, 'wall');
  await page.evaluate(() => window.Kanni.open('settings', { page: 'desktop' })); await sleep(300);
  await page.setInputFiles('.srow input[type=file]', { name: 'w.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
  await sleep(600);
  check(await page.$eval('body', b => b.dataset.wall) === 'custom', 'custom wallpaper applied');
  check(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--custom-wall').startsWith('url(')), 'custom image stored and set');
  await page.evaluate(() => window.Kanni.open('settings', { page: 'appearance' })); await sleep(300);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('snap:settings')).accent);
  await page.click('.srow:has-text("Accent from wallpaper") .switch'); await sleep(600);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('snap:settings')).accent);
  check(before !== after, 'auto accent derived a color from the image', `${before} -> ${after}`);
  await ctx.close();
});

await section('Widgets', async () => {
  const { ctx, page } = await open(DESK, 'widgets');
  await page.evaluate(() => window.Kanni.open('widgets')); await sleep(300);
  for (const t of ['Clock', 'Calendar', 'Weather']) { await page.click(`.wgpick-row:has-text("${t}") button`); await sleep(150); }
  await page.evaluate(() => { for (const w of document.querySelectorAll('.win')) w.remove(); });
  await sleep(500);
  check(await page.$$eval('#widgets .widget', x => x.length) === 3, 'three widgets on the desktop');
  check(await page.$('.widget[data-type=calendar] .wg-day.today') != null, 'calendar highlights today');
  await sleep(400);
  check((await page.textContent('.widget[data-type=weather]')).match(/city|unavailable/i) != null, 'weather shows a city prompt or offline state');
  // Drag the clock
  const start = await page.evaluate(() => { const w = JSON.parse(localStorage.getItem('snap:widgets')).find(w => w.type === 'clock'); return [Math.round(w.x), Math.round(w.y)]; });
  const clk = await page.$('.widget[data-type=clock]'); const bx = await clk.boundingBox();
  await page.mouse.move(bx.x + 40, bx.y + 6); await page.mouse.down(); await page.mouse.move(bx.x - 200, bx.y + 220, { steps: 10 }); await page.mouse.up(); await sleep(300);
  const moved = await page.evaluate(() => { const w = JSON.parse(localStorage.getItem('snap:widgets')).find(w => w.type === 'clock'); return [Math.round(w.x), Math.round(w.y)]; });
  check(moved[0] !== start[0] || moved[1] !== start[1], 'widget drag persists', `${start} -> ${moved}`);
  await ctx.close();

  const m = await open(PHONE, 'widgets-m');
  await m.page.evaluate(() => window.Kanni.open('widgets')); await sleep(200);
  await m.page.click('.wgpick-row:has-text("Clock") button'); await m.page.click('.wgpick-row:has-text("Calendar") button'); await sleep(200);
  await m.page.evaluate(() => { for (const w of document.querySelectorAll('.win')) w.remove(); document.body.classList.remove('has-win'); });
  await sleep(400);
  check(!(await noOverflow(m.page)), 'phone widgets: no horizontal overflow', await noOverflow(m.page));
  await m.ctx.close();
});

await section('Multiple desktops', async () => {
  const { ctx, page } = await open(DESK, 'desk');
  const cur = () => page.evaluate(() => +document.body.dataset.desktop);
  await page.evaluate(() => window.Kanni.open('browser')); await sleep(300);
  await page.click('#desktops .desk-pill.add'); await sleep(400);
  check(await page.$$eval('#desktops .desk-pill:not(.add)', x => x.length) === 2 && await cur() === 1, 'added a desktop and switched to it');
  check(await page.$eval('.win[data-app=browser]', w => w.classList.contains('off-desk')), 'window from desktop 1 is hidden');
  await page.keyboard.press('Control+Alt+ArrowLeft'); await sleep(300);
  check(await cur() === 0 && await page.$eval('.win[data-app=browser]', w => !w.classList.contains('off-desk')), 'Ctrl+Alt+Left returns to desktop 1');
  await page.click('.win[data-app=browser] .win-btn.deskb'); await sleep(150);
  await page.click('.desk-menu button:has-text("Desktop 2")'); await sleep(400);
  check(await cur() === 1 && await page.$eval('.win[data-app=browser]', w => w.dataset.desktop) === '1', 'moved window to desktop 2');
  await page.reload(); await page.waitForFunction(() => !document.getElementById('boot')); await sleep(200);
  check(await page.$$eval('#desktops .desk-pill:not(.add)', x => x.length) === 2, 'desktop count persists');
  await ctx.close();
});

await section('Lock screen', async () => {
  const { ctx, page } = await open(DESK, 'lock');
  await page.evaluate(() => window.Kanni.lock()); await sleep(300);
  check(await page.isVisible('.lock') && await page.isVisible('.lock-hint'), 'locks with no PIN');
  await page.keyboard.press('Enter'); await sleep(300);
  check(!(await page.isVisible('.lock')), 'any key unlocks when there is no PIN');
  await page.evaluate(() => window.Kanni.open('settings', { page: 'lock' })); await sleep(400);
  await page.click('.srow:has-text("PIN") button:has-text("Set a PIN")'); await sleep(200);
  await page.fill('.srow input[aria-label="New PIN"]', '2468');
  await page.fill('.srow input[aria-label="Confirm PIN"]', '2468');
  await page.click('.srow form button:has-text("Save")'); await sleep(400);
  check(await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('snap:lock') || 'null'); return l && l.hash && l.len === 4; }), 'PIN stored as a salted hash with length');
  await page.evaluate(() => window.Kanni.lock()); await sleep(300);
  for (const d of '0000') await page.click(`.lock-key:has-text("${d}")`);
  await sleep(300);
  check((await page.textContent('.lock-msg')).includes('Wrong') && await page.isVisible('.lock'), 'wrong PIN is rejected');
  for (const d of '2468') await page.click(`.lock-key:has-text("${d}")`);
  await sleep(400);
  check(!(await page.isVisible('.lock')), 'correct PIN unlocks');
  // idle setting persists
  await page.evaluate(() => window.Kanni.open('settings', { page: 'lock' })); await sleep(300);
  await page.selectOption('.srow:has-text("Lock when idle") select', '15'); await sleep(200);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('snap:settings')).idleLock === 15), 'idle-lock setting persists as a number');
  await ctx.close();
});

await section('Browser: bookmarks + recently closed', async () => {
  const { ctx, page } = await open(DESK, 'bm');
  await page.evaluate(() => window.Kanni.open('browser')); await sleep(300);
  check(!(await page.isVisible('.br-bookmarks')), 'empty bookmarks bar stays out of the way');
  await page.fill('.br-addr input', 'example.com'); await page.press('.br-addr input', 'Enter'); await sleep(700);
  await page.click('.br-star'); await sleep(250);
  check(await page.$eval('.br-star', s => s.classList.contains('on')) && await page.$$eval('.br-bm', x => x.length) === 1, 'star adds a bookmark to the bar');
  check(await page.isVisible('.br-bookmarks'), 'bookmarks bar appears once something is bookmarked');
  await page.click('.br-new'); await sleep(150);
  await page.fill('.br-addr input', 'example.org'); await page.press('.br-addr input', 'Enter'); await sleep(600);
  const n1 = await page.$$eval('.br-tab', x => x.length);
  await page.click('.br-tab.active .x'); await sleep(250);
  await page.click('.br-top'); await sleep(100);
  await page.keyboard.press('Alt+Shift+T'); await sleep(500);
  check(await page.$$eval('.br-tab', x => x.length) === n1, 'Alt+Shift+T reopens the closed tab');
  await page.click('.icon-btn[aria-label="Recently closed tabs"]'); await sleep(200);
  check(await page.$('.br-menu') != null, 'recently-closed menu opens');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.Kanni.open('settings', { page: 'browser' })); await sleep(300);
  await page.click('.srow:has-text("Show bookmarks bar") .switch'); await sleep(200);
  check(await page.$eval('.br-bookmarks', b => b.hidden), 'bookmarks bar hides via setting');
  await ctx.close();
});

await section('Sounds + What’s new', async () => {
  const { ctx, page } = await open(DESK, 'wn', () => { try { localStorage.setItem('snap:seenVersion', '"1.0.0"'); } catch {} });
  await sleep(600);
  check(await page.isVisible('#whatsnew'), 'What’s new shows after a version change');
  await page.click('#whatsnew .btn'); await sleep(200);
  check(await page.evaluate(() => localStorage.getItem('snap:seenVersion')) === '"1.5.0"', 'records the new version');
  await page.evaluate(() => window.Kanni.open('settings', { page: 'sound' })); await sleep(300);
  await page.click('.srow:has-text("Test") button'); await sleep(150);
  await page.evaluate(() => { const r = document.querySelector('.range'); r.value = '65'; r.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(150);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('snap:settings')).volume === 0.65), 'volume persists');
  check(!allErrors.some(e => /AudioContext/.test(e)), 'playing a sound after a gesture raises no warning');
  await ctx.close();

  // Fresh install: What's new stays silent.
  const fresh = await open(DESK, 'wn-fresh');
  await sleep(500);
  check(!(await fresh.page.isVisible('#whatsnew')), 'fresh install does not show What’s new');
  await fresh.ctx.close();
});

await section('Spotlight, Control Center and menus', async () => {
  const { ctx, page } = await open(DESK, 'spot');
  check(await page.$('#launcher-btn .tile .ico') != null, 'dock launcher shows an app-grid icon');
  await page.keyboard.press('Control+k'); await sleep(250);
  check(await page.isVisible('#spotlight input'), 'Ctrl+K opens Spotlight');
  await page.keyboard.type('2*(3+4)^2'); await sleep(150);
  check((await page.textContent('#spotlight .sp-row[aria-selected=true]')).includes('98'), 'Spotlight does math');
  await page.fill('#spotlight input', 'calcu'); await sleep(150);
  await page.keyboard.press('Enter'); await sleep(400);
  check(!(await page.$('#spotlight')) && await page.isVisible('.win[data-app=calculator]'), 'Enter opens the top app');
  await page.keyboard.press('Control+k'); await sleep(200);
  await page.fill('#spotlight input', 'appearance'); await sleep(150);
  check((await page.textContent('#spotlight .sp-row[aria-selected=true]')).includes('Appearance'), 'finds Settings pages');
  await page.fill('#spotlight input', '2048'); await sleep(150);
  check((await page.textContent('#spotlight')).includes('Play 2048'), 'finds individual games');
  await page.keyboard.press('Escape'); await sleep(250);
  check(!(await page.$('#spotlight')), 'Esc closes Spotlight');
  await page.click('#search-btn'); await sleep(200);
  check(await page.isVisible('#spotlight'), 'search button opens Spotlight');
  await page.keyboard.press('Escape'); await sleep(250);

  await page.click('#bell-btn'); await sleep(250);
  check(await page.isVisible('#cc .cc-tog[data-tog=dnd]'), 'Control Center shows quick toggles');
  await page.click('#cc .cc-tog[data-tog=dnd]'); await sleep(150);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('snap:settings')).notifications === false), 'Do Not Disturb toggles the setting');
  check(await page.$eval('#cc .cc-tog[data-tog=dnd]', b => b.getAttribute('aria-pressed') === 'true'), 'toggle shows its new state');
  await page.click('#cc .cc-tog[data-tog=dark]'); await sleep(150);
  check(await page.$eval('html', e => e.dataset.theme) === 'light', 'dark mode toggle switches the theme');
  await page.click('#cc .cc-tog[data-tog=dark]'); await sleep(150);
  await page.keyboard.press('Escape'); await sleep(150);

  await page.mouse.click(900, 420, { button: 'right' }); await sleep(200);
  check(await page.isVisible('.ctx-menu[aria-label=Desktop]'), 'right-click opens the desktop menu');
  await page.click('.ctx-menu button:has-text("New note")'); await sleep(400);
  check(await page.isVisible('.win[data-app=notes] .nt-ed'), 'New note opens Notes with an editor');

  await page.click('.dock-item[data-app=chat]', { button: 'right' }); await sleep(200);
  await page.click('.ctx-menu button:has-text("Unpin")'); await sleep(200);
  check(!(await page.$('#dock-apps .dock-item[data-app=chat]')) && await page.evaluate(() => JSON.parse(localStorage.getItem('snap:pins')).chat === false), 'dock menu unpins an app');
  await page.mouse.click(700, 200); await page.keyboard.press('Shift+?'); await sleep(250);
  check(await page.isVisible('#keysheet'), 'Shift+? shows keyboard shortcuts');
  await page.keyboard.press('Escape'); await sleep(250);
  await ctx.close();
});

await section('Notes, Calculator, Clock, Games', async () => {
  const { ctx, page } = await open(DESK, 'apps');
  await page.evaluate(() => window.Kanni.open('notes', { new: true })); await sleep(300);
  await page.keyboard.type('Shopping\nmilk and eggs'); await sleep(500);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('snap:notes'))[0].text) === 'Shopping\nmilk and eggs', 'Notes saves as you type');
  check((await page.textContent('.nt-item.on')).includes('Shopping'), 'first line is the title');
  await page.reload(); await page.waitForFunction(() => !document.getElementById('boot'));
  await page.evaluate(() => window.Kanni.open('notes')); await sleep(300);
  check((await page.inputValue('.nt-ed')) === 'Shopping\nmilk and eggs', 'notes persist after reload');

  await page.evaluate(() => window.Kanni.open('calculator')); await sleep(300);
  await page.keyboard.type('12*7+5'); await sleep(100);
  check((await page.textContent('.calc-expr')) === '12×7+5' && (await page.textContent('.calc-out')).includes('89'), 'Calculator shows the expression and live answer');
  await page.keyboard.press('Enter'); await sleep(100);
  check((await page.textContent('.calc-expr')) === '89', 'Enter gives the result');
  await page.click('.calc-k[data-k="clear"]');
  for (const k of ['7', '÷', '0', 'eq']) await page.click(`.calc-k[data-k="${k}"]`);
  check((await page.textContent('.calc-out')).includes('Can’t'), 'divide by zero is handled');

  await page.evaluate(() => window.Kanni.open('clock', { timer: 5 })); await sleep(1200);
  check(/^04:5\d$/.test(await page.textContent('.ck-big')), 'Clock timer counts down', await page.textContent('.ck-big'));
  await page.click('.ck-main'); await sleep(100);
  check((await page.textContent('.ck-main')) === 'Resume', 'timer pauses');
  await page.click('.ck-seg [data-v=watch]'); await page.click('.ck-main'); await sleep(600); await page.click('.ck-second'); await sleep(100);
  check(await page.$$eval('.ck-laps li', x => x.length) === 1, 'stopwatch records a lap');

  await page.evaluate(() => window.Kanni.open('games')); await sleep(400);
  check(await page.$$eval('.gm-card', x => x.length) === 7 && await page.$$eval('.gm-art img', x => x.every(i => i.complete && i.naturalWidth === 480)) && await page.$$eval('.gm-lic', x => x.every(a => a.textContent && /^https:\/\/github\.com\//.test(a.href))), 'Games lists 7 games with real thumbnails, each with a license and source link');
  await page.click('.gm-filter button:has-text("Puzzle")'); await sleep(100);
  check(await page.$$eval('.gm-card', x => x.length) === 2, 'filters by type');
  await page.click('.gm-play[data-game="2048"]'); await sleep(300);
  check(await page.$eval('.gm-frame', f => f.src) === 'https://gabrielecirulli.github.io/2048/' && await page.$eval('.gm-frame', f => !f.sandbox.contains('allow-top-navigation')), 'plays a game in a sandboxed frame that can’t navigate Kanni away');
  await page.click('.gm-back'); await sleep(200);
  check(await page.isVisible('.gm-grid') && (await page.textContent('.gm-card')).includes('Recent'), 'back to the library, last played first');
  await ctx.close();

  const m = await open(PHONE, 'apps-phone');
  check(await m.page.isVisible('#home-search'), 'phone home has a search pill');
  await m.page.tap('#home-search'); await sleep(250);
  check(await m.page.isVisible('#spotlight input'), 'search pill opens Spotlight');
  check(!(await noOverflow(m.page)), 'Spotlight fits a phone', await noOverflow(m.page));
  await m.page.keyboard.press('Escape'); await sleep(200);
  for (const app of ['notes', 'calculator', 'clock', 'games']) {
    await m.page.evaluate(a => window.Kanni.open(a), app); await sleep(350);
    check(!(await m.page.$('.app-error')) && !(await noOverflow(m.page)), `${app} fits a phone`, await noOverflow(m.page));
    await m.page.tap(`.win[data-app=${app}] .win-home`); await sleep(250);
  }
  await m.ctx.close();
});

const unexpected = allErrors.filter(e => !/can escape its sandboxing/.test(e));
console.log('\nConsole errors/warnings:', unexpected.length ? '' : 'none');
for (const e of unexpected) console.log('  ' + e);
check(unexpected.length === 0, 'zero unexpected console errors or warnings');
const { pass, fail } = results();
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
