import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 4100);
const GOOD_TOKEN = 'good-token';
const state = { articleHeading: 'Published heading v1' };
export const log = [];

const img = (url) => ({ type: 'image', url, alt: 'inline', children: [{ text: '' }] });
const media = (path) => ({ url: { default: path, base: null } });
const meta = (key, types, url) => ({ key, types, displayName: key, locale: 'en', version: '1', url: { default: url, hierarchical: url, base: 'https://site.test' } });

function landing() {
  const tile = (key, title, extra = {}) => ({
    __typename: 'CompositionComponentNode', key, nodeType: 'component', type: 'Tile', displaySettings: [], displayTemplateKey: null,
    component: { __typename: 'Tile', _metadata: { types: ['Tile', '_Component'] }, title, description: `${title} description` }, ...extra,
  });
  return {
    __typename: 'LandingExperience',
    _metadata: meta('klanding', ['LandingExperience', '_Experience', '_Page', '_Content'], '/'),
    hero: { __typename: 'Hero', heading: 'Astro on CMS 13', summary: 'Hero summary', theme: 'dark', background: media('/globalassets/hero.jpg') },
    composition: {
      __typename: 'CompositionStructureNode', nodeType: 'experience', key: 'root',
      nodes: [
        {
          __typename: 'CompositionStructureNode', key: 's1', nodeType: 'section', type: 'BlankSection', displaySettings: [], displayTemplateKey: null, component: {},
          nodes: [{
            __typename: 'CompositionStructureNode', key: 'r1', nodeType: 'row', displayTemplateKey: 'TileRowDisplayTemplate', displaySettings: [{ key: 'padding', value: 'large' }],
            nodes: [
              { __typename: 'CompositionStructureNode', key: 'c1', nodeType: 'column', displayTemplateKey: 'TileColumnDisplayTemplate', displaySettings: [{ key: 'background', value: 'primary' }], nodes: [tile('e1', 'Plain tile')] },
              { __typename: 'CompositionStructureNode', key: 'c2', nodeType: 'column', displaySettings: [], nodes: [tile('e2', 'Square tile', { displayTemplateKey: 'SquareDisplayTemplate', displaySettings: [{ key: 'orientation', value: 'horizontal' }] })] },
              { __typename: 'CompositionStructureNode', key: 'c3', nodeType: 'column', displaySettings: [], nodes: [{
                __typename: 'CompositionComponentNode', key: 'e3', nodeType: 'component', type: 'CallToAction', displaySettings: [],
                component: { __typename: 'CallToAction', _metadata: { types: ['CallToAction', '_Component'] }, label: 'Read the article', variant: 'secondary', link: { url: { default: '/blog/hello/' } } } }] },
              { __typename: 'CompositionStructureNode', key: 'c4', nodeType: 'column', displaySettings: [], nodes: [{
                __typename: 'CompositionComponentNode', key: 'e4', nodeType: 'component', type: 'MonthlySpecial', displaySettings: [],
                component: { __typename: 'MonthlySpecial', _metadata: { types: ['MonthlySpecial', '_Component'] }, title: 'Svelte special', price: 12.5, validUntil: '2026-12-31T00:00:00Z' } }] },
            ],
          }],
        },
        {
          __typename: 'CompositionComponentNode', key: 'faq', nodeType: 'component', type: 'FAQ', displaySettings: [],
          component: { __typename: 'FAQ', _metadata: { types: ['FAQ', '_Component'] }, heading: 'Questions', items: [
            { __typename: 'FaqItem', question: 'Does it hydrate?', answer: { html: '<p>Only this block.</p>', json: null } },
            { __typename: 'FaqItem', question: 'Which framework?', answer: { html: '<p>Svelte.</p>', json: null } },
          ] },
        },
      ],
    },
  };
}

function article(draft) {
  const json = { type: 'richText', children: [
    { type: 'paragraph', children: [{ text: draft ? 'Draft body' : 'Published body' }] },
    img('/globalassets/inline.jpg'),
  ] };
  return {
    __typename: 'ArticlePage',
    _metadata: meta('karticle', ['ArticlePage', '_Page', '_Content'], '/blog/hello/'),
    heading: draft ? 'DRAFT heading' : state.articleHeading,
    publishedAt: '2026-10-28T10:00:00Z',
    cover: media('/globalassets/cover.jpg'),
    body: {
      html: '<p>Body</p>',
      json: draft ? json : JSON.stringify(json),
    },
  };
}

const byPath = { '/': landing, '/blog/hello/': () => article(false), '/blog/hello': () => article(false) };
const byKey = { klanding: landing, karticle: (draft) => article(draft) };

function find(vars) {
  const all = JSON.stringify(vars);
  const path = Object.values(byPath).length && Object.keys(byPath).find((p) => all.includes(`"${p}"`));
  const key = Object.keys(byKey).find((k) => all.includes(k));
  return { path, key };
}

const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (req.url?.startsWith('/__set')) {
    const u = new URL(req.url, 'http://x');
    state.articleHeading = u.searchParams.get('heading') ?? state.articleHeading;
    res.end('ok');
    return;
  }
  if (req.url?.startsWith('/__log')) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(log)); return; }
  const { query = '', variables = {} } = JSON.parse(body || '{}');
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  const op = /query\s+(\w+)/.exec(query)?.[1] ?? 'anonymous';
  log.push({ op, variables, bearer, url: req.url });
  if (bearer && bearer !== GOOD_TOKEN) { res.statusCode = 401; res.end(JSON.stringify({ errors: [{ message: 'invalid token' }] })); return; }
  const draft = bearer === GOOD_TOKEN;
  const { path, key } = find(variables);
  const make = path ? byPath[path] : key ? byKey[key] : null;
  const item = make ? make(draft) : null;
  let data;
  if (op === 'ResolveDocPath') {
    data = { _Content: { items: item ? [{ _metadata: { url: { default: item._metadata.url.default } } }] : [] } };
  } else if (/damAssetType|taxonomyType/.test(query)) {
    data = { _Content: { item: item ? { _metadata: { types: item._metadata.types } } : null, items: item ? [{ _metadata: { types: item._metadata.types } }] : [] }, damAssetType: null, taxonomyType: null };
  } else {
    data = { _Content: { item, items: item ? [item] : [] } };
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ data }));
});
server.listen(PORT, () => console.log(`[mock-graph] listening on ${PORT}`));
