// Loads the structured content (site/content) and builds lookup indexes. Content is data only:
// components never hard-code layers, concepts or relationships.
const BASE = '../content/';

async function get(path) {
  const res = await fetch(BASE + path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export async function loadContent() {
  const model = await get('model.json');
  const [layers, rel, cc, flows, dashboard] = await Promise.all([
    Promise.all(model.layers.map((id) => get(`layers/${id}.json`))),
    get('relationships.json'), get('crosscutting.json'), get('flows.json'), get('dashboard.json'),
  ]);
  const concepts = await Promise.all(layers.flatMap((l) => l.concepts).map((id) => get(`concepts/${id}.json`)));
  // measured signals from the news pipeline; optional, the site works without them
  const news = await fetch('../data/news.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  const layerById = new Map(layers.map((l) => [l.id, l]));
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const relationships = rel.relationships;
  return {
    model, layers, concepts, relationships, crosscutting: cc.crosscutting, flows, dashboard, news,
    layerById, conceptById,
    // layers ordered top (9) to bottom (1), the way a stack is read
    topDown: [...layers].sort((a, b) => b.order - a.order),
    relsOf: (id) => relationships.filter((r) => r.from === id || r.to === id),
    layerOf: (conceptId) => layerById.get(conceptById.get(conceptId)?.layer),
  };
}
