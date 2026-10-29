# Visual Builder without Next.js: Astro on Optimizely CMS 13 PaaS

Code for *Visual Builder without Next.js, part 1: what Astro has to rebuild on CMS 13 PaaS*.

- `web/` – Astro 7 site: Visual Builder rendering, live preview, ISR cache and Graph webhook, checks
- `cms/OauthClientAccessInitialization.cs` – the one CMS-side module (see `web/docs/cms13-setup.md`)

## Versions

| Package | Version |
| --- | --- |
| Node.js | `^22.23.4 \|\| ^24.0.0` |
| `astro` | 7.4.2 |
| `@optimizely/cms-sdk`, `@optimizely/cms-cli` | 3.1.0-beta.0 (exact) |
| Optimizely CMS | 13.4.2 or later, with Optimizely Graph |

## Run locally against the Graph mock

```bash
cd web
npm ci
npx astro check && npm run build && npm test
node test/mock-graph.mjs &
(set -a; . test/env.sh; exec node ./dist/server/entry.mjs) &
npm run checks
```

## Run against CMS 13

1. Set up the CMS as described in `web/docs/cms13-setup.md`.
2. Copy `web/.env.template` to `web/.env` and fill it in.
3. `npm run opti-push`, then `npm run dev` (https://localhost:3001).

Checks against real content, on the built server (`npm run build`, `node --env-file=.env ./dist/server/entry.mjs`):

- `test/checks.sh` with `BASE`, `KEY`, `ARTICLE`, `DOC`, `CMS_ORIGIN`, and for checks 3 and 5 `TOKEN`,
  `PREVIEW_QS` and `DRAFT_TEXT`; `SKIP="7 8"`
- `test/real-checks-7-8.mjs` with `CONTENT_KEY` and `ARTICLE`; the OAuth client needs Edit and Publish on that page

A preview token comes from `GET /_cms/v1/content/{key}/versions/{version}/previews`.

## Licence

Apache License 2.0. See `LICENSE` and `NOTICE`.
