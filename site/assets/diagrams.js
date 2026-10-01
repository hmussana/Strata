// Renders the small diagram DSL used in concepts.json into inline SVG.
// Types: flow, stack, hub, bars, sequence, compare. Colours come from CSS classes so both themes work.

let uid = 0;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function wrap(text, maxChars) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// Centered multi-line text; returns [svg, height]
function textLines(x, y, lines, cls, size, lh = 1.25) {
  const spans = lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : size * lh}">${esc(l)}</tspan>`).join('');
  return [`<text x="${x}" y="${y}" class="${cls}" text-anchor="middle" font-size="${size}">${spans}</text>`, lines.length * size * lh];
}

function arrowDefs(id) {
  return `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="dg-arrowhead"/></marker></defs>`;
}

function svg(w, h, body, label) {
  return `<svg viewBox="0 0 ${w} ${Math.ceil(h)}" role="img" aria-label="${esc(label)}" class="dg-svg" preserveAspectRatio="xMidYMin meet">${body}</svg>`;
}

// Box with bold label and optional sub-label, text centred and wrapped to width
function box(x, y, w, h, label, sub, cls = '') {
  const chars = Math.max(6, Math.floor((w - 14) / 7.4));
  const L = wrap(label, chars);
  const S = sub ? wrap(sub, Math.floor((w - 12) / 6.2)) : [];
  const total = L.length * 16 + (S.length ? 4 + S.length * 14 : 0);
  let ty = y + (h - total) / 2 + 12;
  const [lt] = textLines(x + w / 2, ty, L, 'dg-label', 13.5);
  ty += L.length * 16 + 4;
  const st = S.length ? textLines(x + w / 2, ty + 1, S, 'dg-sub', 11.5, 1.2)[0] : '';
  return `<g class="dg-node ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="dg-box"/>${lt}${st}</g>`;
}

function flow(d) {
  const id = `ah${++uid}`;
  const steps = d.steps || [];
  const n = steps.length;
  const W = 680, pad = 8, gap = 30, bh = 84, y = 14;
  const bw = (W - 2 * pad - (n - 1) * gap) / n;
  let body = arrowDefs(id);
  steps.forEach((s, i) => {
    const x = pad + i * (bw + gap);
    body += box(x, y, bw, bh, s.label, s.sub, i === n - 1 ? 'dg-end' : '');
    if (i < n - 1) body += `<line x1="${x + bw + 3}" y1="${y + bh / 2}" x2="${x + bw + gap - 3}" y2="${y + bh / 2}" class="dg-edge" marker-end="url(#${id})"/>`;
  });
  let H = y + bh + 14;
  if (d.loop) {
    const cx = (i) => pad + i * (bw + gap) + bw / 2;
    const x1 = cx(d.loop.from), x2 = cx(d.loop.to), yb = y + bh, yl = yb + 38;
    body += `<path d="M${x1},${yb + 2} C${x1},${yl} ${x2},${yl} ${x2},${yb + 4}" class="dg-edge dg-loop" fill="none" marker-end="url(#${id})"/>`;
    body += `<text x="${(x1 + x2) / 2}" y="${yl + 4}" text-anchor="middle" class="dg-sub dg-looplabel" font-size="11.5">${esc(d.loop.label || '')}</text>`;
    H = yl + 18;
  }
  return svg(W, H, body, d.caption || 'flow diagram');
}

function stack(d) {
  const layers = d.layers || [];
  const W = 640, rh = 46, gap = 6;
  let body = '';
  layers.forEach((l, i) => {
    const y = i * (rh + gap) + 2;
    body += `<g class="dg-node ${l.hl ? 'dg-hl' : ''}"><rect x="2" y="${y}" width="${W - 4}" height="${rh}" rx="8" class="dg-box"/>`;
    body += `<text x="18" y="${y + rh / 2 + 5}" class="dg-label" font-size="14">${esc(l.label)}</text>`;
    if (l.sub) body += `<text x="${230}" y="${y + rh / 2 + 5}" class="dg-sub" font-size="12.5">${esc(l.sub)}</text>`;
    body += '</g>';
  });
  return svg(W, layers.length * (rh + gap) + 2, body, d.caption || 'stack diagram');
}

