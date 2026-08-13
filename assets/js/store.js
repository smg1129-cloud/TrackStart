/*
 * store.js — shared browser-local state for both portals.
 *
 * Everything lives in localStorage so the client (association) portal and the
 * owner request portal operate on the same association record set. In a
 * production build this is the server + database boundary.
 */
window.RGStore = (function () {
  "use strict";
  var KEY = "rgfl_state_v3";

  function seed() {
    return {
      association: { name: "Bayshore Villas Condominium Association", type: "condo" },
      seq: 0,               // monotonic id source (no Math.random for determinism)
      docs: [],             // uploaded/processed documents
      requests: [],         // owner records requests
      seededSamples: false,
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      var s = JSON.parse(raw);
      if (!s || !s.association) return seed();
      return s;
    } catch (e) {
      return seed();
    }
  }

  function save(s) {
    localStorage.setItem(KEY, JSON.stringify(s));
    return s;
  }

  function reset() {
    localStorage.removeItem(KEY);
    return seed();
  }

  function nextId(s, prefix) {
    s.seq = (s.seq || 0) + 1;
    return (prefix || "id") + "-" + s.seq;
  }

  return { load: load, save: save, reset: reset, nextId: nextId, seed: seed };
})();
