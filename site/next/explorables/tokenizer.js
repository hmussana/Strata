// Explorable: a toy byte-pair-encoding (BPE) tokenizer. Play trains a real byte-level BPE on a small embedded corpus
// at mount and splits whatever you type; workbench steps through BPE merges on a tiny word list, one merge at a time.
import { esc } from '../ui.js';

// Pre-split like GPT-2: words keep their leading space; merges never cross these pieces.
const SPLIT = /'(?:s|t|re|ve|m|ll|d)| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
const utf8 = new TextEncoder();
const strict = new TextDecoder('utf-8', { fatal: true });

const join = (a, b) => `${a}\u0001${b}`;
function pairCounts(words) {
  const m = new Map();
  for (const w of words) for (let i = 0; i < w.s.length - 1; i++) { const k = join(w.s[i], w.s[i + 1]); m.set(k, (m.get(k) || 0) + w.n); }
  return m;
}
function top(m) { let bk = null, bn = 0; for (const [k, n] of m) if (n > bn) { bk = k; bn = n; } return [bk, bn]; } // ties: first seen
function apply(s, a, b, ab) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (i < s.length - 1 && s[i] === a && s[i + 1] === b) { out.push(ab); i++; } else out.push(s[i]);
  }
  return out;
}

// Byte-level BPE: symbols are token ids; ids 0-255 are the raw bytes, each merge adds one id.
export function train(corpus, maxMerges = 300, minCount = 2) {
  const counts = new Map();
  for (const c of corpus.match(SPLIT) || []) counts.set(c, (counts.get(c) || 0) + 1);
  const words = [...counts].map(([c, n]) => ({ s: [...utf8.encode(c)], n }));
  const bytes = Array.from({ length: 256 }, (_, i) => [i]);
  const rank = new Map();
  for (let k = 0; k < maxMerges; k++) {
    const [key, n] = top(pairCounts(words));
    if (!key || n < minCount) break;
    const [a, b] = key.split('\u0001').map(Number);
    const id = bytes.length;
    bytes.push([...bytes[a], ...bytes[b]]);
    rank.set(key, id);
    for (const w of words) w.s = apply(w.s, a, b, id);
  }
  return { bytes, rank };
}

export function encode(text, tk) {
  const out = [];
  for (const c of text.match(SPLIT) || []) {
    let s = [...utf8.encode(c)];
    for (;;) { // apply the earliest-learned merge present, as in training
      let best = Infinity, key = null;
      for (let i = 0; i < s.length - 1; i++) { const k = join(s[i], s[i + 1]); const r = tk.rank.get(k); if (r !== undefined && r < best) { best = r; key = k; } }
      if (key === null) break;
      const [a, b] = key.split('\u0001').map(Number);
      s = apply(s, a, b, best);
    }
    out.push(...s);
  }
  return out;
}

// A token's text; a piece of a multi-byte character shows as its hex byte(s).
function label(bytes) {
  try { return strict.decode(new Uint8Array(bytes)); } catch { return bytes.map((b) => `<${b.toString(16).toUpperCase().padStart(2, '0')}>`).join(''); }
}
const show = (t) => esc(t).replace(/ /g, '<span class="xk-sp">·</span>').replace(/\n/g, '<span class="xk-sp">⏎</span>');

function mountPlay(el, cfg) {
  const tk = train(cfg.corpus || '', cfg.merges || 300);
  const ex = cfg.examples || [];
  const st = { ids: false };
  el.innerHTML = `<div class="xp xq">
    <label class="xk-field"><span class="label">Your text</span>
      <textarea rows="3" spellcheck="false" data-in>${esc(ex[0]?.text || '')}</textarea></label>
    <div class="xp-k" role="group" aria-label="Load an example">
      <span class="label">Try</span>
      ${ex.map((e, i) => `<button type="button" data-ex="${i}">${esc(e.label)}</button>`).join('')}
    </div>
    <p class="xk-stats" aria-hidden="true"></p>
    <div class="xk-tokens" role="img" aria-label="Your text split into tokens"></div>
    <div class="xp-k"><button type="button" data-act="ids" aria-pressed="false">Show token IDs</button></div>
    <p class="xk-ids" hidden></p>
    <p class="xp-summary sr-only" aria-live="polite"></p>
    <p class="small muted">Toy tokenizer, not a real model's. It learned ${tk.bytes.length - 256} merges from a short English text in your browser, on top of 256 single bytes. ${esc(cfg.note || '')}</p>
  </div>`;
  const ta = el.querySelector('[data-in]');

  function render() {
    const ids = encode(ta.value, tk);
    const chars = [...ta.value].length;
    const labels = ids.map((id) => label(tk.bytes[id]));
    el.querySelector('.xk-tokens').innerHTML = ids.map((id, i) => `<span class="xk-tok xk-t${i % 6}" title="token ${id}">${show(labels[i])}</span>`).join('') || '<span class="muted small">Type something above.</span>';
    el.querySelector('.xk-tokens').setAttribute('aria-label', `Tokens: ${labels.map((l) => `“${l}”`).join(', ')}`);
    const per = ids.length ? (chars / ids.length).toFixed(1) : '0';
    el.querySelector('.xk-stats').innerHTML = `<strong>${ids.length}</strong> tokens · <strong>${chars}</strong> characters · ${per} characters per token`;
    el.querySelector('.xk-ids').textContent = `[${ids.join(', ')}]`;
    el.querySelector('.xk-ids').hidden = !st.ids;
    el.querySelector('.xp-summary').textContent = `${ids.length} tokens for ${chars} characters.`;
  }
  ta.addEventListener('input', render);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ex !== undefined) { ta.value = ex[Number(b.dataset.ex)].text; render(); }
    if (b.dataset.act === 'ids') { st.ids = !st.ids; b.setAttribute('aria-pressed', String(st.ids)); render(); }
  });
  render();
}

