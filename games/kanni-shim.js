/* Kanni game shim. Bundled games run in a sandboxed frame with an opaque
   origin, so they can't reach Kanni's storage or account. That also takes
   away their own localStorage and cookies, which most games expect. This
   gives them working stand-ins:
   - localStorage: starts from the save Kanni passes in the URL hash
     (#kanni-save=…), and every change is posted back to Kanni, which keeps
     it under this game's name only.
   - sessionStorage and document.cookie: in memory for this visit.
   It runs first in each game's <head> and does nothing where real storage works. */
(function () {
  'use strict';
  var m = location.pathname.match(/\/games\/([^/]+)\//);
  var id = m ? m[1] : 'game';
  function works(name) { try { var s = window[name]; s.getItem('k'); return true; } catch (e) { return false; } }

  function makeStorage(initial, onChange) {
    var data = Object.create(null);
    if (initial) for (var k in initial) if (Object.prototype.hasOwnProperty.call(initial, k)) data[k] = String(initial[k]);
    var api = {
      getItem: function (k) { k = String(k); return k in data ? data[k] : null; },
      setItem: function (k, v) { data[String(k)] = String(v); onChange(data); },
      removeItem: function (k) { delete data[String(k)]; onChange(data); },
      clear: function () { for (var k in data) delete data[k]; onChange(data); },
      key: function (i) { var keys = Object.keys(data); return i < keys.length ? keys[i] : null; },
    };
    // A Proxy so property-style use (localStorage.foo = 'x') works too.
    return new Proxy(api, {
      get: function (t, k) { if (k === 'length') return Object.keys(data).length; if (k in api) return api[k]; return typeof k === 'string' && k in data ? data[k] : undefined; },
      set: function (t, k, v) { api.setItem(k, v); return true; },
      deleteProperty: function (t, k) { api.removeItem(k); return true; },
      has: function (t, k) { return k in api || k in data; },
      ownKeys: function () { return Object.keys(data); },
      getOwnPropertyDescriptor: function (t, k) { return k in data ? { value: data[k], enumerable: true, configurable: true, writable: true } : undefined; },
    });
  }

  if (!works('localStorage')) {
    var saved = null;
    try { var h = location.hash.match(/kanni-save=([^&]*)/); if (h) saved = JSON.parse(decodeURIComponent(h[1])); } catch (e) { saved = null; }
    var timer = 0;
    var sync = function (data) {
      clearTimeout(timer);
      timer = setTimeout(function () { try { parent.postMessage({ kanniSave: id, data: Object.assign({}, data) }, '*'); } catch (e) {} }, 200);
    };
    try { Object.defineProperty(window, 'localStorage', { value: makeStorage(saved, sync), configurable: true }); } catch (e) {}
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }
  if (!works('sessionStorage')) {
    try { Object.defineProperty(window, 'sessionStorage', { value: makeStorage(null, function () {}), configurable: true }); } catch (e) {}
  }
  try { void document.cookie; } catch (e) {
    var jar = Object.create(null);
    try {
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get: function () { return Object.keys(jar).map(function (k) { return k + '=' + jar[k]; }).join('; '); },
        set: function (v) { var kv = String(v).split(';')[0], i = kv.indexOf('='); if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); },
      });
    } catch (e2) {}
  }
})();
