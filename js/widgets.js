/* Desktop widgets: Clock, Weather and Calendar. They live on a layer behind
   windows, can be dragged to position on desktop (stacked on phones), and
   their set + positions persist. Weather uses Open-Meteo (no key, no location
   permission): a city search via its geocoding API, current conditions via
   its forecast API. */
import { $, h, uid, clamp, Store, Bus, isMobile, mq } from './core.js';
import { ICONS } from './icons.js';
import { fmtTime } from './shell.js';

const WX_CODE = {
  0: ['Clear', 'sun'], 1: ['Mainly clear', 'sun'], 2: ['Partly cloudy', 'cloud'], 3: ['Overcast', 'cloud'],
  45: ['Fog', 'fog'], 48: ['Rime fog', 'fog'], 51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Dense drizzle', 'rain'],
  61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'], 66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'],
  80: ['Showers', 'rain'], 81: ['Showers', 'rain'], 82: ['Violent showers', 'rain'], 85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm', 'storm'], 99: ['Thunderstorm', 'storm'],
};
const WX_ICON = {
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 9.5a3.5 3.5 0 0 1 .5 8.5Z"/>',
  rain: '<path d="M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 6.5 3.5 3.5 0 0 1 17.5 15Z"/><path d="M8 18.5 7 20.5M12 18.5 11 20.5M16 18.5 15 20.5"/>',
  snow: '<path d="M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 6.5 3.5 3.5 0 0 1 17.5 15Z"/><path d="M9 19h.01M12 20h.01M15 19h.01"/>',
  fog: '<path d="M4 10h13a3.5 3.5 0 0 0-6.5-2.5A4 4 0 0 0 4 10Z"/><path d="M4 14h16M6 18h12"/>',
  storm: '<path d="M7 14a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 5.5 3.5 3.5 0 0 1 17.5 14Z"/><path d="m12 13-2 3.5h3L11 21"/>',
};
const wxIco = (k) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${WX_ICON[k] || WX_ICON.cloud}</svg>`;

/* Widget definitions: each mounts into its card body and returns {destroy?}. */
const TYPES = {
  clock: {
    name: 'Clock', icon: ICONS.clock, w: 220, h: 150,
    mount(body) {
      body.classList.add('wg-clock');
      const t = h('div', { class: 'wg-time tnum' }), d = h('div', { class: 'wg-date' });
      body.append(t, d);
      const upd = (now = new Date()) => { t.textContent = fmtTime(now, false); d.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); };
      upd();
      const off = Bus.on('tick', upd);
      return { destroy: off };
    },
  },
  calendar: {
    name: 'Calendar', icon: ICONS.calendar, w: 280, h: 300,
    mount(body) {
      body.classList.add('wg-cal');
      let view = new Date(); view.setDate(1);
      const head = h('div', { class: 'wg-cal-head' });
      const grid = h('div', { class: 'wg-cal-grid' });
      body.append(head, grid);
      const draw = () => {
        const y = view.getFullYear(), m = view.getMonth(), today = new Date();
        head.replaceChildren(
          h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Previous month', svg: ICONS.back, onclick: () => { view = new Date(y, m - 1, 1); draw(); } }),
          h('b', { text: view.toLocaleDateString([], { month: 'long', year: 'numeric' }) }),
          h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Next month', svg: ICONS.fwd, onclick: () => { view = new Date(y, m + 1, 1); draw(); } }));
        const cells = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => h('span', { class: 'wg-dow', text: d }));
        const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
        for (let i = 0; i < first; i++) cells.push(h('span', { class: 'wg-day out' }));
        for (let d = 1; d <= days; d++) {
          const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
          cells.push(h('span', { class: 'wg-day' + (isToday ? ' today' : ''), text: String(d) }));
        }
        grid.replaceChildren(...cells);
      };
      draw();
      return {};
    },
  },
  weather: {
    name: 'Weather', icon: ICONS.cloud, w: 240, h: 170,
    mount(body, inst) {
      body.classList.add('wg-weather');
      const card = h('div', { class: 'wg-wx-main' });
      const search = h('div', { class: 'wg-wx-search', hidden: true });
      body.append(card, search);
      const unitC = () => (inst.cfg.unit || 'c') === 'c';
      const setCity = (c) => { inst.cfg.city = c; inst.save(); load(); };

      function showSearch() {
        const input = h('input', { class: 'field', type: 'search', placeholder: 'Search city…', 'aria-label': 'Search city', autocomplete: 'off' });
        const list = h('div', { class: 'wg-wx-results' });
        const msg = h('p', { class: 'msg' });
        search.replaceChildren(h('div', { class: 'row nowrap' }, input,
          h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Close search', svg: ICONS.close, onclick: () => { search.hidden = true; card.hidden = false; } })), msg, list);
        search.hidden = false; card.hidden = true; setTimeout(() => input.focus(), 30);
        let timer = 0;
        input.addEventListener('input', () => {
          clearTimeout(timer); const q = input.value.trim();
          if (q.length < 2) { list.replaceChildren(); return; }
          timer = setTimeout(async () => {
            msg.textContent = 'Searching…'; msg.className = 'msg';
            try {
              const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`);
              const j = await r.json();
              msg.textContent = '';
              const items = (j.results || []);
              if (!items.length) { msg.textContent = 'No matches.'; return; }
              list.replaceChildren(...items.map(c => h('button', { class: 'wg-wx-row', type: 'button', onclick: () => { search.hidden = true; card.hidden = false; setCity({ name: c.name, admin1: c.admin1 || '', country: c.country_code || '', lat: c.latitude, lon: c.longitude }); } },
                h('b', { text: c.name }), h('small', { text: [c.admin1, c.country].filter(Boolean).join(', ') }))));
            } catch { msg.textContent = 'Search needs a connection.'; msg.className = 'msg err'; }
          }, 300);
        });
      }

      async function load() {
        const city = inst.cfg.city;
        if (!city) {
          card.replaceChildren(h('div', { class: 'wg-wx-empty' }, h('p', { text: 'Pick a city for live weather.' }),
            h('button', { class: 'btn sm', type: 'button', text: 'Choose city', onclick: showSearch })));
          return;
        }
        card.replaceChildren(h('div', { class: 'wg-wx-load' }, h('span', { class: 'spinner' }), 'Loading…'));
        try {
          const u = unitC() ? 'celsius' : 'fahrenheit';
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code,apparent_temperature&temperature_unit=${u}`);
          if (!r.ok) throw new Error('bad');
          const j = await r.json(), cur = j.current || {};
          const [label, ic] = WX_CODE[cur.weather_code] || ['—', 'cloud'];
          card.replaceChildren(
            h('div', { class: 'wg-wx-top' },
              h('span', { class: 'wg-wx-ico', svg: wxIco(ic) }),
              h('div', { class: 'wg-wx-temp tnum', text: `${Math.round(cur.temperature_2m)}°` }),
              h('button', { class: 'icon-btn sm wg-wx-edit', type: 'button', 'aria-label': 'Change city', svg: ICONS.search, onclick: showSearch })),
            h('div', { class: 'wg-wx-label', text: label }),
            h('div', { class: 'wg-wx-city' },
              h('span', { text: [city.name, city.country].filter(Boolean).join(', ') }),
              h('button', { class: 'wg-wx-unit', type: 'button', text: unitC() ? '°C' : '°F', onclick: () => { inst.cfg.unit = unitC() ? 'f' : 'c'; inst.save(); load(); } })));
        } catch {
          card.replaceChildren(h('div', { class: 'wg-wx-empty' }, h('span', { class: 'wg-wx-ico', svg: wxIco('cloud') }),
            h('p', { text: 'Weather unavailable offline.' }),
            h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', text: 'Retry', onclick: load }),
              h('button', { class: 'btn sm ghost', type: 'button', text: 'Change city', onclick: showSearch }))));
        }
      }
      load();
      return {};
    },
  },
};
export const WIDGET_TYPES = Object.entries(TYPES).map(([id, t]) => ({ id, name: t.name, icon: t.icon }));

export const Widgets = {
  list: [],
  layer: null,
  load() {
    const saved = Store.get('widgets', []);
    this.list = Array.isArray(saved) ? saved.filter(w => w && TYPES[w.type]).map(w => ({ id: w.id || uid(), type: w.type, x: +w.x || 24, y: +w.y || 24, cfg: w.cfg && typeof w.cfg === 'object' ? w.cfg : {} })) : [];
  },
  save() { Store.set('widgets', this.list.map(w => ({ id: w.id, type: w.type, x: w.x, y: w.y, cfg: w.cfg }))); },
  has(type) { return this.list.some(w => w.type === type); },
  area() { return ($('#desktop') || this.layer).getBoundingClientRect(); },
  add(type) {
    if (!TYPES[type] || this.has(type)) return;
    const a = this.area();
    const def = TYPES[type], gap = 16, margin = 28;
    // Right-align every widget to a shared right edge (clear of the left icon
    // column) and stack down. Aligning on the right, not the left, keeps
    // widgets of different widths in the same column.
    const right = a.width - margin;
    const y = this.list.filter(w => Math.abs((w.x + TYPES[w.type].w) - right) < 24)
      .reduce((m, w) => Math.max(m, w.y + TYPES[w.type].h + gap), 28);
    this.list.push({ id: uid(), type, x: clamp(right - def.w, 8, Math.max(8, a.width - def.w - 8)), y: clamp(y, 8, Math.max(8, a.height - def.h - 8)), cfg: {} });
    this.save(); this.render(); Bus.emit('widgets');
  },
  remove(type) { this.list = this.list.filter(w => w.type !== type); this.save(); this.render(); Bus.emit('widgets'); },

  init() {
    this.layer = $('#widgets');
    if (!this.layer) return;
    this.load();
    this.render();
    let rz = 0;
    addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { this.clamp(); this.measure(); }); });
    mq('(max-width: 720px)').addEventListener?.('change', () => { this.render(); });
  },
  // On phones, publish the stacked height so the icon grid can sit below it.
  measure() {
    document.body.classList.toggle('has-widgets', this.list.length > 0);
    if (isMobile() && this.list.length) requestAnimationFrame(() => document.documentElement.style.setProperty('--wg-h', this.layer.offsetHeight + 'px'));
    else document.documentElement.style.removeProperty('--wg-h');
  },
  clamp() {
    if (isMobile()) return;
    const a = this.area();
    for (const w of this.list) {
      const el = this.layer.querySelector(`[data-wid="${w.id}"]`); if (!el) continue;
      w.x = clamp(w.x, 8, Math.max(8, a.width - el.offsetWidth - 8));
      w.y = clamp(w.y, 8, Math.max(8, a.height - el.offsetHeight - 8));
      el.style.left = w.x + 'px'; el.style.top = w.y + 'px';
    }
    this.save();
  },
  render() {
    if (!this.layer) return;
    document.body.classList.toggle('has-clock-wg', this.has('clock'));
    for (const old of this.layer._insts || []) { try { old.destroy && old.destroy(); } catch {} }
    this.layer._insts = [];
    this.layer.replaceChildren(...this.list.map(w => {
      const def = TYPES[w.type];
      const body = h('div', { class: 'wg-body' });
      const card = h('div', { class: 'widget', 'data-wid': w.id, 'data-type': w.type, role: 'group', 'aria-label': def.name + ' widget', tabindex: '0' },
        h('div', { class: 'wg-grip', 'aria-hidden': 'true' }),
        h('button', { class: 'wg-x', type: 'button', 'aria-label': `Remove ${def.name}`, title: 'Remove', svg: ICONS.close, onclick: () => this.remove(w.type) }),
        body);
      card.style.left = w.x + 'px'; card.style.top = w.y + 'px';
      const inst = { cfg: w.cfg, save: () => this.save() };
      try { const r = def.mount(body, inst) || {}; this.layer._insts.push(r); } catch (e) { console.error('Widget error', e); body.textContent = 'Widget error'; }
      this.enableDrag(card, w);
      return card;
    }));
    this.measure();
  },
  enableDrag(card, w) {
    const start = (e) => {
      if (isMobile() || e.button !== 0 || e.target.closest('button,input,a,.wg-x')) return;
      e.preventDefault();
      const a = this.area(), sx = e.clientX, sy = e.clientY, ox = w.x, oy = w.y;
      card.setPointerCapture(e.pointerId); card.classList.add('dragging');
      const move = ev => {
        w.x = clamp(ox + ev.clientX - sx, 8, a.width - card.offsetWidth - 8);
        w.y = clamp(oy + ev.clientY - sy, 8, a.height - card.offsetHeight - 8);
        card.style.left = w.x + 'px'; card.style.top = w.y + 'px';
      };
      const up = () => { card.classList.remove('dragging'); card.removeEventListener('pointermove', move); card.removeEventListener('pointerup', up); card.removeEventListener('pointercancel', up); this.save(); };
      card.addEventListener('pointermove', move); card.addEventListener('pointerup', up); card.addEventListener('pointercancel', up);
    };
    card.addEventListener('pointerdown', start);
  },
};
