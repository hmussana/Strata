import { renderDiagram } from './diagrams.js';
import { icon } from './icons.js';

// ---------------------------------------------------------------- helpers
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '#';
  } catch { return '#'; }
};
const DAY = 86400000;
const ageDays = (iso) => (Date.now() - Date.parse(iso)) / DAY;
function timeAgo(iso) {
  if (!iso) return 'never';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(`strata.${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`strata.${key}`, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

function previousVisit() {
  // Keep the same baseline for the whole tab session so reloads don't wipe "new" markers.
  try {
    const cached = sessionStorage.getItem('strata.prevVisit');
    if (cached !== null) return JSON.parse(cached);
    const prev = store.get('lastVisit', null);
    sessionStorage.setItem('strata.prevVisit', JSON.stringify(prev));
    store.set('lastVisit', new Date().toISOString());
    return prev;
  } catch { return null; }
}

// ---------------------------------------------------------------- state
const TYPES = ['lab', 'community', 'research', 'press', 'security', 'release'];
const EMPTY_NEWS = { items: [], sources: [], heat: { concepts: {}, layers: {} }, radar: [], generated: null };
const state = {
  concepts: null,
  news: EMPTY_NEWS,
  index: new Map(),          // concept id -> { item, cat, layer }
  newsByConcept: new Map(),  // concept id -> news items (newest first)
  openLayer: null,
  filters: { layer: 'all', type: 'all', days: 7, sort: 'latest', q: '', concept: null, onlyNew: false },
  shown: 40,
  learned: new Set(store.get('learned', [])),
  lastVisit: previousVisit(),
  drawerOpener: null,
  path: null,                // { id, idx } while stepping through a learning path
};

const heat7 = (id) => state.news.heat?.concepts?.[id]?.d7 ?? 0;
const isNew = (it) => state.lastVisit && it.firstSeen && it.firstSeen > state.lastVisit;
const layerOf = (id) => state.index.get(id)?.layer;

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------- init
async function init() {
  applyTheme(store.get('theme', null));
  const [concepts, news] = await Promise.all([
    loadJSON(new URL('../data/concepts.json', import.meta.url)),
    loadJSON(new URL('../data/news.json', import.meta.url)).catch(() => EMPTY_NEWS),
  ]);
  state.concepts = concepts;
  state.news = { ...EMPTY_NEWS, ...news };
  for (const layer of concepts.layers) {
    for (const cat of layer.categories) {
      for (const item of cat.items) state.index.set(item.id, { item, cat, layer });
    }
  }
  for (const it of state.news.items) {
    for (const t of it.tags || []) {
      if (!state.newsByConcept.has(t)) state.newsByConcept.set(t, []);
      state.newsByConcept.get(t).push(it);
    }
  }
  $('#reviewed').textContent = concepts.reviewed || '–';
  renderStatus();
  renderJourney();
  const view = ['both', 'tech', 'threats'].includes(store.get('view')) ? store.get('view') : 'both';
  $('#tower').dataset.view = view;
  document.querySelectorAll('.view-toggle [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  renderPaths();
  renderMap();
  renderFilters();
  renderNews();
  renderSide();
  bindGlobal();
  route();
}

// ---------------------------------------------------------------- status
function renderStatus() {
  const n = state.news;
  const el = $('#status');
  if (!n.generated) {
    el.textContent = 'News feed not fetched yet: run the "Update news & deploy" workflow.';
    return;
  }
  const fresh = n.items.filter(isNew).length;
  const ok = n.sources.filter((s) => s.ok).length;
  el.innerHTML = `News updated <strong>${esc(timeAgo(n.generated))}</strong> · ${n.items.length} stories · ${ok}/${n.sources.length} sources`
    + (fresh ? ` · <a href="#news" class="pill-new" id="new-link">${fresh} new since your last visit</a>` : '');
  $('#new-link')?.addEventListener('click', () => { setFilter({ onlyNew: true, days: 0 }); });
}

// ---------------------------------------------------------------- follow a prompt
const layerById = (id) => state.concepts.layers.find((l) => l.id === id);

function renderJourney() {
  const steps = state.concepts.journey || [];
  $('#mini-tower').innerHTML = state.concepts.layers.filter((l) => !l.pillar).map((l) => `
    <div class="mt-row l-${esc(l.id)}" data-layer="${esc(l.id)}"><span class="mt-num">L${esc(l.num)}</span><span class="mt-name">${esc(l.name)}</span><span class="packet"></span></div>`).join('');
  $('#journey-steps').innerHTML = steps.map((s, i) => {
    const l = layerById(s.layer);
    return `<li class="j-step l-${esc(s.layer)} ${s.dir === 'up' ? 'up' : ''}" data-step="${i}">
      <span class="j-num">L${esc(l?.num ?? '')}</span>
      <div class="j-body"><div class="j-head">${icon(l?.icon)}<strong>${esc(l?.name)}</strong><span class="j-unit">${esc(s.unit)}</span><span class="j-arrow" aria-hidden="true">${s.dir === 'up' ? '↑ up' : '↓ down'}</span></div>
      <p>${esc(s.text)}</p></div>
    </li>`;
  }).join('');
}

let journeyTimer = null;
function playJourney() {
  const items = [...document.querySelectorAll('.j-step')];
  const btn = $('#journey-play');
  clearInterval(journeyTimer);
  items.forEach((el) => el.classList.remove('active', 'done'));
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((el) => el.classList.add('done'));
    return;
  }
  let i = 0;
  btn.textContent = '■ Playing…';
  const steps = state.concepts.journey || [];
  const tick = () => {
    items.forEach((el, j) => { el.classList.toggle('active', j === i); el.classList.toggle('done', j < i); });
    document.querySelectorAll('.mt-row').forEach((row) => {
      const hot = steps[i] && row.dataset.layer === steps[i].layer;
      row.classList.toggle('hot', hot);
      row.querySelector('.packet').textContent = hot ? `${steps[i].dir === 'up' ? '↑' : '↓'} ${steps[i].unit}` : '';
    });
    if (i >= items.length) { clearInterval(journeyTimer); btn.textContent = '↻ Replay'; return; }
    i += 1;
  };
  tick();
  journeyTimer = setInterval(tick, 1600);
}

// ---------------------------------------------------------------- learning paths
const findPath = (id) => (state.concepts.paths || []).find((p) => p.id === id);

function renderPaths() {
  const paths = state.concepts.paths || [];
  $('#paths').innerHTML = paths.map((p) => {
    const steps = p.steps.filter((s) => state.index.has(s));
    const done = steps.filter((s) => state.learned.has(s)).length;
    const layers = [...new Set(steps.map((s) => state.index.get(s).layer.id))];
    const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
    return `<button class="path-card" type="button" data-path="${esc(p.id)}">
      <span class="path-dots" aria-hidden="true">${layers.map((l) => `<i class="l-${esc(l)}"></i>`).join('')}</span>
      <strong>${esc(p.name)}</strong>
      <span class="path-blurb">${esc(p.blurb)}</span>
      <span class="path-foot"><svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect class="bg" width="100" height="6" rx="3"/><rect class="fg" width="${Math.max(pct, 2)}" height="6" rx="3"/></svg>
        <span>${done ? `${done}/${steps.length} · Continue →` : `${steps.length} steps · Start →`}</span></span>
    </button>`;
  }).join('');
}

function startPath(id) {
  const p = findPath(id);
  if (!p) return;
  const steps = p.steps.filter((s) => state.index.has(s));
  const idx = Math.max(0, steps.findIndex((s) => !state.learned.has(s)));
  openConcept(steps[idx], document.activeElement, { id, idx });
}

function pathNav(position) {
  if (!state.path) return '';
  const p = findPath(state.path.id);
  const steps = p.steps.filter((s) => state.index.has(s));
  const { idx } = state.path;
  const btn = (i, label) => (i >= 0 && i < steps.length
    ? `<button class="fbtn" type="button" data-path-step="${i}">${label}</button>` : '<span></span>');
  if (position === 'top') {
    return `<div class="path-nav"><span>Path · <strong>${esc(p.name)}</strong> · step ${idx + 1} of ${steps.length}</span>
      <span class="path-steps" aria-hidden="true">${steps.map((s, i) => `<i class="${i === idx ? 'cur' : ''} ${state.learned.has(s) ? 'done' : ''}"></i>`).join('')}</span></div>`;
  }
  const next = steps[idx + 1] ? state.index.get(steps[idx + 1]).item.name : null;
  return `<div class="path-nav path-nav-bottom">${btn(idx - 1, '← Previous')}${next ? btn(idx + 1, `Next: ${esc(next)} →`) : '<span class="muted small">End of path 🎉</span>'}</div>`;
}

// ---------------------------------------------------------------- the stack map
function layerStats(layer) {
  const items = layer.categories.flatMap((c) => c.items);
  const learned = items.filter((i) => state.learned.has(i.id)).length;
  const d7 = state.news.heat?.layers?.[layer.id]?.d7 ?? 0;
  return { total: items.length, learned, d7 };
}

function catChips(layer) {
  return layer.categories.map((cat) => {
    const h = cat.items.reduce((sum, i) => sum + heat7(i.id), 0);
    return `<button class="chip" type="button" data-cat="${esc(cat.id)}" data-layer="${esc(layer.id)}" title="${esc(cat.summary)}">${esc(cat.name)}${h ? `<span class="n">${h}</span>` : ''}</button>`;
  }).join('');
}

function techChips(layer) {
  return (layer.tech || []).map((id) => {
    const e = state.index.get(id);
    return e ? `<button class="chip" type="button" data-concept="${esc(id)}">${esc(e.item.name.replace(/ \(.*\)$/, ''))}</button>` : '';
  }).join('');
}

function threatPills(layer) {
  return (layer.threats || []).map((t, i) => `<button class="threat-pill" type="button" data-threat="${esc(layer.id)}:${i}" title="${esc(t.what)}">${icon('warn', 'ico-s')}${esc(t.name)}</button>`).join('');
}

function renderMap() {
  const layers = state.concepts.layers;
  $('#bands').innerHTML = layers.filter((l) => !l.pillar).map((layer) => {
    const s = layerStats(layer);
    return `<div class="band l-${esc(layer.id)}" id="band-${esc(layer.id)}" data-layer="${esc(layer.id)}">
      <div class="band-head" data-toggle="${esc(layer.id)}">
        <div class="lnum" aria-hidden="true">L${esc(layer.num)}</div>
        <div class="licon">${icon(layer.icon)}</div>
        <div class="ltitle">
          <button class="band-title" type="button" data-toggle="${esc(layer.id)}" aria-expanded="false">${esc(layer.name)}</button>
          <span class="osi" title="Closest OSI layer">≈ OSI ${esc(layer.osi)}</span>
        </div>
        <div class="lmoves"><span class="moves-label">moves</span><span class="moves">${esc(layer.moves)}</span></div>
        <div class="lcol col-tech">${techChips(layer)}</div>
        <div class="lcol col-threats">${threatPills(layer)}</div>
        <div class="band-meta"><strong>${s.d7}</strong><span>stories · 7d</span><span class="band-chevron" aria-hidden="true">›</span></div>
      </div>
    </div>`;
  }).join('');

  const pillar = layers.find((l) => l.pillar);
  if (pillar) {
    const s = layerStats(pillar);
    $('#pillar').innerHTML = `<div class="pillar l-${esc(pillar.id)}" data-toggle="${esc(pillar.id)}" id="band-${esc(pillar.id)}">
      <div class="licon">${icon(pillar.icon)}</div>
      <button class="band-title" type="button" data-toggle="${esc(pillar.id)}" aria-expanded="false">${esc(pillar.name)}</button>
      <div class="band-tag">${esc(pillar.tagline)}</div>
      <div class="band-cats">${catChips(pillar)}</div>
      <div class="pillar-note"><strong>${s.d7}</strong> stories · 7d<br>Spans all seven layers ↕</div>
    </div>`;
  }
}

function toggleLayer(id, { focusCat = null, forceOpen = false, scroll = true } = {}) {
  const same = state.openLayer === id;
  closeLayer();
  if (same && !forceOpen) return;
  const layer = state.concepts.layers.find((l) => l.id === id);
  if (!layer) return;
  state.openLayer = id;
  const zoom = document.createElement('div');
  zoom.className = layer.pillar ? `zoom zoom-panel l-${layer.id}` : 'zoom';
  zoom.id = 'zoom';
  zoom.innerHTML = zoomHTML(layer);
  const host = $(`#band-${CSS.escape(id)}`);
  if (layer.pillar) {
    $('#bands').appendChild(zoom);
    host.classList.add('open');
  } else {
    host.appendChild(zoom);
    host.classList.add('open');
  }
  host.querySelectorAll('[aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
  if (focusCat) {
    const cat = $(`#cat-${CSS.escape(focusCat)}`);
    cat?.classList.add('flash');
    cat?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (scroll) {
    (layer.pillar ? zoom : host).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function closeLayer() {
  $('#zoom')?.remove();
  document.querySelectorAll('.band.open, .pillar.open').forEach((b) => b.classList.remove('open'));
  document.querySelectorAll('.band-title[aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  state.openLayer = null;
}

function itemButton(item) {
  const h = heat7(item.id);
  return `<button class="item-btn ${state.learned.has(item.id) ? 'learned' : ''}" type="button" data-concept="${esc(item.id)}">
    <span class="nm">${esc(item.name)}${h ? ` <span class="heat" title="stories in the past 7 days">${h}</span>` : ''}</span>
    <span class="sm"><span class="kind">${esc(item.kind || 'concept')}</span> ${esc(item.summary)}</span>
  </button>`;
}

function threatCards(layer) {
  if (!layer.threats?.length) return '';
  return `<h3 class="zoom-h" id="threats-${esc(layer.id)}">${icon('warn', 'ico-s')} Threats at this layer</h3>
    <div class="threats">${layer.threats.map((t) => {
      const e = t.concept && state.index.get(t.concept);
      return `<div class="threat">
        <strong>${esc(t.name)}</strong>
        <p>${esc(t.what)}</p>
        <p class="t-ex"><span>Example</span>${esc(t.example)}</p>
        <p class="t-def"><span>Defence</span>${esc(t.defense)}</p>
        ${e ? `<button class="chip l-${esc(e.layer.id)}" type="button" data-concept="${esc(t.concept)}">Learn: ${esc(e.item.name)}</button>` : ''}
      </div>`;
    }).join('')}</div>`;
}

function zoomHTML(layer) {
  const plain = layer.plain ? `<div class="plain">
      <div class="plain-text"><span class="plain-label">In plain words</span>${esc(layer.plain)}</div>
      ${layer.osi ? `<dl class="plain-facts"><div><dt>OSI analogy</dt><dd>${esc(layer.osi)}</dd></div><div><dt>What moves</dt><dd>${esc(layer.moves)}</dd></div></dl>` : ''}
    </div>` : '';
  return `${plain}
    <div class="zoom-intro">
      <div>${(layer.explainer || []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
      <div>${renderDiagram(layer.diagram)}</div>
    </div>
    ${threatCards(layer)}
    <h3 class="zoom-h">Concepts & technologies</h3>
    <div class="cats">${layer.categories.map((cat) => `
      <div class="cat" id="cat-${esc(cat.id)}">
        <h4>${esc(cat.name)}</h4>
        <p>${esc(cat.summary)}</p>
        ${cat.diagram ? `<button class="cat-diagram-btn" type="button" data-catdg="${esc(cat.id)}" aria-expanded="false">▸ Show diagram</button><div class="cat-dg" hidden>${renderDiagram(cat.diagram)}</div>` : ''}
        ${cat.items.map(itemButton).join('')}
      </div>`).join('')}
    </div>`;
}

// ---------------------------------------------------------------- concept drawer
function openConcept(id, opener = document.activeElement, pathCtx = null) {
  const entry = state.index.get(id);
  if (!entry) return;
  state.path = pathCtx;
  const { item, cat, layer } = entry;
  const drawer = $('#drawer');
  drawer.className = `drawer open l-${layer.id}`;
  drawer.setAttribute('aria-hidden', 'false');
  $('#backdrop').hidden = false;
  state.drawerOpener = opener;

  const hc = state.news.heat?.concepts?.[id];
  const trend = hc ? trendText(hc) : '';
  const news = state.newsByConcept.get(id) || [];
  const diagram = item.diagram || cat.diagram;
  const related = (item.related || []).map((r) => {
    const e = state.index.get(r);
    return e ? `<button class="chip l-${esc(e.layer.id)}" type="button" data-concept="${esc(r)}">${esc(e.item.name)}</button>` : '';
  }).join('');
  const learned = state.learned.has(id);

  $('#drawer-body').innerHTML = `
    ${pathNav('top')}
    <div class="crumbs"><button type="button" data-layer-open="${esc(layer.id)}" data-cat-focus="${esc(cat.id)}">${esc(layer.name)}</button> › ${esc(cat.name)}</div>
    <h2 id="drawer-title">${esc(item.name)}</h2>
    <div class="badges"><span class="badge">${esc(item.kind || 'concept')}</span>${(item.badges || []).map((b) => `<span class="badge">${esc(b)}</span>`).join('')}</div>
    <p class="summary-lg">${esc(item.summary)}</p>
    ${(item.explainer || []).map((p) => `<p>${esc(p)}</p>`).join('')}
    ${diagram ? `${item.diagram ? '' : '<h3>Category diagram</h3>'}${renderDiagram(diagram)}` : ''}
    ${item.why ? `<div class="why"><strong>Why it matters</strong>${esc(item.why)}</div>` : ''}
    ${related ? `<h3>Related</h3><div class="related">${related}</div>` : ''}
    ${item.links?.length ? `<h3>Links</h3><div class="links">${item.links.map((l) => `<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join('')}</div>` : ''}
    <button class="learn-toggle" type="button" data-learn="${esc(id)}" aria-pressed="${learned}">${learned ? '✓ Learned' : 'Mark as learned'}</button>
    <h3>Latest news ${trend ? `<span class="muted">· ${trend}</span>` : ''}</h3>
    ${news.length ? `<ul class="mini-news">${news.slice(0, 8).map((it) => `
      <li><a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a>
      <div class="meta">${esc(it.sourceName)} · ${esc(timeAgo(it.published))}${isNew(it) ? ' · <span class="new-dot">new</span>' : ''}</div></li>`).join('')}</ul>
      ${news.length > 8 ? `<button class="more-btn" type="button" data-news-concept="${esc(id)}">All ${news.length} stories on the news board</button>` : ''}`
      : '<p class="muted small">No tagged stories in the current window. The Radar and news board will pick it up when it trends.</p>'}
    ${pathNav('bottom')}
  `;
  $('#drawer').scrollTop = 0;
  $('#drawer-close').focus();
  history.replaceState(null, '', `#c=${encodeURIComponent(id)}`);
}

function trendText(h) {
  if (!h.d7 && !h.prev7) return `${h.d30} in 30 days`;
  const arrow = h.d7 > h.prev7 ? '<span class="up">↑</span>' : h.d7 < h.prev7 ? '<span class="down">↓</span>' : '→';
  return `${h.d7} this week ${arrow} vs ${h.prev7} last week`;
}

function closeDrawer() {
  const drawer = $('#drawer');
  if (!drawer.classList.contains('open')) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  $('#backdrop').hidden = true;
  history.replaceState(null, '', location.pathname + location.search);
  state.drawerOpener?.focus?.();
}

function toggleLearned(id) {
  if (state.learned.has(id)) state.learned.delete(id); else state.learned.add(id);
  store.set('learned', [...state.learned]);
  const openLayer = state.openLayer;
  renderMap();
  renderPaths();
  if (openLayer) toggleLayer(openLayer, { forceOpen: true, focusCat: state.index.get(id)?.cat.id });
  openConcept(id, state.drawerOpener, state.path);
}

// ---------------------------------------------------------------- news board
function setFilter(patch) {
  Object.assign(state.filters, patch);
  state.shown = 40;
  renderFilters();
  renderNews();
}

function renderFilters() {
  const f = state.filters;
  const btn = (key, value, label, extra = '') =>
    `<button class="fbtn ${extra}" type="button" data-f="${key}" data-v="${esc(value)}" aria-pressed="${String(f[key]) === String(value)}">${label}</button>`;
  const layerBtns = state.concepts.layers.map((l) => btn('layer', l.id, `<i></i>${esc(l.name)}`, `l-${esc(l.id)}`)).join('');
  $('#filters').innerHTML = `
    <div class="filter-row"><span class="lbl">Layer</span>${btn('layer', 'all', 'All')}${layerBtns}</div>
    <div class="filter-row"><span class="lbl">Source</span>${btn('type', 'all', 'All')}${TYPES.map((t) => btn('type', t, t)).join('')}</div>
    <div class="filter-row"><span class="lbl">When</span>${btn('days', 1, '24h')}${btn('days', 7, '7 days')}${btn('days', 30, '30 days')}${btn('days', 0, 'All')}
      <span class="sep" aria-hidden="true"></span>${btn('sort', 'latest', 'Latest')}${btn('sort', 'top', 'Top')}
      ${state.lastVisit ? btn('onlyNew', true, 'New since last visit') : ''}</div>`;

  const chips = [];
  if (f.concept) chips.push(`Concept: <strong>${esc(state.index.get(f.concept)?.item.name || f.concept)}</strong> <button class="fbtn" type="button" data-clear="concept">✕</button>`);
  if (f.q) chips.push(`Search: <strong>“${esc(f.q)}”</strong> <button class="fbtn" type="button" data-clear="q">✕</button>`);
  const af = $('#active-filter');
  af.hidden = !chips.length;
  af.innerHTML = chips.join(' &nbsp; ');
}

function filteredNews() {
  const f = state.filters;
  const q = f.q.toLowerCase();
  let items = state.news.items.filter((it) =>
    (f.layer === 'all' || (it.layers || []).includes(f.layer))
    && (f.type === 'all' || it.type === f.type)
    && (!f.days || ageDays(it.published) <= f.days)
    && (!f.concept || (it.tags || []).includes(f.concept))
    && (!f.onlyNew || isNew(it))
    && (!q || `${it.title} ${it.summary} ${it.llm?.summary || ''} ${it.sourceName}`.toLowerCase().includes(q)));
  if (f.sort === 'top') {
    const rank = (it) => (it.score || 1) * Math.exp(-ageDays(it.published) / 5);
    items = [...items].sort((a, b) => rank(b) - rank(a));
  }
  return items;
}

function newsCard(it) {
  const tags = (it.tags || []).map((t) => {
    const e = state.index.get(t);
    return e ? `<button class="chip l-${esc(e.layer.id)}" type="button" data-concept="${esc(t)}">${esc(e.item.name)}</button>` : '';
  }).join('');
  const summary = it.llm?.summary || it.summary;
  return `<article class="news-card ${isNew(it) ? 'is-new' : ''}">
    <div class="meta">
      <span class="src-type">${esc(it.type)}</span><span>${esc(it.sourceName)}</span><span>·</span>
      <time datetime="${esc(it.published)}" title="${esc(new Date(it.published).toLocaleString())}">${esc(timeAgo(it.published))}</time>
      ${it.points ? `<span>· ▲ ${esc(it.points)}</span>` : ''}
      ${it.discussion ? `<a href="${esc(safeUrl(it.discussion))}" target="_blank" rel="noopener noreferrer">discuss</a>` : ''}
      ${isNew(it) ? '<span class="new-dot">new</span>' : ''}
    </div>
    <h3><a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a></h3>
    ${summary ? `<p>${esc(summary)}</p>` : ''}
    ${tags ? `<div class="tags">${tags}</div>` : ''}
  </article>`;
}

function renderNews() {
  const list = $('#news-list');
  if (!state.news.items.length) {
    list.innerHTML = `<div class="empty"><p><strong>No stories yet.</strong></p>
      <p>The feed is built by the <code>Update news &amp; deploy</code> GitHub Action (every 3 hours).<br>
      Run it once from the Actions tab, or locally with <code>python3 scripts/fetch_news.py</code>.</p></div>`;
    $('#more').hidden = true;
    return;
  }
  const items = filteredNews();
  list.innerHTML = items.length
    ? items.slice(0, state.shown).map(newsCard).join('')
    : '<div class="empty">Nothing matches these filters. Try a wider time window.</div>';
  $('#more').hidden = items.length <= state.shown;
  $('#more').textContent = `Show more (${items.length - state.shown} left)`;
}

function renderSide() {
  const heat = state.news.heat?.concepts || {};
  const rows = Object.entries(heat).filter(([id, h]) => h.d7 > 0 && state.index.has(id))
    .sort((a, b) => b[1].d7 - a[1].d7).slice(0, 12);
  const max = rows[0]?.[1].d7 || 1;
  $('#trending').innerHTML = rows.length ? rows.map(([id, h]) => {
    const e = state.index.get(id);
    const w = Math.max(3, (h.d7 / max) * 90);
    const arrow = h.prev7 === 0 ? '<span class="up" title="new this week">★</span>' : h.d7 > h.prev7 ? '<span class="up">↑</span>' : h.d7 < h.prev7 ? '<span class="down">↓</span>' : '';
    return `<button class="trend-row l-${esc(e.layer.id)}" type="button" data-concept="${esc(id)}">
      <span class="tn">${esc(e.item.name)}</span>
      <svg viewBox="0 0 90 10" aria-hidden="true"><rect class="bg" width="90" height="10" rx="3"/><rect class="fg" width="${w.toFixed(1)}" height="10" rx="3"/></svg>
      <span class="tv">${h.d7}${arrow}</span></button>`;
  }).join('') : '<p class="small muted">Appears after the first news fetch.</p>';

  const radar = state.news.radar || [];
  $('#radar').innerHTML = radar.length
    ? `<div class="radar-list">${radar.map((r) => `<button type="button" data-radar="${esc(r.term)}" title="${r.items} stories from ${r.sources} sources">${esc(r.term)}<span class="n">${r.sources}</span></button>`).join('')}</div>`
    : '<p class="small muted">Nothing unmapped is trending right now.</p>';

  const sources = [...(state.news.sources || [])].sort((a, b) => Number(a.ok) - Number(b.ok));
  $('#sources').innerHTML = sources.length ? sources.map((s) => `<div class="src-row" title="${esc(s.error || '')}">
      <span>${esc(s.name)} <span class="muted">· ${esc(s.type)}</span></span>
      <span class="${s.ok ? 'ok' : 'err'}">${s.ok ? `✓ ${s.count}` : `✕ ${s.lastOk ? `ok ${esc(timeAgo(s.lastOk))}` : 'failing'}`}</span></div>`).join('')
    : '<p class="small muted">No fetch yet.</p>';
}

// ---------------------------------------------------------------- search
function searchConcepts(q) {
  const t = q.toLowerCase();
  const scored = [];
  for (const [id, { item, layer }] of state.index) {
    let s = 0;
    if (item.name.toLowerCase().includes(t)) s += item.name.toLowerCase().startsWith(t) ? 10 : 6;
    if ((item.keywords || []).some((k) => k.replace(/^=/, '').toLowerCase().includes(t))) s += 4;
    if (item.summary.toLowerCase().includes(t)) s += 2;
    if ((item.explainer || []).join(' ').toLowerCase().includes(t)) s += 1;
    if (s) scored.push({ id, item, layer, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, 8);
}

function renderSearch(q) {
  const box = $('#search-results');
  if (q.trim().length < 2) { box.hidden = true; return; }
  const concepts = searchConcepts(q.trim());
  const newsCount = state.news.items.filter((it) => `${it.title} ${it.summary}`.toLowerCase().includes(q.trim().toLowerCase())).length;
  box.innerHTML = (concepts.length ? '<div class="sr-head">Concepts</div>' : '')
    + concepts.map((c) => `<button type="button" class="l-${esc(c.layer.id)}" data-concept="${esc(c.id)}"><strong>${esc(c.item.name)}</strong> <span class="sr-kind">· ${esc(c.layer.name)}</span><br><span class="sr-kind">${esc(c.item.summary)}</span></button>`).join('')
    + `<div class="sr-head">News</div><button type="button" data-search-news="${esc(q.trim())}">Show ${newsCount} matching stor${newsCount === 1 ? 'y' : 'ies'} for “${esc(q.trim())}”</button>`;
  box.hidden = false;
}

function goToNews() {
  $('#news').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------- theme
function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
function toggleTheme() {
  const current = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  store.set('theme', next);
}

// ---------------------------------------------------------------- events
function bindGlobal() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-toggle], a');
    if (!t) {
      if (!e.target.closest('.top-actions')) $('#search-results').hidden = true;
      return;
    }
    if (!t.closest('.top-actions')) $('#search-results').hidden = true;
    const d = t.dataset;
    if (d.concept) { e.preventDefault(); $('#search-results').hidden = true; openConcept(d.concept, t); return; }
    if (d.cat) { e.stopPropagation(); if (state.openLayer === d.layer) { const c = $(`#cat-${CSS.escape(d.cat)}`); c?.classList.remove('flash'); void c?.offsetWidth; c?.classList.add('flash'); c?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } else toggleLayer(d.layer, { focusCat: d.cat }); return; }
    if (d.toggle) { toggleLayer(d.toggle); history.replaceState(null, '', state.openLayer ? `#l=${state.openLayer}` : location.pathname); return; }
    if (d.catdg) {
      const panel = t.nextElementSibling;
      panel.hidden = !panel.hidden;
      t.setAttribute('aria-expanded', String(!panel.hidden));
      t.textContent = panel.hidden ? '▸ Show diagram' : '▾ Hide diagram';
      return;
    }
    if (d.layerOpen) { closeDrawer(); toggleLayer(d.layerOpen, { forceOpen: true, focusCat: d.catFocus }); return; }
    if (d.learn) { toggleLearned(d.learn); return; }
    if (d.threat) {
      e.stopPropagation();
      const [lid] = d.threat.split(':');
      if (state.openLayer !== lid) toggleLayer(lid, { forceOpen: true, scroll: false });
      $(`#threats-${CSS.escape(lid)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (d.view) {
      $('#tower').dataset.view = d.view;
      document.querySelectorAll('.view-toggle [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === d.view)));
      store.set('view', d.view);
      return;
    }
    if (t.id === 'journey-play') { playJourney(); return; }
    if (d.path) { startPath(d.path); return; }
    if (d.pathStep !== undefined && state.path) {
      const p = findPath(state.path.id);
      const steps = p.steps.filter((s) => state.index.has(s));
      const i = Number(d.pathStep);
      openConcept(steps[i], state.drawerOpener, { id: p.id, idx: i });
      return;
    }
    if (d.newsConcept) { closeDrawer(); setFilter({ concept: d.newsConcept, days: 0, layer: 'all' }); goToNews(); return; }
    if (d.f) {
      const f = state.filters;
      let v = d.v;
      if (d.f === 'days') v = Number(v);
      if (d.f === 'onlyNew') v = !f.onlyNew;
      setFilter({ [d.f]: v });
      return;
    }
    if (d.clear) { setFilter({ [d.clear]: d.clear === 'concept' ? null : '' }); return; }
    if (d.radar) { setFilter({ q: d.radar, days: 0, layer: 'all', type: 'all' }); goToNews(); return; }
    if (d.searchNews !== undefined) { $('#search-results').hidden = true; setFilter({ q: d.searchNews, days: 0 }); goToNews(); return; }
  });

  $('#more').addEventListener('click', () => { state.shown += 40; renderNews(); });
  $('#drawer-close').addEventListener('click', closeDrawer);
  $('#backdrop').addEventListener('click', closeDrawer);
  $('#theme-toggle').addEventListener('click', toggleTheme);

  const input = $('#search');
  input.addEventListener('input', () => renderSearch(input.value));
  input.addEventListener('focus', () => renderSearch(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = $('#search-results button');
      first?.click();
    } else if (e.key === 'Escape') {
      $('#search-results').hidden = true;
      input.blur();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
    if (e.key === '/' && document.activeElement !== input && !e.target.closest('input, textarea')) {
      e.preventDefault();
      input.focus();
    }
  });
  window.addEventListener('hashchange', route);
}

function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('c=')) openConcept(hash.slice(2));
  else if (hash.startsWith('l=')) toggleLayer(hash.slice(2), { forceOpen: true });
}

init().catch((err) => {
  console.error(err);
  $('#status').textContent = `Failed to load data: ${err.message}`;
});
