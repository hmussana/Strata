// Z2 concept map: concepts as nodes, labelled relationships as edges (arrow styles from model.json), neighbouring-layer
// concepts as ghost nodes along the top (layers above) and bottom (layers below). Generated from data.
import { markers, edgeAttrs } from './diagrams.js';
import { href } from './router.js';
import { esc, lclass } from './ui.js';

const W = 1000, NW = 160, NH = 62, GW = 150, GH = 40;

function wrap(text, max) {
  const words = String(text).split(/\s+/), lines = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w; else if ((line + ' ' + w).length <= max) line += ' ' + w; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

// point where the segment from the box centre towards (tx,ty) leaves the box
function clip(cx, cy, w, h, tx, ty) {
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const s = Math.min(Math.abs((w / 2) / (dx || 1e-9)), Math.abs((h / 2) / (dy || 1e-9)));
  return [cx + dx * s, cy + dy * s];
}

export function conceptMap(layer, c) {
  const inLayer = new Set(layer.concepts);
  const nodes = (layer.metaDiagram?.nodes || []).filter((n) => c.conceptById.has(n.concept));
  const rels = c.relationships.filter((r) => inLayer.has(r.from) || inLayer.has(r.to));
  const ghostIds = [...new Set(rels.flatMap((r) => [r.from, r.to]).filter((id) => !inLayer.has(id)))];
  const above = ghostIds.filter((id) => c.layerOf(id).order > layer.order);
  const below = ghostIds.filter((id) => c.layerOf(id).order < layer.order);

  // ghost bands sit far enough from the main map for a label pill to fit on each cross-layer edge
  const top = above.length ? 104 : 20;
  const mainH = 340;
  const H = top + mainH + (below.length ? 124 : 20);
  const pos = new Map();
  // authored layout hints (0–100) or a simple grid fallback
  const cols = Math.ceil(Math.sqrt(nodes.length || 1));
  nodes.forEach((n, i) => {
    const x = n.x ?? ((i % cols) + 0.5) * (100 / cols);
    const y = n.y ?? (Math.floor(i / cols) + 0.5) * (100 / Math.ceil(nodes.length / cols));
    pos.set(n.concept, { x: 90 + (x / 100) * (W - 180), y: top + 20 + (y / 100) * (mainH - 40), w: NW, h: NH, ghost: false });
  });
  // ghosts sit near the concepts they connect to (fewer crossings), then are pushed apart so none overlap
  const row = (ids, y) => {
    const want = ids.map((gid) => {
      const xs = rels.filter((r) => r.from === gid || r.to === gid).map((r) => pos.get(r.from === gid ? r.to : r.from)?.x).filter((x) => x !== undefined);
      return { gid, x: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : W / 2 };
    }).sort((a, b) => a.x - b.x);
    const gap = GW + 16, lo = GW / 2 + 8, hi = W - GW / 2 - 8;
    want.forEach((g, i) => { g.x = Math.max(g.x, lo, i ? want[i - 1].x + gap : lo); });
    for (let i = want.length - 1; i >= 0; i--) want[i].x = Math.min(want[i].x, i < want.length - 1 ? want[i + 1].x - gap : hi);
    want.forEach((g) => pos.set(g.gid, { x: g.x, y, w: GW, h: GH, ghost: true }));
  };
  row(above, 32);
  row(below, H - 34);

  const id = `cm${Math.random().toString(36).slice(2, 7)}`;
  const types = c.model.relationshipTypes, arrows = c.model.arrows;
  let edges = '', labels = '';
  rels.forEach((r) => {
    const a = pos.get(r.from), b = pos.get(r.to);
    if (!a || !b) return;
    const [x1, y1] = clip(a.x, a.y, a.w + 8, a.h + 8, b.x, b.y);
    const [x2, y2] = clip(b.x, b.y, b.w + 10, b.h + 10, a.x, a.y);
    const attrs = edgeAttrs(arrows[types[r.type]?.arrow], id);
    const cls = `cm-edge ${a.ghost || b.ghost ? 'cm-x' : ''}`;
    edges += `<g class="${cls}" data-from="${esc(r.from)}" data-to="${esc(r.to)}"><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${attrs.cls}" ${attrs.head}/></g>`;
    // every edge, cross-layer ones included, gets its label as a small pill at the midpoint, drawn above the lines
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const lines = wrap(r.label, 16), lw = Math.max(...lines.map((l) => l.length)) * 6.4 + 12, lh = lines.length * 14 + 6;
    const t = lines.map((l, i) => `<tspan x="${mx.toFixed(1)}" dy="${i ? 14 : 0}">${esc(l)}</tspan>`).join('');
    labels += `<g class="cm-label" data-from="${esc(r.from)}" data-to="${esc(r.to)}"><rect x="${(mx - lw / 2).toFixed(1)}" y="${(my - lh / 2).toFixed(1)}" width="${lw.toFixed(1)}" height="${lh}" rx="7"/>`
      + `<text x="${mx.toFixed(1)}" y="${(my - lh / 2 + 15).toFixed(1)}" text-anchor="middle">${t}</text></g>`;
  });

  let nodeSvg = '';
  for (const [cid, p] of pos) {
    const k = c.conceptById.get(cid), kl = c.layerOf(cid);
    const lines = wrap(k.name, p.ghost ? 19 : 16);
    const lh = p.ghost ? 13 : 15, fs = p.ghost ? 11.5 : 13.5;
    const ty = p.y - ((lines.length - 1) * lh) / 2 + fs / 3;
    const lnum = p.ghost ? `<tspan class="cm-lnum">L${kl.order} </tspan>` : '';
    const text = lines.map((l, i) => `<tspan x="${p.x}" dy="${i ? lh : 0}">${i ? '' : lnum}${esc(l)}</tspan>`).join('');
    nodeSvg += `<a href="${href.concept(cid)}" class="cm-node ${lclass(kl)} ${p.ghost ? 'cm-ghost' : ''}" data-node="${esc(cid)}" aria-label="${p.ghost ? `In L${kl.order} ${esc(kl.name)}: ` : ''}${esc(k.name)}. ${esc(k.summary)}">
      <rect x="${p.x - p.w / 2}" y="${p.y - p.h / 2}" width="${p.w}" height="${p.h}" rx="${p.ghost ? 8 : 12}"/>
      <text x="${p.x}" y="${ty}" text-anchor="middle" font-size="${fs}">${text}</text></a>`;
  }
  const bands = `${above.length ? `<text x="10" y="14" class="cm-band">FROM LAYERS ABOVE</text>` : ''}${below.length ? `<text x="10" y="${H - 64}" class="cm-band">FROM LAYERS BELOW</text>` : ''}`;
  return `<svg class="cm-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="Concept map of ${esc(layer.name)}">${markers(id)}${bands}<g class="cm-edges">${edges}</g><g class="cm-labels">${labels}</g><g class="cm-nodes">${nodeSvg}</g></svg>`;
}

// Highlight concept nodes and the edges that pass `edgeOn(from, to)`; empty `ids` clears the highlight
export function highlight(svg, ids, edgeOn = () => false) {
  const set = new Set(ids);
  svg.classList.toggle('cm-dim', set.size > 0);
  svg.querySelectorAll('[data-node]').forEach((n) => n.classList.toggle('is-hi', set.has(n.dataset.node)));
  svg.querySelectorAll('[data-from]').forEach((e) => e.classList.toggle('is-hi', set.size > 0 && edgeOn(e.dataset.from, e.dataset.to)));
}
