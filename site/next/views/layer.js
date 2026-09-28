// Z2: inside one layer. Methods: concept mapping, signaling, pre-training, narrative thread.
// M1 lists concepts and their labelled connections; the meta-diagram and walkthrough arrive in milestone 4.
import { icon } from '../icons.js';
import { href } from '../router.js';
import { prefs } from '../store.js';
import { esc, lclass, lnum, freshness, zoomLabel } from '../ui.js';

const DEPTHS = ['D1', 'D2', 'D3', 'D4', 'D5'];

export function layer(route, c) {
  const l = c.layerById.get(route.id);
  if (!l) return null;
  const above = c.layers.find((x) => x.order === l.order + 1);
  const below = c.layers.find((x) => x.order === l.order - 1);
  const concepts = l.concepts.map((id) => c.conceptById.get(id)).filter(Boolean);
  const cards = concepts.map((k) => `
    <a class="concept-card ${lclass(l)}" href="${href.concept(k.id)}">
      <strong>${esc(k.name)}</strong>
      <span class="small muted">${esc(k.summary)}</span>
      <span class="depth-dots" aria-label="Written at depths ${DEPTHS.filter((d) => k.depths[d]).join(', ')}">${DEPTHS.map((d) => `<i class="${k.depths[d] ? 'on' : ''}">${d}</i>`).join('')}</span>
    </a>`).join('');

  const rels = c.relationships.filter((r) => l.concepts.includes(r.from) || l.concepts.includes(r.to));
  const relItems = rels.map((r) => {
    const a = c.conceptById.get(r.from), b = c.conceptById.get(r.to);
    const la = c.layerOf(r.from), lb = c.layerOf(r.to);
    const link = (k, kl) => `<a class="chip ${lclass(kl)}" href="${href.concept(k.id)}">${kl.id !== l.id ? `L${kl.order} · ` : ''}${esc(k.name)}</a>`;
    return `<li>${link(a, la)} <span class="rel-type">→ ${esc(r.label)} →</span> ${link(b, lb)}</li>`;
  }).join('');

  const showBreaks = prefs.depth >= 2;
  return {
    zoom: 'Z2', layer: l.id, title: l.name,
    crumbs: [{ label: 'Landscape', href: href.landscape(), z: 'Z0' }, { label: 'Stack', href: href.stack(l.id), z: 'Z1' }, { label: l.name, z: 'Z2' }],
    html: `<header class="layer-head ${lclass(l)}">
        <p class="eyebrow">${zoomLabel('Z2')} ${lnum(l)} Layer ${l.order} of ${c.layers.length}</p>
        <h1>${icon(l.icon)}${esc(l.name)}</h1>
        <p class="lede">${esc(l.oneLiner)}</p>
        ${freshness(l, c.model)}
        <div class="analogy"><span class="label">Everyday analogy</span>${esc(l.analogy.text)}
          ${showBreaks ? `<div class="breaks"><span class="label">${icon('alert', 'ico-s')}Where this analogy breaks</span>${esc(l.analogy.breaks)}</div>` : ''}
        </div>
      </header>
      <div class="neighbours">
        ${below ? `<a class="neighbour ${lclass(below)}" href="${href.layer(below.id)}">${icon('down', 'ico-s')}<span><span class="small muted">Needs from below:</span> ${lnum(below)} ${esc(below.name)}</span></a>` : '<span></span>'}
        ${above ? `<a class="neighbour ${lclass(above)}" href="${href.layer(above.id)}">${icon('up', 'ico-s')}<span><span class="small muted">Gives up to:</span> ${lnum(above)} ${esc(above.name)}</span></a>` : ''}
      </div>
      <h2 class="section-title">Concepts in this layer</h2>
      <div class="concept-grid">${cards || '<p class="pending">No concepts written yet.</p>'}</div>
      <h2 class="section-title">How they connect</h2>
      ${relItems ? `<ul class="rel-list">${relItems}</ul>` : '<p class="muted">No relationships recorded yet.</p>'}
      <p class="pending small">The concept map and guided walkthrough for this layer arrive in a later milestone.</p>`,
  };
}
