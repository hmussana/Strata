// The AI Stack: app shell. Loads content, routes between zoom levels, keeps breadcrumb + minimap in sync.
import { loadContent } from './content.js';
import { start, href } from './router.js';
import { prefs } from './store.js';
import { icon } from './icons.js';
import { esc, lclass } from './ui.js';
import { landscape } from './views/landscape.js';
import { stack } from './views/stack.js';
import { layer } from './views/layer.js';
import { concept } from './views/concept.js';
import { legend } from './views/legend.js';

const VIEWS = { landscape, stack, layer, concept, legend };
const $ = (s) => document.querySelector(s);
let previous = null;

function notFound() {
  return {
    zoom: null, layer: null, title: 'Not found',
    crumbs: [{ label: 'Landscape', href: href.landscape(), z: 'Z0' }, { label: 'Not found' }],
    html: `<h1>That page doesn't exist</h1><p><a href="${href.landscape()}">Back to the landscape</a></p>`,
  };
}

function renderCrumbs(crumbs) {
  $('#crumbs').innerHTML = `<ol>${crumbs.map((c, i) => {
    const z = c.z ? `<span class="zlabel" aria-hidden="true">${esc(c.z)}</span>` : '';
    return i === crumbs.length - 1
      ? `<li><span aria-current="page">${z} ${esc(c.label)}</span></li>`
      : `<li><a href="${c.href}">${z} ${esc(c.label)}</a></li>`;
  }).join('')}</ol>`;
}

function renderMinimap(c, out) {
  const zoomBtn = (z, label, target) => `<a class="mm-btn" href="${target}" ${out.zoom === z ? 'aria-current="page"' : ''} title="${label}">${z}</a>`;
  const layers = c.topDown.map((l) => `<a class="mm-layer ${lclass(l)}" href="${href.layer(l.id)}" ${out.layer === l.id ? 'aria-current="location"' : ''}
      aria-label="Layer ${l.order}: ${esc(l.name)}" title="L${l.order} · ${esc(l.name)}">${l.order}</a>`).join('');
  $('#minimap').innerHTML = `<div class="mm-zoom">${zoomBtn('Z0', 'Landscape', href.landscape())}${zoomBtn('Z1', 'Stack', href.stack())}</div>
    <div class="mm-label">Layers</div>${layers}`;
}

function render(c, route) {
  const view = VIEWS[route.view];
  const out = (view && view(route, c)) || notFound();
  const main = $('#view');
  document.body.className = out.bodyClass || '';
  main.innerHTML = out.html;
  renderCrumbs(out.crumbs);
  renderMinimap(c, out);
  document.title = `${out.title} · The AI Stack`;
  $('#announce').textContent = `${out.title}${out.zoom ? `, zoom level ${out.zoom}` : ''}`;
  out.mount?.(main);
  // same concept, different depth: keep focus on the depth dial; otherwise move to the new view
  const sameConcept = previous?.view === 'concept' && route.view === 'concept' && previous.id === route.id;
  if (sameConcept) main.querySelector('.depth-opt[aria-checked="true"]')?.focus({ preventScroll: true });
  else if (previous) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  previous = route;
}

function setupTheme() {
  const btn = $('#theme');
  btn.innerHTML = icon('theme');
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    prefs.theme = next;
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!prefs.theme) document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
  });
}

// Semantic zoom: the clicked element and the new view's matching element share one view-transition name,
// so the tile visibly becomes the stack row, the row becomes the layer header, the card becomes the concept.
function setupZoom() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-zoom]');
    if (!a) return;
    document.querySelectorAll('.vt-target').forEach((el) => el.classList.remove('vt-target'));
    a.classList.add('vt-target');
  });
}

// Z0 fills exactly one screen: track the real height of the sticky bar (it can wrap on narrow screens)
function trackBarHeight() {
  const bar = document.querySelector('.bar');
  const set = () => document.documentElement.style.setProperty('--bar-h', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
  new ResizeObserver(set).observe(bar);
  set();
}

async function main() {
  setupTheme();
  setupZoom();
  trackBarHeight();
  try {
    const content = await loadContent();
    start((route) => render(content, route));
  } catch (err) {
    console.error(err);
    $('#view').innerHTML = `<h1>Couldn't load the content</h1><p class="muted">${esc(err.message)}</p>`;
  }
}

main();
