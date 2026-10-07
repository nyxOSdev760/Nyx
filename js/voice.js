/* Voice: one room, up to 6 people, WebRTC mesh (everyone connects to
   everyone). Firestore carries the signaling:
     voice/lobby/peers/{uid}      who's in the room (+ heartbeat, mute)
     voice/lobby/signals/{id}     offers, answers and ICE candidates
   Audio goes peer to peer; nothing is recorded or stored. The microphone
   is requested only when you press Join. */
import { Bus, uid as rid } from './core.js';
import { Account } from './account.js';
import { Notify } from './notify.js';
import { TURN_SERVERS, STUN_SERVERS } from './config.js';
import { EMULATOR } from './firebase.js';

export const MAX_PEOPLE = 6;
const ROOM = 'lobby';
const HEARTBEAT = 15000;
const STALE = 45000;
const SPEAK_LEVEL = 0.035;

export const Voice = {
  state: 'idle',        // idle | joining | joined
  error: '',
  muted: false,
  people: new Map(),    // uid -> { uid, name, muted, seen, session, fresh }
  conns: new Map(),     // uid -> { pc, state, audio, remoteSession, pending: [], tries }
  speaking: new Set(),
  session: '',
  emit() { Bus.emit('voice'); },

  /* Watch who's in the room (for the count shown before joining). */
  watchRoom() {
    if (this._roomUnsub || !Account.fb || !Account.user) return;
    const { db, F } = Account.fb;
    this._roomUnsub = F.onSnapshot(F.collection(db, 'voice', ROOM, 'peers'), snap => {
      const seen = new Set();
      for (const d of snap.docs) {
        const x = d.data({ serverTimestamps: 'estimate' });
        const t = x.seen && x.seen.toMillis ? x.seen.toMillis() : Date.now();
        seen.add(d.id);
        this.people.set(d.id, { uid: d.id, name: String(x.name || '?'), muted: !!x.muted, seen: t, session: String(x.session || '') });
      }
      for (const id of [...this.people.keys()]) if (!seen.has(id)) this.people.delete(id);
      this.syncPeers();
      this.emit();
    }, e => console.warn('Voice room unavailable:', e.code || e));
  },
  unwatchRoom() {
    if (this.state !== 'idle') return;
    if (this._roomUnsub) { this._roomUnsub(); this._roomUnsub = null; }
    this.people.clear();
  },
  skew: 0,
  isFresh(p) { return p.seen + STALE > Date.now() + this.skew; },
  present() { return [...this.people.values()].filter(p => this.isFresh(p)); },

  async join() {
    if (this.state !== 'idle') return;
    const fb = Account.fb, me = Account.user;
    if (!fb || !me) { this.fail('Sign in to use voice.'); return; }
    if (Account.banned) { this.fail('You’re banned, so you can’t join voice.'); return; }
    if (!window.RTCPeerConnection || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.fail('This browser doesn’t support voice chat.'); return; }
    this.state = 'joining'; this.error = ''; this.emit();
    const { db, F } = fb;
    try {
      // Room full? Count everyone who has checked in recently.
      const snap = await F.getDocs(F.collection(db, 'voice', ROOM, 'peers'));
      const now = Date.now();
      const others = snap.docs.filter(d => d.id !== me.uid && d.data().seen && d.data().seen.toMillis() + STALE > now + this.skew);
      if (others.length >= MAX_PEOPLE) { this.state = 'idle'; this.fail(`Voice is full (${MAX_PEOPLE} people). Try again in a bit.`); return; }
    } catch (e) { console.warn(e); }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (e) {
      this.state = 'idle';
      const n = e && e.name;
      this.fail(n === 'NotAllowedError' || n === 'SecurityError' ? 'Microphone access was blocked. Allow the microphone for this site (the icon in the address bar), then press Join again.'
        : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'No microphone was found. Plug one in and try again.'
        : n === 'NotReadableError' ? 'Your microphone is being used by another app. Close it and try again.'
        : 'Couldn’t start the microphone.');
      return;
    }
    this.session = `${me.uid.slice(0, 8)}-${rid()}`;
    this.muted = false;
    this.me = { ...me };
    this.seq = 0;
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.audioCtx.resume().catch(() => {});
    } catch { this.audioCtx = null; }
    this.addMeter(me.uid, this.stream);
    try {
      await F.setDoc(F.doc(db, 'voice', ROOM, 'peers', me.uid), { name: me.name, session: this.session, joinedAt: F.serverTimestamp(), seen: F.serverTimestamp(), muted: false });
    } catch (e) {
      this.cleanupLocal();
      this.state = 'idle';
      this.fail(e.code === 'permission-denied' ? 'The server refused to let you join voice.' : 'Couldn’t join voice. Check your connection.');
      return;
    }
    this.state = 'joined';
    this.watchRoom();
    // Incoming signals addressed to me.
    this._sigUnsub = F.onSnapshot(F.query(F.collection(db, 'voice', ROOM, 'signals'), F.where('to', '==', me.uid)), snap => {
      const items = snap.docChanges().filter(c => c.type === 'added').map(c => ({ ref: c.doc.ref, ...c.doc.data() }));
      // Offers and answers before ICE; then by sender order.
      const rank = { offer: 0, answer: 1, ice: 2 };
      items.sort((a, b) => (rank[a.type] - rank[b.type]) || ((a.seq || 0) - (b.seq || 0)));
      for (const s of items) this.onSignal(s);
    }, e => { console.warn('Voice signaling failed:', e.code || e); this.fail('Voice signaling stopped. Leave and join again.'); });
    this._beat = setInterval(() => this.heartbeat(), HEARTBEAT);
    this._meterT = setInterval(() => this.meter(), 120);
    this.cacheToken();
    this._unload = () => { this.beaconLeave(); this.leave({ quiet: true }); };
    addEventListener('pagehide', this._unload);
    this.syncPeers();
    this.emit();
  },

  /* On tab close a normal Firestore write may not finish, so leave with a
     keepalive REST call using a cached ID token. */
  async cacheToken() { try { this._token = await Account.fb.auth.currentUser.getIdToken(); } catch { this._token = ''; } },
  beaconLeave() {
    if (this.state === 'idle' || !this._token || !this.me) return;
    const pid = Account.fb.app.options.projectId;
    const base = EMULATOR ? `http://${location.hostname}:8080/v1/` : 'https://firestore.googleapis.com/v1/';
    try { fetch(`${base}projects/${pid}/databases/(default)/documents/voice/${ROOM}/peers/${this.me.uid}`, { method: 'DELETE', keepalive: true, headers: { Authorization: `Bearer ${this._token}` } }).catch(() => {}); } catch {}
  },

  async heartbeat() {
    if (this.state !== 'joined') return;
    this.cacheToken();
    const { db, F } = Account.fb;
    try {
      await F.updateDoc(F.doc(db, 'voice', ROOM, 'peers', this.me.uid), { seen: F.serverTimestamp() });
      const s = await F.getDoc(F.doc(db, 'voice', ROOM, 'peers', this.me.uid));
      if (s.exists() && s.data().seen) this.skew = s.data().seen.toMillis() - Date.now();
    } catch (e) { console.warn('Voice heartbeat failed:', e.code || e); }
    // Tidy up people who vanished without leaving (closed laptop, crash).
    for (const p of this.people.values()) {
      if (p.uid !== this.me.uid && p.seen + 60000 < Date.now() + this.skew) F.deleteDoc(F.doc(db, 'voice', ROOM, 'peers', p.uid)).catch(() => {});
    }
  },

  /* Make the set of connections match the set of people in the room. */
  syncPeers() {
    if (this.state !== 'joined') return;
    const mine = this.me.uid;
    const want = new Map(this.present().filter(p => p.uid !== mine).map(p => [p.uid, p]));
    for (const [id, c] of this.conns) {
      const p = want.get(id);
      if (!p || (c.remoteSession && p.session && c.remoteSession !== p.session)) this.drop(id);
    }
    for (const p of want.values()) {
      // The lower uid makes the offer, so two people never offer to each other at once.
      if (!this.conns.has(p.uid) && mine < p.uid && p.session) this.call(p);
    }
  },

  newConn(uid, remoteSession) {
    const pc = new RTCPeerConnection({ iceServers: [...STUN_SERVERS, ...TURN_SERVERS] });
    const c = { pc, state: 'connecting', remoteSession, pending: [], tries: (this.conns.get(uid) || {}).tries || 0, audio: null };
    this.conns.set(uid, c);
    for (const t of this.stream.getTracks()) pc.addTrack(t, this.stream);
    pc.onicecandidate = e => { if (e.candidate) this.send(uid, c.remoteSession, 'ice', { cand: e.candidate.toJSON() }); };
    pc.ontrack = e => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      if (!c.audio) { c.audio = document.createElement('audio'); c.audio.autoplay = true; c.audio.setAttribute('playsinline', ''); c.audio.hidden = true; document.body.append(c.audio); }
      c.audio.srcObject = stream;
      c.audio.play().catch(() => {});
      this.addMeter(uid, stream);
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (this.conns.get(uid) !== c) return;
      if (s === 'connected') { c.state = 'connected'; c.tries = 0; }
      else if (s === 'failed') {
        c.state = 'failed';
        // One fresh attempt from the offering side, then give up and explain.
        if (this.me.uid < uid && c.tries < 1) { c.tries++; const p = this.people.get(uid); this.drop(uid, true); if (p) setTimeout(() => this.call(p, 1), 800); return; }
        const p = this.people.get(uid);
        Notify.push({ title: 'Voice connection failed', body: `Couldn’t reach ${p ? p.name : 'someone'}. Some networks block direct audio and need a TURN server (see README).`, app: 'Chat' });
      } else if (s === 'disconnected') c.state = 'connecting';
      this.emit();
    };
    return c;
  },
  async call(p, tries = 0) {
    if (this.state !== 'joined') return;
    const c = this.newConn(p.uid, p.session);
    c.tries = tries;
    try {
      const offer = await c.pc.createOffer();
      await c.pc.setLocalDescription(offer);
      await this.send(p.uid, p.session, 'offer', { sdp: offer.sdp });
    } catch (e) { console.warn('Voice offer failed:', e); c.state = 'failed'; this.emit(); }
  },
  async onSignal(s) {
    const { F } = Account.fb;
    F.deleteDoc(s.ref).catch(() => {});
    if (this.state !== 'joined' || s.toSession !== this.session) return;
    try {
      if (s.type === 'offer') {
        this.drop(s.from, true);
        const c = this.newConn(s.from, s.session);
        await c.pc.setRemoteDescription({ type: 'offer', sdp: s.sdp });
        await this.flush(c);
        const ans = await c.pc.createAnswer();
        await c.pc.setLocalDescription(ans);
        await this.send(s.from, s.session, 'answer', { sdp: ans.sdp });
      } else if (s.type === 'answer') {
        const c = this.conns.get(s.from);
        if (c && c.pc.signalingState === 'have-local-offer') { await c.pc.setRemoteDescription({ type: 'answer', sdp: s.sdp }); await this.flush(c); }
      } else if (s.type === 'ice') {
        const c = this.conns.get(s.from);
        if (!c || c.remoteSession !== s.session) return;
        if (c.pc.remoteDescription) await c.pc.addIceCandidate(s.cand).catch(() => {});
        else c.pending.push(s.cand);
      }
    } catch (e) { console.warn('Voice signal failed:', e); }
    this.emit();
  },
  async flush(c) { const q = c.pending.splice(0); for (const cand of q) await c.pc.addIceCandidate(cand).catch(() => {}); },
  send(to, toSession, type, extra) {
    const { db, F } = Account.fb;
    return F.addDoc(F.collection(db, 'voice', ROOM, 'signals'), { from: this.me.uid, to, session: this.session, toSession: toSession || '', type, seq: ++this.seq, createdAt: F.serverTimestamp(), ...extra })
      .catch(e => console.warn('Voice signal not sent:', e.code || e));
  },
  drop(uid, keepTries) {
    const c = this.conns.get(uid);
    if (!c) return;
    try { c.pc.onconnectionstatechange = null; c.pc.close(); } catch {}
    if (c.audio) { c.audio.srcObject = null; c.audio.remove(); }
    this.removeMeter(uid);
    this.conns.delete(uid);
    if (!keepTries) this.speaking.delete(uid);
  },

  /* Speaking indicators from audio levels (local and remote). */
  meters: new Map(),
  addMeter(uid, stream) {
    if (!this.audioCtx) return;
    this.removeMeter(uid);
    try {
      const src = this.audioCtx.createMediaStreamSource(stream);
      const an = this.audioCtx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      this.meters.set(uid, { src, an, buf: new Float32Array(an.fftSize), hold: 0 });
    } catch (e) { console.warn('Level meter unavailable:', e); }
  },
  removeMeter(uid) { const m = this.meters.get(uid); if (m) { try { m.src.disconnect(); } catch {} this.meters.delete(uid); } },
  meter() {
    let changed = false;
    const now = Date.now();
    for (const [uid, m] of this.meters) {
      m.an.getFloatTimeDomainData(m.buf);
      let sum = 0; for (let i = 0; i < m.buf.length; i++) sum += m.buf[i] * m.buf[i];
      const rms = Math.sqrt(sum / m.buf.length);
      const local = uid === (this.me && this.me.uid);
      if (rms > SPEAK_LEVEL && !(local && this.muted)) m.hold = now + 300;
      const on = m.hold > now;
      if (on !== this.speaking.has(uid)) { if (on) this.speaking.add(uid); else this.speaking.delete(uid); changed = true; }
    }
    if (changed) this.emit();
  },

  async setMuted(m) {
    if (this.state !== 'joined') return;
    this.muted = m;
    for (const t of this.stream.getAudioTracks()) t.enabled = !m;
    this.emit();
    const { db, F } = Account.fb;
    F.updateDoc(F.doc(db, 'voice', ROOM, 'peers', this.me.uid), { muted: m, seen: F.serverTimestamp() }).catch(() => {});
  },

  cleanupLocal() {
    clearInterval(this._beat); clearInterval(this._meterT);
    if (this._sigUnsub) { this._sigUnsub(); this._sigUnsub = null; }
    for (const id of [...this.conns.keys()]) this.drop(id);
    for (const id of [...this.meters.keys()]) this.removeMeter(id);
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.audioCtx) { this.audioCtx.close().catch(() => {}); this.audioCtx = null; }
    if (this._unload) { removeEventListener('pagehide', this._unload); this._unload = null; }
    this.speaking.clear();
  },
  async leave({ quiet = false } = {}) {
    if (this.state === 'idle') return;
    const me = this.me, fb = Account.fb;
    this.cleanupLocal();
    this.state = 'idle'; this.muted = false;
    this.emit();
    if (!fb || !me) return;
    const { db, F } = fb;
    const tasks = [F.deleteDoc(F.doc(db, 'voice', ROOM, 'peers', me.uid))];
    if (!quiet) {
      // Remove leftover signals to and from me.
      for (const field of ['from', 'to']) {
        tasks.push(F.getDocs(F.query(F.collection(db, 'voice', ROOM, 'signals'), F.where(field, '==', me.uid)))
          .then(s => Promise.all(s.docs.map(d => F.deleteDoc(d.ref)))).catch(() => {}));
      }
    }
    await Promise.all(tasks.map(p => p.catch(() => {})));
  },
  fail(msg) { this.error = msg; this.emit(); },
};

Bus.on('account-signout', () => { Voice.leave(); Voice.unwatchRoom(); });
Bus.on('account', () => { if (Account.banned && Voice.state !== 'idle') { Voice.leave(); Voice.fail('You’ve been banned, so you were removed from voice.'); } });
