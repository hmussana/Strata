// Explorable: scaled dot-product attention, softmax(QKᵀ/√d)·V.
// The maths is real; the query, key and value vectors are small hand-set examples, labelled illustrative in content.
import { esc } from '../ui.js';
import { softmax } from './sampling.js';

const dot = (a, b) => a.reduce((s, v, i) => s + v * (b[i] || 0), 0);
const fmt = (v, d = 2) => (v === -Infinity ? '−∞' : (Math.abs(v) < 0.005 ? 0 : v).toFixed(d).replace('-', '−'));
const pct = (v) => (v >= 0.995 ? '99+%' : v < 0.005 ? '0%' : `${Math.round(v * 100)}%`);

// Every step of attention for a whole sequence. Row i is the query token, column j the key token.
export function attend(Q, K, V, causal = true) {
  const d = Q[0].length;
  const S = Q.map((q) => K.map((k) => dot(q, k)));
  const scaled = S.map((row) => row.map((s) => s / Math.sqrt(d)));
  const masked = scaled.map((row, i) => row.map((s, j) => (causal && j > i ? -Infinity : s)));
  const A = masked.map((row) => softmax(row, 1));
  const out = V ? A.map((w) => V[0].map((_, c) => w.reduce((s, a, j) => s + a * V[j][c], 0))) : null;
  return { d, S, scaled, masked, A, out };
}

function mountPlay(el, cfg) {
  const toks = cfg.tokens;
  const st = { h: 0, i: cfg.start ?? toks.length - 1 };
  el.innerHTML = `<div class="xp xa">
    <div class="xp-k" role="group" aria-label="Attention head">
      <span class="label">Head</span>
      ${cfg.heads.map((h, i) => `<button type="button" data-h="${i}">${esc(h.name)}</button>`).join('')}
    </div>
    <p class="small xa-about"></p>
    <div class="xa-words" role="group" aria-label="Choose a word to see what it attends to">
      ${toks.map((t, i) => `<button type="button" class="xa-word" data-i="${i}">${esc(t)}</button>`).join(' ')}
    </div>
    <div class="tbl-wrap"><table class="xp-table">
      <caption class="sr-only">Attention weights from the chosen word</caption>
      <thead><tr><th scope="col">Looks at</th><th scope="col">Weight</th><th scope="col" class="num">%</th></tr></thead>
      <tbody></tbody>
    </table></div>
    <p class="xp-summary sr-only" aria-live="polite"></p>
    <p class="small muted">${esc(cfg.note || '')}</p>
  </div>`;
  const tbody = el.querySelector('tbody');

  function render() {
    const h = cfg.heads[st.h];
    const w = attend(h.q, h.k, null).A[st.i];
    el.querySelectorAll('[data-h]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.h) === st.h)));
    el.querySelector('.xa-about').textContent = h.about;
    el.querySelectorAll('.xa-word').forEach((b, j) => {
      const sel = j === st.i;
      b.setAttribute('aria-pressed', String(sel));
      b.classList.toggle('is-later', j > st.i);
      b.style.setProperty('--w', `${Math.round((j > st.i ? 0 : w[j]) * 45)}%`);
      b.setAttribute('aria-label', sel ? `${toks[j]} (chosen)` : j > st.i ? `${toks[j]} (later, hidden)` : `${toks[j]}, ${pct(w[j])}`);
    });
    tbody.innerHTML = toks.map((t, j) => (j > st.i
      ? `<tr class="is-out"><th scope="row">${esc(t)}</th><td class="small muted">later word: hidden by the causal mask</td><td class="c-p num">–</td></tr>`
      : `<tr><th scope="row">${esc(t)}${j === st.i ? ' <span class="small muted">(itself)</span>' : ''}</th>
          <td class="c-bar"><span class="xp-bar"><span class="xp-fill" style="width:${(w[j] * 100).toFixed(1)}%"></span></span></td>
          <td class="c-p num">${pct(w[j])}</td></tr>`)).join('');
    const top = w.indexOf(Math.max(...w));
    el.querySelector('.xp-summary').textContent = `${h.name} head: “${toks[st.i]}” attends most to “${toks[top]}”, ${pct(w[top])}.`;
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.h !== undefined) st.h = Number(b.dataset.h);
    if (b.dataset.i !== undefined) st.i = Number(b.dataset.i);
    render();
  });
  el.querySelector('.xa-words').addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    st.i = Math.min(toks.length - 1, Math.max(0, st.i + step));
    render();
    el.querySelector(`.xa-word[data-i="${st.i}"]`).focus();
  });
  render();
}

const VEC = { q: 'Query', k: 'Key', v: 'Value' };

