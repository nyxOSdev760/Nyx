// Firestore security rules tests. Run with: npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, writeBatch, serverTimestamp, Timestamp, query, where } from 'firebase/firestore';

let env;
const RULES = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-nyx', firestore: { rules: RULES, host, port: Number(port) } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'config/admins'), { uids: ['admin'] });
  });
});

const as = (uid, name) => env.authenticatedContext(uid, { email: `${name.toLowerCase()}@nyx.local` }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const alice = () => as('alice', 'Alice');
const bob = () => as('bob', 'Bob');
const admin = () => as('admin', 'Admin');

function post(db, uid, name, text, { rate = true, extra = {} } = {}) {
  const b = writeBatch(db);
  b.set(doc(collection(db, 'messages')), { uid, name, text, createdAt: serverTimestamp(), ...extra });
  if (rate) b.set(doc(db, 'rate', uid), { last: serverTimestamp() });
  return b.commit();
}
async function seed(path, data) { await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), path), data)); }

test('signed-out users can read nothing but username availability', async () => {
  await seed('messages/m1', { uid: 'alice', name: 'Alice', text: 'hi', createdAt: Timestamp.now() });
  await assertFails(getDoc(doc(anon(), 'messages/m1')));
  await assertFails(getDocs(collection(anon(), 'messages')));
  await assertFails(setDoc(doc(anon(), 'messages/x'), { uid: 'x', name: 'x', text: 'x', createdAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(anon(), 'usernames/alice')));
  await assertFails(getDocs(collection(anon(), 'usernames')));
});

test('signed-in users can read messages', async () => {
  await seed('messages/m1', { uid: 'alice', name: 'Alice', text: 'hi', createdAt: Timestamp.now() });
  await assertSucceeds(getDoc(doc(bob(), 'messages/m1')));
});

test('posting as yourself with the rate stamp works', async () => {
  await assertSucceeds(post(alice(), 'alice', 'Alice', 'hello'));
});

test('cannot post as someone else', async () => {
  await assertFails(post(alice(), 'bob', 'Bob', 'spoof'));          // wrong uid
  await assertFails(post(alice(), 'alice', 'Bob', 'spoof'));        // wrong name
  await assertFails(post(alice(), 'alice', 'alice_x', 'spoof'));    // name not mine
});

test('name match is case-insensitive to the account but must be valid', async () => {
  await assertSucceeds(post(alice(), 'alice', 'ALICE', 'hi'));
  await assertFails(post(as('weird', 'we ird'), 'weird', 'we ird', 'x'));
});

test('message length 1..500', async () => {
  await assertFails(post(alice(), 'alice', 'Alice', ''));
  await assertFails(post(alice(), 'alice', 'Alice', 'x'.repeat(501)));
  await assertSucceeds(post(alice(), 'alice', 'Alice', 'x'.repeat(500)));
});

test('rate limit: the stamp is required and one message per 2 seconds', async () => {
  await assertFails(post(alice(), 'alice', 'Alice', 'no stamp', { rate: false }));
  await assertSucceeds(post(alice(), 'alice', 'Alice', 'one'));
  await assertFails(post(alice(), 'alice', 'Alice', 'two'));
  await new Promise(r => setTimeout(r, 2100));
  await assertSucceeds(post(alice(), 'alice', 'Alice', 'three'));
});

test('cannot forge the rate stamp or timestamps', async () => {
  await assertFails(setDoc(doc(alice(), 'rate/alice'), { last: Timestamp.fromMillis(Date.now() - 60000) }));
  await assertFails(setDoc(doc(alice(), 'rate/bob'), { last: serverTimestamp() }));
  const db = alice(), b = writeBatch(db);
  b.set(doc(collection(db, 'messages')), { uid: 'alice', name: 'Alice', text: 'old', createdAt: Timestamp.fromMillis(0) });
  b.set(doc(db, 'rate', 'alice'), { last: serverTimestamp() });
  await assertFails(b.commit());
});

test('no extra fields on messages', async () => {
  await assertFails(post(alice(), 'alice', 'Alice', 'hi', { extra: { admin: true } }));
});

test('banned users cannot post', async () => {
  await seed('bans/alice', { name: 'Alice', by: 'admin', at: Timestamp.now() });
  await assertFails(post(alice(), 'alice', 'Alice', 'hi'));
});

test('deleting: author or admin only', async () => {
  await seed('messages/m1', { uid: 'alice', name: 'Alice', text: 'hi', createdAt: Timestamp.now() });
  const tomb = (uid) => ({ text: '', deleted: true, deletedBy: uid });
  await assertFails(updateDoc(doc(bob(), 'messages/m1'), tomb('bob')));
  await assertFails(updateDoc(doc(alice(), 'messages/m1'), { text: 'edited' }));
  await assertFails(updateDoc(doc(alice(), 'messages/m1'), tomb('bob')));
  await assertSucceeds(updateDoc(doc(alice(), 'messages/m1'), tomb('alice')));
  await seed('messages/m2', { uid: 'bob', name: 'Bob', text: 'hi', createdAt: Timestamp.now() });
  await assertSucceeds(updateDoc(doc(admin(), 'messages/m2'), tomb('admin')));
  await assertFails(deleteDoc(doc(alice(), 'messages/m2')));
  await assertSucceeds(deleteDoc(doc(admin(), 'messages/m2')));
});

test('bans: admins only; you can see your own', async () => {
  await assertFails(setDoc(doc(alice(), 'bans/bob'), { name: 'Bob', by: 'alice', at: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(admin(), 'bans/bob'), { name: 'Bob', by: 'admin', at: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(bob(), 'bans/bob')));
  await assertFails(getDoc(doc(alice(), 'bans/bob')));
  await assertFails(getDocs(collection(alice(), 'bans')));
  await assertSucceeds(getDocs(collection(admin(), 'bans')));
  await assertFails(deleteDoc(doc(bob(), 'bans/bob')));
  await assertSucceeds(deleteDoc(doc(admin(), 'bans/bob')));
});

test('admins list is read-only to clients', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'config/admins')));
  await assertFails(setDoc(doc(alice(), 'config/admins'), { uids: ['alice'] }));
});

