// Explorable: a character bigram model trained live by gradient descent. One table of scores W[a][b]
// ("how likely is b after a"), softmax per row, cross-entropy loss averaged over every pair in the text.
// Everything is computed in the browser from the embedded text; nothing here is a real model's numbers.
import { esc } from '../ui.js';
import { softmax } from './sampling.js';

function rng(seed) { // mulberry32: same start every time
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function setup(raw) {
  const text = raw.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z .,]/g, '');
  const chars = [...new Set(text)].sort();
  const ix = new Map(chars.map((c, i) => [c, i]));
  const V = chars.length;
  const C = chars.map(() => new Array(V).fill(0));
  for (let i = 0; i < text.length - 1; i++) C[ix.get(text[i])][ix.get(text[i + 1])]++;
  const n = C.map((r) => r.reduce((a, b) => a + b, 0));
  const N = text.length - 1;
  let floor = 0; // lowest loss any bigram can reach: the text's own next-character frequencies
  C.forEach((r, i) => r.forEach((c, j) => { if (c) floor -= c * Math.log(c / n[i]); }));
  return { text, chars, ix, V, C, n, N, floor: floor / N };
}

// Loss = -(1/N) Σ count(a→b) · log p(b|a); gradient dLoss/dW[a][b] = (n_a · p(b|a) − count(a→b)) / N.
export function lossGrad(W, d) {
  let L = 0;
  const P = W.map((row) => softmax(row, 1));
  const G = W.map((row, i) => {
    const m = Math.max(...row);
    const lz = m + Math.log(row.reduce((s, w) => s + Math.exp(w - m), 0));
    row.forEach((w, j) => { if (d.C[i][j]) L -= d.C[i][j] * (w - lz); });
    return P[i].map((p, j) => (d.n[i] * p - d.C[i][j]) / d.N);
  });
  return { loss: L / d.N, P, G };
}

const shown = (c) => (c === ' ' ? '␣' : c);
const named = (c) => (c === ' ' ? 'space' : c === '.' ? 'full stop' : c === ',' ? 'comma' : c);
const pct = (v) => (v >= 0.995 ? '99+%' : v < 0.005 ? '<1%' : `${Math.round(v * 100)}%`);

