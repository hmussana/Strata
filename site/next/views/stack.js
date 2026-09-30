// Z1: all layers as a vertical stack.
// Methods: analogy (a layered stack, OSI-style), spatial contiguity (what each layer gives the one above sits in
// the gap between them), segmenting (flows advance only when the learner asks: Next, or a Play they start),
// CPA (a concrete D1 one-liner and everyday analogy per layer; the abstract detail lives one zoom level down).
import { icon } from '../icons.js';
import { href } from '../router.js';
import { prefs } from '../store.js';
import { esc, lclass, zoomLabel } from '../ui.js';

const STEP_MS = 2600;
let timer = null;

function flowItems(c, name) {
  const f = c.flows?.[name];
  if (!f) return [];
  const items = [];
  if (f.intro) items.push({ kind: 'intro', anchor: f.intro.anchor, text: f.intro.text, dir: f.intro.dir || f.direction });
  f.steps.forEach((s) => items.push({ kind: 'step', anchor: s.layer, text: s.text, bypass: Boolean(s.bypass), dir: f.direction }));
  if (f.outro) items.push({ kind: 'outro', anchor: f.outro.anchor, text: f.outro.text, dir: f.outro.dir || f.direction });
  return items;
}

function row(l, c, focus, depth) {
  return `<article class="z1-row ${lclass(l)} ${focus === l.id ? 'is-focus vt-target' : ''}" id="row-${esc(l.id)}" data-anchor="${esc(l.id)}" data-zoom-root>
    <div class="z1-num" aria-hidden="true">L${l.order}</div>
    <div class="z1-main">
      <h2 class="z1-title"><a href="${href.layer(l.id)}" data-zoom>${icon(l.icon)}<span>${esc(l.name)}</span><span class="sr-only">, layer ${l.order} of ${c.layers.length}. Open this layer.</span></a></h2>
      <p>${esc(l.oneLiner)}</p>
    </div>
    <div class="z1-analogy"><span class="label">Think of it as</span>${esc(l.analogy.text)}
      ${depth >= 2 ? `<details class="z1-breaks"><summary>${icon('alert', 'ico-s')}Where this analogy breaks</summary><p>${esc(l.analogy.breaks)}</p></details>` : ''}
    </div>
    <div class="z1-examples"><span class="label">Examples</span><ul>${l.examples.map((e) => `<li class="chip">${esc(e)}</li>`).join('')}</ul></div>
    <span class="z1-badge" aria-hidden="true">not on this path</span>
  </article>`;
}

function gives(from, to) {
  return `<div class="z1-gives ${lclass(from)}"><span class="z1-arrow" aria-hidden="true">↑</span>
    <span><strong>L${from.order} gives ${to ? `L${to.order}` : 'people'}:</strong> ${esc(from.givesAbove)}</span></div>`;
}

export function stack(route, c) {
  clearInterval(timer);
  timer = null;
  const focus = route.params.get('focus');
  const startFlow = ['request', 'capability'].includes(route.params.get('flow')) ? route.params.get('flow') : '';
  const startStep = Number(route.params.get('step')) || 0;
  const depth = prefs.depth;
  const top = c.topDown[0];
  const bottom = c.topDown[c.topDown.length - 1];

  const rows = c.topDown.map((l) => {
    const below = c.layers.find((x) => x.order === l.order - 1);
    return row(l, c, focus, depth) + (below ? gives(below, l) : '');
  }).join('');

  const flowBtn = (id, label, hint) => `<button type="button" data-flow="${id}" aria-pressed="false" title="${hint}">${label}</button>`;

  return {
    zoom: 'Z1', layer: focus, title: 'The AI stack',
    crumbs: [{ label: 'Landscape', href: href.landscape(focus), z: 'Z0' }, { label: 'Stack', z: 'Z1' }],
    html: `<header class="view-head z1-head">
        <div>
          <p class="eyebrow">${zoomLabel('Z1')} The stack</p>
          <h1>How the AI world is organised</h1>
          <p class="lede">Each layer builds on the one below and serves the one above. Open any layer, or follow how things move through the stack.</p>
        </div>
        <div class="flow-bar" role="group" aria-label="Show a flow through the stack">
          ${flowBtn('', 'Explore', 'Just the layers')}
          ${flowBtn('request', `${icon('down', 'ico-s')}Follow a request`, 'A question travels down to the chips and back')}
          ${flowBtn('capability', `${icon('up', 'ico-s')}Capability flows up`, 'How each layer builds on the one below')}
        </div>
      </header>
      <div class="z1-layout">
        <div class="z1-stack">
          <div class="rail" aria-hidden="true"><div class="rail-trail"></div><div class="packet"></div></div>
          <div class="z1-cap" data-anchor="top">${icon('users', 'ico-s')}<span><strong>People</strong> use what the stack produces</span></div>
          ${gives(top, null)}
          ${rows}
          <div class="z1-cap z1-foundation" data-anchor="bottom">${icon('layers', 'ico-s')}<span><strong>What it all rests on:</strong> ${esc(bottom.needsBelow)}</span></div>
        </div>
        <aside class="flow-panel" hidden aria-label="Flow steps">
          <p class="flow-kicker"></p>
          <p class="flow-text" aria-live="polite"></p>
          <p class="flow-note" hidden></p>
          <div class="flow-ctrls">
            <button type="button" class="btn-ghost" data-step="prev">← Back</button>
            <button type="button" class="btn" data-step="play">▶ Play</button>
            <button type="button" class="btn-ghost" data-step="next">Next →</button>
          </div>
          <p class="flow-legend small muted"></p>
        </aside>
      </div>`,
    mount: (root) => mountFlows(root, c, startFlow, startStep, focus),
  };
}

