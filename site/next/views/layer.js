// Z2: inside one layer.
// Methods: pre-training (name the parts first, as cards), concept mapping (nodes + labelled edges, generated from
// relationships.json), signaling (hover/focus highlights a concept's connections; the walkthrough highlights each
// step), segmenting (walkthrough advances only on Next), narrative thread (one running example through the steps).
import { icon } from '../icons.js';
import { href } from '../router.js';
import { prefs } from '../store.js';
import { arrowSample } from '../diagrams.js';
import { conceptMap, highlight } from '../conceptmap.js';
import { layerQuestions } from './quiz.js';
import { esc, lclass, lnum, freshness, zoomLabel } from '../ui.js';

const DEPTHS = ['D1', 'D2', 'D3', 'D4', 'D5'];

export function layer(route, c) {
  const l = c.layerById.get(route.id);
  if (!l) return null;
  const above = c.layers.find((x) => x.order === l.order + 1);
  const below = c.layers.find((x) => x.order === l.order - 1);
  const concepts = l.concepts.map((id) => c.conceptById.get(id)).filter(Boolean);
  const cards = concepts.map((k) => `
    <a class="concept-card ${lclass(l)}" href="${href.concept(k.id)}" data-zoom>
      <strong>${esc(k.name)}</strong>
      <span class="small muted">${esc(k.summary)}</span>
      <span class="depth-dots" aria-label="Written at depths ${DEPTHS.filter((d) => k.depths[d]).join(', ')}">${DEPTHS.map((d) => `<i class="${k.depths[d] ? 'on' : ''}">${d}</i>`).join('')}</span>
    </a>`).join('');

  const rels = c.relationships.filter((r) => l.concepts.includes(r.from) || l.concepts.includes(r.to));
  const relItems = rels.map((r) => {
    const a = c.conceptById.get(r.from), b = c.conceptById.get(r.to);
    const la = c.layerOf(r.from), lb = c.layerOf(r.to);
    const link = (k, kl) => `<a class="chip ${lclass(kl)}" href="${href.concept(k.id)}">${kl.id !== l.id ? `L${kl.order} · ` : ''}${esc(k.name)}</a>`;
    return `<li data-from="${esc(r.from)}" data-to="${esc(r.to)}">${link(a, la)} <span class="rel-type">→ ${esc(r.label)} →</span> ${link(b, lb)}</li>`;
  }).join('');
  const usedArrows = [...new Set(rels.map((r) => c.model.relationshipTypes[r.type]?.arrow))].filter(Boolean);
  const legend = usedArrows.map((a) => {
    const names = Object.entries(c.model.relationshipTypes).filter(([n, t]) => t.arrow === a && rels.some((r) => r.type === n)).map(([n]) => n);
    return `<span class="cm-key">${arrowSample(c.model.arrows[a])}<span>${esc(names.join(', '))}</span></span>`;
  }).join('');

  const walk = l.walkthrough || [];
  const hasMap = (l.metaDiagram?.nodes || []).length > 1;
  const showBreaks = prefs.depth >= 2;
  const quizN = layerQuestions(c, l.id).length;

  return {
    zoom: 'Z2', layer: l.id, title: l.name,
    crumbs: [{ label: 'Landscape', href: href.landscape(l.id), z: 'Z0' }, { label: 'Stack', href: href.stack(l.id), z: 'Z1' }, { label: l.name, z: 'Z2' }],
    html: `<header class="layer-head vt-target ${lclass(l)}">
        <p class="eyebrow">${zoomLabel('Z2')} ${lnum(l)} Lumai Layer ${l.order} of ${c.layers.length}</p>
        <h1>${icon(l.icon)}${esc(l.name)}</h1>
        <p class="lede">${esc(l.oneLiner)}</p>
        ${freshness(l, c.model)}
        <div class="analogy"><span class="label">Everyday analogy</span>${esc(l.analogy.text)}
          ${showBreaks ? `<div class="breaks"><span class="label">${icon('alert', 'ico-s')}Where this analogy breaks</span>${esc(l.analogy.breaks)}</div>` : ''}
        </div>
      </header>
      <h2 class="section-title">The parts</h2>
      <div class="concept-grid">${cards || '<p class="pending">No concepts written yet.</p>'}</div>
      ${quizN ? `<p class="qz-entry"><a class="btn-ghost" href="${href.quiz(l.id)}">${icon('target', 'ico-s')}<span>Check what you know <span class="muted">· ${quizN} questions</span></span></a></p>` : ''}
      ${hasMap ? `
      <h2 class="section-title">How they work together</h2>
      <div class="cm-wrap ${lclass(l)}">
        <button type="button" class="btn-ghost cm-show" aria-expanded="false">${icon('zoom', 'ico-s')}Show the map</button>
        <div class="cm-canvas">${conceptMap(l, c)}</div>
        <aside class="cm-panel" aria-live="polite">
          <div class="cm-info"><p class="muted">Hover, tab to or tap a concept to see what it connects to. Concepts from neighbouring layers sit along the edges.</p></div>
          ${walk.length ? `<div class="cm-walk" hidden>
              <p class="flow-kicker"></p><h3 class="cm-walk-title"></h3><p class="cm-walk-text"></p>
              <div class="flow-ctrls"><button type="button" class="btn-ghost" data-w="prev">← Back</button><button type="button" class="btn-ghost" data-w="next">Next →</button><button type="button" class="btn-ghost" data-w="exit">Done</button></div>
            </div>
            <button type="button" class="btn cm-start">${icon('bulb', 'ico-s')}Walk me through it <span class="cm-steps">· ${walk.length} steps</span></button>` : ''}
        </aside>
        <div class="cm-legend small muted">${legend}<span>Every line is also labelled in words.</span></div>
        <details class="cm-text"><summary>Connections as a text list</summary><ul class="rel-list">${relItems}</ul></details>
      </div>`
      : (relItems ? `<h2 class="section-title">How they connect</h2><ul class="rel-list">${relItems}</ul>` : '')}
      <div class="neighbours">
        ${below ? `<a class="neighbour ${lclass(below)}" href="${href.layer(below.id)}">${icon('down', 'ico-s')}<span><span class="small muted">Needs from below:</span> ${lnum(below)} ${esc(below.name)}</span></a>` : '<span></span>'}
        ${above ? `<a class="neighbour ${lclass(above)}" href="${href.layer(above.id)}">${icon('up', 'ico-s')}<span><span class="small muted">Gives up to:</span> ${lnum(above)} ${esc(above.name)}</span></a>` : ''}
      </div>`,
    mount: (root) => { if (hasMap) mountMap(root, l, c, walk); },
  };
}

