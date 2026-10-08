// The landing explainer: a 30-second silent "film" drawn in SVG that says what Lumai is, why it exists and who it
// serves. Scenes are CSS states (.ex.onN = "scene N has started"); this module only flips classes on a timer, so
// the motion lives in next.css. Reduced motion: no autoplay and no transitions; the scene buttons still step through.
import { esc, lclass } from './ui.js';

const SCENES = [
  { ms: 4200, cap: 'Hundreds of AI stories land every week. It is hard to tell how they connect.' },
  { ms: 4600, cap: 'Lumai sorts every story into the part of the AI world it belongs to.' },
  { ms: 4800, cap: 'The Lumai Model: nine layers, each built on the one below: from power and chips up to the apps you use.' },
  { ms: 5200, cap: 'Open any layer to see its key ideas, and how they link, on one map.' },
  { ms: 5200, cap: 'Then pick how deep to go, from a one-minute story to the open research questions.' },
  { ms: 6500, cap: 'For curious readers, students and people who work with AI and want the whole picture.' },
];
const SUMMARY = 'A short silent animation. ' + SCENES.map((s) => s.cap).join(' ');

const W = 640, BAR_W = 220, BAR_H = 26, BAR_X = (W - BAR_W) / 2;
const barY = (order) => 317 - order * 30;
const MAP = [ // a few real Foundation Models ideas, placed by hand
  ['Tokens', 296, 62], ['Transformers', 436, 48], ['Pretraining', 304, 142],
  ['Post-training', 462, 128], ['Reasoning models', 318, 222], ['Open weights', 482, 210],
];
const MAP_EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [1, 4], [3, 5], [0, 2]];
const DEPTHS = ['Story', 'Picture', 'Play', 'Mechanism', 'Frontier'];
const PEOPLE = ['Curious readers', 'Students', 'People who work with AI'];

// headline chips: a scattered start and a target bar; positions are fixed so every loop looks the same
const CHIPS = [
  [40, 40, 9], [400, 26, 5], [210, 70, 2], [470, 92, 8], [64, 118, 3], [300, 132, 6], [500, 160, 1],
  [150, 186, 7], [390, 206, 4], [30, 238, 5], [250, 252, 9], [470, 272, 2], [110, 300, 8], [340, 304, 3],
];

function chips(layerByOrder) {
  return CHIPS.map(([x, y, o], i) => {
    const l = layerByOrder[o];
    const tx = BAR_X + BAR_W / 2 - 18, ty = barY(o) + 9;
    return `<g class="ex-chip ${l ? lclass(l) : ''}" data-x1="${x}" data-y1="${y}" data-x2="${tx}" data-y2="${ty}" data-d="${i * 70}">
      <rect class="ex-chip-bg" width="120" height="24" rx="6"/>
      <circle class="ex-chip-dot" cx="12" cy="12" r="4"/>
      <rect class="ex-chip-line" x="22" y="7" width="${60 + ((i * 17) % 30)}" height="4" rx="2"/>
      <rect class="ex-chip-line" x="22" y="14" width="${40 + ((i * 23) % 40)}" height="4" rx="2"/>
    </g>`;
  }).join('');
}

function stack(layers) {
  return layers.map((l) => {
    const y = barY(l.order), focus = l.id === 'foundation-models' ? ' is-focus' : '';
    return `<g class="ex-bar ${lclass(l)}${focus}" data-d="${(l.order - 1) * 90}">
      <rect class="ex-bar-bg" x="${BAR_X}" y="${y}" width="${BAR_W}" height="${BAR_H}" rx="5"/>
      <text class="ex-bar-n" x="${BAR_X + 10}" y="${y + 17}">L${l.order}</text>
      <text class="ex-bar-t" x="${BAR_X + 34}" y="${y + 17}">${esc(l.name)}</text>
    </g>`;
  }).join('');
}

function map() {
  const ctr = MAP.map(([t, x, y]) => [x + t.length * 3.6 + 12, y + 13]);
  const edges = MAP_EDGES.map(([a, b]) => `<line class="ex-edge" x1="${ctr[a][0]}" y1="${ctr[a][1]}" x2="${ctr[b][0]}" y2="${ctr[b][1]}"/>`).join('');
  const nodes = MAP.map(([t, x, y], i) => `<g class="ex-node${i === 1 ? ' is-pick' : ''}" data-d="${200 + i * 110}">
      <rect x="${x}" y="${y}" width="${t.length * 7.2 + 24}" height="26" rx="13"/>
      <text x="${x + 12}" y="${y + 17}">${esc(t)}</text></g>`).join('');
  const fy = barY(5) + BAR_H / 2;
  return `<path class="ex-link" d="M ${BAR_X + BAR_W - 170} ${fy} C 280 ${fy}, 280 155, 304 155"/>
    <g class="ex-map c-l5">${edges}${nodes}</g>`;
}