function mountFlows(root, c, startFlow, startStep, focus) {
  const layout = root.querySelector('.z1-layout');
  const stackEl = root.querySelector('.z1-stack');
  const panel = root.querySelector('.flow-panel');
  const packet = root.querySelector('.packet');
  const trail = root.querySelector('.rail-trail');
  const playBtn = panel.querySelector('[data-step="play"]');
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let flow = startFlow;
  let items = flowItems(c, flow);
  let i = Math.min(Math.max(0, startStep), Math.max(0, items.length - 1));

  const anchorEl = (a) => stackEl.querySelector(`[data-anchor="${CSS.escape(a)}"]`);
  const centre = (a) => { const el = anchorEl(a); return el ? el.offsetTop + el.offsetHeight / 2 : 0; };

  const syncUrl = () => {
    const q = new URLSearchParams();
    if (focus) q.set('focus', focus);
    if (flow) { q.set('flow', flow); q.set('step', String(i)); }
    const qs = q.toString();
    history.replaceState(null, '', `#/stack${qs ? `?${qs}` : ''}`);
  };

  function stop() {
    clearInterval(timer);
    timer = null;
    playBtn.textContent = i >= items.length - 1 ? '↻ Replay' : '▶ Play';
  }

  function paint({ scroll = true, animate = true } = {}) {
    if (!stackEl.isConnected) { stop(); return; }   // the view was replaced: never touch the URL again
    root.querySelectorAll('[data-flow]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.flow === flow)));
    stackEl.querySelectorAll('[data-anchor]').forEach((el) => el.classList.remove('flow-active', 'flow-visited', 'flow-bypass'));
    layout.classList.toggle('flowing', Boolean(flow));
    stackEl.classList.toggle('flowing', Boolean(flow));
    stackEl.dataset.flow = flow;
    panel.hidden = !flow;
    if (!flow) { syncUrl(); return; }

    const item = items[i];
    const seen = items.slice(0, i + 1);
    seen.forEach((it, k) => {
      const el = anchorEl(it.anchor);
      if (!el) return;
      el.classList.add(k === i ? 'flow-active' : 'flow-visited');
      if (it.bypass) el.classList.add('flow-bypass');
    });

    const ys = seen.map((it) => centre(it.anchor));
    const y = centre(item.anchor);
    stackEl.classList.toggle('no-anim', !animate);
    packet.style.transform = `translateY(${y - 15}px)`;
    packet.textContent = item.dir === 'up' ? '↑' : '↓';
    packet.classList.toggle('is-bypass', item.bypass);
    trail.style.top = `${Math.min(...ys)}px`;
    trail.style.height = `${Math.max(...ys) - Math.min(...ys)}px`;

    const layer = c.layerById.get(item.anchor);
    const where = layer ? `L${layer.order} · ${layer.name}` : item.anchor === 'top' ? 'People' : 'Foundations';
    panel.querySelector('.flow-kicker').textContent = `${flow === 'request' ? 'Follow a request' : 'Capability flows up'} · ${i + 1} of ${items.length} · ${where}`;
    panel.querySelector('.flow-text').textContent = item.text;
    const note = panel.querySelector('.flow-note');
    note.hidden = !item.bypass;
    note.textContent = item.bypass ? 'This layer is skipped on this path (shown dashed).' : '';
    panel.querySelector('[data-step="prev"]').disabled = i === 0;
    panel.querySelector('[data-step="next"]').disabled = i >= items.length - 1;
    panel.querySelector('.flow-legend').textContent = flow === 'request'
      ? 'Solid line: the request path. Dashed layer: bypassed.'
      : 'Thick line: capability building up the stack (primary path).';
    if (!timer) playBtn.textContent = i >= items.length - 1 ? '↻ Replay' : '▶ Play';
    if (scroll) anchorEl(item.anchor)?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    syncUrl();
  }

  function setFlow(next) {
    stop();
    flow = next;
    items = flowItems(c, flow);
    i = 0;
    paint({ animate: false });
    if (flow) panel.querySelector('[data-step="next"]').focus({ preventScroll: true });
  }

  function go(delta) {
    stop();
    i = Math.min(Math.max(0, i + delta), items.length - 1);
    paint();
  }

  function play() {
    if (timer) { stop(); return; }
    if (i >= items.length - 1) i = 0;
    paint();
    playBtn.textContent = '❚❚ Pause';
    timer = setInterval(() => {
      if (!stackEl.isConnected || i >= items.length - 1) { stop(); return; }
      i += 1;
      paint();
      if (i >= items.length - 1) stop();
    }, STEP_MS);
  }

  window.addEventListener('hashchange', stop, { once: true });
  root.querySelectorAll('[data-flow]').forEach((b) => b.addEventListener('click', () => setFlow(b.dataset.flow)));
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    if (b.dataset.step === 'play') play(); else go(b.dataset.step === 'next' ? 1 : -1);
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });
  // row heights change with window width and opened analogy notes: keep the packet on its row
  new ResizeObserver(() => { if (flow) paint({ scroll: false, animate: false }); }).observe(stackEl);

  paint({ scroll: false, animate: false });
  if (focus && !flow) document.getElementById(`row-${focus}`)?.scrollIntoView({ block: 'center' });
  if (flow) anchorEl(items[i].anchor)?.scrollIntoView({ block: 'center' });
}
