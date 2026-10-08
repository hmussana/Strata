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
  get introHidden() { return read('introHidden', false) === true; },
  set introHidden(v) { write('introHidden', !!v); },
};

// Best quiz score per scope ('stack' or a layer id), compared as a share of questions right
export const quizBest = {
  get(scope) {
    const all = read('quizBest', {});
    const b = all && typeof all === 'object' ? all[scope] : null;
    return b && Number.isInteger(b.score) && Number.isInteger(b.total) && b.total > 0 && b.score >= 0 && b.score <= b.total ? b : null;
  },
  // returns true when this result is a new best
  record(scope, score, total) {
    const prev = quizBest.get(scope);
    if (prev && score / total <= prev.score / prev.total) return false;
    const all = read('quizBest', {});
    write('quizBest', { ...(all && typeof all === 'object' ? all : {}), [scope]: { score, total } });
    return true;
  },
};