function hub(d) {
  const spokes = d.spokes || [];
  const W = 660, H = 330, cx = W / 2, cy = H / 2, rx = 235, ry = 118, bw = 138, bh = 54;
  let body = '';
  const pos = spokes.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / spokes.length;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
  pos.forEach(([x, y]) => { body += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="dg-edge dg-spoke"/>`; });
  body += `<g class="dg-node dg-hl"><ellipse cx="${cx}" cy="${cy}" rx="78" ry="40" class="dg-box"/>`;
  body += textLines(cx, cy - (d.center?.sub ? 2 : -5), wrap(d.center?.label, 16), 'dg-label', 14)[0];
  if (d.center?.sub) body += textLines(cx, cy + 16, [d.center.sub], 'dg-sub', 11.5)[0];
  body += '</g>';
  spokes.forEach((s, i) => {
    const [x, y] = pos[i];
    body += box(x - bw / 2, y - bh / 2, bw, bh, s.label, s.sub, /idle/i.test(s.sub || '') ? 'dg-dim' : '');
  });
  return svg(W, H, body, d.caption || 'hub diagram');
}

function bars(d) {
  const items = d.items || [];
  const W = 640, lw = 150, vw = 130, rh = 30, gap = 8;
  const vals = items.map((i) => i.value);
  const max = Math.max(...vals), min = Math.min(...vals);
  const log = d.scale === 'log' || (min > 0 && max / min > 100);
  const len = (v) => {
    const span = W - lw - vw;
    if (!log) return Math.max(3, (v / max) * span);
    const lo = Math.log10(min) - 0.4, hi = Math.log10(max);
    return Math.max(3, ((Math.log10(v) - lo) / (hi - lo)) * span);
  };
  const fmt = (v) => (v >= 1000 ? v.toLocaleString('en-US') : String(v));
  let body = '';
  items.forEach((it, i) => {
    const y = i * (rh + gap) + 2;
    const w = len(it.value);
    body += `<text x="${lw - 10}" y="${y + rh / 2 + 5}" text-anchor="end" class="dg-label" font-size="13">${esc(it.label)}</text>`;
    body += `<rect x="${lw}" y="${y}" width="${w}" height="${rh}" rx="4" class="dg-bar"/>`;
    body += `<text x="${lw + w + 8}" y="${y + rh / 2 + 5}" class="dg-sub" font-size="12.5">${esc(fmt(it.value))} ${esc(d.unit || '')}</text>`;
  });
  const H = items.length * (rh + gap) + (log ? 20 : 4);
  if (log) body += `<text x="${W - 4}" y="${H - 4}" text-anchor="end" class="dg-sub" font-size="11">log scale</text>`;
  return svg(W, H, body, d.caption || 'bar chart');
}

function sequence(d) {
  const id = `ah${++uid}`;
  const actors = d.actors || [];
  const msgs = d.messages || [];
  const W = 660, pad = 70, top = 10, ah = 36, step = 38;
  const xs = actors.map((_, i) => pad + (i * (W - 2 * pad)) / Math.max(1, actors.length - 1));
  const H = top + ah + 18 + msgs.length * step + 10;
  let body = arrowDefs(id);
  actors.forEach((a, i) => {
    body += `<line x1="${xs[i]}" y1="${top + ah}" x2="${xs[i]}" y2="${H - 4}" class="dg-lifeline"/>`;
    body += `<g class="dg-node"><rect x="${xs[i] - 62}" y="${top}" width="124" height="${ah}" rx="8" class="dg-box"/>`;
    body += `<text x="${xs[i]}" y="${top + ah / 2 + 5}" text-anchor="middle" class="dg-label" font-size="13.5">${esc(a)}</text></g>`;
  });
  msgs.forEach((m, i) => {
    const y = top + ah + 30 + i * step;
    const x1 = xs[m.from], x2 = xs[m.to];
    const dir = x2 > x1 ? 1 : -1;
    body += `<line x1="${x1 + dir * 3}" y1="${y}" x2="${x2 - dir * 3}" y2="${y}" class="dg-edge ${dir < 0 ? 'dg-return' : ''}" marker-end="url(#${id})"/>`;
    body += `<text x="${(x1 + x2) / 2}" y="${y - 7}" text-anchor="middle" class="dg-sub dg-msg" font-size="12">${esc(m.label)}</text>`;
  });
  return svg(W, H, body, d.caption || 'sequence diagram');
}

function compare(d) {
  const cols = d.columns || [];
  const W = 680, gap = 14, colW = (W - (cols.length - 1) * gap) / cols.length, hh = 38;
  const chars = Math.floor((colW - 30) / 6.6);
  const wrapped = cols.map((c) => (c.points || []).map((p) => wrap(p, chars)));
  const heights = wrapped.map((pts) => pts.reduce((h, l) => h + l.length * 16 + 8, 0));
  const H = hh + Math.max(...heights, 0) + 18;
  let body = '';
  cols.forEach((c, i) => {
    const x = i * (colW + gap);
    body += `<g class="dg-node dg-col${i % 3}"><rect x="${x + 1}" y="1" width="${colW - 2}" height="${H - 2}" rx="10" class="dg-box"/>`;
    body += `<path d="M${x + 1},${hh} h${colW - 2}" class="dg-divider"/>`;
    body += `<text x="${x + colW / 2}" y="${hh / 2 + 6}" text-anchor="middle" class="dg-label" font-size="14">${esc(c.title)}</text>`;
    let y = hh + 20;
    wrapped[i].forEach((lines) => {
      body += `<circle cx="${x + 15}" cy="${y - 4}" r="2.6" class="dg-bullet"/>`;
      lines.forEach((l, j) => { body += `<text x="${x + 25}" y="${y + j * 16}" class="dg-sub dg-point" font-size="12.5">${esc(l)}</text>`; });
      y += lines.length * 16 + 8;
    });
    body += '</g>';
  });
  return svg(W, H, body, d.caption || 'comparison');
}

const RENDERERS = { flow, stack, hub, bars, sequence, compare };

export function renderDiagram(d) {
  if (!d || !RENDERERS[d.type]) return '';
  return `<figure class="diagram dg-${d.type}"><div class="dg-scroll">${RENDERERS[d.type](d)}</div>${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ''}</figure>`;
}
