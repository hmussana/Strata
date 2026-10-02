// Z3: one concept at the learner's chosen depth. Methods: depth dial (expertise reversal), CPA, analogy with
// explicit breakpoints (from D2 up), predict-then-reveal, segmenting, explorables (D3 play, D4 workbench),
// modality (D1 narration through the browser's own speech engine: no audio files, no third parties).
import { icon } from '../icons.js';
import { href } from '../router.js';
import { prefs } from '../store.js';
import { renderDiagram } from '../diagrams.js';
import { guide } from '../guide.js';
import { esc, paras, lclass, lnum, freshness, zoomLabel, isPlaceholder } from '../ui.js';

const DEPTH_IDS = ['D1', 'D2', 'D3', 'D4', 'D5'];

function depthSelector(c, k, current, l) {
  const opts = c.model.depths.map((d, i) => {
    const n = i + 1, has = Boolean(k.depths[d.id]), on = n === current;
    return `<a role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" class="depth-opt ${has ? '' : 'missing'}" href="${href.concept(k.id, n)}" data-depth="${n}"
      title="${esc(d.audience)}${has ? '' : ' (not written yet)'}"><b>${esc(d.id)} ${esc(d.name)}</b><span>${has ? esc(d.audience) : 'not written yet'}</span></a>`;
  }).join('');
  return `<div class="depth-bar ${lclass(l)}"><div class="depth-sel" role="radiogroup" aria-label="Explanation depth">${opts}</div></div>`;
}

function predictCard(p) {
  return `<section class="predict" data-answer="${p.answer}" aria-label="Predict, then reveal">
    <h3>${icon('bulb', 'ico-s')}Predict first</h3>
    <p class="q">${esc(p.question)}</p>
    <div class="opts">${p.options.map((o, i) => `<button type="button" class="opt" data-i="${i}" aria-pressed="false">${esc(o)}</button>`).join('')}</div>
    <button type="button" class="btn reveal-btn" disabled>Reveal the answer</button>
    <div class="reveal" hidden aria-live="polite"><p><strong class="verdict"></strong> ${esc(p.explanation)}</p></div>
  </section>`;
}

const canSpeak = () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

