/* Core helpers shared by every module: DOM builder, storage, event bus. */

export const state = { booted: false };

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const uid = () => Math.random().toString(36).slice(2, 10);
export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/* h('div', {class, text, svg, onclick, ...attrs}, ...children)
   'text' always goes through textContent. 'svg' is for trusted, static icon
   markup from icons.js only, never for user or network data. */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'svg') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/* ---------- Storage (namespaced, never throws) ----------
   The "snap:" prefix is kept from earlier versions so saved data carries over. */
export const NS = 'snap:';
export const Store = {
  get(k, fb) { try { const raw = localStorage.getItem(NS + k); return raw == null ? fb : JSON.parse(raw); } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch { return false; } },
  remove(k) { try { localStorage.removeItem(NS + k); } catch {} },
  clearAll() { try { Object.keys(localStorage).filter(k => k.startsWith(NS)).forEach(k => localStorage.removeItem(k)); } catch {} },
  available() { try { localStorage.setItem(NS + 'probe', '1'); localStorage.removeItem(NS + 'probe'); return true; } catch { return false; } },
  bytes() { let n = 0; try { for (const k of Object.keys(localStorage)) if (k.startsWith(NS)) n += (k.length + (localStorage.getItem(k) || '').length) * 2; } catch {} return n; },
};

/* ---------- Event bus ---------- */
export const Bus = {
  m: new Map(),
  on(e, f) { if (!this.m.has(e)) this.m.set(e, new Set()); this.m.get(e).add(f); return () => this.m.get(e).delete(f); },
  emit(e, d) { [...(this.m.get(e) || [])].forEach(f => { try { f(d); } catch (err) { console.error(err); } }); },
};

/* ---------- URL helpers ---------- */
export function isHttpUrl(v) { try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }
export function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }

export const mq = (q) => { try { return matchMedia(q); } catch { return { matches: false, addEventListener() {} }; } };
export const isMobile = () => mq('(max-width: 720px)').matches;
export const isCoarse = () => mq('(pointer: coarse)').matches;

/* Stable color for a string (avatars). Muted, readable on near-black. */
export function colorFor(s) {
  let x = 2166136261;
  for (const c of String(s)) { x ^= c.codePointAt(0); x = Math.imul(x, 16777619) >>> 0; }
  return `hsl(${x % 360} 38% 62%)`;
}
export function initials(name) {
  const s = String(name || '?').replace(/[^A-Za-z0-9]/g, '');
  return (s.slice(0, 2) || '?').toUpperCase();
}