test('usernames: reserve only your own, once', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'usernames/alice'), { uid: 'alice', name: 'Alice', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(alice(), 'usernames/alice'), { uid: 'alice', name: 'ALICE', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(bob(), 'usernames/carol'), { uid: 'bob', name: 'carol', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(bob(), 'usernames/bob'), { uid: 'alice', name: 'bob', createdAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(alice(), 'usernames/alice')));
});

test('profiles: create your own with your name', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'users/alice'), { name: 'Alice', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(bob(), 'users/bob'), { name: 'Alice', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(bob(), 'users/alice'), { name: 'Bob', createdAt: serverTimestamp() }));
});

test('private block list is owner-only', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'private/alice'), { blocked: { bob: 'Bob' } }));
  await assertFails(getDoc(doc(bob(), 'private/alice')));
  await assertFails(setDoc(doc(bob(), 'private/alice'), { blocked: {} }));
});

test('reports: anyone signed in can file, only admins can read', async () => {
  const r = { msgId: 'm1', msgUid: 'bob', msgName: 'Bob', text: 'x', reason: 'spam', reporter: 'alice', reporterName: 'Alice', createdAt: serverTimestamp() };
  await assertSucceeds(addDoc(collection(alice(), 'reports'), r));
  await assertFails(addDoc(collection(alice(), 'reports'), { ...r, reporter: 'bob' }));
  await assertFails(addDoc(collection(alice(), 'reports'), { ...r, reason: 'because' }));
  await assertFails(getDocs(collection(alice(), 'reports')));
  await assertSucceeds(getDocs(collection(admin(), 'reports')));
});

test('voice presence: only yourself, not while banned; stale entries can be cleared', async () => {
  const me = { name: 'Alice', session: 's1', joinedAt: serverTimestamp(), seen: serverTimestamp(), muted: false };
  await assertSucceeds(setDoc(doc(alice(), 'voice/lobby/peers/alice'), me));
  await assertFails(setDoc(doc(alice(), 'voice/lobby/peers/bob'), { ...me, name: 'Bob' }));
  await assertFails(setDoc(doc(alice(), 'voice/other/peers/alice'), me));
  await assertFails(deleteDoc(doc(bob(), 'voice/lobby/peers/alice')));
  await seed('voice/lobby/peers/ghost', { name: 'ghost', session: 's', joinedAt: Timestamp.fromMillis(Date.now() - 3600e3), seen: Timestamp.fromMillis(Date.now() - 3600e3), muted: false });
  await assertSucceeds(deleteDoc(doc(bob(), 'voice/lobby/peers/ghost')));
  await seed('bans/bob', { name: 'Bob', by: 'admin', at: Timestamp.now() });
  await assertFails(setDoc(doc(bob(), 'voice/lobby/peers/bob'), { ...me, name: 'Bob' }));
});

test('voice signals: send as yourself, read only your own', async () => {
  const sig = { from: 'alice', to: 'bob', session: 'a', toSession: 'b', type: 'offer', seq: 1, sdp: 'v=0', createdAt: serverTimestamp() };
  await assertSucceeds(addDoc(collection(alice(), 'voice/lobby/signals'), sig));
  await assertFails(addDoc(collection(alice(), 'voice/lobby/signals'), { ...sig, from: 'bob', to: 'alice' }));
  await assertFails(addDoc(collection(alice(), 'voice/lobby/signals'), { ...sig, type: 'hack' }));
  await assertSucceeds(getDocs(query(collection(bob(), 'voice/lobby/signals'), where('to', '==', 'bob'))));
  await assertFails(getDocs(query(collection(as('carol', 'Carol'), 'voice/lobby/signals'), where('to', '==', 'bob'))));
  await assertFails(getDocs(collection(bob(), 'voice/lobby/signals')));
});
