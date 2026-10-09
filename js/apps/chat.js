/* Chat: one public room on Firestore.
   All message text is rendered with textContent, never innerHTML.
   Limits (500 characters, one message per 2 seconds, bans, who may delete)
   are enforced by firestore.rules; the client mirrors them for feedback. */
import { h, Bus, colorFor, initials, isMobile } from '../core.js';
import { ICONS, MARK } from '../icons.js';
import { registerApp } from '../apps.js';
import { Account, MIN_PASSWORD } from '../account.js';
import { extraSections } from './settings.js';
import { WM } from '../wm.js';
import { Voice, MAX_PEOPLE } from '../voice.js';

export const MAX_LEN = 500;
const PAGE = 50;
const COOLDOWN = 2000;
const GROUP_GAP = 5 * 60 * 1000;
const RULES_URL = 'rules.html';
const REASONS = [['spam', 'Spam or advertising'], ['harassment', 'Harassment or bullying'], ['hate', 'Hate or slurs'], ['personal', 'Sharing personal info'], ['nsfw', 'Sexual or violent content'], ['other', 'Something else']];

/* Blocked users for the signed-in account: private/{uid}.blocked = {uid: name}. */
export const Blocks = {
  map: {}, unsub: null, uid: null,
  has(uid) { return Object.prototype.hasOwnProperty.call(this.map, uid); },
  watch() {
    const u = Account.user, fb = Account.fb;
    if (!u || !fb) { this.stop(); return; }
    if (this.uid === u.uid && this.unsub) return;
    this.stop();
    this.uid = u.uid;
    this.unsub = fb.F.onSnapshot(fb.F.doc(fb.db, 'private', u.uid), s => {
      const b = s.exists() && s.data().blocked;
      this.map = b && typeof b === 'object' ? b : {};
      Bus.emit('blocks');
    }, e => console.warn('Blocked list unavailable:', e.code || e));
  },
  stop() {
    const had = this.unsub || Object.keys(this.map).length;
    if (this.unsub) this.unsub();
    this.unsub = null; this.uid = null; this.map = {};
    if (had) Bus.emit('blocks');
  },
  async set(uid, name, blocked) {
    const { db, F } = Account.fb;
    await F.setDoc(F.doc(db, 'private', Account.user.uid), { blocked: { [uid]: blocked ? name : F.deleteField() } }, { merge: true });
  },
};
Bus.on('account', () => { if (Account.user) Blocks.watch(); else Blocks.stop(); });