export function mount(el, cfg, mode = 'play') {
  const bench = mode === 'workbench';
  const d = setup(cfg.text || '');
  const contexts = (cfg.contexts || [d.chars[0]]).filter((c) => d.ix.has(c));
  const per = cfg.stepsPerClick || 25;
  const st = { W: null, hist: [], ctx: contexts[0], lr: cfg.lr || 20, steps: bench ? 10 : per, sample: '' };
  const uniform = Math.log(d.V);

  function reset() {
    const r = rng(cfg.seed || 1);
    st.W = d.chars.map(() => d.chars.map(() => (r() - 0.5) * 0.2));
    st.hist = [lossGrad(st.W, d).loss];
    st.sample = '';
  }

  el.innerHTML = `<div class="xp ${bench ? 'xp-bench' : ''} xb">
    <div class="xp-controls">
      ${bench ? `<label class="xp-slider">Learning rate η <input type="range" min="0" max="3" step="0.05" value="${Math.log10(st.lr)}" data-ctl="lr"> <output data-out="lr"></output></label>
      <div class="xp-k" role="group" aria-label="Steps per click"><span class="label">Steps per click</span>
        ${[1, 10, 100].map((k) => `<button type="button" data-steps="${k}" aria-pressed="${k === st.steps}">${k}</button>`).join('')}</div>` : ''}
      <div class="xp-sample">
        <button type="button" class="btn" data-act="train">${bench ? 'Step' : `Train ${per} steps`}</button>
        <button type="button" class="btn-ghost" data-act="reset">Reset</button>
      </div>
    </div>
    <div class="xb-chart">
      <svg viewBox="0 0 320 150" role="img" aria-labelledby="xb-cap-${mode}"></svg>
      <p class="xb-loss" id="xb-cap-${mode}"></p>
    </div>
    ${bench ? '<p class="xp-formula" aria-live="polite"></p>' : ''}
    <div class="xp-k" role="group" aria-label="Context character">
      <span class="label">After the character</span>
      ${contexts.map((c) => `<button type="button" data-ctx="${esc(c)}" aria-label="${esc(named(c))}" aria-pressed="${c === st.ctx}">${esc(shown(c))}</button>`).join('')}
    </div>
    <div class="tbl-wrap"><table class="xp-table">
      <caption class="sr-only">Model probability of each next character after the chosen character</caption>
      <thead><tr><th scope="col">Next</th>${bench ? '<th scope="col" class="num">In text</th><th scope="col" class="num">Share</th>' : ''}<th scope="col">Model probability</th><th scope="col" class="num">p</th>${bench ? '<th scope="col" class="num">Gradient</th>' : ''}</tr></thead>
      <tbody></tbody></table></div>
    ${bench ? '' : '<div class="xp-sample"><button type="button" class="btn-ghost" data-act="write">Write 60 characters</button><p class="xb-sample" aria-live="polite"></p></div>'}
    <p class="xp-summary sr-only" aria-live="polite"></p>
    <p class="small muted">A toy model learning from ${d.N + 1} characters of text written for this page; every number is computed live in your browser. Loss is in nats: ${uniform.toFixed(2)} means a uniform guess over ${d.V} characters, ${d.floor.toFixed(2)} is the best any bigram can do on this text. ${esc(cfg.note || '')}</p>
  </div>`;

  function chart() {
    const h = st.hist, W = 320, H = 150, pad = 4;
    const top = Math.max(uniform * 1.1, ...h);
    const x = (i) => pad + (i / Math.max(h.length - 1, 1)) * (W - 2 * pad);
    const y = (v) => H - pad - (v / top) * (H - 2 * pad);
    const every = Math.ceil(h.length / 300);
    const pts = h.map((v, i) => [i, v]).filter(([i]) => i % every === 0 || i === h.length - 1).map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    el.querySelector('svg').innerHTML = `
      <line x1="0" x2="${W}" y1="${y(uniform)}" y2="${y(uniform)}" class="xb-ref"/><text x="${W - 4}" y="${y(uniform) - 4}" text-anchor="end" class="xb-lab">uniform guess</text>
      <line x1="0" x2="${W}" y1="${y(d.floor)}" y2="${y(d.floor)}" class="xb-ref"/><text x="${W - 4}" y="${y(d.floor) + 12}" text-anchor="end" class="xb-lab">best possible</text>
      <polyline points="${pts}" class="xb-line"/>`;
  }

  function render() {
    const { loss, P, G } = lossGrad(st.W, d);
    const steps = st.hist.length - 1;
    const up = steps > 0 && loss > st.hist[st.hist.length - 2] + 1e-9;
    chart();
    el.querySelector('.xb-loss').innerHTML = `Loss <strong>${loss.toFixed(3)}</strong> after ${steps} step${steps === 1 ? '' : 's'} <span class="muted small">(started at ${st.hist[0].toFixed(3)}; best possible ${d.floor.toFixed(3)})</span>${up ? ' <span class="xb-warn">Loss went up: the step overshot.</span>' : ''}`;
    const a = d.ix.get(st.ctx);
    const rows = d.chars.map((c, j) => ({ c, j, cnt: d.C[a][j], p: P[a][j], g: G[a][j] }))
      .sort((r, s) => s.cnt - r.cnt || s.p - r.p).slice(0, bench ? 10 : 8);
    el.querySelector('tbody').innerHTML = rows.map((r) => `<tr><th scope="row"><span aria-label="${esc(named(r.c))}">${esc(shown(r.c))}</span></th>
      ${bench ? `<td class="num">${r.cnt}</td><td class="num">${d.n[a] ? pct(r.cnt / d.n[a]) : '–'}</td>` : ''}
      <td class="c-bar"><span class="xp-bar"><span class="xp-fill" data-w="${(r.p * 100).toFixed(1)}"></span></span></td>
      <td class="num">${pct(r.p)}</td>${bench ? `<td class="num">${r.g.toPrecision(2)}</td>` : ''}</tr>`).join('');
    el.querySelectorAll('[data-w]').forEach((f) => { f.style.width = `${f.dataset.w}%`; }); // CSP: no inline style attributes
    el.querySelectorAll('[data-ctx]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ctx === st.ctx)));
    if (bench) {
      el.querySelector('[data-out="lr"]').textContent = st.lr >= 10 ? st.lr.toFixed(0) : st.lr.toFixed(1);
      el.querySelectorAll('[data-steps]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.steps) === st.steps)));
      el.querySelector('[data-act="train"]').textContent = `Step ×${st.steps}`;
      const r = rows[0];
      const next = st.W[a][r.j] - st.lr * r.g;
      el.querySelector('.xp-formula').innerHTML = `W[a][b] ← W[a][b] − η × (n<sub>a</sub> × p(b|a) − count(a→b)) ÷ N<br>
        <span class="muted small">Next step for “${esc(shown(st.ctx))}” → “${esc(shown(r.c))}”:</span> ${st.W[a][r.j].toFixed(3)} − ${st.lr.toFixed(1)} × (${d.n[a]} × ${r.p.toFixed(3)} − ${r.cnt}) ÷ ${d.N} = ${next.toFixed(3)}`;
    }
    const best = rows.reduce((m, r) => (r.p > m.p ? r : m), rows[0]);
    el.querySelector('.xp-summary').textContent = `Loss ${loss.toFixed(2)} after ${steps} steps. After ${named(st.ctx)}, the model's top guess is ${named(best.c)} at ${pct(best.p)}.`;
    if (!bench) el.querySelector('.xb-sample').textContent = st.sample;
  }

  function train(k) {
    for (let s = 0; s < k; s++) {
      const { G } = lossGrad(st.W, d);
      st.W = st.W.map((row, i) => row.map((w, j) => w - st.lr * G[i][j]));
      st.hist.push(lossGrad(st.W, d).loss);
      if (st.hist.length > 5000) st.hist.splice(1, 1); // keep the start, drop the oldest middle point
    }
  }

  function write() {
    let c = cfg.start && d.ix.has(cfg.start) ? cfg.start : d.chars[0], out = c;
    for (let i = 0; i < 59; i++) {
      const p = softmax(st.W[d.ix.get(c)], 1);
      let r = Math.random(), j = 0;
      while (j < p.length - 1 && (r -= p[j]) > 0) j++;
      c = d.chars[j];
      out += c;
    }
    st.sample = `“${out}”`;
  }

  el.addEventListener('input', (e) => {
    if (e.target.dataset.ctl === 'lr') { st.lr = 10 ** Number(e.target.value); render(); }
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ctx !== undefined) st.ctx = b.dataset.ctx;
    if (b.dataset.steps) st.steps = Number(b.dataset.steps);
    if (b.dataset.act === 'train') train(st.steps);
    if (b.dataset.act === 'reset') reset();
    if (b.dataset.act === 'write') write();
    render();
  });
  reset();
  render();
}
