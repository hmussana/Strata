// Explorable: the inference calculator. One module, six modes for three concepts:
// memory-bandwidth (bandwidth-play, bandwidth-workbench), quantization (quant-play, quant-workbench),
// batching-caching (batch-play, kv-workbench). The maths is real and computed live; every hardware or model
// number comes from interactiveConfig and is labelled illustrative there.
import { esc } from '../ui.js';

// ---------- maths ----------
export const tokensPerSecBound = (bwBytes, params, bytesPerWeight) => bwBytes / (params * bytesPerWeight);
export const computeTokBound = (flops, params) => flops / (2 * params);          // ~2 FLOPs per parameter per token
export const roofline = (peakFlops, bwBytes, intensity) => Math.min(peakFlops, bwBytes * intensity);
export const kvBytes = (layers, kvHeads, headDim, bytes, tokens, users) => 2 * layers * kvHeads * headDim * bytes * tokens * users;
export const weightBytes = (params, bits) => (params * bits) / 8;

// Symmetric round-to-nearest with one absmax scale per block. 2 ** (bits - 1) - 1 levels each side of zero.
export function quantize(ws, bits, block = ws.length) {
  const L = 2 ** (bits - 1) - 1;
  const q = [], scales = [];
  for (let s = 0; s < ws.length; s += block) {
    const b = ws.slice(s, s + block);
    const sc = (Math.max(...b.map(Math.abs)) || 1) / L;
    scales.push(sc);
    b.forEach((w) => q.push(Math.max(-L, Math.min(L, Math.round(w / sc))) * sc));
  }
  return { q, scales, levels: 2 * L + 1 };
}
const meanAbs = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
const maxAbs = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

// One decode step for n users, each with ctx tokens cached: read weights once plus every user's cache.
export function serveStep(hw, m, n, ctx) {
  const kvTok = kvBytes(m.layers, m.kvHeads, m.headDim, m.bytesPerWeight, 1, 1);
  const w = m.params * m.bytesPerWeight, cache = n * ctx * kvTok;
  const tMem = (w + cache) / (hw.bandwidthGBs * 1e9), tComp = (2 * m.params * n) / (hw.computeTFLOPS * 1e12);
  const t = Math.max(tMem, tComp);
  return { perUser: 1 / t, total: n / t, used: w + cache, fits: w + cache <= hw.memoryGB * 1e9, limit: tComp > tMem ? 'compute' : 'memory bandwidth' };
}