// What Listen reads: the D1 text itself (markup stripped), or `narration` where the spoken words must differ
function spokenText(body) {
  const src = body.narration || body.text;
  return (Array.isArray(src) ? src : [src]).join(' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();
}

// One utterance per sentence: Chrome silently stops long utterances after about 15 seconds
const sentences = (text) => text.match(/[^.!?…]+[.!?…]+["'”’)]*|[^.!?…]+$/g)?.map((x) => x.trim()).filter(Boolean) || [];

function extras(body, l) {
  return `${body.interactive ? `<div class="explorable ${lclass(l)}" data-interactive="${esc(body.interactive)}"><p class="muted small">Loading the interactive…</p></div>` : ''}
    ${body.tasks?.length ? `<section class="tasks"><h3>${icon('target', 'ico-s')}Try this</h3><ol>${body.tasks.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></section>` : ''}
    ${body.code ? `<figure class="code-fig"><figcaption>Pseudo-code</figcaption><pre class="code"><code>${esc(body.code)}</code></pre></figure>` : ''}
    ${body.tradeoffs?.length ? `<section class="tradeoffs"><h3>${icon('scale', 'ico-s')}Trade-offs</h3><ul>${body.tradeoffs.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}`;
}

function sourcesList(k) {
  const items = (k.sources || []).map((s) => {
    if (isPlaceholder(s.title)) return '<li><span class="ph">PLACEHOLDER</span> source to be added</li>';
    return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> <span class="muted small">(${esc(s.date)})</span>
      ${s.verify ? '<span class="badge badge-verify" title="Cited from memory; link and details need checking">verify</span>' : ''}</li>`;
  }).join('');
  return `<h2 class="section-title">${icon('book', 'ico-s')} Sources and further reading</h2><ul class="sources">${items}</ul>`;
}

export function concept(route, c) {
  const k = c.conceptById.get(route.id);
  if (!k) return null;
  const l = c.layerById.get(k.layer);
  const fromUrl = Number(route.params.get('d'));
  if (fromUrl >= 1 && fromUrl <= 5) prefs.depth = fromUrl;
  const depth = prefs.depth;
  const did = DEPTH_IDS[depth - 1];
  const body = k.depths[did];
  const meta = c.model.depths[depth - 1];

  let content;
  if (body) {
    content = `<div class="depth-body">
      ${body.guide ? guide(body.guide, c.model.guide?.name) : ''}
      ${did === 'D1' ? `<div class="narrate" hidden><button type="button" class="btn" data-narrate aria-pressed="false">${icon('speaker', 'ico-s')}<span>Listen</span></button>
        <button type="button" class="btn-ghost" data-show-text hidden aria-expanded="false">Show the text</button></div>` : ''}
      <div class="depth-text">${paras(body.text)}</div>
      ${body.diagram ? renderDiagram(body.diagram, lclass(l)) : ''}
      ${body.analogy ? `<div class="analogy"><span class="label">Analogy</span>${esc(body.analogy)}
        ${depth >= 2 && body.analogyBreaks ? `<div class="breaks"><span class="label">${icon('alert', 'ico-s')}Where this analogy breaks</span>${esc(body.analogyBreaks)}</div>` : ''}</div>` : ''}
      ${extras(body, l)}
    </div>
    ${body.predict ? predictCard(body.predict) : ''}
    ${depth === 5 ? sourcesList(k) : ''}`;
  } else {
    const avail = DEPTH_IDS.map((d, i) => (k.depths[d] ? i + 1 : 0)).filter(Boolean);
    const nearest = avail.sort((a, b) => Math.abs(a - depth) - Math.abs(b - depth))[0];
    content = `<div class="pending"><p><strong>${esc(did)} ${esc(meta.name)}</strong> hasn't been written for this concept yet.</p>
      <p>Closest available: <a href="${href.concept(k.id, nearest)}">${DEPTH_IDS[nearest - 1]} ${esc(c.model.depths[nearest - 1].name)}</a>.</p></div>`;
  }

  const prereq = (k.prerequisites || []).map((id) => c.conceptById.get(id)).filter(Boolean);
  const rels = c.relsOf(k.id).map((r) => {
    const other = c.conceptById.get(r.from === k.id ? r.to : r.from);
    const ol = c.layerOf(other.id);
    const chip = `<a class="chip ${lclass(ol)}" href="${href.concept(other.id)}">L${ol.order} · ${esc(other.name)}</a>`;
    const verb = `<span class="rel-type">→ ${esc(r.label)} →</span>`;
    return r.from === k.id ? `<li><span class="rel-this">This</span> ${verb} ${chip}</li>` : `<li>${chip} ${verb} <span class="rel-this">this</span></li>`;
  }).join('');

  return {
    zoom: 'Z3', layer: l.id, title: k.name,
    crumbs: [{ label: 'Landscape', href: href.landscape(l.id), z: 'Z0' }, { label: 'Stack', href: href.stack(l.id), z: 'Z1' },
      { label: l.name, href: href.layer(l.id), z: 'Z2' }, { label: k.name, z: 'Z3' }],
    html: `<header class="concept-head vt-target ${lclass(l)}">
        <p class="eyebrow">${zoomLabel('Z3')} Concept in <a href="${href.layer(l.id)}">${lnum(l)} ${esc(l.name)}</a></p>
        <h1>${esc(k.name)}</h1>
        <p class="lede">${esc(k.summary)}</p>
        ${freshness(k, c.model)}
      </header>
      ${depthSelector(c, k, depth, l)}
      <p class="small muted">${esc(meta.id)} ${esc(meta.name)}: ${esc(meta.form)} Your choice is remembered as you move between concepts.</p>
      ${content}
      ${prereq.length ? `<h2 class="section-title">Helps to know first</h2><div class="related">${prereq.map((p) => `<a class="chip ${lclass(c.layerOf(p.id))}" href="${href.concept(p.id)}">${esc(p.name)}</a>`).join('')}</div>` : ''}
      ${rels ? `<h2 class="section-title">Connected concepts</h2><ul class="rel-list">${rels}</ul>` : ''}`,
    mount: (root) => {
      if (body) mountExtras(root, body);
      // depth radiogroup: arrow keys move between options
      const radios = [...root.querySelectorAll('.depth-opt')];
      radios.forEach((r, i) => r.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = radios[(i + step + radios.length) % radios.length];
        next.focus();
        location.hash = next.getAttribute('href');
      }));
      // predict, then reveal
      root.querySelectorAll('.predict').forEach((card) => {
        const answer = Number(card.dataset.answer);
        const opts = [...card.querySelectorAll('.opt')];
        const btn = card.querySelector('.reveal-btn');
        let choice = null;
        opts.forEach((o) => o.addEventListener('click', () => {
          if (!card.querySelector('.reveal').hidden) return;
          choice = Number(o.dataset.i);
          opts.forEach((x) => x.setAttribute('aria-pressed', String(x === o)));
          btn.disabled = false;
        }));
        btn.addEventListener('click', () => {
          opts.forEach((x, i) => { x.classList.toggle('correct', i === answer); x.classList.toggle('wrong', i === choice && i !== answer); x.disabled = true; });
          const reveal = card.querySelector('.reveal');
          reveal.querySelector('.verdict').textContent = choice === answer ? 'Correct.' : 'Not quite.';
          reveal.hidden = false;
          btn.hidden = true;
        });
      });
    },
  };
}

