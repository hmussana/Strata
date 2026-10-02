// Explorable: retrieval for RAG. Documents are cut into chunks of whole sentences up to a word limit, each chunk is scored against the
// question, and the top k are pasted into the prompt. The score is TF-IDF word overlap, a stand-in for real embeddings.
import { esc } from '../ui.js';

const STOP = new Set('a an and are as at be by can do does for from how i in is it of on or the to what when where which who will with you your'.split(' '));
export const terms = (s) => (s.toLowerCase().match(/[a-z0-9£:]+/g) || [])
  .map((w) => w.replace(/:$/, '')).filter((w) => w && !STOP.has(w)).map((w) => w.replace(/(?<=[a-z]{3})s$/, ''));

// Chunks are whole sentences packed up to `size` words; a sentence longer than that is cut into `size`-word pieces.
export function chunk(docs, size) {
  return docs.flatMap((d, di) => {
    const out = [];
    let cur = [];
    const push = () => { if (cur.length) out.push({ doc: di, title: d.title, part: out.length + 1, text: cur.join(' ') }); cur = []; };
    for (const sent of d.text.match(/[^.!?]+[.!?]*/g) || []) {
      const w = sent.split(/\s+/).filter(Boolean);
      if (cur.length + w.length > size) push();
      for (let i = 0; i < w.length; i += size) { if (i) push(); cur.push(...w.slice(i, i + size)); }
    }
    push();
    return out;
  });
}

// score = Σ over question terms found in the chunk of (1 + ln count) × ln(N ÷ chunks containing the term), N = chunk count
export function rank(chunks, question) {
  const q = [...new Set(terms(question))], bags = chunks.map((c) => terms(c.text)), N = chunks.length;
  const idf = new Map(q.map((t) => [t, Math.log(N / (bags.filter((b) => b.includes(t)).length || N))]));
  return chunks.map((c, i) => {
    const hits = q.filter((t) => bags[i].includes(t));
    const score = hits.reduce((a, t) => a + (1 + Math.log(bags[i].filter((w) => w === t).length)) * idf.get(t), 0);
    return { ...c, hits, score };
  }).sort((a, b) => b.score - a.score || a.doc - b.doc || a.part - b.part);
}

export function mount(el, cfg) {
  const docs = cfg.docs || [], qs = cfg.questions || [];
  const init = { q: qs[0]?.q || '', ans: qs[0]?.answer || '', size: cfg.chunkSize || 20, k: cfg.topK || 2 };
  const st = { ...init };
  const SHOW = 8;

  el.innerHTML = `<div class="xp xt">
    <label class="xt-q"><span class="label">Question</span> <input type="text" data-ctl="q" autocomplete="off"></label>
    <div class="xp-k" role="group" aria-label="Example questions">
      <span class="label">Or pick</span>
      ${qs.map((q, i) => `<button type="button" data-q="${i}" aria-pressed="false">${esc(q.label || q.q)}</button>`).join('')}
    </div>
    <div class="xp-controls">
      <label class="xp-slider">Chunk size (words) <input type="range" min="10" max="60" step="5" data-ctl="size"> <output data-out="size"></output></label>
      <label class="xp-slider">Top k <input type="range" min="1" max="5" step="1" data-ctl="k"> <output data-out="k"></output></label>
      <button type="button" class="btn-ghost" data-act="reset">Reset</button>
    </div>
    <p class="xp-formula">score = Σ (1 + ln count) × ln(chunks ÷ chunks with the word), over question words in the chunk. <span class="muted small">Word overlap weighted by rarity (TF-IDF): a simple stand-in for real embeddings, which match meaning, not just words.</span></p>
    <div class="tbl-wrap"><table class="xp-table xt-table">
      <caption class="small muted xt-cap"></caption>
      <thead><tr><th scope="col">Rank</th><th scope="col">Chunk</th><th scope="col" class="num">Score</th></tr></thead>
      <tbody></tbody>
    </table></div>
    <p class="xt-verdict" aria-live="polite"></p>
    <figure class="code-fig"><figcaption>Exactly what the model is given</figcaption><pre class="code xt-prompt"><code></code></pre></figure>
    <p class="small muted">${esc(cfg.note || '')}</p>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const mark = (text, hits) => text.split(/(\s+)/).map((w) => (terms(w).some((t) => hits.includes(t)) ? `<mark>${esc(w)}</mark>` : esc(w))).join('');

  function render() {
    if ($('[data-ctl="q"]').value !== st.q) $('[data-ctl="q"]').value = st.q;
    $('[data-ctl="size"]').value = st.size; $('[data-ctl="k"]').value = st.k;
    $('[data-out="size"]').textContent = st.size; $('[data-out="k"]').textContent = st.k;
    el.querySelectorAll('[data-q]').forEach((b) => b.setAttribute('aria-pressed', String(qs[b.dataset.q].q === st.q)));
    const chunks = chunk(docs, st.size), ranked = rank(chunks, st.q);
    const picked = ranked.slice(0, st.k).filter((c) => c.score > 0);
    $('.xt-cap').textContent = `${chunks.length} chunks (whole sentences, packed up to ${st.size} words); top ${Math.min(SHOW, ranked.length)} shown. Highlighted rows go to the model (chunks scoring 0 never do).`;
    $('tbody').innerHTML = ranked.slice(0, SHOW).map((c, i) => `<tr class="${picked.includes(c) ? 'xt-in' : 'xt-out'}"><th scope="row">${i + 1}${picked.includes(c) ? ' <span class="sr-only">(sent to the model)</span>' : ''}</th>
      <td><span class="small muted">${esc(c.title)}, part ${c.part}</span><br>${mark(c.text, c.hits)}</td><td class="num">${c.score.toFixed(2)}</td></tr>`).join('');
    const context = picked.map((c, i) => `[${i + 1}] (${c.title}) ${c.text}`).join('\n') || '(nothing retrieved)';
    $('.xt-prompt code').textContent = `Answer using only the context below. If the answer is not there, say you don't know.\n\nContext:\n${context}\n\nQuestion: ${st.q}`;
    const has = st.ans && picked.some((c) => c.text.includes(st.ans));
    $('.xt-verdict').textContent = st.ans
      ? (has ? `The answer ("${st.ans}") is in the context, so the model can use it.` : `The answer ("${st.ans}") is not in the context. However good the model, it cannot answer from what it was given.`)
      : `${picked.length} chunk${picked.length === 1 ? '' : 's'} sent to the model.`;
  }

  el.addEventListener('input', (e) => {
    const k = e.target.dataset.ctl;
    if (!k) return;
    if (k === 'q') { st.q = e.target.value; st.ans = (qs.find((q) => q.q === st.q) || {}).answer || ''; } else st[k] = Number(e.target.value);
    render();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.q !== undefined) { st.q = qs[b.dataset.q].q; st.ans = qs[b.dataset.q].answer || ''; }
    if (b.dataset.act === 'reset') Object.assign(st, init);
    render();
  });
  render();
}
