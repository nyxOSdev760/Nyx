/* Accounts: username + password on top of Firebase email/password auth.
   A username maps to <username>@nyx.local (a domain kept from the old name
   so existing accounts can still sign in); Kanni never sees or stores the
   password itself. Usernames are 3–20 of [A-Za-z0-9_], unique without
   regard to case, and reserved in the "usernames" collection inside a
   transaction. Loading Firebase never blocks the OS: until it's ready
   (or if it can't load) everyone is a guest. */
import { h, Bus, colorFor, initials } from './core.js';
import { ICONS } from './icons.js';
import { loadFirebase, firebaseConfigured } from './firebase.js';

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const MIN_PASSWORD = 8;
const emailFor = (name) => `${name.toLowerCase()}@nyx.local`;
const err = (message, code) => Object.assign(new Error(message), { code });

function friendly(e) {
  const c = (e && e.code) || '';
  if (c === 'auth/email-already-in-use') return err('That username is taken. Try another one.', c);
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email') return err('Wrong username or password.', c);
  if (c === 'auth/weak-password' || c === 'auth/password-does-not-meet-requirements') return err(`Use a stronger password: at least ${MIN_PASSWORD} characters.`, c);
  if (c === 'auth/too-many-requests') return err('Too many attempts. Wait a minute, then try again.', c);
  if (c === 'auth/network-request-failed' || c === 'unavailable') return err('Couldn’t reach the server. Check your connection and try again.', c);
  if (c === 'auth/operation-not-allowed') return err('Username sign-in isn’t enabled for this site yet (Email/Password is off in Firebase).', c);
  if (c === 'permission-denied') return err('The server refused that request.', c);
  if (e && e.message && !/^Firebase:/.test(e.message)) return e;
  return err('Something went wrong. Please try again.', c);
}

