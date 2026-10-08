// Z0: the whole AI world on one screen, like an executive dashboard.
// Methods: overview first (Shneiderman), signaling (bars for measured attention, a 0–100 score for maturity),
// coherence (no decoration; formulas and breakdowns on demand in the indicator panel), pre-training (all nine
// layer names visible so later screens build on familiar terms). Every row is a zoom target into Z1.
import { icon } from '../icons.js';
import { href } from '../router.js';
import { prefs } from '../store.js';
import { explainerHtml, mountExplainer } from '../explainer.js';
import { esc, val, lclass, lnum, freshness, zoomLabel, isPlaceholder } from '../ui.js';

const TREND_MIN_DAYS = 14;
const MARK = { yes: ['✓', 'yes'], partial: ['½', 'partial'], no: ['✗', 'no'] };

const band = (score, bands) => [...(bands || [])].reverse().find((b) => score >= b.min)?.label || '';

function scoreCell(m, ind) {
  if (!m || isPlaceholder(m.value)) return val('PLACEHOLDER');
  const max = ind.max || 100;
  const w = Math.max(2, (m.value / max) * 100);
  return `<span class="score" aria-label="Maturity ${m.value} out of ${max}, ${esc(band(m.value, ind.bands))}">
    <span class="score-n">${m.value}</span>
    <svg class="score-bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect class="track" width="100" height="10" rx="2"/><rect class="fill" width="${w.toFixed(1)}" height="10" rx="2"/></svg>
    <span class="score-band">${esc(band(m.value, ind.bands))}</span>
  </span>`;
}

function measuredBar(n, max, label, trend = '') {
  if (n === undefined || n === null) return '<span class="muted small">collecting…</span>';
  const w = max ? Math.max(2, (n / max) * 100) : 0;
  return `<span class="news" title="${n} ${label}">
    <span class="news-n">${n}</span>${trend || '<span class="trend" aria-hidden="true"></span>'}
    <svg class="news-bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect class="track" width="100" height="10" rx="2"/><rect class="fill" width="${w.toFixed(1)}" height="10" rx="2"/></svg>
  </span>`;
}

function players(v) {
  const list = v?.value || [];
  const shown = list.slice(0, 3).map(esc).join(' · ');
  return list.length > 3 ? `${shown} <span class="muted">+${list.length - 3}</span>` : shown;
}

