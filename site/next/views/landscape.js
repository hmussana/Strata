// Z0: the whole AI world on one screen. Methods: overview first, signaling, coherence, pre-training
// (all nine layer names are visible so later screens build on familiar terms).
import { icon } from '../icons.js';
import { href } from '../router.js';
import { esc, val, lclass, lnum, freshness, zoomLabel } from '../ui.js';

export function landscape(route, c) {
  const dash = c.dashboard;
  const ind = Object.fromEntries(dash.indicators.map((i) => [i.id, i]));
  const rows = c.topDown.map((l) => {
    const d = dash.layers[l.id] || {};
    return `<a class="land-row ${lclass(l)}" href="${href.stack(l.id)}" aria-label="Layer ${l.order}: ${esc(l.name)}. Zoom in">
      <span class="land-name">${lnum(l)}${icon(l.icon)}<span>${esc(l.name)}</span></span>
      <span class="land-players">${(d.players || []).map(esc).join(' · ')}</span>
      <span class="ind-maturity">${val(d.maturity ?? 'PLACEHOLDER')}</span>
      <span class="ind-activity"><span class="muted small">pending</span></span>
      <span class="ind-investment">${val(d.investment ?? 'PLACEHOLDER')}</span>
    </a>`;
  }).join('');
  const cc = c.crosscutting.map((x) => `<a class="cc-band c-cc" href="${href.legend()}?section=cc" title="${esc(x.summary)}">${icon(x.icon, 'ico-s')}<span>${esc(x.name)}</span></a>`).join('');
  return {
    zoom: 'Z0', layer: null, title: 'The AI landscape',
    crumbs: [{ label: 'Landscape', z: 'Z0' }],
    html: `<header class="view-head">
        <p class="eyebrow">${zoomLabel('Z0')} Landscape</p>
        <h1>The whole AI world, on one screen</h1>
        <p class="lede">Nine layers, from power plants to the apps you use. Each builds on the one below. Pick a layer to zoom in.</p>
        ${freshness(dash, c.model)}
      </header>
      <div class="land">
        <div class="land-rows">
          <div class="land-head" aria-hidden="true"><span>Layer</span><span class="h-players">${esc(ind.players?.label)}</span><span class="h-maturity">${esc(ind.maturity?.label)}</span><span class="h-activity">${esc(ind.activity?.label)}</span><span class="h-investment">${esc(ind.investment?.label)}</span></div>
          ${rows}
        </div>
        <div class="land-cc" role="list" aria-label="Cross-cutting concerns">${cc}</div>
      </div>
      <p class="small muted">Key players are draft examples, not a ranking. <span class="ph">PLACEHOLDER</span> marks values that need real data.</p>`,
  };
}
