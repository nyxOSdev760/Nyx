/* Clock: a countdown timer and a stopwatch. Both keep running when the window
   closes; the timer sends a notification and a chime when it ends. */
import { h, Bus } from '../core.js';
import { ICONS } from '../icons.js';
import { registerApp } from '../apps.js';
import { Notify } from '../notify.js';

const pad2 = n => String(Math.floor(n)).padStart(2, '0');
const fmt = (ms, cs = false) => {
  ms = Math.max(0, ms);
  const s = ms / 1000, h_ = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = Math.floor(s) % 60;
  return (h_ ? `${h_}:${pad2(m)}` : pad2(m)) + `:${pad2(sec)}` + (cs ? `.${pad2((ms % 1000) / 10)}` : '');
};

/* Engines live at module level so they survive the window closing. */
const timer = { total: 5 * 60e3, left: 5 * 60e3, endAt: 0, running: false, done: 0 };
const watch = { start: 0, acc: 0, running: false, laps: [] };
let doneT = 0;
function timerLeft() { return timer.running ? Math.max(0, timer.endAt - Date.now()) : timer.left; }
function armDone() {
  clearTimeout(doneT);
  if (!timer.running) return;
  doneT = setTimeout(() => {
    timer.running = false; timer.left = 0; timer.done = Date.now();
    Notify.push({ title: 'Timer done', body: `${fmt(timer.total)} is up.`, app: 'Clock' });
    Bus.emit('sfx', 'wave'); Bus.emit('clock');
  }, timer.endAt - Date.now());
}

registerApp({
  id: 'clock', name: 'Clock', description: 'Timer and stopwatch', icon: ICONS.timer, tint: '#f43f5e', size: [420, 560], pinned: false,
  mount(root, ctx) {
    let tab = 'timer', raf = 0;
    const seg = h('div', { class: 'seg ck-seg', role: 'tablist', 'aria-label': 'Clock' },
      [['timer', 'Timer'], ['watch', 'Stopwatch']].map(([id, n]) => h('button', { type: 'button', role: 'tab', 'data-v': id, text: n, onclick: () => { tab = id; draw(); } })));
    const R = 108, C = 2 * Math.PI * R;
    const ring = h('div', { class: 'ck-ring', svg: `<svg viewBox="0 0 240 240" aria-hidden="true"><circle class="ck-track" cx="120" cy="120" r="${R}"/><circle class="ck-prog" cx="120" cy="120" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>` });
    const big = h('div', { class: 'ck-big tnum', 'aria-live': 'off' });
    const sub = h('small', { class: 'ck-sub' });
    const face = h('div', { class: 'ck-face' }, ring, h('div', { class: 'ck-center' }, big, sub));
    const presets = h('div', { class: 'ck-presets' }, [1, 3, 5, 10, 15, 25, 45, 60].map(m => h('button', { class: 'ck-chip', type: 'button', text: m < 60 ? `${m} min` : '1 hr', onclick: () => setTimer(m * 60e3) })));
    const adj = h('div', { class: 'ck-adj' },
      h('button', { class: 'btn sm', type: 'button', text: '−1 min', onclick: () => setTimer(Math.max(60e3, timer.total - 60e3)) }),
      h('button', { class: 'btn sm', type: 'button', text: '+1 min', onclick: () => setTimer(Math.min(24 * 3600e3, timer.total + 60e3)) }));
    const main = h('button', { class: 'btn primary lg ck-main', type: 'button' });
    const second = h('button', { class: 'btn lg ck-second', type: 'button' });
    const laps = h('ol', { class: 'ck-laps scroll' });
    const el = h('div', { class: 'ck' }, seg, face, h('div', { class: 'ck-ctl' }, second, main), presets, adj, laps);
    root.append(el);

    function setTimer(ms) { timer.total = timer.left = ms; timer.running = false; timer.done = 0; armDone(); draw(); }
    main.addEventListener('click', () => {
      if (tab === 'timer') {
        if (timer.running) { timer.left = timerLeft(); timer.running = false; }
        else { if (!timer.left) timer.left = timer.total; timer.endAt = Date.now() + timer.left; timer.running = true; timer.done = 0; }
        armDone();
      } else {
        if (watch.running) { watch.acc += Date.now() - watch.start; watch.running = false; }
        else { watch.start = Date.now(); watch.running = true; }
      }
      Bus.emit('clock');
    });
    second.addEventListener('click', () => {
      if (tab === 'timer') { timer.running = false; timer.left = timer.total; timer.done = 0; armDone(); }
      else if (watch.running) watch.laps.unshift(watch.acc + Date.now() - watch.start);
      else { watch.acc = 0; watch.laps = []; }
      Bus.emit('clock');
    });

    function draw() {
      seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.v === tab)));
      seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === tab)));
      const isT = tab === 'timer';
      presets.hidden = adj.hidden = !isT; laps.hidden = isT;
      el.classList.toggle('watch', !isT);
      if (isT) {
        const left = timerLeft();
        big.textContent = fmt(left);
        sub.textContent = timer.done ? 'Done!' : timer.running ? `Ends ${new Date(timer.endAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : timer.left < timer.total ? 'Paused' : `${fmt(timer.total)} timer`;
        ring.querySelector('.ck-prog').style.strokeDashoffset = String(C * (1 - left / timer.total));
        main.textContent = timer.running ? 'Pause' : timer.left < timer.total && timer.left > 0 ? 'Resume' : 'Start';
        second.textContent = 'Reset'; second.disabled = !timer.running && timer.left === timer.total;
        presets.querySelectorAll('.ck-chip').forEach((c, i) => c.classList.toggle('on', [1, 3, 5, 10, 15, 25, 45, 60][i] * 60e3 === timer.total));
      } else {
        const t = watch.acc + (watch.running ? Date.now() - watch.start : 0);
        big.textContent = fmt(t, true);
        sub.textContent = watch.laps.length ? `Lap ${watch.laps.length + 1}` : watch.running ? 'Running' : t ? 'Stopped' : 'Stopwatch';
        ring.querySelector('.ck-prog').style.strokeDashoffset = String(C * (1 - ((t / 1000) % 60) / 60));
        main.textContent = watch.running ? 'Stop' : t ? 'Resume' : 'Start';
        second.textContent = watch.running ? 'Lap' : 'Reset'; second.disabled = !watch.running && !t;
        const fastest = watch.laps.length > 1 ? Math.min(...watch.laps.map((l, i) => l - (watch.laps[i + 1] || 0))) : -1;
        laps.replaceChildren(...watch.laps.map((l, i) => { const d = l - (watch.laps[i + 1] || 0); return h('li', { class: d === fastest ? 'best' : null }, h('span', { text: `Lap ${watch.laps.length - i}` }), h('span', { class: 'tnum', text: fmt(d, true) })); }));
      }
      main.classList.toggle('stop', (isT && timer.running) || (!isT && watch.running));
      cancelAnimationFrame(raf);
      if ((isT && timer.running) || (!isT && watch.running)) raf = requestAnimationFrame(draw);
    }
    const startFor = (min) => { tab = 'timer'; setTimer(min * 60e3); timer.endAt = Date.now() + timer.left; timer.running = true; armDone(); Bus.emit('clock'); };
    const off = Bus.on('clock', draw);
    if (ctx.args && ctx.args.timer) startFor(+ctx.args.timer); else draw();
    return { handleArgs: (a) => { if (a && a.timer) startFor(+a.timer); }, destroy: () => { cancelAnimationFrame(raf); off(); } };
  },
});
