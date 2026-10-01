// Registry of interactive components referenced by content (depth.interactive). The validator checks ids against it.
export const EXPLORABLES = {
  'sampling-play': () => import('./sampling.js').then((m) => (el, cfg) => m.mount(el, cfg, 'play')),
  'sampling-workbench': () => import('./sampling.js').then((m) => (el, cfg) => m.mount(el, cfg, 'workbench')),
};
