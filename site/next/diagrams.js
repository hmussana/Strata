// Data-driven SVG diagrams for The AI Stack. Every diagram ships with a text alternative.
// Types: flow (optionally numbered, with loop), stack, hub, bars, compare, sequence.
// Arrow styles follow model.json "arrows": solid / dashed / dotted / thick strokes; arrow / none / diamond heads.

let uid = 0;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function wrap(text, max) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= max) line += ' ' + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function textLines(x, y, lines, cls, size, lh = 1.25) {
  const spans = lines.map((l, i) => `<tspan x="${x}" dy="${i ? size * lh : 0}">${esc(l)}</tspan>`).join('');
  return `<text x="${x}" y="${y}" class="${cls}" text-anchor="middle" font-size="${size}">${spans}</text>`;
}

export function markers(id) {
  return `<defs>
    <marker id="${id}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="dg-head"/></marker>
    <marker id="${id}-open" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" class="dg-head-open"/></marker>
    <marker id="${id}-diamond" viewBox="0 0 12 12" refX="11" refY="6" markerUnits="userSpaceOnUse" markerWidth="13" markerHeight="13" orient="auto"><path d="M1,6 L6,1 L11,6 L6,11 z" class="dg-head-open"/></marker>
  </defs>`;
}

// Stroke class + marker attribute for an arrow spec from model.json
export function edgeAttrs(spec, id) {
  const stroke = spec?.stroke && spec.stroke !== 'solid' ? spec.stroke : '';
  const marker = { diamond: 'diamond', open: 'open' }[spec?.head] || 'arrow';
  const head = spec?.head === 'none' ? '' : `marker-end="url(#${id}-${marker})"`;
  return { cls: `dg-edge ${stroke}`, head };
}

function svg(w, h, body, label) {
  return `<svg viewBox="0 0 ${w} ${Math.ceil(h)}" role="img" aria-label="${esc(label)}" class="dg-svg" preserveAspectRatio="xMidYMin meet">${body}</svg>`;
}

function box(x, y, w, h, label, sub, cls = '') {
  const L = wrap(label, Math.max(6, Math.floor((w - 14) / 7.6)));
  const S = sub ? wrap(sub, Math.floor((w - 12) / 6.3)) : [];
  const total = L.length * 16 + (S.length ? 4 + S.length * 14 : 0);
  let ty = y + (h - total) / 2 + 12;
  let out = `<g class="dg-node ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="dg-box"/>`;
  out += textLines(x + w / 2, ty, L, 'dg-label', 13.5);
  ty += L.length * 16 + 4;
  if (S.length) out += textLines(x + w / 2, ty + 1, S, 'dg-sub', 11.5, 1.2);
  return out + '</g>';
}

function flow(d, id) {
  const steps = d.steps || [];
  const n = steps.length;
  const W = 700, pad = 10, gap = 28, bh = 86, y = 18;
  const bw = (W - 2 * pad - (n - 1) * gap) / n;
  const arrow = edgeAttrs({ stroke: 'solid', head: 'arrow' }, id);
  let body = markers(id);
  steps.forEach((s, i) => {
    const x = pad + i * (bw + gap);
    body += box(x, y, bw, bh, s.label, s.sub, i === n - 1 ? 'dg-end' : '');
    if (d.numbered) {
      body += `<circle cx="${x + 2}" cy="${y + 2}" r="11" class="dg-num"/><text x="${x + 2}" y="${y + 6.5}" text-anchor="middle" font-size="12" class="dg-num-t">${i + 1}</text>`;
    }
    if (i < n - 1) body += `<line x1="${x + bw + 3}" y1="${y + bh / 2}" x2="${x + bw + gap - 3}" y2="${y + bh / 2}" class="${arrow.cls}" ${arrow.head}/>`;
  });
  let H = y + bh + 14;
  if (d.loop) {
    const cx = (i) => pad + i * (bw + gap) + bw / 2;
    const x1 = cx(d.loop.from), x2 = cx(d.loop.to), yb = y + bh, yl = yb + 40;
    body += `<path d="M${x1},${yb + 2} C${x1},${yl} ${x2},${yl} ${x2},${yb + 4}" class="dg-edge dashed" ${arrow.head}/>`;
    body += `<text x="${(x1 + x2) / 2}" y="${yl + 6}" text-anchor="middle" class="dg-sub" font-size="11.5">${esc(d.loop.label || '')}</text>`;
    H = yl + 20;
  }
  return svg(W, H, body, d.caption || 'process diagram');
}

function stack(d) {
  const layers = d.layers || [];
  const W = 640, rh = 46, gap = 6;
  let body = '';
  layers.forEach((l, i) => {
    const y = i * (rh + gap) + 2;
    body += `<g class="dg-node ${l.hl ? 'dg-hl' : ''}"><rect x="2" y="${y}" width="${W - 4}" height="${rh}" rx="8" class="dg-box"/>`;
    body += `<text x="18" y="${y + rh / 2 + 5}" class="dg-label" font-size="14">${esc(l.label)}</text>`;
    if (l.sub) body += `<text x="230" y="${y + rh / 2 + 5}" class="dg-sub" font-size="12.5">${esc(l.sub)}</text>`;
    body += '</g>';
  });
  return svg(W, layers.length * (rh + gap) + 2, body, d.caption || 'stack diagram');
}

