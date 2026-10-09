/* =========================================================================
   FIREBASE CONFIG  ·  paste your project's web config here (see README.md)
   Firebase console › Project settings › Your apps › Web app › SDK setup and
   configuration › Config. These values are public identifiers, not secrets;
   access is controlled by firestore.rules.
   Leave apiKey empty and Kanni runs without accounts or Chat.
   ========================================================================= */
export const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

/* Firebase JS SDK version loaded from the official CDN (www.gstatic.com). */
export const FIREBASE_SDK_VERSION = '12.7.0';

/* =========================================================================
   VOICE: ICE servers for WebRTC
   Google's public STUN servers work for most home networks. Some networks
   (strict school/office firewalls, symmetric NAT, some mobile carriers)
   block direct peer-to-peer audio; those need a TURN relay. Add yours here,
   for example:
     { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'secret' }
   Leave it empty to use STUN only.
   ========================================================================= */
export const TURN_SERVERS = [];
export const STUN_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
