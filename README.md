# Kanni 👾

A quiet desktop for the web. Kanni (formerly NyxOS) is a static site (plain HTML, CSS and ES modules, no build step) that runs on GitHub Pages: a dot-field desktop with a floating dock, windows you can snap, a tabbed browser, settings, a first-run tips tour, an about:blank launcher, and an optional public Chat with voice backed by Firebase.

Inspired by [GalaxyV7](https://github.com/whosrogo/GalaxyV7) by whosrogo. Kanni is written from scratch and contains no GalaxyV7 code.

## Run it

Any static file server works. Paths are relative, so it runs from a GitHub Pages project URL (`https://you.github.io/repo/`) too.

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

ES modules don't load from `file://`, so open it through a server.

Everything except Chat and Voice works with no setup. Settings and history live in `localStorage` under the `snap:` prefix (kept from earlier versions so existing data carries over).

## Project layout

```
index.html          markup, pre-paint theme script, startup watchdog, fatal screen
css/tokens.css      design tokens (color, space, type, radius, motion)
css/base.css        reset and shared controls
css/shell.css       boot, wallpaper, desktop, dock, windows, panels, phone layout
css/apps.css        Browser, Settings, previews, Customize
css/chat.css        Chat and Voice
js/main.js          boot
js/core.js          DOM helper, Store, Bus
js/settings.js      SCHEMA, Settings, BrowserNet transports, appearance
js/wm.js            window manager (drag, resize, edge snapping, minimize to dock)
js/shell.js         dock, launcher, notifications, account panel, icons, clock, mode switch
js/dots.js          the interactive dot field
js/tour.js          first-run tips tour
js/customize.js     Customize screen (Settings › Appearance)
js/launch.js        Open in about:blank, Ask on launch
js/config.js        FIREBASE_CONFIG and TURN_SERVERS (edit these)
js/firebase.js      lazy Firebase loader (CDN ES modules)
js/account.js       username accounts
js/voice.js         WebRTC voice room
js/apps/*.js        Browser, Settings, Chat
rules.html          chat rules page
firestore.rules     Firestore security rules
tests/              rules tests and end-to-end tests
```

Add an app with `registerApp({ id, name, icon, mount(root, ctx) { … } })`, or at runtime with `window.Kanni.registerApp(...)` (`window.Nyx` and `window.SNAP` still work).

## Turning on Chat and Voice (Firebase)

Chat and Voice need a free Firebase project. Until you add one, the Chat app says it isn't set up and everything else works normally.

### 1. Create the project

1. Go to <https://console.firebase.google.com> and click **Create a project** (or **Add project**). Give it a name; Google Analytics is optional.
2. In the project, click the **Web** icon (`</>`) under "Get started by adding Firebase to your app". Give the app a nickname. You don't need Firebase Hosting. Click **Register app**.
3. Firebase shows a `firebaseConfig` object. Keep that page open.

### 2. Enable Email/Password sign-in

Kanni signs people in with a username and password. Under the hood each username becomes `username@nyx.local` for Firebase's email/password provider (the domain is kept from the old name so existing accounts keep working); no email is ever sent and Kanni never stores passwords.

1. **Build › Authentication › Get started**.
2. **Sign-in method** tab › **Email/Password** › turn on **Email/Password** (leave "Email link" off) › **Save**.

### 3. Create the Firestore database

1. **Build › Firestore Database › Create database**.
2. Pick a location close to your users (this can't be changed later).
3. Start in **production mode** (you'll replace the rules in step 5).

### 4. Paste the config

Open `js/config.js` and fill in `FIREBASE_CONFIG` with the values from step 1:

```js
export const FIREBASE_CONFIG = {
  apiKey: 'AIza…',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123',
};
```

These values identify your project; they aren't secrets. What protects your data is the rules file. Commit and push.

### 5. Deploy the security rules

Either paste them in the console: **Firestore Database › Rules**, replace everything with the contents of `firestore.rules`, and click **Publish**.

Or use the Firebase CLI from this folder:

```sh
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project your-project-id
```

### 6. Authorize your GitHub Pages domain

**Authentication › Settings › Authorized domains › Add domain**, then add your Pages host, for example `yourname.github.io` (just the host, no `https://` and no path). `localhost` is already on the list for local testing.

### 7. Make yourself an admin

1. Open Kanni, open **Chat**, and create your account.
2. In the Firebase console, **Authentication › Users**: copy the **User UID** of the account `yourname@nyx.local`.
3. **Firestore Database › Data › Start collection**: collection ID `config`, document ID `admins`, add a field `uids` of type **array** with one **string** item: your UID. Save.
4. Reload Kanni. A **Moderate** button appears in Chat's header. To add more admins, add their UIDs to the same array.

Admins can delete any message, ban users (banned users can't post or join voice), unban them, and review reports. Everyone can report a message and block a user (hides that person's messages for them; manage the list in **Settings › Account**).

### What the rules enforce

- Only signed-in users can read or write; usernames can be checked for availability before sign-up.
- A user can only post as themselves: the message's `uid` and `name` must match their account.
- Messages are 1 to 500 characters, at most one every 2 seconds per user (enforced with a rate-limit document written in the same batch), and banned users can't post.
- Only a message's author or an admin can delete it; only admins can ban or read reports.
- Voice presence and signaling documents can only be written as yourself.

The 6-person voice limit is enforced by the app (Firestore rules can't count documents).

### Voice and TURN

Voice is a WebRTC mesh: each person connects directly to every other person, and Firestore only carries the connection setup. Kanni uses Google's public STUN servers. Some networks (strict school or office firewalls, some mobile carriers) block direct connections; people there will see "Couldn't connect". Fix that by adding a TURN server (for example from a TURN provider or your own coturn) to `TURN_SERVERS` in `js/config.js`:

```js
export const TURN_SERVERS = [
  { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'secret' },
];
```

Credentials in this file are public, so use a TURN service that issues limited or rotating credentials. Nothing is ever recorded.

### Costs

Firebase's free Spark plan covers a small community comfortably. Each open Chat window listens to the latest 50 messages; voice uses a few small documents per connection.

## Tests

```sh
cd tests
npm install
npm run test:rules     # Firestore rules unit tests (starts the Firestore emulator; needs Java 11+)
npm run test:e2e       # core end-to-end tests in headless Chromium at desktop and 390px widths
npm run test:features  # widgets, desktops, lock screen, bookmarks, sounds, personalization
```

`test:e2e` serves the site, starts the Auth and Firestore emulators, and opens Kanni with `?emulator=1`, which (on `localhost` only) points the app at the emulators with a demo project. It covers boot, every app, windows and snapping, the dock, the mode switch, browser tabs and navigation, shortcuts, settings persistence, the first-run tips tour, the Customize screen, about:blank with pop-ups allowed and blocked, reduced motion, accounts, chat, moderation, and a two-window voice call with fake microphones. `test:features` adds the personalization, widgets, multiple desktops, lock screen, bookmarks and sound features (no Firebase needed).

## Notes

- The browser loads pages directly ("Direct" mode). It is not a proxy: sites that refuse to be framed (YouTube, TikTok and many others) stay blank. The toolbar's **Open in a new browser tab** button always opens the current page for real. A proxy server you run can be plugged in under **Settings › Browser** (or register a transport with `BrowserNet.register`).
- There is no service worker; on load Kanni removes any left at its address by an earlier deploy.