function hub(d, id) {
  const spokes = d.spokes || [];
  const W = 660, H = 320, cx = W / 2, cy = H / 2, rx = 235, ry = 112, bw = 140, bh = 54;
  const arrow = edgeAttrs({ stroke: 'solid', head: 'arrow' }, id);
  let body = markers(id);
  const pos = spokes.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / spokes.length;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
  pos.forEach(([x, y]) => {
    const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy);
    body += `<line x1="${cx + (dx / len) * 80}" y1="${cy + (dy / len) * 40}" x2="${x - (dx / len) * 58}" y2="${y - (dy / len) * 30}" class="${arrow.cls}" ${arrow.head}/>`;
  });
  body += `<g class="dg-node dg-hl"><ellipse cx="${cx}" cy="${cy}" rx="80" ry="40" class="dg-box"/>`;
  body += textLines(cx, cy - (d.center?.sub ? 2 : -5), wrap(d.center?.label, 16), 'dg-label', 14);
  if (d.center?.sub) body += textLines(cx, cy + 16, [d.center.sub], 'dg-sub', 11.5);
  body += '</g>';
  spokes.forEach((s, i) => { body += box(pos[i][0] - bw / 2, pos[i][1] - bh / 2, bw, bh, s.label, s.sub); });
  return svg(W, H, body, d.caption || 'hub diagram');
}

function bars(d) {
  const items = d.items || [];
  const W = 640, lw = 120, vw = 110, rh = 30, gap = 8;
  const max = Math.max(...items.map((i) => i.value), 1);
  const fmt = (v) => (v >= 1000 ? v.toLocaleString('en-US') : String(v));
  let body = '';
  items.forEach((it, i) => {
    const y = i * (rh + gap) + 2;
    const w = Math.max(3, (it.value / max) * (W - lw - vw));
    body += `<text x="${lw - 10}" y="${y + rh / 2 + 5}" text-anchor="end" class="dg-label" font-size="13">${esc(it.label)}</text>`;
    body += `<rect x="${lw}" y="${y}" width="${w}" height="${rh}" rx="4" class="dg-bar"/>`;
    body += `<text x="${lw + w + 8}" y="${y + rh / 2 + 5}" class="dg-sub" font-size="12.5">${esc(fmt(it.value))} ${esc(d.unit || '')}</text>`;
  });
  return svg(W, items.length * (rh + gap) + 4, body, d.caption || 'bar chart');
}

function compare(d) {
  const cols = d.columns || [];
  const W = 680, gap = 14, colW = (W - (cols.length - 1) * gap) / cols.length, hh = 38;
  const chars = Math.floor((colW - 30) / 6.6);
  const wrapped = cols.map((c) => (c.points || []).map((p) => wrap(p, chars)));
  const H = hh + Math.max(...wrapped.map((pts) => pts.reduce((h, l) => h + l.length * 16 + 8, 0)), 0) + 18;
  let body = '';
  cols.forEach((c, i) => {
    const x = i * (colW + gap);
    body += `<g class="dg-node"><rect x="${x + 1}" y="1" width="${colW - 2}" height="${H - 2}" rx="10" class="dg-box"/>`;
    body += `<path d="M${x + 1},${hh} h${colW - 2}" class="dg-divider"/>`;
    body += `<text x="${x + colW / 2}" y="${hh / 2 + 6}" text-anchor="middle" class="dg-label" font-size="14">${esc(c.title)}</text>`;
    let y = hh + 20;
    wrapped[i].forEach((lines) => {
      body += `<circle cx="${x + 15}" cy="${y - 4}" r="2.6" class="dg-bullet"/>`;
      lines.forEach((l, j) => { body += `<text x="${x + 25}" y="${y + j * 16}" class="dg-sub" font-size="12.5">${esc(l)}</text>`; });
      y += lines.length * 16 + 8;
    });
    body += '</g>';
  });
  return svg(W, H, body, d.caption || 'comparison');
}