function mountExtras(root, body) {
  // explorables load on demand from the registry, so concepts without one cost nothing
  const xp = root.querySelector('[data-interactive]');
  if (xp) {
    import('../explorables/index.js').then(({ EXPLORABLES }) => {
      const load = EXPLORABLES[xp.dataset.interactive];
      if (!load) throw new Error(`unknown explorable ${xp.dataset.interactive}`);
      return load().then((fn) => { if (xp.isConnected) fn(xp, body.interactiveConfig || {}); });
    }).catch(() => { xp.innerHTML = '<p class="pending">This interactive could not load.</p>'; });
  }

  // D1 Listen: when there is a picture, hide the words while listening (modality: hear the story, look at the picture),
  // with one tap to bring them back; without a picture the words stay up so early readers can follow along
  const box = root.querySelector('.narrate');
  if (!box || !canSpeak()) return;
  box.hidden = false;
  const btn = box.querySelector('[data-narrate]'), show = box.querySelector('[data-show-text]');
  const text = root.querySelector('.depth-text');
  const hideText = Boolean(body.diagram);
  const setText = (visible) => {
    if (!hideText) return;
    text.hidden = !visible; show.hidden = visible; show.setAttribute('aria-expanded', String(visible));
  };
  const idle = () => { btn.setAttribute('aria-pressed', 'false'); btn.querySelector('span').textContent = 'Listen'; setText(true); };
  btn.addEventListener('click', () => {
    if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); idle(); return; }
    const parts = sentences(spokenText(body));
    if (!parts.length) return;
    try {
      parts.forEach((part, i) => {
        const u = new SpeechSynthesisUtterance(part);
        u.lang = 'en';
        u.rate = 0.95;
        if (i === parts.length - 1) u.onend = idle;
        u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') { speechSynthesis.cancel(); idle(); } };
        speechSynthesis.speak(u);
      });
    } catch { idle(); return; }
    btn.setAttribute('aria-pressed', 'true');
    btn.querySelector('span').textContent = 'Stop';
    setText(false);
  });
  show.addEventListener('click', () => setText(true));
  window.addEventListener('hashchange', () => speechSynthesis.cancel(), { once: true });
}
