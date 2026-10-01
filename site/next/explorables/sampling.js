// Explorable: how a language model turns scores into a choice of next token.
// The maths is real (softmax with temperature, top-k, top-p); the example scores are illustrative and labelled so.
import { esc } from '../ui.js';

export function softmax(z, T) {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp((v - m) / T));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

// Keep the top-k (0 = all), then the smallest prefix whose probability reaches topP; renormalise.
export function filterProbs(p, k = 0, topP = 1) {
  const order = p.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const keep = new Set();
  let cum = 0;
  for (const [v, i] of order.slice(0, k > 0 ? k : order.length)) {
    keep.add(i);
    cum += v;
    if (topP < 1 && cum >= topP - 1e-9) break;   // top-p off (1) never cuts: tiny tails stay possible
  }
  const kept = p.map((v, i) => (keep.has(i) ? v : 0));
  const s = kept.reduce((a, b) => a + b, 0) || 1;
  return kept.map((v) => v / s);
}

function draw(p) {
  let r = Math.random(), acc = 0;
  for (let i = 0; i < p.length; i++) { acc += p[i]; if (r <= acc) return i; }
  return p.findIndex((v) => v > 0);
}

const pct = (v) => (v >= 0.995 ? '99+%' : v < 0.0005 ? '0%' : v < 0.01 ? '<1%' : `${Math.round(v * 100)}%`);
const fmt = (v, d = 2) => Number(v).toFixed(d);