function card() {
  const dots = DEPTHS.map((d, i) => {
    const x = 322 + i * 64;
    return `<g class="ex-depth" data-d="${500 + i * 380}"><circle cx="${x}" cy="200" r="13"/><text class="ex-depth-n" x="${x}" y="205">${i + 1}</text>
      <text class="ex-depth-t" x="${x}" y="234">${d}</text></g>`;
  }).join('');
  return `<g class="ex-card c-l5">
    <rect class="ex-card-bg" x="280" y="70" width="340" height="196" rx="12"/>
    <text class="ex-card-k" x="302" y="100">Foundation Models</text>
    <text class="ex-card-t" x="302" y="128">Transformers &amp; attention</text>
    <rect class="ex-chip-line" x="302" y="142" width="270" height="5" rx="2.5"/>
    <rect class="ex-chip-line" x="302" y="153" width="210" height="5" rx="2.5"/>
    ${dots}
  </g>`;
}

function people() {
  const fig = (x) => `<circle cx="${x}" cy="226" r="11"/><path d="M ${x - 19} 266 a 19 19 0 0 1 38 0 z"/>`;
  return `<g class="ex-end">
    <text class="ex-brand" x="${W / 2}" y="104">Lumai</text>
    <text class="ex-tag" x="${W / 2}" y="140">How AI works, layer by layer.</text>
    ${PEOPLE.map((p, i) => {
      const x = 160 + i * 160;
      return `<g class="ex-person c-l${[9, 5, 7][i]}" data-d="${400 + i * 250}">${fig(x)}<text x="${x}" y="292">${esc(p)}</text></g>`;
    }).join('')}
  </g>`;
}

export function explainerHtml(c) {
  const layers = c.topDown;
  const byOrder = Object.fromEntries(layers.map((l) => [l.order, l]));
  const steps = SCENES.map((s, i) => `<button type="button" class="ex-step" data-step="${i}" aria-label="Scene ${i + 1} of ${SCENES.length}"><span></span></button>`).join('');
  return `<figure class="ex" data-s="0">
    <svg class="ex-svg" viewBox="0 0 ${W} 360" role="img" aria-label="${esc(SUMMARY)}">
      <g class="ex-stack">${stack(layers)}</g>
      ${chips(byOrder)}
      ${map()}
      ${card()}
      ${people()}
    </svg>
    <figcaption class="ex-cap" aria-hidden="true">${esc(SCENES[0].cap)}</figcaption>
    <div class="ex-ctl">
      <button type="button" class="btn-ghost ex-play" aria-label="Pause the animation">Pause</button>
      <div class="ex-steps">${steps}</div>
    </div>
  </figure>`;
}

export function mountExplainer(fig) {
  if (!fig) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cap = fig.querySelector('.ex-cap'), play = fig.querySelector('.ex-play');
  const stepBtns = [...fig.querySelectorAll('.ex-step')];
  // per-element positions and delays come from data attributes; CSSOM writes are allowed under the page CSP
  fig.querySelectorAll('[data-x1]').forEach((g) => {
    for (const k of ['x1', 'y1', 'x2', 'y2']) g.style.setProperty(`--${k}`, `${g.dataset[k]}px`);
  });
  fig.querySelectorAll('[data-d]').forEach((g) => g.style.setProperty('--d', `${g.dataset.d}ms`));

  let scene = 0, timer = 0, playing = !reduce, inView = true, tabOn = !document.hidden;
  const show = (n, { reset = false } = {}) => {
    scene = n;
    if (reset) { // jump without animating back through earlier states
      fig.classList.add('is-cut');
      void fig.getBoundingClientRect();
    }
    fig.dataset.s = String(n + 1);
    for (let i = 1; i <= SCENES.length; i++) fig.classList.toggle(`on${i}`, i <= n + 1);
    if (reset) requestAnimationFrame(() => requestAnimationFrame(() => fig.classList.remove('is-cut')));
    cap.textContent = SCENES[n].cap;
    stepBtns.forEach((b, i) => { b.classList.toggle('is-on', i === n); b.classList.toggle('is-done', i < n); });
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!fig.isConnected) return;
    if (!playing || !inView || !tabOn) return;
    timer = setTimeout(() => {
      if (!fig.isConnected) return;
      const next = (scene + 1) % SCENES.length;
      show(next, { reset: next === 0 });
      schedule();
    }, SCENES[scene].ms);
  };
  const setPlaying = (p) => {
    playing = p;
    fig.classList.toggle('is-paused', !p);
    play.textContent = p ? 'Pause' : 'Play';
    play.setAttribute('aria-label', p ? 'Pause the animation' : 'Play the animation');
    schedule();
  };
  play.addEventListener('click', () => setPlaying(!playing));
  stepBtns.forEach((b, i) => b.addEventListener('click', () => { show(i, { reset: true }); schedule(); }));
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; schedule(); }).observe(fig);
  document.addEventListener('visibilitychange', () => { tabOn = !document.hidden; schedule(); });

  // start a frame later so scene 1's entrance animates in from the hidden state
  requestAnimationFrame(() => requestAnimationFrame(() => { show(reduce ? 2 : 0); setPlaying(playing); }));
}