const avatarFor = (uid, name, size = '') => h('span', { class: 'avatar' + (size ? ' ' + size : ''), style: `--av:${colorFor(uid)}`, 'aria-hidden': 'true', text: initials(name) });
const fmtClock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function fmtDay(t) {
  const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
const dayKey = (t) => new Date(t).toDateString();

registerApp({
  id: 'chat', name: 'Chat', description: 'The public room, plus voice', icon: ICONS.chat, tint: '#22b58a', size: [760, 640],
  mount(root, ctx) {
    const off = [];
    let room = null;   // live room state while signed in
    const el = h('div', { class: 'chat' });
    root.append(el);

    /* ---------- Small in-app dialogs and menus ---------- */
    let layer = null;
    function closeLayer() { if (layer) { layer.remove(); layer = null; } }
    function dialog(title, body, actions, { onClose } = {}) {
      closeLayer();
      const box = h('div', { class: 'chat-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h3', { text: title }), body, h('div', { class: 'row chat-dialog-actions' }, actions));
      layer = h('div', { class: 'chat-layer', onclick: e => { if (e.target === layer) { closeLayer(); onClose && onClose(); } } }, box);
      layer.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeLayer(); onClose && onClose(); } });
      el.append(layer);
      const f = box.querySelector('input,button.primary,button');
      if (f) f.focus();
      return box;
    }
    const confirmDialog = (title, text, okLabel, danger) => new Promise(res => {
      dialog(title, h('p', { text }), [
        h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: () => { closeLayer(); res(false); } }),
        h('button', { class: 'btn primary' + (danger ? ' danger-fill' : ''), type: 'button', text: okLabel, onclick: () => { closeLayer(); res(true); } })],
      { onClose: () => res(false) });
    });
    function menu(anchor, items) {
      closeLayer();
      const r = anchor.getBoundingClientRect(), base = el.getBoundingClientRect();
      const m = h('div', { class: 'chat-menu', role: 'menu' }, items.filter(Boolean).map(it => h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '', onclick: () => { closeLayer(); it.run(); } }, h('span', { svg: it.icon }), it.label)));
      layer = h('div', { class: 'chat-layer clear', onclick: e => { if (e.target === layer) closeLayer(); } }, m);
      layer.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.stopPropagation(); closeLayer(); anchor.focus(); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const b = [...m.querySelectorAll('button')], i = b.indexOf(document.activeElement);
          b[(i + (e.key === 'ArrowDown' ? 1 : b.length - 1)) % b.length].focus();
        }
      });
      el.append(layer);
      const below = r.bottom - base.top + 4;
      m.style.top = Math.max(8, below + m.offsetHeight > base.height - 8 ? r.top - base.top - m.offsetHeight - 4 : below) + 'px';
      m.style.left = Math.max(8, Math.min(r.right - base.left - m.offsetWidth, base.width - m.offsetWidth - 8)) + 'px';
      m.querySelector('button').focus();
    }

    /* ---------- Screens ---------- */
    function screen(icon, title, text, ...actions) {
      return h('div', { class: 'chat-screen' }, h('div', { class: 'chat-screen-ico', svg: icon }), h('h2', { text: title }), text ? h('p', { text }) : null, actions.length ? h('div', { class: 'row' }, actions) : null);
    }
    function render() {
      closeLayer();
      if (Account.status === 'unconfigured') {
        stopRoom();
        el.replaceChildren(screen(ICONS.chat, 'Chat isn’t set up here yet', 'This copy of Kanni has no Firebase project connected, so accounts and Chat are off. Everything else works as usual. The site owner can turn Chat on by following the README.'));
        return;
      }
      if (Account.status === 'loading') { stopRoom(); el.replaceChildren(h('div', { class: 'chat-screen' }, h('span', { class: 'spinner lg' }), h('p', { text: 'Connecting…' }))); return; }
      if (Account.status === 'error') {
        stopRoom();
        el.replaceChildren(screen(ICONS.alert, 'Couldn’t connect to Chat', Account.error || 'Firebase didn’t load.',
          h('button', { class: 'btn primary', type: 'button', text: 'Try again', onclick: () => Account.retry() })));
        return;
      }
      if (!Account.user) { stopRoom(); el.replaceChildren(authView()); return; }
      if (!room || room.uid !== Account.user.uid) startRoom();
      else room.renderHead();
    }

    /* ---------- Sign in / sign up ---------- */
    function authView() {
      let mode = 'in';
      const name = h('input', { class: 'field', id: `cu-${ctx.winId}`, autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', maxlength: '20', placeholder: 'your_name', required: true });
      const pw = h('input', { class: 'field', id: `cp-${ctx.winId}`, type: 'password', autocomplete: 'current-password', placeholder: '••••••••', required: true });
      const showPw = h('button', { class: 'icon-btn sm pw-eye', type: 'button', 'aria-label': 'Show password', 'aria-pressed': 'false', svg: ICONS.search, onclick: () => {
        const on = pw.type === 'password'; pw.type = on ? 'text' : 'password'; showPw.setAttribute('aria-pressed', String(on)); showPw.setAttribute('aria-label', on ? 'Hide password' : 'Show password');
      } });
      showPw.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
      const agree = h('input', { type: 'checkbox', id: `ca-${ctx.winId}` });
      const agreeRow = h('label', { class: 'check', for: `ca-${ctx.winId}` }, agree, h('span', null, 'I’m 13 or older and agree to the ', h('a', { href: RULES_URL, target: '_blank', rel: 'noopener', text: 'chat rules' }), '.'));
      const hintName = h('small', { class: 'hint', text: '3–20 letters, numbers or underscores.' });
      const hintPw = h('small', { class: 'hint', text: `At least ${MIN_PASSWORD} characters. We never see it: Firebase stores it securely.` });
      const msg = h('p', { class: 'msg', role: 'alert', 'aria-live': 'assertive' });
      const submit = h('button', { class: 'btn primary lg', type: 'submit' });
      const tabs = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Account' });
      const form = h('form', { class: 'auth-form', novalidate: true },
        h('div', { class: 'auth-field' }, h('label', { for: name.id, text: 'Username' }), name, hintName),
        h('div', { class: 'auth-field' }, h('label', { for: pw.id, text: 'Password' }), h('div', { class: 'pw-wrap' }, pw, showPw), hintPw),
        agreeRow, msg, submit);
      const draw = () => {
        tabs.replaceChildren(...[['in', 'Sign in'], ['up', 'Create account']].map(([m, t]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === m), 'aria-checked': String(mode === m), text: t, onclick: () => { mode = m; msg.textContent = ''; draw(); } })));
        const up = mode === 'up';
        agreeRow.hidden = !up; hintName.hidden = !up; hintPw.hidden = !up;
        pw.autocomplete = up ? 'new-password' : 'current-password';
        submit.textContent = up ? 'Create account' : 'Sign in';
      };
      form.addEventListener('submit', async e => {
        e.preventDefault();
        msg.textContent = ''; msg.className = 'msg err';
        const up = mode === 'up';
        if (up) { const bad = Account.validateName(name.value.trim()); if (bad) { msg.textContent = bad; name.focus(); return; } }
        submit.disabled = true;
        const label = submit.textContent;
        submit.replaceChildren(h('span', { class: 'spinner' }), up ? 'Creating account…' : 'Signing in…');
        try {
          if (up) await Account.signUp(name.value, pw.value, agree.checked);
          else await Account.signIn(name.value, pw.value);
        } catch (err) {
          msg.textContent = err.message;
          submit.disabled = false; submit.textContent = label;
          if (err.code === 'not-agreed') agree.focus(); else if (/password/i.test(err.message)) pw.focus(); else name.focus();
        }
      });
      draw();
      return h('div', { class: 'chat-auth scroll' }, h('div', { class: 'auth-card' },
        h('div', { class: 'auth-mark', svg: MARK }),
        h('h2', { text: 'Join the conversation' }),
        h('p', { class: 'auth-sub', text: 'One public room for everyone on Kanni. Sign in with a username; no email needed.' }),
        tabs, form,
        h('p', { class: 'auth-foot' }, 'Be kind. Read the ', h('a', { href: RULES_URL, target: '_blank', rel: 'noopener', text: 'chat rules' }), '.')));
    }

    /* ---------- The room ---------- */
    function stopRoom() {
      if (!room) return;
      room.stop();
      room = null;
    }
    function startRoom() {
      stopRoom();
      const { db, F } = Account.fb;
      const me = { ...Account.user };
      const msgs = new Map();        // id -> {id, uid, name, text, t, deleted, pending}
      let oldestSnap = null, hasMore = true, loadingOlder = false, stick = true, unseen = 0, cooldownUntil = 0, cdTimer = 0;
      const unsubs = [];

      const headTitle = h('div', { class: 'chat-title' }, h('b', { text: 'Lobby' }), h('small', { text: 'Public room · be kind' }));
      const voiceSlot = h('div', { class: 'chat-voice-slot' });
      const adminBtn = h('button', { class: 'btn sm', type: 'button', hidden: true, onclick: () => adminPanel() }, h('span', { svg: ICONS.shield }), 'Moderate');
      const meBtn = h('button', { class: 'chat-me', type: 'button', 'aria-label': `Account menu for ${me.name}`, 'aria-haspopup': 'menu' }, avatarFor(me.uid, me.name), h('span', { class: 'chat-me-name', text: me.name }), h('span', { svg: ICONS.chevDown }));
      meBtn.addEventListener('click', () => menu(meBtn, [
        { icon: ICONS.sliders, label: 'Account settings', run: () => WM.open('settings', { page: 'account' }) },
        { icon: ICONS.flag, label: 'Chat rules', run: () => window.open(RULES_URL, '_blank', 'noopener') },
        { icon: ICONS.logout, label: 'Sign out', run: () => Account.signOut() },
      ]));
      const head = h('header', { class: 'chat-head' }, h('span', { class: 'chat-hash', text: '#' }), headTitle, voiceSlot, adminBtn, meBtn);
      const voicePanel = h('div', { class: 'chat-voice' });
      const top = h('div', { class: 'chat-top' });
      const items = h('div', { class: 'chat-items', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': 'Messages' });
      const list = h('div', { class: 'chat-list scroll' }, top, items);
      const jump = h('button', { class: 'chat-jump', type: 'button', hidden: true, onclick: () => toBottom(true) }, h('span', { svg: ICONS.arrowDown }), h('span', { class: 'chat-jump-t', text: 'New messages' }));
      const input = h('textarea', { class: 'chat-input', rows: '1', maxlength: String(MAX_LEN), placeholder: 'Message #lobby', 'aria-label': 'Message', enterkeyhint: 'send' });
      const count = h('span', { class: 'chat-count tnum', 'aria-live': 'polite' });
      const sendBtn = h('button', { class: 'chat-send', type: 'submit', 'aria-label': 'Send', title: 'Send (Enter)', svg: ICONS.send });
      const note = h('p', { class: 'chat-note', role: 'status', 'aria-live': 'polite' });
      const form = h('form', { class: 'chat-compose' }, h('div', { class: 'chat-box' }, input, count, sendBtn), note);
      const banned = h('div', { class: 'chat-banned', hidden: true }, h('span', { svg: ICONS.ban }), h('span', { text: 'You’ve been banned from posting in Chat. You can still read along.' }));
      el.replaceChildren(head, voicePanel, h('div', { class: 'chat-body' }, list, jump), banned, form);

      /* Voice: a header button, and a panel while you're in the room. */
      const voiceBtn = h('button', { class: 'btn sm', type: 'button', onclick: () => { if (Voice.state === 'idle') Voice.join(); } });
      voiceSlot.append(voiceBtn);
      function renderVoice() {
        const people = Voice.present();
        const n = people.length;
        const inRoom = Voice.state !== 'idle';
        voiceBtn.hidden = inRoom;
        voiceBtn.disabled = Account.banned;
        voiceBtn.replaceChildren(h('span', { svg: ICONS.headphones }), n ? `Voice · ${n}` : 'Voice');
        voiceBtn.setAttribute('aria-label', n ? `Join voice, ${n} ${n === 1 ? 'person' : 'people'} in it` : 'Join voice');
        if (!inRoom) {
          voicePanel.replaceChildren(...(Voice.error ? [h('div', { class: 'vc-top' }, h('span', { class: 'vc-msg err', role: 'alert', text: Voice.error }), h('div', { class: 'vc-actions' }, h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Dismiss', svg: ICONS.close, onclick: () => { Voice.error = ''; renderVoice(); } })))] : []));
          return;
        }
        const joining = Voice.state === 'joining';
        const all = joining ? [] : people;
        const meIn = all.some(p => p.uid === me.uid);
        const list = meIn ? all : all.concat(joining ? [] : [{ uid: me.uid, name: me.name, muted: Voice.muted }]);
        voicePanel.replaceChildren(...[
          h('div', { class: 'vc-top' }, h('span', { class: 'vc-live', 'aria-hidden': 'true' }), h('b', { text: 'Voice' }),
            h('span', { class: 'tnum', text: joining ? 'Joining…' : `${list.length} of ${MAX_PEOPLE}` }),
            h('div', { class: 'vc-actions' },
              h('button', { class: 'btn sm' + (Voice.muted ? ' vc-on' : ''), type: 'button', 'aria-pressed': String(Voice.muted), disabled: joining, onclick: () => Voice.setMuted(!Voice.muted) }, h('span', { svg: Voice.muted ? ICONS.micOff : ICONS.mic }), Voice.muted ? 'Unmute' : 'Mute'),
              h('button', { class: 'btn sm vc-leave', type: 'button', onclick: () => Voice.leave() }, h('span', { svg: ICONS.phoneOff }), 'Leave'))),
          joining ? h('p', { class: 'vc-msg', text: 'Asking for your microphone…' }) :
          h('div', { class: 'vc-people', role: 'list', 'aria-label': 'People in voice' }, list.map(p => {
            const self = p.uid === me.uid, c = Voice.conns.get(p.uid);
            const st = self ? (Voice.muted ? 'Muted' : 'You') : !c ? 'Connecting…' : c.state === 'connected' ? (p.muted ? 'Muted' : 'Connected') : c.state === 'failed' ? 'Couldn’t connect' : 'Connecting…';
            const speaking = Voice.speaking.has(p.uid) && !(self ? Voice.muted : p.muted);
            const av = avatarFor(p.uid, p.name, 'lg');
            if (self ? Voice.muted : p.muted) av.append(h('span', { class: 'vc-mic', svg: ICONS.micOff }));
            return h('div', { class: 'vc-p' + (speaking ? ' speaking' : '') + (c && c.state === 'failed' ? ' failed' : ''), role: 'listitem', 'aria-label': `${p.name}: ${st}${speaking ? ', speaking' : ''}`, 'data-uid': p.uid, 'data-state': self ? 'self' : (c ? c.state : 'none') },
              av, h('span', { class: 'vc-name', text: self ? `${p.name} (you)` : p.name }), h('span', { class: 'vc-state', text: st }));
          })),
          Voice.error ? h('p', { class: 'vc-msg err', role: 'alert', text: Voice.error }) : null].filter(Boolean));
      }
      Voice.watchRoom();
      const offV = Bus.on('voice', renderVoice);
      renderVoice();

      const renderHead = () => {
        renderVoice();
        if (Account.user && Account.user.uid === me.uid) me.name = Account.user.name;
        meBtn.querySelector('.chat-me-name').textContent = me.name;
        meBtn.querySelector('.avatar').textContent = initials(me.name);
        adminBtn.hidden = !Account.isAdmin;
        banned.hidden = !Account.banned;
        form.hidden = Account.banned;
      };
      renderHead();

      /* Rendering: day separators, grouped messages, one row per message. */
      function render() {
        const all = [...msgs.values()].filter(m => !m.deleted && !Blocks.has(m.uid)).sort((a, b) => a.t - b.t);
        const frag = [];
        let prev = null, group = null;
        for (const m of all) {
          if (!prev || dayKey(prev.t) !== dayKey(m.t)) { frag.push(h('div', { class: 'chat-day', role: 'separator' }, h('span', { text: fmtDay(m.t) }))); prev = null; }
          const cont = prev && prev.uid === m.uid && m.t - prev.t < GROUP_GAP;
          if (!cont) {
            group = h('div', { class: 'chat-group' + (m.uid === me.uid ? ' mine' : '') },
              avatarFor(m.uid, m.name, 'lg'),
              h('div', { class: 'chat-gbody' }, h('div', { class: 'chat-meta' }, h('b', { text: m.name, style: `color:${colorFor(m.uid)}` }), h('time', { text: fmtClock(m.t), datetime: new Date(m.t).toISOString(), title: new Date(m.t).toLocaleString() }))));
            frag.push(group);
          }
          const row = h('div', { class: 'chat-msg' + (m.pending ? ' pending' : ''), 'data-id': m.id },
            cont ? h('time', { class: 'chat-t', text: fmtClock(m.t), title: new Date(m.t).toLocaleString() }) : null,
            h('p', { class: 'chat-text', text: m.text }),
            h('button', { class: 'icon-btn sm chat-more', type: 'button', 'aria-label': `Actions for message from ${m.name}`, 'aria-haspopup': 'menu', svg: ICONS.more, onclick: e => messageMenu(e.currentTarget, m) }));
          group.querySelector('.chat-gbody').append(row);
          prev = m;
        }
        if (!all.length) frag.push(h('div', { class: 'chat-empty' }, h('div', { class: 'chat-screen-ico', svg: ICONS.chat }), h('b', { text: 'No messages yet' }), h('p', { text: 'Say hi. You’re first.' })));
        items.replaceChildren(...frag);
        top.replaceChildren(...[hasMore ? (loadingOlder ? h('div', { class: 'chat-older' }, h('span', { class: 'spinner' }), 'Loading older messages…') : h('div', { class: 'chat-older' }, 'Scroll up for older messages'))
          : all.length ? h('div', { class: 'chat-start' }, h('b', { text: 'Welcome to #lobby' }), h('p', { text: 'This is the start of the room.' })) : null].filter(Boolean));
      }
      const atBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      function toBottom(smooth) { list.scrollTo({ top: list.scrollHeight, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' }); unseen = 0; jump.hidden = true; }
      function rerender(newFromOthers) {
        const keep = atBottom() || stick;
        render();
        if (keep) toBottom(false);
        else if (newFromOthers) { unseen += newFromOthers; jump.hidden = false; jump.querySelector('.chat-jump-t').textContent = unseen === 1 ? '1 new message' : `${unseen} new messages`; }
      }
      list.addEventListener('scroll', () => {
        stick = atBottom();
        if (stick) { unseen = 0; jump.hidden = true; }
        if (list.scrollTop < 120) loadOlder();
      }, { passive: true });

      const toMsg = (d) => {
        const x = d.data({ serverTimestamps: 'estimate' });
        const t = x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : Date.now();
        return { id: d.id, uid: String(x.uid || ''), name: String(x.name || 'unknown'), text: String(x.text || ''), t, deleted: !!x.deleted, pending: d.metadata.hasPendingWrites };
      };
      // Latest 50, live. Docs that slide out of the window stay (they weren't deleted:
      // deletion is a tombstone update, which arrives as 'modified').
      const q = F.query(F.collection(db, 'messages'), F.orderBy('createdAt', 'desc'), F.limit(PAGE));
      let first = true;
      unsubs.push(F.onSnapshot(q, { includeMetadataChanges: true }, snap => {
        let fresh = 0;
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed') continue;
          const m = toMsg(ch.doc);
          if (ch.type === 'added' && !msgs.has(m.id) && !first && m.uid !== me.uid && !m.deleted && !Blocks.has(m.uid)) fresh++;
          msgs.set(m.id, m);
        }
        if (first) {
          first = false;
          oldestSnap = snap.docs[snap.docs.length - 1] || null;
          hasMore = snap.docs.length >= PAGE;
          render(); toBottom(false);
          requestAnimationFrame(() => { if (list.scrollHeight <= list.clientHeight) loadOlder(); });
          return;
        }
        rerender(fresh);
      }, e => {
        console.error(e);
        items.replaceChildren(h('div', { class: 'chat-empty' }, h('div', { class: 'chat-screen-ico', svg: ICONS.alert }), h('b', { text: 'Couldn’t load messages' }), h('p', { text: e.code === 'permission-denied' ? 'The server refused access. Try signing out and back in.' : 'Check your connection, then reopen Chat.' })));
      }));

      async function loadOlder() {
        if (loadingOlder || !hasMore || !oldestSnap) return;
        loadingOlder = true; render();
        const before = list.scrollHeight, beforeTop = list.scrollTop;
        try {
          const snap = await F.getDocs(F.query(F.collection(db, 'messages'), F.orderBy('createdAt', 'desc'), F.startAfter(oldestSnap), F.limit(PAGE)));
          for (const d of snap.docs) { const m = toMsg(d); if (!msgs.has(m.id)) msgs.set(m.id, m); }
          if (snap.docs.length) oldestSnap = snap.docs[snap.docs.length - 1];
          hasMore = snap.docs.length >= PAGE;
        } catch (e) { console.warn('Older messages failed:', e); hasMore = false; }
        loadingOlder = false;
        if (!room) return;
        render();
        list.scrollTop = beforeTop + (list.scrollHeight - before);
      }

      /* Sending: the message and the rate-limit stamp go in one batch, so the
         rules can check both together. */
      const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 132) + 'px'; };
      const updCount = () => {
        const n = input.value.length, left = MAX_LEN - n;
        count.textContent = left <= 80 ? String(left) : '';
        count.classList.toggle('warn', left <= 20);
        sendBtn.disabled = !input.value.trim() || Date.now() < cooldownUntil;
      };
      input.addEventListener('input', () => { autosize(); updCount(); note.textContent = ''; });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isMobile()) { e.preventDefault(); form.requestSubmit(); }
      });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const text = input.value.replace(/\s+$/g, '').replace(/^\s*\n/g, '');
        if (!text.trim()) return;
        if (Account.banned) { renderHead(); return; }
        if (text.length > MAX_LEN) { note.textContent = `Messages can be up to ${MAX_LEN} characters.`; note.className = 'chat-note err'; return; }
        const wait = cooldownUntil - Date.now();
        if (wait > 0) { note.textContent = 'One message every 2 seconds. Hang on…'; note.className = 'chat-note'; return; }
        cooldownUntil = Date.now() + COOLDOWN;
        clearTimeout(cdTimer); cdTimer = setTimeout(updCount, COOLDOWN + 20);
        input.value = ''; autosize(); updCount();
        stick = true;
        try {
          const batch = F.writeBatch(db);
          batch.set(F.doc(F.collection(db, 'messages')), { uid: me.uid, name: me.name, text, createdAt: F.serverTimestamp() });
          batch.set(F.doc(db, 'rate', me.uid), { last: F.serverTimestamp() });
          await batch.commit();
        } catch (err) {
          if (!input.value) { input.value = text; autosize(); updCount(); }
          if (err.code === 'permission-denied') {
            note.textContent = Account.banned ? 'You’re banned from posting.' : 'Slow down a little: one message every 2 seconds.';
          } else { console.warn('Send failed:', err); note.textContent = 'Couldn’t send. Check your connection and try again.'; }
          note.className = 'chat-note err';
        }
      });
      updCount();

      /* Message actions */
      function messageMenu(btn, m) {
        const mine = m.uid === me.uid;
        menu(btn, [
          !mine && { icon: ICONS.flag, label: 'Report message', run: () => reportDialog(m) },
          !mine && { icon: ICONS.ban, label: Blocks.has(m.uid) ? `Unblock ${m.name}` : `Block ${m.name}`, run: () => toggleBlock(m) },
          (mine || Account.isAdmin) && { icon: ICONS.trash, label: 'Delete message', danger: true, run: () => deleteMsg(m) },
          Account.isAdmin && !mine && { icon: ICONS.shield, label: `Ban ${m.name}`, danger: true, run: () => banUser(m.uid, m.name) },
        ]);
      }
      function reportDialog(m) {
        let reason = 'spam';
        const opts = h('div', { class: 'chat-reasons', role: 'radiogroup', 'aria-label': 'Reason' },
          REASONS.map(([v, t], i) => h('label', { class: 'check' }, h('input', { type: 'radio', name: `rr-${ctx.winId}`, value: v, checked: i === 0, onchange: () => { reason = v; } }), h('span', { text: t }))));
        const quote = h('blockquote', { class: 'chat-quote' }, h('b', { text: m.name }), h('span', { text: m.text }));
        const msg = h('p', { class: 'msg' });
        const send = h('button', { class: 'btn primary', type: 'button', text: 'Send report', onclick: async () => {
          send.disabled = true;
          try {
            await F.addDoc(F.collection(db, 'reports'), { msgId: m.id, msgUid: m.uid, msgName: m.name, text: m.text.slice(0, MAX_LEN), reason, reporter: me.uid, reporterName: me.name, createdAt: F.serverTimestamp() });
            closeLayer(); ctx.notify('Report sent', 'Thanks. A moderator will take a look.');
          } catch (e) { send.disabled = false; msg.textContent = 'Couldn’t send the report. Try again.'; msg.className = 'msg err'; }
        } });
        dialog('Report message', h('div', { class: 'chat-dialog-body' }, quote, opts, msg), [h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: closeLayer }), send]);
      }
      async function toggleBlock(m) {
        const blocking = !Blocks.has(m.uid);
        if (blocking && !(await confirmDialog(`Block ${m.name}?`, 'You won’t see their messages. They aren’t told. You can unblock them from Settings › Account.', 'Block'))) return;
        try { await Blocks.set(m.uid, m.name, blocking); ctx.notify(blocking ? `Blocked ${m.name}` : `Unblocked ${m.name}`, blocking ? 'Their messages are hidden for you.' : ''); }
        catch (e) { ctx.notify('Couldn’t update your block list', 'Check your connection and try again.'); }
      }
      async function deleteMsg(m) {
        if (!(await confirmDialog('Delete message?', m.uid === me.uid ? 'This removes it for everyone.' : `This removes ${m.name}’s message for everyone.`, 'Delete', true))) return;
        try { await F.updateDoc(F.doc(db, 'messages', m.id), { text: '', deleted: true, deletedBy: me.uid }); }
        catch (e) { ctx.notify('Couldn’t delete that message', e.code === 'permission-denied' ? 'You can only delete your own messages.' : 'Check your connection and try again.'); }
      }
      async function banUser(uid, name) {
        if (!(await confirmDialog(`Ban ${name}?`, 'They won’t be able to post or join voice until unbanned. Their messages stay unless you delete them.', 'Ban', true))) return;
        try { await F.setDoc(F.doc(db, 'bans', uid), { name, by: me.uid, at: F.serverTimestamp() }); ctx.notify(`${name} is banned`, 'Unban them from Moderate › Bans.'); }
        catch (e) { ctx.notify('Couldn’t ban', e.code === 'permission-denied' ? 'Only admins can ban.' : 'Check your connection and try again.'); }
      }
      function adminPanel() {
        let tab = 'reports';
        const body = h('div', { class: 'mod-list scroll' });
        const tabs = h('div', { class: 'seg', role: 'tablist' });
        const draw = async () => {
          tabs.replaceChildren(...[['reports', 'Reports'], ['bans', 'Bans']].map(([v, t]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === v), 'aria-checked': String(tab === v), text: t, onclick: () => { tab = v; draw(); } })));
          body.replaceChildren(h('div', { class: 'chat-older' }, h('span', { class: 'spinner' }), 'Loading…'));
          try {
            if (tab === 'reports') {
              const s = await F.getDocs(F.query(F.collection(db, 'reports'), F.orderBy('createdAt', 'desc'), F.limit(50)));
              body.replaceChildren(...(s.empty ? [h('p', { class: 'empty', text: 'No open reports.' })] : s.docs.map(d => {
                const r = d.data();
                const row = h('div', { class: 'mod-item' },
                  h('div', { class: 'mod-meta' }, h('b', { text: String(r.msgName || '') }), h('small', { text: `${(REASONS.find(x => x[0] === r.reason) || ['', 'Other'])[1]} · reported by ${String(r.reporterName || 'someone')}` })),
                  h('p', { class: 'mod-text', text: String(r.text || '') }),
                  h('div', { class: 'row' },
                    h('button', { class: 'btn sm', type: 'button', text: 'Delete message', onclick: async () => { try { await F.updateDoc(F.doc(db, 'messages', String(r.msgId)), { text: '', deleted: true, deletedBy: me.uid }); } catch {} await F.deleteDoc(d.ref).catch(() => {}); row.remove(); } }),
                    h('button', { class: 'btn sm danger', type: 'button', text: 'Ban user', onclick: () => banUser(String(r.msgUid), String(r.msgName)) }),
                    h('button', { class: 'btn sm ghost', type: 'button', text: 'Dismiss', onclick: async () => { await F.deleteDoc(d.ref).catch(() => {}); row.remove(); } })));
                return row;
              })));
            } else {
              const s = await F.getDocs(F.query(F.collection(db, 'bans'), F.limit(100)));
              body.replaceChildren(...(s.empty ? [h('p', { class: 'empty', text: 'Nobody is banned.' })] : s.docs.map(d => {
                const row = h('div', { class: 'mod-item row-flat' }, avatarFor(d.id, String(d.data().name || '?')), h('b', { text: String(d.data().name || d.id) }),
                  h('button', { class: 'btn sm', type: 'button', text: 'Unban', onclick: async () => { await F.deleteDoc(d.ref).catch(() => {}); row.remove(); } }));
                return row;
              })));
            }
          } catch (e) { body.replaceChildren(h('p', { class: 'empty', text: 'Couldn’t load. Are you still an admin?' })); }
        };
        const box = dialog('Moderate', h('div', { class: 'chat-dialog-body' }, tabs, body), [h('button', { class: 'btn', type: 'button', text: 'Close', onclick: closeLayer })]);
        box.classList.add('wide');
        draw();
      }

      const offB = Bus.on('blocks', () => rerender(0));
      // Refresh relative day labels at midnight and keep times honest.
      const dayTimer = setInterval(() => { if (room) rerender(0); }, 60000);

      room = {
        uid: me.uid, renderHead,
        stop() { unsubs.forEach(u => { try { u(); } catch {} }); offB(); offV(); clearInterval(dayTimer); clearTimeout(cdTimer); Voice.leave(); Voice.unwatchRoom(); },
      };
    }

    off.push(Bus.on('account', render));
    Account.init();
    render();
    return {
      destroy: () => { off.forEach(f => f()); stopRoom(); closeLayer(); },
    };
  },
});

