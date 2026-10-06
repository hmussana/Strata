// Expertise check: questions drawn only from each concept's D2 "Predict first" card (retrieval practice with
// immediate, explained feedback). Whole stack: 10 questions, at most 2 per layer. One layer: all its questions.
// One question at a time; Check reveals right/wrong, the explanation and a link to the concept at D2.
import { icon } from '../icons.js';
import { href } from '../router.js';
import { quizBest } from '../store.js';
import { esc, lclass, lnum } from '../ui.js';

const STACK = 'stack';
const STACK_SIZE = 10;
const PER_LAYER = 2;

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const validPredict = (p) => p && typeof p.question === 'string' && Array.isArray(p.options) && p.options.length >= 2
  && Number.isInteger(p.answer) && p.answer >= 0 && p.answer < p.options.length;

// every concept in a layer that has a usable D2 predict card, in content order
export function layerQuestions(c, layerId) {
  const l = c.layerById.get(layerId);
  if (!l) return [];
  return l.concepts.map((id) => c.conceptById.get(id)).filter((k) => validPredict(k?.depths?.D2?.predict))
    .map((k) => ({ concept: k, layer: l, predict: k.depths.D2.predict }));
}

const stackCount = (c) => Math.min(STACK_SIZE, c.layers.reduce((n, l) => n + Math.min(PER_LAYER, layerQuestions(c, l.id).length), 0));
const countFor = (c, scope) => (scope === STACK ? stackCount(c) : layerQuestions(c, scope).length);

function draw(c, scope) {
  if (scope !== STACK) return shuffle(layerQuestions(c, scope));
  const perLayer = new Map();
  const picked = [];
  for (const q of shuffle(c.layers.flatMap((l) => layerQuestions(c, l.id)))) {
    const n = perLayer.get(q.layer.id) || 0;
    if (n >= PER_LAYER) continue;
    perLayer.set(q.layer.id, n + 1);
    picked.push(q);
    if (picked.length === STACK_SIZE) break;
  }
  return picked;
}