function mountBench(el, cfg) {
  const toks = cfg.tokens.map((t) => ({ text: t.text, q: [...t.q], k: [...t.k], v: [...t.v] }));
  const d = toks[0].q.length;
  const st = { causal: true, focus: cfg.focus ?? toks.length - 1 };
  const uid = `xa-${Math.random().toString(36).slice(2, 8)}`;
  const sub = (x) => Array.from({ length: d }, (_, c) => `${x}<sub>${c + 1}</sub>`).join(' ');
  el.innerHTML = `<div class="xp xp-bench xa">
    <p class="xp-formula">Attention(Q, K, V) = softmax(QKᵀ ÷ √d) · V <span class="muted small">with d = ${d}, so √d = ${fmt(Math.sqrt(d), 3)}</span></p>
    <p class="small muted xa-about" id="${uid}">Edit any number. Each token has a query (what it looks for), a key (what it offers to be found by) and a value (what it passes on).</p>
    <div class="tbl-wrap"><table class="xp-table xa-in" aria-describedby="${uid}">
      <thead><tr><th scope="col">Token</th>${Object.keys(VEC).map((x) => `<th scope="col">${sub(x)}</th>`).join('')}</tr></thead>
      <tbody>${toks.map((t, i) => `<tr><th scope="row">${esc(t.text)}</th>${Object.keys(VEC).map((x) => `<td class="xa-vec">${t[x].map((v, c) => `<input type="number" step="0.1" value="${v}" data-t="${i}" data-x="${x}" data-c="${c}" aria-label="${VEC[x]} number ${c + 1} for ${esc(t.text)}">`).join('')}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <div class="xp-controls">
      <label class="xa-check"><input type="checkbox" data-ctl="causal" checked> Causal mask (hide later tokens)</label>
      <label class="xp-slider">Explain row <select data-ctl="focus">${toks.map((t, i) => `<option value="${i}"${i === st.focus ? ' selected' : ''}>${esc(t.text)}</option>`).join('')}</select></label>
      <button type="button" class="btn-ghost" data-act="reset">Reset</button>
    </div>
    <div class="xa-steps"></div>
    <p class="xp-formula xa-work" aria-live="polite"></p>
    <p class="small muted">${esc(cfg.note || '')}</p>
  </div>`;
  const names = toks.map((t) => esc(t.text));

  const mat = (title, M, cell, cols = names) => `<div class="tbl-wrap"><table class="xp-table xa-mat">
    <caption>${title}</caption>
    <thead><tr><th scope="col"><span class="sr-only">Query token</span></th>${cols.map((c) => `<th scope="col" class="num">${c}</th>`).join('')}</tr></thead>
    <tbody>${M.map((row, i) => `<tr${i === st.focus ? ' class="xa-focus"' : ''}><th scope="row">${names[i]}</th>${row.map((v, j) => cell(v, i, j)).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
  const num = (v) => `<td class="num${v === -Infinity ? ' muted' : ''}">${fmt(v)}</td>`;

  function render() {
    const r = attend(toks.map((t) => t.q), toks.map((t) => t.k), toks.map((t) => t.v), st.causal);
    el.querySelector('.xa-steps').innerHTML = [
      mat('1. Scores QKᵀ: each query dotted with each key', r.S, num),
      mat(`2. Scaled: divide by √d = ${fmt(Math.sqrt(d), 3)}`, r.scaled, num),
      mat(`3. Causal mask ${st.causal ? 'on: later tokens set to −∞' : 'off: every token can see every other'}`, r.masked, num),
      mat('4. Softmax along each row: the attention weights', r.A, (v) => `<td class="num xa-w" style="--w:${Math.round(v * 45)}%">${fmt(v)}</td>`),
      mat('5. Output = weights · V: a blend of the values', r.out, num, Array.from({ length: d }, (_, c) => `out<sub>${c + 1}</sub>`)),
    ].join('');
    const f = st.focus, w = r.A[f];
    const terms = w.map((a, j) => [a, j]).filter(([a]) => a > 0);
    el.querySelector('.xa-work').innerHTML = `Row “${names[f]}”: out = ${terms.map(([a, j]) => `${fmt(a)}×v<sub>${names[j]}</sub>`).join(' + ')} = (${r.out[f].map((v) => fmt(v)).join(', ')})`
      + ` <span class="muted small">Biggest weight: “${names[w.indexOf(Math.max(...w))]}”, ${pct(Math.max(...w))}.</span>`;
  }

  el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.t !== undefined) { toks[t.dataset.t][t.dataset.x][t.dataset.c] = Number(t.value) || 0; render(); }
  });
  el.addEventListener('change', (e) => {
    if (e.target.dataset.ctl === 'causal') st.causal = e.target.checked;
    if (e.target.dataset.ctl === 'focus') st.focus = Number(e.target.value);
    render();
  });
  el.querySelector('[data-act="reset"]').addEventListener('click', () => {
    el.querySelectorAll('[data-t]').forEach((inp) => {
      const v = cfg.tokens[inp.dataset.t][inp.dataset.x][inp.dataset.c];
      inp.value = v; toks[inp.dataset.t][inp.dataset.x][inp.dataset.c] = v;
    });
    st.causal = true; el.querySelector('[data-ctl="causal"]').checked = true;
    render();
  });
  render();
}

export function mount(el, cfg, mode = 'play') {
  return mode === 'workbench' ? mountBench(el, cfg) : mountPlay(el, cfg);
}
