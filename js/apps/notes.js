/* Notes: plain-text notes saved in this browser. The first line is the title.
   Saves as you type. Search, pin and delete. */
import { h, Store, Bus, uid, isMobile } from '../core.js';
import { ICONS } from '../icons.js';
import { registerApp } from '../apps.js';
import { Notify } from '../notify.js';

const load = () => { const v = Store.get('notes', []); return Array.isArray(v) ? v.filter(n => n && typeof n.text === 'string').map(n => ({ id: String(n.id || uid()), text: n.text.slice(0, 100000), t: +n.t || Date.now(), pin: !!n.pin })) : []; };
const titleOf = (n) => (n.text.trim().split('\n')[0] || 'New note').slice(0, 80);
const previewOf = (n) => n.text.trim().split('\n').slice(1).join(' ').trim().slice(0, 90) || 'No additional text';
const when = (t) => {
  const d = new Date(t), now = new Date();
  return d.toDateString() === now.toDateString() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

registerApp({
  id: 'notes', name: 'Notes', description: 'Quick notes, saved as you type', icon: ICONS.note, tint: '#f5b400', size: [780, 540],
  mount(root, ctx) {
    let notes = load(), cur = null, saveT = 0;
    const me = uid();   // this window; it ignores its own save events
    const save = () => { clearTimeout(saveT); Store.set('notes', notes); Bus.emit('notes', me); };
    const q = h('input', { class: 'field nt-q', type: 'search', placeholder: 'Search notes', 'aria-label': 'Search notes' });
    const list = h('div', { class: 'nt-list scroll', role: 'listbox', 'aria-label': 'Notes' });
    const ed = h('textarea', { class: 'nt-ed', placeholder: 'Start typing. The first line becomes the title.', 'aria-label': 'Note text', spellcheck: 'true' });
    const meta = h('small', { class: 'nt-meta' });
    const pinBtn = h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Pin note', title: 'Pin', svg: ICONS.pin, onclick: () => { if (!cur) return; cur.pin = !cur.pin; save(); draw(); } });
    const delBtn = h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Delete note', title: 'Delete', svg: ICONS.trash, onclick: () => remove(cur) });
    const back = h('button', { class: 'nt-back', type: 'button', onclick: () => shell.classList.add('list') }, h('span', { svg: ICONS.back }), 'Notes');
    const pane = h('div', { class: 'nt-pane' }, h('div', { class: 'nt-bar' }, back, meta, h('div', { class: 'row nowrap' }, pinBtn, delBtn)), ed);
    const empty = h('div', { class: 'nt-empty' }, h('span', { class: 'nt-empty-ico', svg: ICONS.note }), h('b', { text: 'No note selected' }), h('small', { text: 'Create one with the + button.' }));
    const shell = h('div', { class: 'nt' + (isMobile() ? ' list' : '') },
      h('aside', { class: 'nt-side' },
        h('div', { class: 'nt-head' }, h('h2', { text: 'Notes' }), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'New note', title: 'New note', svg: ICONS.plus, onclick: () => create() })),
        q, list),
      pane, empty);
    root.append(shell);

    function sorted() { return [...notes].sort((a, b) => (b.pin - a.pin) || (b.t - a.t)); }
    function draw() {
      const term = q.value.trim().toLowerCase();
      const shown = sorted().filter(n => !term || n.text.toLowerCase().includes(term));
      list.replaceChildren(...(shown.length ? shown.map(n => h('button', { class: 'nt-item' + (cur && n.id === cur.id ? ' on' : ''), type: 'button', role: 'option', 'aria-selected': String(!!cur && n.id === cur.id), onclick: () => select(n) },
        h('b', null, n.pin ? h('span', { class: 'nt-pin', svg: ICONS.pin }) : null, titleOf(n)), h('small', null, h('time', { text: when(n.t) }), ' ', previewOf(n)))) :
        [h('p', { class: 'empty', text: term ? 'No notes match.' : 'No notes yet.' })]));
      pane.hidden = !cur; empty.hidden = !!cur;
      if (cur) { meta.textContent = `Edited ${when(cur.t)}`; pinBtn.classList.toggle('on', cur.pin); pinBtn.setAttribute('aria-pressed', String(cur.pin)); }
      ctx.setTitle(cur ? `${titleOf(cur)} – Notes` : '');
    }
    function select(n, focus = true) {
      cur = n; ed.value = n ? n.text : '';
      shell.classList.toggle('list', !n && isMobile());
      draw();
      if (n && focus) setTimeout(() => ed.focus(), 0);
    }
    function create() {
      const n = { id: uid(), text: '', t: Date.now(), pin: false };
      notes.push(n); q.value = ''; save(); select(n);
    }
    function remove(n) {
      if (!n) return;
      notes = notes.filter(x => x !== n); save();
      select(sorted()[0] || null, false);
      if (n.text.trim()) Notify.push({ title: 'Note deleted', body: titleOf(n), app: 'Notes' });
    }
    ed.addEventListener('input', () => {
      if (!cur) return;
      cur.text = ed.value; cur.t = Date.now();
      clearTimeout(saveT); saveT = setTimeout(save, 250);
      draw();
    });
    ed.addEventListener('blur', () => { if (cur && !cur.text.trim()) { notes = notes.filter(x => x !== cur); cur = null; save(); draw(); } else save(); });
    q.addEventListener('input', draw);
    const off = Bus.on('notes', (src) => { if (src !== me && document.activeElement !== ed) { const fresh = load(); notes = fresh; if (cur) cur = notes.find(n => n.id === cur.id) || null; draw(); } });

    const args = ctx.args || {};
    if (args.new) create();
    else { select(sorted()[0] || null, false); if (isMobile()) shell.classList.add('list'); }
    return {
      handleArgs: (a) => { if (a && a.new) create(); },
      destroy: () => { save(); off(); },
    };
  },
});
