// The visual grammar in one place: colours, arrows, icons, zoom and depth levels, badges, type.
import { icon, ICONS } from '../icons.js';
import { href } from '../router.js';
import { arrowSample } from '../diagrams.js';
import { esc, lclass, lnum, zoomLabel } from '../ui.js';

export function legend(route, c) {
  const swatches = c.topDown.map((l) => `<a class="swatch ${lclass(l)}" href="${href.layer(l.id)}">
      <span class="swatch-bar" aria-hidden="true"></span>
      <span>${lnum(l)} ${icon(l.icon, 'ico-s')} <span class="ink">${esc(l.name)}</span><br><span class="small muted">token --${esc(l.color)}</span></span></a>`).join('');
  const cc = c.crosscutting.map((x) => `<div class="swatch c-cc"><span class="swatch-bar" aria-hidden="true"></span>
      <span>${icon(x.icon, 'ico-s')} <span class="ink">${esc(x.name)}</span><br><span class="small muted">${esc(x.summary)}</span></span></div>`).join('');
  const arrows = Object.entries(c.model.arrows).map(([key, a]) => {
    const used = Object.entries(c.model.relationshipTypes).filter(([, t]) => t.arrow === key).map(([name]) => name);
    return `<div class="arrow-row">${arrowSample(a)}<span><strong>${esc(a.label)}</strong>${used.length ? ` <span class="muted small">relationships: ${used.map(esc).join(', ')}</span>` : ''}</span></div>`;
  }).join('');
  const zooms = c.model.zoomLevels.map((z) => `<tr><td>${zoomLabel(z.id)}</td><td><strong>${esc(z.name)}</strong></td><td>${esc(z.question)}</td></tr>`).join('');
  const depths = c.model.depths.map((d) => `<tr><td><strong>${esc(d.id)} ${esc(d.name)}</strong></td><td>${esc(d.audience)}</td><td>${esc(d.form)}</td></tr>`).join('');
  const icons = ICONS.map((n) => `<div class="icon-cell">${icon(n)}<span>${esc(n)}</span></div>`).join('');
  return {
    zoom: null, layer: null, title: 'Legend',
    crumbs: [{ label: 'Landscape', href: href.landscape(), z: 'Z0' }, { label: 'Legend' }],
    html: `<header class="view-head">
        <p class="eyebrow">Reference</p>
        <h1>Visual grammar</h1>
        <p class="lede">The same colours, arrows and icons mean the same thing on every screen. Colour is always paired with a layer number, icon or label.</p>
      </header>
      <h2 class="section-title">Layers (one colour each, at every zoom level)</h2>
      <div class="legend-grid">${swatches}</div>
      <h2 class="section-title" id="cc">Cross-cutting concerns (span every layer; one neutral colour, distinct icons)</h2>
      <div class="legend-grid">${cc}</div>
      <h2 class="section-title">Arrows</h2>
      <div>${arrows}</div>
      <p class="small muted">Every relationship edge is also labelled in words, so line style is never the only cue.</p>
      <h2 class="section-title">Zoom levels (how much of the landscape is on screen)</h2>
      <table class="table"><thead><tr><th>Level</th><th>Name</th><th>Answers</th></tr></thead><tbody>${zooms}</tbody></table>
      <h2 class="section-title">Depth levels (how deep an explanation goes)</h2>
      <table class="table"><thead><tr><th>Depth</th><th>For</th><th>Form</th></tr></thead><tbody>${depths}</tbody></table>
      <h2 class="section-title">Status markers</h2>
      <div class="meta"><span class="badge badge-draft">Draft</span><span class="badge">${icon('clock', 'ico-s')}Reviewed 2026-09-28</span>
        <span class="badge badge-stale">May be out of date</span><span class="ph">PLACEHOLDER</span><span class="badge badge-verify">verify</span></div>
      <h2 class="section-title">Icons</h2>
      <div class="icon-grid">${icons}</div>
      <h2 class="section-title">Type</h2>
      <div class="type-scale"><p class="ts-h1" aria-hidden="true">Heading 1</p><p class="ts-h2" aria-hidden="true">Heading 2</p><p class="ts-h3" aria-hidden="true">Heading 3</p><p>Body text for explanations, kept to comfortable line lengths.</p><p class="small muted">Secondary text for metadata.</p><p><code>code and configuration</code></p></div>`,
    mount: (root) => {
      const section = route.params.get('section');
      if (section) root.querySelector(`#${CSS.escape(section)}`)?.scrollIntoView({ block: 'start' });
    },
  };
}
