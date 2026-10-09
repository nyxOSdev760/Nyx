/* Lazy Firebase loader. Nothing here runs until Chat or the account system
   needs it, and any failure is reported as a friendly error instead of
   breaking the OS. For local testing against the Firebase emulators, open
   http://localhost:PORT/?emulator=1 (only honored on localhost). */
import { FIREBASE_CONFIG, FIREBASE_SDK_VERSION } from './config.js';

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const EMULATOR = LOCAL && (() => { try { return new URLSearchParams(location.search).get('emulator') === '1'; } catch { return false; } })();
const DEMO_CONFIG = { apiKey: 'demo-key', authDomain: 'demo-kanni.firebaseapp.com', projectId: 'demo-kanni', appId: 'demo-app' };

export const firebaseConfigured = () => EMULATOR || !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

let loading = null;
export function loadFirebase() {
  if (!firebaseConfigured()) return Promise.reject(Object.assign(new Error('Chat isn’t set up on this site yet.'), { code: 'unconfigured' }));
  if (loading) return loading;
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/`;
  let timer = 0;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error('Firebase took too long to load.'), { code: 'timeout' })), 20000); });
  loading = Promise.race([timeout, (async () => {
    const [A, U, F] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
    const cfg = EMULATOR && !FIREBASE_CONFIG.apiKey ? DEMO_CONFIG : FIREBASE_CONFIG;
    const app = A.getApps().length ? A.getApp() : A.initializeApp(cfg);
    const fresh = !app._kanni;
    app._kanni = true;
    const auth = fresh ? U.initializeAuth(app, { persistence: [U.indexedDBLocalPersistence, U.browserLocalPersistence, U.inMemoryPersistence] }) : U.getAuth(app);
    const db = F.getFirestore(app);
    if (EMULATOR && fresh) {
      U.connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
      F.connectFirestoreEmulator(db, location.hostname, 8080);
    }
    return { app, auth, db, U, F };
  })()]).then(fb => { clearTimeout(timer); return fb; }, err => {
    clearTimeout(timer);
    loading = null;
    if (err && err.code === 'timeout') throw err;
    throw Object.assign(new Error('Couldn’t load Firebase. Check your connection, or whether a filter is blocking www.gstatic.com.'), { code: 'load-failed', cause: err });
  });
  return loading;
}