export function mount(el, cfg, mode = 'play') {
  const bench = mode === 'workbench';
  const tokens = cfg.tokens.map((t) => ({ ...t }));
  const st = { T: 1, k: 0, topP: 1, tally: new Map(), last: '' };

  el.innerHTML = `<div class="xp ${bench ? 'xp-bench' : ''}">
    <p class="xp-prompt"><span>${esc(cfg.prompt)}</span> <span class="xp-blank" aria-label="next token">?</span></p>
    <div class="xp-controls">
      <label class="xp-slider">Temperature <input type="range" min="0.1" max="2" step="0.1" value="1" data-ctl="T"> <output data-out="T">1.0</output></label>
      <div class="xp-k" role="group" aria-label="Choose from">
        <span class="label">Choose from</span>
        ${[[0, 'All'], [5, 'Top 5'], [3, 'Top 3'], [1, 'Top 1 (greedy)']].map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${k === 0}">${l}</button>`).join('')}
      </div>
      ${bench ? '<label class="xp-slider">Top-p <input type="range" min="0.1" max="1" step="0.05" value="1" data-ctl="topP"> <output data-out="topP">1.00</output></label>' : ''}
    </div>
    ${bench ? '<p class="xp-formula" aria-live="polite"></p>' : ''}
    <div class="tbl-wrap"><table class="xp-table">
      <caption class="sr-only">Probability of each candidate next token</caption>
      <thead><tr><th scope="col">Token</th>${bench ? '<th scope="col">Score z</th><th scope="col">z ÷ T</th><th scope="col">exp(z ÷ T)</th>' : ''}<th scope="col">Probability</th><th scope="col" class="num">p</th></tr></thead>
      <tbody></tbody>
    </table></div>
    <div class="xp-sample">
      <button type="button" class="btn" data-act="sample">Sample 20</button>
      <button type="button" class="btn-ghost" data-act="reset">Reset</button>
      <div class="xp-tally" aria-live="polite"></div>
    </div>
    <p class="xp-summary sr-only" aria-live="polite"></p>
    <p class="small muted">${esc(cfg.note || '')}</p>
  </div>`;

  const tbody = el.querySelector('tbody');
  tbody.innerHTML = tokens.map((t, i) => `<tr data-i="${i}">
      <th scope="row">${esc(t.text)}</th>
      ${bench ? `<td><input type="number" step="0.1" value="${t.logit}" aria-label="Score for ${esc(t.text)}" data-logit="${i}"></td><td class="c-zt num"></td><td class="c-exp num"></td>` : ''}
      <td class="c-bar"><span class="xp-bar"><span class="xp-fill"></span></span></td>
      <td class="c-p num"></td></tr>`).join('');

  function compute() {
    const z = tokens.map((t) => Number(t.logit) || 0);
    const raw = softmax(z, st.T);
    const p = filterProbs(raw, st.k, st.topP);
    return { z, raw, p };
  }

  function render() {
    const { z, p } = compute();
    el.querySelector('[data-out="T"]').textContent = fmt(st.T, 1);
    if (bench) el.querySelector('[data-out="topP"]').textContent = fmt(st.topP);
    el.querySelectorAll('[data-k]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.k) === st.k)));
    const m = Math.max(...z);
    tbody.querySelectorAll('tr').forEach((tr, i) => {
      const off = p[i] === 0;
      tr.classList.toggle('is-out', off);
      tr.querySelector('.xp-fill').style.width = `${(p[i] * 100).toFixed(1)}%`;
      tr.querySelector('.c-p').textContent = off ? 'excluded' : pct(p[i]);
      if (bench) {
        tr.querySelector('.c-zt').textContent = fmt(z[i] / st.T);
        tr.querySelector('.c-exp').textContent = Math.exp((z[i] - m) / st.T).toPrecision(3);
      }
    });
    if (bench) {
      el.querySelector('.xp-formula').innerHTML = `p<sub>i</sub> = exp(z<sub>i</sub> ÷ ${fmt(st.T, 1)}) ÷ Σ exp(z<sub>j</sub> ÷ ${fmt(st.T, 1)})${st.k ? ` · keep top ${st.k}` : ''}${st.topP < 1 ? ` · keep smallest set reaching p ≥ ${fmt(st.topP)}` : ''} · renormalise <span class="muted small">(exp column shown relative to the largest score, which doesn't change p)</span>`;
    }
    const top = p.indexOf(Math.max(...p));
    el.querySelector('.xp-summary').textContent = `Most likely: ${tokens[top].text}, ${pct(p[top])}.`;
  }

  function renderTally() {
    const list = [...st.tally.entries()].sort((a, b) => b[1] - a[1]);
    el.querySelector('.xp-tally').innerHTML = list.length
      ? `<span class="small muted">Sampled:</span> ${list.map(([t, n]) => `<span class="chip">${esc(t)} ×${n}</span>`).join(' ')}`
      : '';
    el.querySelector('.xp-blank').textContent = st.last || '?';
    el.querySelector('.xp-blank').classList.toggle('filled', Boolean(st.last));
  }

  el.addEventListener('input', (e) => {
    const ctl = e.target.dataset.ctl;
    if (ctl) { st[ctl] = Number(e.target.value); render(); }
    if (e.target.dataset.logit !== undefined) { tokens[Number(e.target.dataset.logit)].logit = Number(e.target.value); render(); }
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k !== undefined) { st.k = Number(b.dataset.k); render(); }
    if (b.dataset.act === 'sample') {
      const { p } = compute();
      st.tally = new Map();
      for (let n = 0; n < 20; n++) {
        const t = tokens[draw(p)].text;
        st.tally.set(t, (st.tally.get(t) || 0) + 1);
        st.last = t;
      }
      renderTally();
    }
    if (b.dataset.act === 'reset') {
      st.T = 1; st.k = 0; st.topP = 1; st.tally = new Map(); st.last = '';
      tokens.forEach((t, i) => { t.logit = cfg.tokens[i].logit; });
      el.querySelectorAll('[data-ctl="T"]').forEach((i) => { i.value = 1; });
      el.querySelectorAll('[data-ctl="topP"]').forEach((i) => { i.value = 1; });
      el.querySelectorAll('[data-logit]').forEach((i) => { i.value = cfg.tokens[Number(i.dataset.logit)].logit; });
      render(); renderTally();
    }
  });
  render();
}