// ---------- formatting ----------
const sig = (v, d = 3) => (v >= 10 ** d ? Math.round(v).toLocaleString('en-GB') : Number(v.toPrecision(d)).toLocaleString('en-GB'));
export function bytesStr(b) {
  for (const [u, k] of [['TB', 1e12], ['GB', 1e9], ['MB', 1e6], ['KB', 1e3]]) if (b >= k) return `${sig(b / k)} ${u}`;
  return `${sig(b)} bytes`;
}
const paramsStr = (p) => (p >= 1e9 ? `${sig(p / 1e9)}B` : `${sig(p / 1e6)}M`);
const tokStr = (v) => `${sig(v)} tokens/s`;
const w3 = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(3);
const pow2 = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => 2 ** (a + i));
const logPct = (v, lo, hi) => Math.max(1, Math.min(100, (100 * Math.log(v / lo)) / Math.log(hi / lo)));
const bar = (pct) => `<span class="xp-bar"><span class="xp-fill" data-w="${pct.toFixed(1)}"></span></span>`;
const BPW = [[2, '16-bit (2 bytes)'], [1, '8-bit (1 byte)'], [0.5, '4-bit (½ byte)']];
const tbl = (cap, head, rows) => `<div class="tbl-wrap"><table class="xp-table"><caption class="sr-only">${cap}</caption>
  <thead><tr>${head.map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
const row = (cur, cells) => `<tr${cur ? ' class="xq-cur"' : ''}><th scope="row">${cells[0]}${cur ? ' <span class="xq-tag">now</span>' : ''}</th>${cells.slice(1).map((c) => `<td class="num">${c}</td>`).join('')}</tr>`;

// Column chart of weights: outline = original, dot = quantized, grid lines = the levels each block can use.
function weightChart(ws, q, scales, block, bits, H = 180) {
  const W = 30, pad = 8, n = ws.length, M = Math.max(...ws.map(Math.abs)) * 1.08 || 1, L = 2 ** (bits - 1) - 1;
  const y = (v) => H / 2 - (v / M) * (H / 2 - pad);
  let s = '';
  scales.forEach((sc, bi) => {
    const x0 = bi * block * W, x1 = Math.min(n, (bi + 1) * block) * W;
    if (scales.length > 1 && bi % 2) s += `<rect x="${x0}" y="0" width="${x1 - x0}" height="${H}" class="xq-band"/>`;
    if (L <= 15) for (let k = -L; k <= L; k++) s += `<line x1="${x0 + 2}" x2="${x1 - 2}" y1="${y(k * sc)}" y2="${y(k * sc)}" class="xq-grid"/>`;
  });
  s += `<line x1="0" x2="${n * W}" y1="${H / 2}" y2="${H / 2}" class="xq-axis"/>`;
  ws.forEach((w, i) => {
    const cx = i * W + W / 2;
    s += `<rect x="${cx - 7}" y="${Math.min(y(w), H / 2)}" width="14" height="${Math.abs(y(w) - H / 2)}" class="xq-orig"/>`;
    s += `<line x1="${cx}" x2="${cx}" y1="${y(w)}" y2="${y(q[i])}" class="xq-err"/><circle cx="${cx}" cy="${y(q[i])}" r="4.5" class="xq-dot"/>`;
  });
  return `<svg class="xq-svg" viewBox="0 0 ${n * W} ${H}" role="img" aria-label="Weights before and after rounding; the table below lists every value">${s}</svg>
    <p class="small muted xq-legend"><span><span class="xq-key xq-key-o"></span> original weight</span> <span><span class="xq-key xq-key-d"></span> after rounding</span><span>${L <= 15 ? 'lines: the values the grid allows' : 'grid too fine to draw'}</span></p>`;
}

// Log-log roofline: x = FLOPs per byte read, y = achievable FLOP/s.
function rooflineChart(P, B, I) {
  const W = 520, H = 240, l = 46, b = 34, xs = [0.5, 8192], ys = [P / 2000, P * 3];
  const X = (v) => l + ((W - l - 8) * Math.log(v / xs[0])) / Math.log(xs[1] / xs[0]);
  const Y = (v) => H - b - ((H - b - 8) * Math.log(v / ys[0])) / Math.log(ys[1] / ys[0]);
  const ridge = P / B, ach = roofline(P, B, I);
  const ticks = [1, 10, 100, 1000].map((t) => `<text x="${X(t)}" y="${H - b + 16}" text-anchor="middle">${t}</text>`).join('');
  return `<svg class="xq-svg xq-roof" viewBox="0 0 ${W} ${H}" role="img" aria-label="Roofline chart; the table below gives the same numbers">
    <line x1="${l}" y1="${H - b}" x2="${W - 8}" y2="${H - b}" class="xq-axis"/><line x1="${l}" y1="8" x2="${l}" y2="${H - b}" class="xq-axis"/>${ticks}
    <text x="${(W + l) / 2}" y="${H - 4}" text-anchor="middle">FLOPs per byte read (log scale)</text>
    <text x="12" y="${(H - b) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(H - b) / 2})">speed (log)</text>
    <polyline points="${X(xs[0])},${Y(B * xs[0])} ${X(ridge)},${Y(P)} ${X(xs[1])},${Y(P)}" class="xq-rline"/>
    <text x="${X(ridge) + 6}" y="${Y(P) - 6}">compute roof</text><text x="${X(2)}" y="${Y(B * 2) - 10}" transform="rotate(-24 ${X(2)} ${Y(B * 2) - 10})">bandwidth slope</text>
    <line x1="${X(ridge)}" x2="${X(ridge)}" y1="${Y(P)}" y2="${H - b}" class="xq-grid"/>
    <circle cx="${X(I)}" cy="${Y(ach)}" r="7" class="xq-dot"/></svg>`;
}

// ---------- modes ----------
const MODES = {
  'bandwidth-play': {
    init: (c) => ({ m: 1, bpw: 2, bw: c.bandwidthSteps[3], tf: c.computeSteps[2] }),
    controls: (c) => [
      { key: 'm', label: 'Model size', opts: c.models.map((m, i) => [i, `${m.label} parameters`]) },
      { key: 'bpw', label: 'Bytes per weight', opts: BPW },
      { key: 'bw', label: 'Memory bandwidth', steps: c.bandwidthSteps, fmt: (v) => `${sig(v)} GB/s` },
      { key: 'tf', label: 'Compute', steps: c.computeSteps, fmt: (v) => `${sig(v)} TFLOPS` },
    ],
    render(c, s) {
      const m = c.models[s.m], read = m.params * s.bpw, memT = tokensPerSecBound(s.bw * 1e9, m.params, s.bpw);
      const compT = computeTokBound(s.tf * 1e12, m.params), up = Math.min(memT, compT), lim = memT <= compT ? 'memory bandwidth' : 'compute';
      return [`<p class="xq-big"><strong>≤ ${tokStr(up)}</strong> <span class="small muted">for one user: upper bound from the formula</span></p>
        <p class="xp-formula">tokens/s ≤ ${sig(s.bw)} GB/s ÷ ${bytesStr(read)} read per token = ${sig(memT)}</p>
        ${tbl('Two ceilings on single-user speed', ['Ceiling', 'Tokens/s', 'Bar (log scale)'], [
          row(false, [`Memory: bandwidth ÷ bytes read`, sig(memT), bar(logPct(memT, 1, 1e6))]),
          row(false, [`Compute: FLOPS ÷ (2 × ${paramsStr(m.params)})`, sig(compT), bar(logPct(compT, 1, 1e6))])].join(''))}
        <p><strong>Limited by ${lim}.</strong> ${lim === 'compute' ? 'Unusual: a tiny model on very fast memory.' : `The compute could keep up with ${sig(compT / memT)}× more tokens, but it waits for the weights to arrive.`}</p>`,
      `Upper bound ${tokStr(up)}, limited by ${lim}. ${bytesStr(read)} read per token.`];
    },
  },
  'bandwidth-workbench': {
    init: (c) => ({ m: 0, bpw: 2, n: 1, bw: c.bandwidthSteps[1], tf: c.computeSteps[2] }),
    controls: (c) => [
      { key: 'n', label: 'Batch size (users)', steps: pow2(0, 10), fmt: String },
      { key: 'bpw', label: 'Bytes per weight', opts: BPW },
      { key: 'm', label: 'Model size', opts: c.models.map((m, i) => [i, `${m.label}`]) },
      { key: 'bw', label: 'Bandwidth', steps: c.bandwidthSteps, fmt: (v) => `${sig(v)} TB/s` },
      { key: 'tf', label: 'Compute', steps: c.computeSteps, fmt: (v) => `${sig(v)} TFLOPS` },
    ],
    render(c, s) {
      const N = c.models[s.m].params, P = s.tf * 1e12, B = s.bw * 1e12, at = (n) => {
        const I = (2 * n) / s.bpw, a = roofline(P, B, I);
        return { I, a, total: a / (2 * N), user: a / (2 * N) / n, lim: B * I < P ? 'memory' : 'compute' };
      };
      const r = at(s.n);
      return [`${rooflineChart(P, B, r.I)}
        <p class="xp-formula">intensity = 2 × batch ${s.n} ÷ ${s.bpw} bytes = ${sig(r.I)} FLOPs/byte · ridge = ${sig(s.tf)} TFLOPS ÷ ${sig(s.bw)} TB/s = ${sig(P / B)} · speed = min(${sig(s.tf)}, ${sig(s.bw)} × ${sig(r.I)}) = ${sig(r.a / 1e12)} TFLOPS</p>
        <p><strong>${r.lim === 'memory' ? 'Memory-bound' : 'Compute-bound'}.</strong> ${tokStr(r.total)} in total, ${tokStr(r.user)} per user <span class="small muted">(upper bounds from the formula, weights only)</span>.</p>
        ${tbl('Roofline numbers for each batch size', ['Batch', 'FLOPs/byte', 'TFLOPS', 'Total tok/s', 'Per user', 'Bound'], pow2(0, 10).map((n) => {
          const x = at(n);
          return row(n === s.n, [n, sig(x.I), sig(x.a / 1e12), sig(x.total), sig(x.user), x.lim]);
        }).join(''))}`, `Batch ${s.n}: ${sig(r.I)} FLOPs per byte, ${r.lim}-bound, ${tokStr(r.total)} total, ${tokStr(r.user)} per user.`];
    },
  },
  'quant-play': {
    init: () => ({ bits: 4, m: 0 }),
    controls: (c) => [
      { key: 'bits', label: 'Bits per weight', opts: [16, 8, 4, 3, 2].map((b) => [b, `${b}-bit`]) },
      { key: 'm', label: 'Model size', opts: c.models.map((m, i) => [i, `${m.label} parameters`]) },
    ],
    render(c, s) {
      const ws = c.weights, { q, levels } = quantize(ws, s.bits), N = c.models[s.m].params;
      const all = [16, 8, 4, 3, 2].map((b) => { const r = quantize(ws, b); return { b, lv: r.levels, mem: weightBytes(N, b), e: meanAbs(ws, r.q), mx: maxAbs(ws, r.q) }; });
      return [`${weightChart(ws, q, [quantize(ws, s.bits).scales[0]], ws.length, s.bits)}
        <p class="xp-formula">memory = ${paramsStr(N)} × ${s.bits} bits ÷ 8 = ${bytesStr(weightBytes(N, s.bits))} <span class="muted small">(weights only, from the formula)</span></p>
        <p>${levels.toLocaleString('en-GB')} levels on the grid. Average rounding error: <strong>${meanAbs(ws, q).toFixed(4)}</strong>.</p>
        ${tbl('Memory and error at every bit-width', ['Bits', 'Levels', 'Memory', 'Avg error', 'Worst error'], all.map((x) => row(x.b === s.bits, [`${x.b}-bit`, x.lv.toLocaleString('en-GB'), bytesStr(x.mem), x.e.toFixed(4), x.mx.toFixed(4)])).join(''))}
        <details class="xq-details"><summary>Every weight, before and after</summary>
        ${tbl('Each weight before and after rounding', ['Weight', 'Original', 'Rounded', 'Error'], ws.map((w, i) => row(false, [`w${i + 1}`, w3(w), w3(q[i]), w3(q[i] - w)])).join(''))}</details>`,
      `${s.bits}-bit: ${levels} levels, average error ${meanAbs(ws, q).toFixed(4)}, ${bytesStr(weightBytes(N, s.bits))} for ${paramsStr(N)} parameters.`];
    },
  },
  'quant-workbench': {
    init: (c) => ({ bits: 4, block: c.weights.length, out: 1 }),
    controls: (c) => [
      { key: 'bits', label: 'Bits per weight', opts: [8, 4, 3, 2].map((b) => [b, `${b}-bit`]) },
      { key: 'block', label: 'Block size', opts: [c.weights.length, 8, 4, 2].map((b) => [b, `${b}`]) },
      { key: 'out', label: 'Outlier', opts: [[1, 'On'], [0, 'Off']] },
    ],
    render(c, s) {
      const ws = c.weights.map((w, i) => (s.out && i === c.outlier.index ? c.outlier.value : w));
      const { q, scales } = quantize(ws, s.bits, s.block), L = 2 ** (s.bits - 1) - 1;
      const errs = scales.map((_, bi) => meanAbs(ws.slice(bi * s.block, (bi + 1) * s.block), q.slice(bi * s.block, (bi + 1) * s.block)));
      const worst = Math.max(...errs), eff = s.bits + 16 / s.block;
      return [`${weightChart(ws, q, scales, s.block, s.bits, 260)}
        <p class="xp-formula">per block: scale = max|w| ÷ ${L} · q = round(w ÷ scale) · w′ = q × scale · stored bits per weight = ${s.bits} + 16 ÷ ${s.block} = ${sig(eff)}</p>
        <p>Average error over all weights: <strong>${meanAbs(ws, q).toFixed(4)}</strong>.</p>
        ${tbl('Scale and error for each block', ['Block', 'Weights', 'Scale', 'Avg error', 'Error bar'], scales.map((sc, bi) => {
          const a = bi * s.block + 1, z = Math.min(ws.length, (bi + 1) * s.block);
          const has = s.out && c.outlier.index >= a - 1 && c.outlier.index < z;
          return row(false, [`${bi + 1}${has ? ' (outlier)' : ''}`, `w${a}–w${z}`, sc.toFixed(4), errs[bi].toFixed(4), bar(worst ? (100 * errs[bi]) / worst : 0)]);
        }).join(''))}`, `${s.bits}-bit, blocks of ${s.block}, outlier ${s.out ? 'on' : 'off'}: average error ${meanAbs(ws, q).toFixed(4)}, ${sig(eff)} stored bits per weight.`];
    },
  },
  'batch-play': {
    init: (c) => ({ n: 1, ctx: c.contexts[0] }),
    controls: (c) => [
      { key: 'n', label: 'Users in the batch', steps: pow2(0, 9), fmt: String },
      { key: 'ctx', label: 'Tokens per conversation', opts: c.contexts.map((x) => [x, x.toLocaleString('en-GB')]) },
    ],
    render(c, s) {
      const ns = pow2(0, 9), rs = ns.map((n) => serveStep(c.hardware, c.model, n, s.ctx)), maxT = Math.max(...rs.filter((r) => r.fits).map((r) => r.total));
      const r = rs[ns.indexOf(s.n)], one = rs[0];
      const msg = r.fits ? `Limited by ${r.limit}.` : `Does not fit: needs ${bytesStr(r.used)} but the illustrative chip has ${sig(c.hardware.memoryGB)} GB.`;
      return [`<p class="xq-big"><strong>${r.fits ? tokStr(r.total) : 'Out of memory'}</strong> <span class="small muted">${r.fits ? `in total · ${tokStr(r.perUser)} per user (${Math.round((100 * r.perUser) / one.perUser)}% of one user alone) · upper bounds from the formula` : ''}</span></p>
        <p><strong>${msg}</strong> Memory used: ${bytesStr(r.used)} of ${sig(c.hardware.memoryGB)} GB.</p>
        ${tbl('Speed and memory for each batch size', ['Users', 'Total tok/s', 'Per user', 'Memory', 'Limit'], ns.map((n, i) => {
          const x = rs[i];
          return row(n === s.n, [n, x.fits ? `${sig(x.total)} ${bar((100 * x.total) / maxT)}` : 'n/a', x.fits ? sig(x.perUser) : 'n/a', bytesStr(x.used), x.fits ? x.limit : 'out of memory']);
        }).join(''))}`, r.fits ? `${s.n} ${s.n === 1 ? 'user' : 'users'}: ${tokStr(r.total)} total, ${tokStr(r.perUser)} each, limited by ${r.limit}.` : `${s.n} ${s.n === 1 ? 'user does' : 'users do'} not fit in memory.`];
    },
  },
  'kv-workbench': {
    init: (c) => ({ m: 0, ctx: 8192, u: 8, kb: 2 }),
    controls: (c) => [
      { key: 'm', label: 'Model shape', opts: c.models.map((m, i) => [i, m.label]) },
      { key: 'ctx', label: 'Context length', steps: pow2(10, 17), fmt: (v) => `${v.toLocaleString('en-GB')} tokens` },
      { key: 'u', label: 'Users', steps: pow2(0, 7), fmt: String },
      { key: 'kb', label: 'Cache precision', opts: [[2, '16-bit'], [1, '8-bit']] },
    ],
    render(c, s) {
      const m = c.models[s.m], W = weightBytes(m.params, m.weightBits), kv = (t, u) => kvBytes(m.layers, m.kvHeads, m.headDim, s.kb, t, u);
      const K = kv(s.ctx, s.u), top = Math.max(K, W), cross = W / kv(1, 1);
      return [`<p class="xp-formula">2 × ${m.layers} layers × ${m.kvHeads} KV heads × ${m.headDim} × ${s.kb} bytes × ${s.ctx.toLocaleString('en-GB')} tokens × ${s.u} users = ${bytesStr(K)}</p>
        ${tbl('Cache memory compared with weights memory', ['Memory', 'Size', 'Bar'], [row(false, [`Weights (${m.weightBits}-bit)`, bytesStr(W), bar((100 * W) / top)]), row(false, ['KV cache', bytesStr(K), bar((100 * K) / top)])].join(''))}
        <p><strong>The cache is ${sig(K / W)}× the weights.</strong> It passes the weights at about ${(Math.round(cross / 1000) * 1000).toLocaleString('en-GB')} tokens in total across all users (${bytesStr(kv(1, 1))} per token). <span class="small muted">From the formula; real servers add overheads.</span></p>
        ${tbl(`Cache size for ${s.u} users at each context length`, ['Context', 'Cache', '× weights'], pow2(10, 17).map((t) => row(t === s.ctx, [t.toLocaleString('en-GB'), bytesStr(kv(t, s.u)), sig(kv(t, s.u) / W)])).join(''))}`,
      `Cache ${bytesStr(K)}, weights ${bytesStr(W)}: cache is ${sig(K / W)} times the weights.`];
    },
  },
};

// ---------- shell: builds the controls from each mode's list and re-renders on every change ----------
function control(ct, s) {
  if (ct.steps) {
    return `<label class="xp-slider">${esc(ct.label)} <input type="range" min="0" max="${ct.steps.length - 1}" step="1" value="${ct.steps.indexOf(s[ct.key])}" data-ctl="${ct.key}"> <output data-out="${ct.key}"></output></label>`;
  }
  return `<div class="xp-k" role="group" aria-label="${esc(ct.label)}"><span class="label">${esc(ct.label)}</span>${ct.opts.map(([v, l]) => `<button type="button" data-key="${ct.key}" data-v="${v}" aria-pressed="false">${esc(l)}</button>`).join('')}</div>`;
}

export function mount(el, cfg, mode = 'bandwidth-play') {
  const M = MODES[mode];
  if (!M) throw new Error(`unknown inference-calc mode ${mode}`);
  const st = M.init(cfg), ctls = M.controls(cfg);
  el.innerHTML = `<div class="xp xq ${mode.endsWith('workbench') ? 'xp-bench' : ''}">
    <div class="xp-controls">${ctls.map((ct) => control(ct, st)).join('')}</div>
    <div class="xq-out"></div>
    <p class="xp-summary sr-only" aria-live="polite"></p>
    <p class="small muted">${esc(cfg.note || '')}</p></div>`;
  const out = el.querySelector('.xq-out');
  function render() {
    ctls.forEach((ct) => {
      if (ct.steps) {
        const t = ct.fmt(st[ct.key]);
        el.querySelector(`[data-out="${ct.key}"]`).textContent = t;
        el.querySelector(`[data-ctl="${ct.key}"]`).setAttribute('aria-valuetext', t);
      } else el.querySelectorAll(`[data-key="${ct.key}"]`).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === st[ct.key])));
    });
    const open = out.querySelector('details')?.open;
    const [html, summary] = M.render(cfg, st);
    out.innerHTML = html;
    out.querySelectorAll('[data-w]').forEach((f) => { f.style.width = `${f.dataset.w}%`; });   // CSP: no inline style attributes
    if (open) out.querySelector('details').open = true;
    el.querySelector('.xp-summary').textContent = summary;
  }
  el.addEventListener('input', (e) => {
    const ct = ctls.find((x) => x.key === e.target.dataset.ctl);
    if (ct) { st[ct.key] = ct.steps[Number(e.target.value)]; render(); }
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-key]');
    if (b) { st[b.dataset.key] = Number(b.dataset.v); render(); }
  });
  render();
}