export const Account = {
  /* status: unconfigured | loading | ready | error */
  status: firebaseConfigured() ? 'loading' : 'unconfigured',
  error: '',
  user: null,          // { uid, name }
  isAdmin: false,
  banned: false,
  fb: null,
  available() { return this.status !== 'unconfigured'; },
  changed() { Bus.emit('account', this.user); },

  avatar(u, size = '') {
    if (!u) return h('span', { class: 'avatar anon' + (size ? ' ' + size : ''), 'aria-hidden': 'true', svg: ICONS.user });
    return h('span', { class: 'avatar' + (size ? ' ' + size : ''), style: `--av:${colorFor(u.uid)}`, 'aria-hidden': 'true', text: initials(u.name) });
  },

  /* Start Firebase and restore the session. Safe to call more than once. */
  init() {
    if (this._init) return this._init;
    if (!firebaseConfigured()) { this.status = 'unconfigured'; this.changed(); return Promise.resolve(null); }
    this.status = 'loading'; this.error = ''; this.changed();
    this._init = loadFirebase().then(fb => {
      this.fb = fb;
      return new Promise(resolve => {
        let first = true;
        fb.U.onAuthStateChanged(fb.auth, (u) => {
          // Sign-up finishes (username reserved, profile named) before anyone sees it.
          if (this._signingUp) return;
          const prefix = u ? (u.email || '').split('@')[0] : '';
          // Right after sign-up the profile name isn't set yet; use the name being registered.
          const pending = this._pendingName && this._pendingName.toLowerCase() === prefix ? this._pendingName : '';
          const same = u && this.user && this.user.uid === u.uid;
          this.user = u ? { uid: u.uid, name: u.displayName || pending || prefix } : null;
          if (!same) { this.isAdmin = false; this.banned = false; this.watchRoles(); }
          this.status = 'ready';
          this.changed();
          if (first) { first = false; resolve(this.user); }
          if (u && !u.displayName && !pending) this.repairProfile(u);
        }, e => { console.error(e); });
      });
    }).catch(e => {
      this._init = null;
      this.status = e.code === 'unconfigured' ? 'unconfigured' : 'error';
      this.error = e.message;
      this.changed();
      return null;
    });
    return this._init;
  },
  retry() { this._init = null; return this.init(); },

  /* Admin and ban flags, kept live so a ban or promotion shows at once.
     The rules enforce both regardless of what the client thinks. */
  watchRoles() {
    (this._roleUnsubs || []).forEach(f => { try { f(); } catch {} });
    this._roleUnsubs = [];
    const uid = this.user && this.user.uid;
    if (!uid || !this.fb) return;
    const { db, F } = this.fb;
    const quiet = () => {};
    this._roleUnsubs.push(F.onSnapshot(F.doc(db, 'config', 'admins'), s => {
      const list = s.exists() ? s.data().uids : null;
      const v = Array.isArray(list) && list.includes(uid);
      if (v !== this.isAdmin) { this.isAdmin = v; this.changed(); }
    }, quiet));
    this._roleUnsubs.push(F.onSnapshot(F.doc(db, 'bans', uid), s => {
      if (s.exists() !== this.banned) { this.banned = s.exists(); this.changed(); }
    }, quiet));
  },

  /* An account whose sign-up was interrupted (tab closed mid-way) has no
     profile name and maybe no username reservation. Finish the job. */
  async repairProfile(u) {
    const { db, F, U } = this.fb;
    const lower = (u.email || '').split('@')[0];
    if (!USERNAME_RE.test(lower)) return;
    try {
      const ref = F.doc(db, 'usernames', lower);
      let name = lower;
      const snap = await F.getDoc(ref);
      if (snap.exists()) { if (snap.data().uid !== u.uid) return; name = String(snap.data().name || lower); }
      else {
        await F.runTransaction(db, async tx => {
          if ((await tx.get(ref)).exists()) throw err('taken', 'taken');
          tx.set(ref, { uid: u.uid, name, createdAt: F.serverTimestamp() });
        });
        await F.setDoc(F.doc(db, 'users', u.uid), { name, createdAt: F.serverTimestamp() }).catch(() => {});
      }
      await U.updateProfile(u, { displayName: name });
      if (this.user && this.user.uid === u.uid) { this.user = { uid: u.uid, name }; this.changed(); }
    } catch (e) { console.warn('Profile repair skipped:', e.code || e.message); }
  },

  validateName(name) {
    if (!name) return 'Enter a username.';
    if (name.length < 3 || name.length > 20) return 'Usernames are 3 to 20 characters.';
    if (!USERNAME_RE.test(name)) return 'Use only letters, numbers and underscores.';
    return '';
  },

  async signUp(name, password, agreed) {
    name = String(name || '').trim();
    const bad = this.validateName(name);
    if (bad) throw err(bad, 'invalid-username');
    if (String(password || '').length < MIN_PASSWORD) throw err(`Passwords need at least ${MIN_PASSWORD} characters.`, 'weak');
    if (!agreed) throw err('Please confirm you’re 13 or older and agree to the chat rules.', 'not-agreed');
    await this.init();
    if (!this.fb) throw err(this.error || 'Accounts aren’t available right now.', 'unavailable');
    const { auth, db, U, F } = this.fb;
    const lower = name.toLowerCase();
    try {
      const taken = await F.getDoc(F.doc(db, 'usernames', lower));
      if (taken.exists()) throw err('That username is taken. Try another one.', 'taken');
    } catch (e) { if (e.code === 'taken') throw e; /* fall through; the transaction decides */ }
    let cred;
    this._pendingName = name;
    this._signingUp = true;
    try { cred = await U.createUserWithEmailAndPassword(auth, emailFor(name), password); }
    catch (e) { this._pendingName = ''; this._signingUp = false; throw friendly(e); }
    try {
      await F.runTransaction(db, async tx => {
        const ref = F.doc(db, 'usernames', lower);
        const snap = await tx.get(ref);
        if (snap.exists()) throw err('That username is taken. Try another one.', 'taken');
        tx.set(ref, { uid: cred.user.uid, name, createdAt: F.serverTimestamp() });
        tx.set(F.doc(db, 'users', cred.user.uid), { name, createdAt: F.serverTimestamp() });
      });
      await U.updateProfile(cred.user, { displayName: name });
    } catch (e) {
      // Roll back the half-made account so the name isn't stuck.
      try { await cred.user.delete(); } catch {}
      this._pendingName = ''; this._signingUp = false;
      this.user = null; this.changed();
      throw friendly(e);
    }
    this._pendingName = ''; this._signingUp = false;
    this.user = { uid: cred.user.uid, name };
    this.isAdmin = false; this.banned = false;
    this.status = 'ready';
    this.watchRoles();
    this.changed();
    return this.user;
  },

  async signIn(name, password) {
    name = String(name || '').trim();
    if (!name || !password) throw err('Enter your username and password.', 'missing');
    if (!USERNAME_RE.test(name)) throw err('Wrong username or password.', 'invalid-username');
    await this.init();
    if (!this.fb) throw err(this.error || 'Accounts aren’t available right now.', 'unavailable');
    try { await this.fb.U.signInWithEmailAndPassword(this.fb.auth, emailFor(name), password); }
    catch (e) { throw friendly(e); }
    return this.user;
  },

  async signOut() {
    if (!this.fb) return;
    Bus.emit('account-signout');
    (this._roleUnsubs || []).forEach(f => { try { f(); } catch {} });
    this._roleUnsubs = [];
    try { await this.fb.U.signOut(this.fb.auth); } catch (e) { console.error(e); }
  },
};
