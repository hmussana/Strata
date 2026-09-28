// Hash routes work on GitHub Pages without server rewrites and keep every view deep-linkable.
//   #/                   Z0 landscape
//   #/stack?focus=<id>   Z1 stack (optionally highlighting a layer)
//   #/layer/<id>         Z2 inside a layer
//   #/concept/<id>?d=N   Z3 a concept at depth N
//   #/legend             visual grammar reference

const enc = encodeURIComponent;

export const href = {
  landscape: () => '#/',
  stack: (focus) => (focus ? `#/stack?focus=${enc(focus)}` : '#/stack'),
  layer: (id) => `#/layer/${enc(id)}`,
  concept: (id, depth) => `#/concept/${enc(id)}${depth ? `?d=${depth}` : ''}`,
  legend: () => '#/legend',
};

export function parse(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const [path, query] = raw.split('?');
  const params = new URLSearchParams(query || '');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return { view: 'landscape', params };
  if (parts[0] === 'stack') return { view: 'stack', params };
  if (parts[0] === 'layer' && parts[1]) return { view: 'layer', id: parts[1], params };
  if (parts[0] === 'concept' && parts[1]) return { view: 'concept', id: parts[1], params };
  if (parts[0] === 'legend') return { view: 'legend', params };
  return { view: 'notfound', params };
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function start(render) {
  let first = true;
  const go = () => {
    const route = parse(location.hash);
    const run = () => render(route);
    if (!first && document.startViewTransition && !reducedMotion()) document.startViewTransition(run);
    else run();
    first = false;
  };
  window.addEventListener('hashchange', go);
  go();
}
