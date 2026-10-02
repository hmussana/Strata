// Explorable: why long agent tasks fail. Each step succeeds with chance p, so a task of n steps finishes with p^n.
// A "check and retry" step catches a failed step with chance c and retries it once: per-step success becomes
// q = p + (1 − p)·c·p, and the whole task finishes with q^n. Pure arithmetic, computed here.
import { esc } from '../ui.js';

export const stepSuccess = (p, check, c) => (check ? p + (1 - p) * c * p : p);
export const finish = (p, n, check = false, c = 0) => stepSuccess(p, check, c) ** n;

const pct = (v) => (v >= 0.9995 ? '100%' : v < 0.0005 ? '0%' : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`);

export function mount(el, cfg) {
  const max = cfg.maxSteps || 50;
  const init = { p: cfg.p ?? 0.95, n: cfg.n ?? 20, check: false, c: cfg.catchRate ?? 0.8 };
  const st = { ...init };
  const W = 560, H = 250, L = 58, R = 14, T = 12, B = 44;
  const x = (n) => L + ((n - 1) / (max - 1)) * (W - L - R);
  const y = (v) => T + (1 - v) * (H - T - B);

  el.innerHTML = `<div class="xp xr">
    <p class="xr-head" aria-hidden="true"></p>
    <div class="xp-controls">
      <label class="xp-slider">Each step succeeds <input type="range" min="50" max="99.9" step="0.1" data-ctl="p"> <output data-out="p"></output></label>
      <label class="xp-slider">Steps <input type="range" min="1" max="${max}" step="1" data-ctl="n"> <output data-out="n"></output></label>
    </div>
    <div class="xp-controls">
      <div class="xp-k"><button type="button" data-act="check" aria-pressed="false">Add check and retry</button></div>
      <label class="xp-slider" data-catch hidden>Check catches <input type="range" min="0" max="100" step="5" data-ctl="c"> <output data-out="c"></output></label>
    </div>
    <p class="xp-formula"></p>
    <svg class="xr-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="xr-cap">
      <title id="xr-cap">Chance of finishing the whole task against the number of steps. The table below gives the same numbers.</title>
      ${[0, 0.25, 0.5, 0.75, 1].map((v) => `<line class="xr-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="xr-tick" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join('')}
      ${[1, 10, 20, 30, 40, 50].filter((n) => n <= max).map((n) => `<text class="xr-tick" x="${x(n)}" y="${H - B + 20}" text-anchor="middle">${n}</text>`).join('')}
      <text class="xr-tick" x="${(L + W - R) / 2}" y="${H - 3}" text-anchor="middle">steps in the task</text>
      <path class="xr-base" fill="none"/><path class="xr-checked" fill="none"/>
      <line class="xr-now" y1="${T}" y2="${H - B}"/><circle class="xr-dot" r="5"/>
    </svg>
    <p class="small xr-legend"><span><span class="xr-key xr-key-base"></span> no check</span> <span data-catch hidden><span class="xr-key xr-key-checked"></span> with check and retry</span></p>
    <div class="tbl-wrap"><table class="xp-table">
      <caption class="sr-only">Chance of finishing the whole task, by number of steps</caption>
      <thead><tr><th scope="col">Steps</th><th scope="col" class="num">No check</th><th scope="col" class="num" data-catch hidden>With check and retry</th></tr></thead>
      <tbody></tbody>
    </table></div>
    <p class="xp-summary sr-only" aria-live="polite"></p>
    <p class="small muted">${esc(cfg.note || '')}</p>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const curve = (check) => Array.from({ length: max }, (_, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(finish(st.p, i + 1, check, st.c)).toFixed(1)}`).join('');

  function render() {
    $('[data-ctl="p"]').value = st.p * 100; $('[data-ctl="n"]').value = st.n; $('[data-ctl="c"]').value = st.c * 100;
    $('[data-out="p"]').textContent = `${(st.p * 100).toFixed(1)}%`;
    $('[data-out="n"]').textContent = st.n;
    $('[data-out="c"]').textContent = `${Math.round(st.c * 100)}%`;
    $('[data-act="check"]').setAttribute('aria-pressed', String(st.check));
    el.querySelectorAll('[data-catch]').forEach((e) => { e.hidden = !st.check; });
    const base = finish(st.p, st.n), chk = finish(st.p, st.n, true, st.c), now = st.check ? chk : base;
    const q = stepSuccess(st.p, true, st.c);
    $('.xp-formula').innerHTML = st.check
      ? `step = p + (1 − p) × catch × p = ${st.p.toFixed(3)} + ${(1 - st.p).toFixed(3)} × ${st.c.toFixed(2)} × ${st.p.toFixed(3)} = ${q.toFixed(4)} · finish = step<sup>n</sup> = ${q.toFixed(4)}<sup>${st.n}</sup> = <strong>${pct(chk)}</strong>`
      : `finish = p<sup>n</sup> = ${st.p.toFixed(3)}<sup>${st.n}</sup> = <strong>${pct(base)}</strong>`;
    $('.xr-base').setAttribute('d', curve(false));
    $('.xr-checked').setAttribute('d', st.check ? curve(true) : '');
    el.querySelectorAll('.xr-now').forEach((l) => { l.setAttribute('x1', x(st.n)); l.setAttribute('x2', x(st.n)); });
    $('.xr-dot').setAttribute('cx', x(st.n)); $('.xr-dot').setAttribute('cy', y(now));
    const rows = [...new Set([1, 5, 10, 20, 50, 100, st.n].filter((n) => n <= max))].sort((a, b) => a - b);
    $('tbody').innerHTML = rows.map((n) => `<tr class="${n === st.n ? 'xr-cur' : ''}"><th scope="row">${n}${n === st.n ? ' (chosen)' : ''}</th><td class="num">${pct(finish(st.p, n))}</td>${st.check ? `<td class="num">${pct(finish(st.p, n, true, st.c))}</td>` : ''}</tr>`).join('');
    const msg = `Each step ${pct(st.p)}, ${st.n} steps: the whole task finishes ${pct(base)} of the time${st.check ? `, or ${pct(chk)} with a check that catches ${Math.round(st.c * 100)}% of failures and retries once` : ''}.`;
    $('.xr-head').textContent = msg;
    $('.xp-summary').textContent = msg;
  }

  el.addEventListener('input', (e) => {
    const k = e.target.dataset.ctl;
    if (!k) return;
    st[k] = k === 'n' ? Number(e.target.value) : Number(e.target.value) / 100;
    render();
  });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="check"]')) { st.check = !st.check; render(); }
  });
  render();
}