/* Settings › Account */
extraSections.push({
  id: 'account', name: 'Account', icon: ICONS.user, after: 'launch',
  render: ({ head, group, srow, confirmBtn }) => {
    const u = Account.user;
    if (!Account.available()) return [head('Account', 'Accounts power Chat and Voice.'), group(null, srow('Not set up', 'This copy of Kanni has no Firebase project connected. See the README to turn accounts on.'))];
    if (!u) return [head('Account', 'Accounts power Chat and Voice.'), group(null, srow('Not signed in', Account.status === 'error' ? Account.error : 'Sign in or create an account from the Chat app.', h('button', { class: 'btn primary', type: 'button', text: 'Open Chat', onclick: () => WM.open('chat') })))];
    const blocked = Object.entries(Blocks.map);
    return [
      head('Account', 'Your Kanni identity for Chat and Voice.'),
      h('div', { class: 'acct-card' }, Account.avatar(u, 'xl'), h('div', null, h('b', { text: u.name }), h('small', { text: Account.isAdmin ? 'Admin' : Account.banned ? 'Banned from posting' : 'Member' }))),
      group('Session', srow('Sign out', 'You stay signed in on this browser until you sign out.', confirmBtn('Sign out', 'Tap again to sign out', () => Account.signOut(), 'btn'))),
      group('Blocked users', ...(blocked.length ? blocked.map(([id, name]) => srow(String(name), null, h('button', { class: 'btn sm', type: 'button', text: 'Unblock', onclick: async (e) => { e.currentTarget.disabled = true; try { await Blocks.set(id, name, false); } catch {} } })))
        : [srow('Nobody', 'People you block in Chat show up here.')])),
    ];
  },
});