// Workbench: character-level BPE on a word list with counts, one merge per click.
function mountBench(el, cfg) {
  const base = cfg.words || [];
  let words, merges, vocab;
  function reset() {
    words = base.map((w) => ({ s: [...w.word], n: w.count, word: w.word }));
    merges = [];
    vocab = [...new Set(words.flatMap((w) => w.s))].sort();
  }
  el.innerHTML = `<div class="xp xp-bench xq">
    <div class="xp-sample">
      <button type="button" class="btn" data-act="next">Next merge</button>
      <button type="button" class="btn-ghost" data-act="reset">Reset</button>
      <span class="xk-stats"></span>
    </div>
    <p class="xp-formula" aria-live="polite"></p>
    <div class="xk-grid">
      <div class="tbl-wrap"><table class="xp-table">
        <caption class="small muted">Adjacent pairs, counted across all words (× how often each word appears)</caption>
        <thead><tr><th scope="col">Pair</th><th scope="col">Count</th><th scope="col" class="num">n</th></tr></thead>
        <tbody data-pairs></tbody></table></div>
      <div>
        <h4 class="xk-h">Words, as currently split</h4>
        <ul class="xk-words" data-words></ul>
      </div>
    </div>
    <div><h4 class="xk-h">Vocabulary</h4><p class="xk-vocab" data-vocab></p></div>
    <label class="xk-field"><span class="label">Split a new word with the merges so far</span>
      <input type="text" value="${esc(cfg.testWord || '')}" spellcheck="false" data-test></label>
    <p class="xk-tokens" data-testout></p>
    <p class="small muted">Toy corpus. ${esc(cfg.note || '')}</p>
  </div>`;
  const spans = (s) => s.map((t, i) => `<span class="xk-tok xk-t${i % 6}">${esc(t)}</span>`).join('');

  function render() {
    const pc = [...pairCounts(words)].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = pc[0]?.[1] || 1;
    const [nextKey] = top(pairCounts(words));
    el.querySelector('[data-pairs]').innerHTML = pc.map(([k, n]) => {
      const [a, b] = k.split('\u0001');
      return `<tr class="${k === nextKey ? 'xk-next' : ''}"><th scope="row"><code>${esc(a)}</code> + <code>${esc(b)}</code>${k === nextKey ? ' <span class="sr-only">(next merge)</span>' : ''}</th>
        <td class="c-bar"><span class="xp-bar"><span class="xp-fill" data-w="${(n / max * 100).toFixed(1)}"></span></span></td><td class="num">${n}</td></tr>`;
    }).join('') || '<tr><td colspan="3" class="muted">No pairs left: every word is a single token.</td></tr>';
    el.querySelectorAll('[data-w]').forEach((f) => { f.style.width = `${f.dataset.w}%`; }); // CSP: no inline style attributes
    el.querySelector('[data-words]').innerHTML = words.map((w) => `<li><span class="xk-tokens">${spans(w.s)}</span> <span class="small muted">×${w.n} · ${w.s.length} token${w.s.length === 1 ? '' : 's'}</span></li>`).join('');
    const fresh = new Set(merges.map((m) => m.ab));
    el.querySelector('[data-vocab]').innerHTML = vocab.map((v) => `<span class="chip ${fresh.has(v) ? 'xk-new' : ''}">${esc(v)}</span>`).join(' ');
    const last = merges[merges.length - 1];
    el.querySelector('.xk-stats').textContent = `${merges.length} merge${merges.length === 1 ? '' : 's'} · vocabulary ${vocab.length}`;
    el.querySelector('.xp-formula').textContent = last
      ? `Merge ${merges.length}: “${last.a}” + “${last.b}” → “${last.ab}” (seen ${last.n} times). Every word is re-split with it.`
      : 'Start: every character is its own token. Each merge joins the most frequent adjacent pair into one new token.';
    el.querySelector('[data-act="next"]').disabled = !nextKey;
    let t = [...el.querySelector('[data-test]').value];
    for (const m of merges) t = apply(t, m.a, m.b, m.ab);
    el.querySelector('[data-testout]').innerHTML = t.length ? `${spans(t)} <span class="small muted">${t.length} token${t.length === 1 ? '' : 's'}</span>` : '';
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'next') {
      const [key, n] = top(pairCounts(words));
      if (!key) return;
      const [a, bb] = key.split('\u0001');
      const ab = a + bb;
      merges.push({ a, b: bb, ab, n });
      if (!vocab.includes(ab)) vocab.push(ab);
      for (const w of words) w.s = apply(w.s, a, bb, ab);
      render();
    }
    if (b.dataset.act === 'reset') { reset(); render(); }
  });
  el.querySelector('[data-test]').addEventListener('input', render);
  reset();
  render();
}

export function mount(el, cfg, mode = 'play') {
  return mode === 'workbench' ? mountBench(el, cfg) : mountPlay(el, cfg);
}