// options shuffled per question; `answer` follows the correct option to its new position
const prepare = (q) => {
  const order = shuffle(q.predict.options.map((_, i) => i));
  return { ...q, order, answer: order.indexOf(q.predict.answer) };
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const bestText = (b) => (b ? `Best: ${b.score} of ${b.total}` : 'Not tried yet');
const scopeName = (c, scope) => (scope === STACK ? 'Whole stack' : c.layerById.get(scope).name);

export function quiz(route, c) {
  const focusLayer = route.id ? c.layerById.get(route.id) : null;
  if (route.id && !focusLayer) return null;
  const crumbs = [{ label: 'Landscape', href: href.landscape(focusLayer?.id), z: 'Z0' }];
  if (focusLayer) crumbs.push({ label: focusLayer.name, href: href.layer(focusLayer.id), z: 'Z2' });
  crumbs.push({ label: 'Check what you know' });

  return {
    zoom: null, layer: focusLayer?.id || null, title: focusLayer ? `Check what you know: ${focusLayer.name}` : 'Check what you know',
    crumbs,
    html: `<header class="view-head">
        <p class="eyebrow">${icon('target', 'ico-s')} Expertise check</p>
        <h1>Check what you know</h1>
        <p class="lede">Every question comes from a concept's “Predict first” card at depth D2. Answer, check, and see why; at the end you get a list of concepts worth revisiting.</p>
      </header>
      <div class="qz" data-qz></div>
      <div class="sr-only" aria-live="polite" data-qz-live></div>`,
    mount: (root) => mountQuiz(root, c, focusLayer ? focusLayer.id : STACK),
  };
}

function mountQuiz(root, c, initialScope) {
  const stage = root.querySelector('[data-qz]');
  const live = root.querySelector('[data-qz-live]');
  let scope = initialScope;
  let questions = [];
  let i = 0;
  let results = []; // { q, right }

  const say = (text) => { live.textContent = ''; requestAnimationFrame(() => { live.textContent = text; }); };
  const focusHead = () => stage.querySelector('[data-qz-head]')?.focus();

  // ---------- start: one featured scope with a Start button, then every other scope ----------
  function showStart(featured = initialScope) {
    const scopes = [STACK, ...c.topDown.map((l) => l.id)].filter((s) => countFor(c, s) > 0);
    const option = (s) => {
      const l = s === STACK ? null : c.layerById.get(s);
      const n = countFor(c, s);
      return `<li><button type="button" class="qz-scope ${l ? lclass(l) : 'c-cc'}" data-scope="${esc(s)}">
          <span class="qz-scope-name">${l ? lnum(l) : `<span class="qz-all" aria-hidden="true">${icon('layers', 'ico-s')}</span>`}<span>${esc(scopeName(c, s))}</span></span>
          <span class="qz-scope-meta small muted">${plural(n, 'question')} · ${esc(bestText(quizBest.get(s)))}</span>
        </button></li>`;
    };
    const fl = featured === STACK ? null : c.layerById.get(featured);
    const fn = countFor(c, featured);
    stage.innerHTML = `<section class="qz-card qz-featured ${fl ? lclass(fl) : 'c-cc'}" aria-labelledby="qz-start-h">
        <h2 id="qz-start-h" class="qz-title">${fl ? `${lnum(fl)} ${esc(fl.name)}` : `${icon('layers', 'ico-s')} Whole stack`}</h2>
        <p>${fl ? `All ${plural(fn, 'question')} from this layer's concepts.` : `${plural(fn, 'question')} picked at random from all ${c.layers.length} layers, at most ${PER_LAYER} from each.`}</p>
        <p class="small muted">${esc(bestText(quizBest.get(featured)))}</p>
        <div class="qz-actions"><button type="button" class="btn" data-scope="${esc(featured)}">Start · ${plural(fn, 'question')}</button></div>
      </section>
      <h2 class="section-title">Or choose another</h2>
      <ul class="qz-scopes">${scopes.filter((s) => s !== featured).map(option).join('')}</ul>`;
    stage.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => begin(b.dataset.scope)));
  }

  function begin(s) {
    scope = s;
    questions = draw(c, scope).map(prepare);
    i = 0;
    results = [];
    showQuestion();
    focusHead();
  }

  // ---------- one question ----------
  function showQuestion() {
    const q = questions[i];
    const name = `qz-${i}`;
    const opts = q.order.map((orig, pos) => `<label class="qz-opt" data-pos="${pos}">
        <input type="radio" name="${name}" value="${pos}"><span class="qz-opt-text">${esc(q.predict.options[orig])}</span><span class="qz-mark"></span>
      </label>`).join('');
    stage.innerHTML = `<section class="qz-card ${lclass(q.layer)}" aria-labelledby="qz-head">
        <div class="qz-top">
          <h2 class="qz-count" id="qz-head" tabindex="-1" data-qz-head>Question ${i + 1} of ${questions.length}</h2>
          <span class="qz-where small">${lnum(q.layer)} ${esc(q.layer.name)}</span>
        </div>
        <progress class="qz-progress" max="${questions.length}" value="${i}" aria-label="Progress: ${i} of ${questions.length} answered"></progress>
        <form class="qz-form" novalidate>
          <fieldset class="qz-fs">
            <legend class="qz-q">${esc(q.predict.question)}</legend>
            <div class="qz-opts">${opts}</div>
          </fieldset>
          <p class="qz-hint small" data-qz-hint hidden>Choose an answer first.</p>
          <div class="qz-actions"><button type="submit" class="btn" data-qz-check>Check</button></div>
        </form>
        <div class="qz-feedback" data-qz-feedback hidden></div>
      </section>`;
    const form = stage.querySelector('.qz-form');
    form.addEventListener('change', () => { stage.querySelector('[data-qz-hint]').hidden = true; });
    form.addEventListener('submit', (e) => { e.preventDefault(); check(form); });
  }

  function check(form) {
    const q = questions[i];
    const picked = form.querySelector('input:checked');
    const hint = stage.querySelector('[data-qz-hint]');
    if (!picked) {
      hint.hidden = false;
      say('Choose an answer first.');
      form.querySelector('input')?.focus();
      return;
    }
    if (results.length > i) return; // already checked
    const choice = Number(picked.value);
    const right = choice === q.answer;
    results.push({ q, right });

    form.querySelector('.qz-fs').disabled = true;
    form.querySelector('.qz-actions').hidden = true;
    form.querySelectorAll('.qz-opt').forEach((lab) => {
      const pos = Number(lab.dataset.pos);
      const mark = lab.querySelector('.qz-mark');
      if (pos === q.answer) { lab.classList.add('is-correct'); mark.textContent = pos === choice ? '✓ Your answer, correct' : '✓ Correct answer'; }
      else if (pos === choice) { lab.classList.add('is-wrong'); mark.textContent = '✗ Your answer'; }
    });
    const last = i === questions.length - 1;
    const correctText = q.predict.options[q.predict.answer];
    const fb = stage.querySelector('[data-qz-feedback]');
    fb.className = `qz-feedback ${right ? 'is-right' : 'is-wrong'}`;
    fb.innerHTML = `<p class="qz-verdict"><span aria-hidden="true">${right ? '✓' : '✗'}</span> ${right ? 'Correct.' : 'Not quite.'}</p>
      ${right ? '' : `<p><strong>The answer:</strong> ${esc(correctText)}</p>`}
      <p>${esc(q.predict.explanation)}</p>
      <p><a href="${href.concept(q.concept.id, 2)}">Read about ${esc(q.concept.name)} (D2) ${icon('zoom', 'ico-s')}</a></p>
      <div class="qz-actions"><button type="button" class="btn" data-qz-next>${last ? 'See your score' : 'Next question'}</button></div>`;
    fb.hidden = false;
    stage.querySelector('.qz-progress').value = i + 1;
    say(`${right ? 'Correct.' : `Not quite. The answer is: ${correctText}.`} ${q.predict.explanation}`);
    const next = fb.querySelector('[data-qz-next]');
    next.addEventListener('click', () => {
      i += 1;
      if (i < questions.length) showQuestion(); else showEnd();
      focusHead();
    });
    next.focus();
  }

  // ---------- end ----------
  function showEnd() {
    const score = results.filter((r) => r.right).length;
    const total = results.length;
    const prev = quizBest.get(scope);
    const isNew = quizBest.record(scope, score, total);
    const best = isNew ? { score, total } : prev;

    const byLayer = c.topDown.map((l) => {
      const rs = results.filter((r) => r.q.layer.id === l.id);
      return rs.length ? { l, right: rs.filter((r) => r.right).length, n: rs.length } : null;
    }).filter(Boolean);
    const breakdown = byLayer.length > 1 ? `<h3 class="section-title">By layer</h3>
      <ul class="qz-breakdown">${byLayer.map(({ l, right, n }) => `<li class="${lclass(l)}">
        <a href="${href.layer(l.id)}">${lnum(l)} ${esc(l.name)}</a><span class="qz-frac">${right} of ${n}</span></li>`).join('')}</ul>` : '';
    const wrong = results.filter((r) => !r.right);
    const revisit = wrong.length
      ? `<h3 class="section-title">Worth revisiting</h3>
        <ul class="qz-revisit">${wrong.map(({ q }) => `<li><a class="${lclass(q.layer)}" href="${href.concept(q.concept.id, 2)}">
          ${lnum(q.layer)}<span><strong>${esc(q.concept.name)}</strong><span class="small muted"> · read at D2</span></span></a></li>`).join('')}</ul>`
      : '<p>Nothing to revisit: every answer was right.</p>';

    stage.innerHTML = `<section class="qz-card qz-end ${scope === STACK ? 'c-cc' : lclass(c.layerById.get(scope))}" aria-labelledby="qz-head">
        <p class="eyebrow">${esc(scopeName(c, scope))}</p>
        <h2 class="qz-score" id="qz-head" tabindex="-1" data-qz-head>You got ${score} of ${total}</h2>
        <p class="muted">${isNew && prev ? 'A new best for this quiz.' : isNew ? 'Your first score for this quiz.' : esc(bestText(best))}</p>
        ${breakdown}
        ${revisit}
        <div class="qz-actions">
          <button type="button" class="btn" data-qz-again>Try again</button>
          <button type="button" class="btn-ghost" data-qz-other>Choose another quiz</button>
        </div>
      </section>`;
    stage.querySelector('[data-qz-again]').addEventListener('click', () => begin(scope));
    stage.querySelector('[data-qz-other]').addEventListener('click', () => {
      showStart(scope);
      stage.querySelector('#qz-start-h').setAttribute('tabindex', '-1');
      stage.querySelector('#qz-start-h').focus();
    });
  }

  showStart();
}
