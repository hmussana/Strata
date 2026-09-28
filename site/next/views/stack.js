// Z1: all layers as a vertical stack. Methods: analogy, spatial contiguity (inputs/outputs sit on each layer),
// segmenting, CPA (a D1-level one-liner and analogy per layer).
import { icon } from '../icons.js';
import { href } from '../router.js';
import { esc, lclass, zoomLabel } from '../ui.js';

export function stack(route, c) {
  const focus = route.params.get('focus');
  const rows = c.topDown.map((l) => `
    <a class="stack-row ${lclass(l)} ${focus === l.id ? 'focus' : ''}" id="row-${esc(l.id)}" href="${href.layer(l.id)}">
      <span class="stack-num" aria-hidden="true">L${l.order}</span>
      <span class="stack-body">
        <span class="stack-title">${icon(l.icon)}<span>${esc(l.name)}</span><span class="sr-only">, layer ${l.order} of ${c.layers.length}</span></span>
        <span>${esc(l.oneLiner)}<br><span class="muted small">Like ${esc(l.analogy.text.charAt(0).toLowerCase() + l.analogy.text.slice(1))}</span></span>
        <span class="io"><strong>Gives up ↑</strong> ${esc(l.givesAbove)}<br><strong>Needs from below ↓</strong> ${esc(l.needsBelow)}</span>
      </span>
    </a>`).join('');
  return {
    zoom: 'Z1', layer: focus, title: 'The AI stack',
    crumbs: [{ label: 'Landscape', href: href.landscape(), z: 'Z0' }, { label: 'Stack', z: 'Z1' }],
    html: `<header class="view-head">
        <p class="eyebrow">${zoomLabel('Z1')} The stack</p>
        <h1>How the AI world is organised</h1>
        <p class="lede">Each layer gives something to the layer above and needs something from the layer below. Select a layer to see what's inside.</p>
      </header>
      <div class="stack">${rows}</div>`,
    mount: () => { if (focus) document.getElementById(`row-${focus}`)?.scrollIntoView({ block: 'center' }); },
  };
}