function maturityTable(c, ind) {
  const crit = ind.criteria || [];
  const head = crit.map((k) => `<th scope="col" title="${esc(k.question)}">${esc(k.label)}</th>`).join('');
  const rows = c.topDown.map((l) => {
    const m = c.dashboard.layers[l.id]?.maturity || {};
    const cells = crit.map((k) => {
      const a = m.answers?.[k.id];
      const [sym, word] = MARK[a?.answer] || ['?', 'unknown'];
      return `<td class="mk mk-${esc(a?.answer)}" title="${esc(a?.why || '')}"><span aria-hidden="true">${sym}</span><span class="sr-only">${word}: ${esc(a?.why || '')}</span></td>`;
    }).join('');
    return `<tr><th scope="row">L${l.order} ${esc(l.name)}</th>${cells}<td class="mk-score">${esc(m.value)}</td></tr>`;
  }).join('');
  return `<div class="tbl-wrap"><table class="table mat-table"><thead><tr><th scope="col">Layer</th>${head}<th scope="col">Score</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function landscape(route, c) {
  const dash = c.dashboard;
  const ind = Object.fromEntries(dash.indicators.map((i) => [i.id, i]));
  const heat = c.news?.heat?.stack || {};
  const newsMax = Math.max(0, ...Object.values(heat).map((h) => h.d7));
  const research = c.news?.research;
  const resD7 = research?.d7 || null;
  const resMax = resD7 ? Math.max(0, ...Object.values(resD7)) : 0;
  const since = c.news?.collectedSince;
  const showTrend = since && (Date.now() - Date.parse(since)) / 86400000 >= TREND_MIN_DAYS;
  const focus = route.params.get('focus');
  const capex = c.crosscutting.find((x) => x.headline)?.headline;

  const rows = c.topDown.map((l) => {
    const d = dash.layers[l.id] || {};
    const h = heat[l.id];
    const trend = showTrend && h ? `<span class="trend" title="${h.prev7} the week before">${h.d7 > h.prev7 ? '↑' : h.d7 < h.prev7 ? '↓' : '→'}</span>` : '';
    return `<a class="land-row ${lclass(l)} ${focus === l.id ? 'vt-target is-focus' : ''}" role="listitem" href="${href.stack(l.id)}" data-zoom aria-label="Lumai Layer ${l.order}: ${esc(l.name)}. Zoom in to the stack">
      <span class="land-name">${lnum(l)}${icon(l.icon)}<span>${esc(l.name)}</span></span>
      <span class="land-players">${players(d.players)}</span>
      <span class="ind-maturity">${scoreCell(d.maturity, ind.maturity || {})}</span>
      <span class="ind-activity">${measuredBar(h?.d7, newsMax, 'news stories in the last 7 days', trend)}</span>
      <span class="ind-research">${measuredBar(resD7 ? (resD7[l.id] ?? 0) : null, resMax, 'new arXiv papers in the last 7 days')}</span>
    </a>`;
  }).join('');

  const cc = c.crosscutting.map((x) => `<a class="cc-band c-cc" role="listitem" href="${href.legend()}?section=cc" title="${esc(x.summary)}">${icon(x.icon, 'ico-s')}<span>${esc(x.name)}</span></a>`).join('');

  const m = ind.maturity || {};
  const defs = dash.indicators.map((i) => `<dt>${esc(i.label)}</dt><dd>${esc(i.definition)}</dd>`).join('');
  const formula = `<h3>How the maturity score is calculated</h3>
    <p class="formula"><code>${esc(m.formula || '')}</code></p>
    <ol class="criteria">${(m.criteria || []).map((k) => `<li><strong>${esc(k.label)}</strong>: ${esc(k.question)}</li>`).join('')}</ol>
    <p class="small">Bands: ${(m.bands || []).map((b, i, all) => `<strong>${esc(b.label)}</strong> ${b.min}–${all[i + 1] ? all[i + 1].min - 1 : m.max || 100}`).join(' · ')}.
      Legend: ✓ yes (1) · ½ partial (0.5) · ✗ no (0). Hover a cell for the reason.</p>
    ${maturityTable(c, m)}`;
  const headline = capex ? `<h3>Cost &amp; Economics headline</h3>
    <p><strong>${esc(capex.label)}:</strong> ${val(capex.value)}<br><span class="small muted">${esc(capex.note)} Source: ${val(capex.source)} · as of ${val(capex.asOf)}</span></p>` : '';

  const notes = [
    since ? `News since ${esc(since.slice(0, 10))}${showTrend ? '' : ` (trends after ${TREND_MIN_DAYS} days)`}` : 'News appears after the first feed update',
    research?.since ? `research since ${esc(research.since)}` : 'research signal starts with the next feed update',
  ].join('; ');

  return {
    zoom: 'Z0', layer: focus, title: 'The AI landscape', bodyClass: 'is-z0',
    crumbs: [{ label: 'Landscape', z: 'Z0' }],
    html: `<div class="z0">
      <section class="intro has-film" id="intro" aria-labelledby="intro-title" ${prefs.introHidden ? 'hidden' : ''}>
        ${explainerHtml(c)}
        <div class="intro-side">
          <div class="intro-text">
            <h2 id="intro-title">What is Lumai?</h2>
            <p>Lumai (say "loo-my", from <i>lumen</i>, light) shines a light into AI's black box. It is a visual guide to how today's AI works, from the power plants and chips at the bottom to the chatbots and agents at the top.
              It's for anyone who wants the whole picture without a computer science degree, and for people who work with AI and want to see how the parts fit.</p>
          </div>
          <ol class="intro-steps">
            <li><strong>Pick a layer</strong> below to see its main ideas on one map.</li>
            <li><strong>Open an idea</strong> and choose how deep to go, from a one-minute story to the open research questions.</li>
            <li><strong>Check what you know</strong> with a <a href="${href.quiz()}">short quiz</a>, or follow the <a href="news/">AI news feed</a>.</li>
          </ol>
          <button class="btn-ghost intro-hide" type="button" data-intro="hide">Got it, hide this</button>
        </div>
      </section>
      <header class="z0-head">
        <div>
          <p class="eyebrow">${zoomLabel('Z0')} Landscape</p>
          <p class="tagline">How AI works, layer by layer.</p>
          <h1>The whole AI world, in nine layers</h1>
          <p class="lede">The Lumai Model runs from power plants to the apps you use; each layer builds on the one below. Select a layer to zoom in.</p>
        </div>
        <div class="z0-actions">${freshness(dash, c.model)}<button class="btn-ghost" type="button" data-intro="show" ${prefs.introHidden ? '' : 'hidden'}>What is this?</button><button class="btn-ghost" type="button" popovertarget="ind-info">${icon('bulb', 'ico-s')}How these are measured</button></div>
      </header>
      <div class="land">
        <div class="land-rows" role="list" aria-label="Layers, top to bottom">
          <div class="land-head" aria-hidden="true"><span>Layer</span><span class="h-players">${esc(ind.players?.label)}</span><span class="h-maturity">${esc(m.label)} <span class="muted">/100</span> <span class="draft-tag">draft</span></span><span class="h-activity">${esc(ind.activity?.label)}</span><span class="h-research">${esc(ind.research?.label)}</span></div>
          ${rows}
        </div>
        <div class="land-cc" role="list" aria-label="Cross-cutting concerns that span every layer">${cc}</div>
      </div>
      <p class="z0-foot small muted">${notes}. ${capex ? `${esc(capex.label)}: ${val(capex.value)}.` : ''}
        <a href="${href.stack()}" data-zoom>See the whole stack</a> · <a href="${href.quiz()}">Check what you know</a></p>
      <div id="ind-info" class="info-pop" popover>
        <h2>How these are measured</h2>
        <dl>${defs}</dl>
        ${formula}
        ${headline}
        <button class="btn" type="button" popovertarget="ind-info" popovertargetaction="hide">Close</button>
      </div>
    </div>`,
    mount(root) {
      const intro = root.querySelector('#intro'), show = root.querySelector('[data-intro="show"]');
      const set = (hidden) => {
        prefs.introHidden = hidden;
        intro.hidden = hidden; show.hidden = !hidden;
        (hidden ? show : intro.querySelector('h2')).focus?.();
      };
      intro.querySelector('h2').tabIndex = -1;
      root.querySelector('[data-intro="hide"]').addEventListener('click', () => set(true));
      show.addEventListener('click', () => set(false));
      mountExplainer(intro.querySelector('.ex'));
    },
  };
}