function mountMap(root, l, c, walk) {
  const svg = root.querySelector('.cm-svg');
  const wrap = root.querySelector('.cm-wrap');
  const list = root.querySelector('.cm-text');
  // the text list lights up with the map, so on phones (where it leads) the walkthrough still shows each step
  const paint = (ids, edgeOn = () => false) => {
    highlight(svg, ids, edgeOn);
    list.querySelectorAll('[data-from]').forEach((li) => li.classList.toggle('is-hi', ids.length > 0 && edgeOn(li.dataset.from, li.dataset.to)));
  };
  // phones: the map is wider than the screen, so the readable text list leads and the map opens on request
  if (matchMedia('(max-width: 700px)').matches) list.open = true;
  const showBtn = root.querySelector('.cm-show');
  showBtn.addEventListener('click', () => {
    const open = wrap.classList.toggle('show-map');
    showBtn.setAttribute('aria-expanded', String(open));
    showBtn.lastChild.textContent = open ? 'Hide the map' : 'Show the map';
  });
  const info = root.querySelector('.cm-info');
  const walkEl = root.querySelector('.cm-walk');
  const startBtn = root.querySelector('.cm-start');
  const defaultInfo = info.innerHTML;
  let step = -1;          // -1: free exploration
  let touchPicked = null; // first tap on touch highlights, second opens
  let lastPointer = 'mouse';

  const neighbours = (id) => c.relsOf(id).map((r) => (r.from === id ? r.to : r.from));

  function showConcept(id) {
    if (step >= 0) return;
    const k = c.conceptById.get(id), kl = c.layerOf(id);
    const links = c.relsOf(id).map((r) => {
      const other = c.conceptById.get(r.from === id ? r.to : r.from);
      return `<li>${r.from === id ? `→ ${esc(r.label)} → <strong>${esc(other.name)}</strong>` : `<strong>${esc(other.name)}</strong> → ${esc(r.label)} → ${esc(k.name)}`}</li>`;
    }).join('');
    info.innerHTML = `<p class="flow-kicker">${kl.id === l.id ? 'In this layer' : `From L${kl.order} · ${esc(kl.name)}`}</p>
      <h3>${esc(k.name)}</h3><p>${esc(k.summary)}</p><ul class="cm-links">${links}</ul>
      <a class="btn-ghost" href="${href.concept(id)}">Open concept ${icon('zoom', 'ico-s')}</a>`;
    paint([id, ...neighbours(id)], (f, t) => f === id || t === id);
  }

  function clear() {
    if (step >= 0) return;
    info.innerHTML = defaultInfo;
    paint([]);
    touchPicked = null;
  }

  function paintStep() {
    const s = walk[step];
    walkEl.hidden = false;
    info.hidden = true;
    startBtn.hidden = true;
    walkEl.querySelector('.flow-kicker').textContent = `Walkthrough · step ${step + 1} of ${walk.length}`;
    walkEl.querySelector('.cm-walk-title').textContent = s.title;
    walkEl.querySelector('.cm-walk-text').textContent = s.text;
    walkEl.querySelector('[data-w="prev"]').disabled = step === 0;
    walkEl.querySelector('[data-w="next"]').disabled = step === walk.length - 1;
    // a disabled button drops focus: hand it to the nearest enabled control so the keyboard keeps working
    if (document.activeElement?.disabled || document.activeElement === document.body) {
      walkEl.querySelector(step === walk.length - 1 ? '[data-w="exit"]' : '[data-w="next"]').focus();
    }
    const set = new Set(s.highlight || []);
    paint([...set], (f, t) => set.has(f) && set.has(t));
  }

  function endWalk() {
    step = -1;
    walkEl.hidden = true;
    info.hidden = false;
    startBtn.hidden = false;
    clear();
    startBtn.focus();
  }

  svg.addEventListener('pointerover', (e) => { const n = e.target.closest('[data-node]'); if (n && e.pointerType === 'mouse') showConcept(n.dataset.node); });
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') clear(); });
  svg.addEventListener('focusin', (e) => { const n = e.target.closest('[data-node]'); if (n) showConcept(n.dataset.node); });
  svg.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });
  svg.addEventListener('click', (e) => {
    const n = e.target.closest('[data-node]');
    if (!n || step >= 0 || lastPointer !== 'touch') return;
    if (touchPicked !== n.dataset.node) { e.preventDefault(); touchPicked = n.dataset.node; showConcept(touchPicked); }
  });
  startBtn?.addEventListener('click', () => { step = 0; paintStep(); walkEl.querySelector('[data-w="next"]').focus(); });
  walkEl?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    if (b.dataset.w === 'exit') { endWalk(); return; }
    step = Math.min(Math.max(0, step + (b.dataset.w === 'next' ? 1 : -1)), walk.length - 1);
    paintStep();
  });
  walkEl?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && step < walk.length - 1) { step += 1; paintStep(); }
    if (e.key === 'ArrowLeft' && step > 0) { step -= 1; paintStep(); }
    if (e.key === 'Escape') endWalk();
  });
}
