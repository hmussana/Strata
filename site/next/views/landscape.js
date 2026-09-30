// Z0: the whole AI world on one screen, like an executive dashboard.
// Methods: overview first (Shneiderman), signaling (one bar per layer for attention, meters for maturity),
// coherence (no decoration; details on demand in the indicator popover), pre-training (all nine layer names
// visible so later screens build on familiar terms). Every row is a zoom target into Z1.
import { icon } from '../icons.js';
import { href } from '../router.js';
import { esc, val, lclass, lnum, freshness, zoomLabel, isPlaceholder } from '../ui.js';

const TREND_MIN_DAYS = 14;

function maturityMeter(value, scale) {
  if (isPlaceholder(value)) return val(value);
  const level = scale.indexOf(value) + 1;
  const cells = scale.map((_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
  return `<span class="meter" aria-label="Maturity: ${esc(value)} (${level} of ${scale.length})"><span class="meter-cells" aria-hidden="true">${cells}</span>${esc(value)}</span>`;
}

function newsBar(h, max, showTrend) {
  if (!h) return '<span class="muted small">no data</span>';
  const w = max ? Math.max(2, (h.d7 / max) * 100) : 0;
  let trend = '<span class="trend" aria-hidden="true"></span>';
  if (showTrend && h.prev7 !== undefined) {
    const diff = h.d7 - h.prev7;
    trend = `<span class="trend" title="${h.prev7} the week before">${diff > 0 ? '↑' : diff < 0 ? '↓' : '→'}</span>`;
  }
  return `<span class="news" title="${h.d7} stories in the last 7 days">
    <span class="news-n">${h.d7}</span>${trend}
    <svg class="news-bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect class="track" width="100" height="10" rx="2"/><rect class="fill" width="${w.toFixed(1)}" height="10" rx="2"/></svg>
  </span>`;
}

function players(v) {
  const list = v?.value || [];
  const shown = list.slice(0, 3).map(esc).join(' · ');
  return list.length > 3 ? `${shown} <span class="muted">+${list.length - 3}</span>` : shown;
}

export function landscape(route, c) {
  const dash = c.dashboard;
  const ind = Object.fromEntries(dash.indicators.map((i) => [i.id, i]));
  const scale = ind.maturity?.scale || [];
  const heat = c.news?.heat?.stack || {};
  const max = Math.max(0, ...Object.values(heat).map((h) => h.d7));
  const since = c.news?.collectedSince;
  const coverage = since ? (Date.now() - Date.parse(since)) / 86400000 : 0;
  const showTrend = coverage >= TREND_MIN_DAYS;
  const focus = route.params.get('focus');

  const rows = c.topDown.map((l) => {
    const d = dash.layers[l.id] || {};
    const cls = focus === l.id ? 'vt-target is-focus' : '';
    return `<a class="land-row ${lclass(l)} ${cls}" role="listitem" href="${href.stack(l.id)}" data-zoom aria-label="Layer ${l.order}: ${esc(l.name)}. Zoom in to the stack">
      <span class="land-name">${lnum(l)}${icon(l.icon)}<span>${esc(l.name)}</span></span>
      <span class="land-players">${players(d.players)}</span>
      <span class="ind-maturity" title="${esc(d.maturity?.rationale || '')}">${maturityMeter(d.maturity?.value ?? 'PLACEHOLDER', scale)}</span>
      <span class="ind-activity">${newsBar(heat[l.id], max, showTrend)}</span>
      <span class="ind-investment">${val(d.investment?.value ?? 'PLACEHOLDER')}</span>
    </a>`;
  }).join('');

  const cc = c.crosscutting.map((x) => `<a class="cc-band c-cc" role="listitem" href="${href.legend()}?section=cc" title="${esc(x.summary)}">${icon(x.icon, 'ico-s')}<span>${esc(x.name)}</span></a>`).join('');

  const defs = dash.indicators.map((i) => `<dt>${esc(i.label)}</dt><dd>${isPlaceholder(i.definition) ? `<span class="ph">PLACEHOLDER</span> ${esc(i.definition.replace('PLACEHOLDER:', '').trim())}` : esc(i.definition)}
      ${i.rubric ? `<ul>${Object.entries(i.rubric).map(([k, v]) => `<li><strong>${esc(k)}</strong>: ${esc(v)}</li>`).join('')}</ul>` : ''}</dd>`).join('');

  const coverageNote = since
    ? `News counted since ${esc(since.slice(0, 10))}${showTrend ? '; arrows compare with the week before' : `; week-on-week trends appear after ${TREND_MIN_DAYS} days of collection`}.`
    : 'News activity appears after the first feed update.';

  return {
    zoom: 'Z0', layer: focus, title: 'The AI landscape', bodyClass: 'is-z0',
    crumbs: [{ label: 'Landscape', z: 'Z0' }],
    html: `<div class="z0">
      <header class="z0-head">
        <div>
          <p class="eyebrow">${zoomLabel('Z0')} Landscape</p>
          <h1>The whole AI world, in nine layers</h1>
          <p class="lede">From power plants to the apps you use; each layer builds on the one below. Select a layer to zoom in.</p>
        </div>
        <div class="z0-actions">${freshness(dash, c.model)}<button class="btn-ghost" type="button" popovertarget="ind-info">${icon('bulb', 'ico-s')}About these indicators</button></div>
      </header>
      <div class="land">
        <div class="land-rows" role="list" aria-label="Layers, top to bottom">
          <div class="land-head" aria-hidden="true"><span>Layer</span><span class="h-players">${esc(ind.players?.label)}</span><span class="h-maturity">${esc(ind.maturity?.label)} <span class="draft-tag">draft</span></span><span class="h-activity">${esc(ind.activity?.label)}</span><span class="h-investment">${esc(ind.investment?.label)}</span></div>
          ${rows}
        </div>
        <div class="land-cc" role="list" aria-label="Cross-cutting concerns that span every layer">${cc}</div>
      </div>
      <p class="z0-foot small muted">${coverageNote} <span class="ph">PLACEHOLDER</span> marks values that still need real data.
        <a href="${href.stack()}" data-zoom>See the whole stack</a></p>
      <div id="ind-info" class="info-pop" popover>
        <h2>About these indicators</h2>
        <dl>${defs}</dl>
        <button class="btn" type="button" popovertarget="ind-info" popovertargetaction="hide">Close</button>
      </div>
    </div>`,
  };
}