function sequence(d, id) {
  const actors = d.actors || [];
  const msgs = d.messages || [];
  const W = 660, pad = 70, top = 10, ah = 36, step = 38;
  const xs = actors.map((_, i) => pad + (i * (W - 2 * pad)) / Math.max(1, actors.length - 1));
  const H = top + ah + 18 + msgs.length * step + 10;
  let body = markers(id);
  actors.forEach((a, i) => {
    body += `<line x1="${xs[i]}" y1="${top + ah}" x2="${xs[i]}" y2="${H - 4}" class="dg-lifeline"/>`;
    body += `<g class="dg-node"><rect x="${xs[i] - 62}" y="${top}" width="124" height="${ah}" rx="8" class="dg-box"/>`;
    body += `<text x="${xs[i]}" y="${top + ah / 2 + 5}" text-anchor="middle" class="dg-label" font-size="13.5">${esc(a)}</text></g>`;
  });
  msgs.forEach((m, i) => {
    const y = top + ah + 30 + i * step, x1 = xs[m.from], x2 = xs[m.to], dir = x2 > x1 ? 1 : -1;
    const a = edgeAttrs({ stroke: dir < 0 ? 'dashed' : 'solid', head: 'arrow' }, id);
    body += `<line x1="${x1 + dir * 3}" y1="${y}" x2="${x2 - dir * 3}" y2="${y}" class="${a.cls}" ${a.head}/>`;
    body += `<text x="${(x1 + x2) / 2}" y="${y - 7}" text-anchor="middle" class="dg-sub" font-size="12">${esc(m.label)}</text>`;
  });
  return svg(W, H, body, d.caption || 'sequence diagram');
}

// Plain-text equivalent for screen readers and anyone who prefers text
export function describe(d) {
  switch (d?.type) {
    case 'flow': {
      const s = (d.steps || []).map((x, i) => `${d.numbered ? `${i + 1}. ` : ''}${x.label}${x.sub ? ` (${x.sub})` : ''}`);
      return [...s, d.loop ? `Then: ${d.loop.label || 'repeat'} (back to step ${d.loop.to + 1}).` : ''].filter(Boolean);
    }
    case 'stack': return (d.layers || []).map((l) => `${l.label}${l.sub ? `: ${l.sub}` : ''}`);
    case 'hub': return [`${d.center?.label} connects to:`, ...(d.spokes || []).map((s) => `${s.label}${s.sub ? ` (${s.sub})` : ''}`)];
    case 'bars': return (d.items || []).map((i) => `${i.label}: ${i.value} ${d.unit || ''}`);
    case 'compare': return (d.columns || []).map((c) => `${c.title}: ${(c.points || []).join('; ')}`);
    case 'sequence': return (d.messages || []).map((m) => `${d.actors[m.from]} → ${d.actors[m.to]}: ${m.label}`);
    case 'guess': return [`What comes after “${d.prompt}”?`, ...(d.options || []).map((o, i, all) => `${o.text}${i === 0 ? ' (best guess)' : i === all.length - 1 ? ' (unlikely)' : ''}`)];
    default: return [];
  }
}

// D1 picture: a sentence with a blank and guess cards; bigger card = better guess (no numbers at D1)
function guess(d) {
  const opts = d.options || [];
  const W = 640, gap = 14;
  const dims = opts.map((o) => ({ w: 70 + (o.size || 1) * 34, h: 40 + (o.size || 1) * 16, f: 13 + (o.size || 1) * 3 }));
  const total = dims.reduce((a, b) => a + b.w, 0) + gap * (opts.length - 1);
  const top = 74, H = top + Math.max(...dims.map((x) => x.h), 0) + 16;
  let body = `<text x="${W / 2 - 40}" y="40" text-anchor="middle" class="dg-label" font-size="22">${esc(d.prompt)}</text>`;
  body += `<rect x="${W / 2 + 92}" y="16" width="86" height="34" rx="8" class="dg-box" stroke-dasharray="5 4"/><text x="${W / 2 + 135}" y="40" text-anchor="middle" class="dg-sub" font-size="20">?</text>`;
  let x = (W - total) / 2;
  opts.forEach((o, i) => {
    const { w, h, f } = dims[i];
    const y = top + (Math.max(...dims.map((q) => q.h)) - h);
    body += `<g class="dg-node ${i === 0 ? 'dg-hl' : ''}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" class="dg-box"/>`;
    body += `<text x="${x + w / 2}" y="${y + h / 2 + f / 3}" text-anchor="middle" class="dg-label" font-size="${f}">${esc(o.text)}</text></g>`;
    x += w + gap;
  });
  return svg(W, H, body, d.caption || 'guess the next word');
}

const RENDERERS = { flow, stack, hub, bars, compare, sequence, guess };

export function renderDiagram(d, cls = '') {
  if (!d || !RENDERERS[d.type]) return '';
  const id = `dg${++uid}`;
  const text = describe(d);
  return `<figure class="diagram ${cls}">
    <div class="dg-scroll">${RENDERERS[d.type](d, id)}</div>
    ${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ''}
    ${text.length ? `<ol class="sr-only">${text.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}
  </figure>`;
}

// A short sample line for the legend page
export function arrowSample(spec) {
  const id = `dg${++uid}`;
  const a = edgeAttrs(spec, id);
  return `<svg viewBox="0 0 150 24" width="150" height="24" aria-hidden="true">${markers(id)}<line x1="6" y1="12" x2="140" y2="12" class="${a.cls}" ${a.head}/></svg>`;
}
