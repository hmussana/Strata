// Explorable: model collapse in miniature. Fit a normal (mean and spread) to data, draw a few new points from the fit,
// refit on those, repeat. Optionally mix a fraction of real data into each round. Real maths with a seeded random
// number generator, so the same settings always give the same run.
import { esc } from '../ui.js';

export function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
export function fit(xs) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { m, s: Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) };
}
// normal CDF via erf (Abramowitz and Stegun 7.1.26, error < 1.5e-7)
export function cdf(x, m, s) {
  if (s <= 0) return x < m ? 0 : 1;
  const z = (x - m) / (s * Math.SQRT2), t = 1 / (1 + 0.3275911 * Math.abs(z));
  const e = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z);
  return 0.5 * (1 + (z >= 0 ? e : -e));
}
export const tail = (f) => cdf(-2, f.m, f.s) + 1 - cdf(2, f.m, f.s);

// gens[0] is the fit to the real data; gens[g] is fitted on `size` points: a `mix` share drawn from the real data,
// the rest drawn from gens[g − 1].
export function run({ seed = 7, realCount = 200, size = 20, gens = 60, mix = 0 }) {
  const r = rng(seed);
  const real = Array.from({ length: realCount }, () => gauss(r));
  const out = [fit(real)];
  const nReal = Math.round(mix * size);
  for (let g = 1; g <= gens; g++) {
    const prev = out[g - 1];
    const xs = Array.from({ length: size }, (_, i) => (i < nReal ? real[Math.floor(r() * real.length)] : prev.m + prev.s * gauss(r)));
    out.push(fit(xs));
  }
  return { real, fits: out };
}

const BINS = Array.from({ length: 16 }, (_, i) => -4 + i * 0.5);
const p1 = (v) => `${(v * 100).toFixed(1)}%`;

export function mount(el, cfg) {
  const opt = { seed: cfg.seed ?? 7, realCount: cfg.realCount ?? 200, size: cfg.sampleSize ?? 20, gens: cfg.generations ?? 60 };
  const st = { g: 0, mix: 0 };
  let data = run({ ...opt, mix: 0 });
  const W = 560, H = 210, L = 8, R = 8, T = 10, B = 30, bw = (W - L - R) / BINS.length;
  const bx = (v) => L + ((v + 4) / 8) * (W - L - R);

  el.innerHTML = `<div class="xp xc">
    <div class="xp-controls">
      <label class="xp-slider">Generation <input type="range" min="0" max="${opt.gens}" step="1" value="0" data-ctl="g"> <output data-out="g"></output></label>
      <label class="xp-slider">Real data mixed in <input type="range" min="0" max="0.5" step="0.1" value="0" data-ctl="mix"> <output data-out="mix"></output></label>
    </div>
    <div class="xp-sample">
      <button type="button" class="btn" data-act="next">Next generation</button>
      <button type="button" class="btn-ghost" data-act="reset">Reset</button>
    </div>
    <p class="xp-formula"></p>
    <svg class="xc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="xc-cap">
      <title id="xc-cap">Histogram: share of values in each band, real data as outlined bars, the current model as filled bars. The table below gives the numbers.</title>
      <g class="xc-model"></g><g class="xc-real"></g>
      <line class="xc-grid" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
      ${[-4, -2, 0, 2, 4].map((v) => `<text class="xc-tick" x="${Math.min(Math.max(bx(v), L + 8), W - R - 8)}" y="${H - B + 16}" text-anchor="middle">${v}</text>`).join('')}
      <line class="xc-tailmark" x1="${bx(-2)}" x2="${bx(-2)}" y1="${T}" y2="${H - B}"/><line class="xc-tailmark" x1="${bx(2)}" x2="${bx(2)}" y1="${T}" y2="${H - B}"/>
    </svg>
    <p class="small xc-legend"><span class="xc-key xc-key-real"></span> real data <span class="xc-key xc-key-model"></span> model at this generation · dotted lines mark the tails (beyond ±2)</p>
    <div class="tbl-wrap"><table class="xp-table">
      <caption class="sr-only">Mean, spread and tail share of the fitted model at each generation</caption>
      <thead><tr><th scope="col">Generation</th><th scope="col" class="num">Mean</th><th scope="col" class="num">Spread</th><th scope="col" class="num">Beyond ±2</th></tr></thead>
      <tbody></tbody>
    </table></div>
    <p class="xp-summary sr-only" aria-live="polite"></p>
    <p class="small muted">${esc(cfg.note || '')}</p>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const realShare = BINS.map((b) => data.real.filter((v) => v >= b && v < b + 0.5).length / data.real.length);

  function render() {
    const f = data.fits[st.g], f0 = data.fits[0];
    $('[data-ctl="g"]').value = st.g; $('[data-ctl="mix"]').value = st.mix;
    $('[data-out="g"]').textContent = st.g;
    $('[data-out="mix"]').textContent = `${Math.round(st.mix * 100)}%`;
    $('[data-act="next"]').disabled = st.g >= opt.gens;
    const share = BINS.map((b) => cdf(b + 0.5, f.m, f.s) - cdf(b, f.m, f.s));
    const top = Math.max(...realShare, ...share, 0.2), h = (v) => (v / top) * (H - T - B);
    const bars = (vals, inset) => vals.map((v, i) => `<rect x="${(L + i * bw + inset).toFixed(1)}" y="${(H - B - h(v)).toFixed(1)}" width="${(bw - 2 * inset).toFixed(1)}" height="${h(v).toFixed(1)}"/>`).join('');
    $('.xc-model').innerHTML = bars(share, 3);
    $('.xc-real').innerHTML = bars(realShare, 1);
    const nReal = Math.round(st.mix * opt.size);
    $('.xp-formula').innerHTML = `generation ${st.g}: mean = ${f.m.toFixed(2)}, spread (standard deviation) = ${f.s.toFixed(2)} · each round refits on ${opt.size} points: ${opt.size - nReal} drawn from the last fit${nReal ? `, ${nReal} from the real data` : ''}`;
    const rows = [...new Set([0, 1, 2, 5, 10, 20, 30, 40, 60, 80, 100].filter((g) => g <= opt.gens && g <= st.g).concat(st.g))].sort((a, b) => a - b);
    $('tbody').innerHTML = rows.map((g) => { const k = data.fits[g]; return `<tr class="${g === st.g ? 'xc-cur' : ''}"><th scope="row">${g === 0 ? '0 (fit to real data)' : g}</th><td class="num">${k.m.toFixed(2)}</td><td class="num">${k.s.toFixed(2)}</td><td class="num">${p1(tail(k))}</td></tr>`; }).join('');
    $('.xp-summary').textContent = `Generation ${st.g}: spread ${f.s.toFixed(2)}, down from ${f0.s.toFixed(2)}. ${p1(tail(f))} of the model's output lands beyond ±2, against ${p1(tail(f0))} for the fit to real data.`;
  }

  el.addEventListener('input', (e) => {
    const k = e.target.dataset.ctl;
    if (!k) return;
    st[k] = Number(e.target.value);
    if (k === 'mix') data = run({ ...opt, mix: st.mix });
    render();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'next') st.g = Math.min(opt.gens, st.g + 1);
    if (b.dataset.act === 'reset') { st.g = 0; st.mix = 0; data = run({ ...opt, mix: 0 }); }
    render();
  });
  render();
}
