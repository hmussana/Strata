// Per-viewer preferences. Browser storage can be unavailable (private mode, blocked site data), so every
// access is guarded and the app works without it.
const PREFIX = 'aistack.';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}

function write(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* ignore */ }
}

export const prefs = {
  get depth() {
    const d = read('depth', 2);
    return Number.isInteger(d) && d >= 1 && d <= 5 ? d : 2;
  },
  set depth(d) { write('depth', d); },
  get theme() {
    try { return localStorage.getItem(PREFIX + 'theme'); } catch { return null; }
  },
  set theme(t) {
    try { localStorage.setItem(PREFIX + 'theme', t); } catch { /* ignore */ }
  },
};
