# CMS 13 setup and implementation notes

The details behind part 1 of the article: the CMS-side setup, content-model rules, the changes the official
Astro sample needs, the versions this repository pins, and every problem that cost time. The code itself is in
`src/`; the cache, webhook and DXP notes are in part 2 of the article.

## 1. Prepare CMS 13

CMS 13 removes most of the setup that a CMS 12 headless project needed. Graph is a mandatory component, the CMS REST API is registered by `AddCms()`, and Visual Builder is the default editor. What is left are four things to set up; the first three are done once per environment.

**1. A Graph instance that carries the CMS 13 schema.** CMS 13 changed the Graph schema, so a CMS 12 site and a CMS 13 site cannot share one instance. On an upgrade, the **Prepare for CMS 13** option in the DXP Management Portal provisions the new instance; on a greenfield project, add one from the PaaS portal. Run **Optimizely Graph Full Synchronization** after the first deploy, then check that `cg.optimizely.com` answers a `_Content` query with your single key.

**2. An OAuth client for the CMS REST API.** The CLI (`config push` / `config pull`) authenticates with client credentials against `/_cms/v1/oauth/token`. On SaaS you create them under **Settings → API Keys**; on PaaS there is no UI for it – you define the client in `appsettings.json` under `Optimizely:Cms:Service:Oauth:Clients` (`ClientId` + `ClientSecret`), or on DXP as App Settings `Optimizely__Cms__Service__Oauth__Clients__0__ClientId` / `__ClientSecret`, which apply without a code deploy. `services.AddCmsCloudPlatformSupport()` must be in the CMS startup, because on DXP it supplies the token-signing certificate. These are *not* the Graph keys and *not* the DXP deploy keys: a project that does all three needs three credential pairs.

The client also needs access to content. Its token carries the client id and the `api:admin` scope, but no roles, and the PaaS token endpoint has no act-as. The scope is enough for content types, display templates and the application. `config push` also creates the application's start content under the root, though, and that is checked against the content ACL: on a root that grants Everyone only Read (Alloy's, for one), the push stops with a 403. Give the client Read and Create on the root, for example with the initialization module in `cms/OauthClientAccessInitialization.cs`, which adds an ACL entry for each configured `ClientId`.

**3. A Headless application.** The application maps hostnames to a start page and tells the CMS where preview lives. Let `config push` create it (section 2 below – the SDK's `type: 'website'` is what the UI calls **Headless**). Applications are created once and updated after that, so creating one by hand first and then pushing an `applications` entry with the same start page fails with *entry points cannot overlap*. What you verify in **Settings > Applications** afterwards: two hostnames (`localhost:3001` for development, the DXP front-end hostname once you have it), **Use Preview Tokens** on, and the default **Preview URL format**:

```text
{host}/preview?key={key}&ver={version}&loc={locale}&ctx={context}
```

The placeholders are `{version}`, `{locale}` and `{context}` – not `ver`, `loc`, `ctx` – and there is no token placeholder: with **Use Preview Tokens** on, the CMS appends `preview_token=` itself. The SDK's `getPreviewContent()` reads the resulting five query parameters, and the token is valid for five minutes.

If the CMS already serves a site, the Headless application is a second application on it, and two settings matter. Bind its host to a language (`locale: 'en'` on the host in `optimizely.config.mjs`), or CMS 13 serves the start page at `/en/` instead of `/`. And set `OPTIMIZELY_APPLICATION_HOST` to the application's primary host as Graph stores it, scheme included (`https://localhost:3001`): the site passes it to the SDK as `query.host`, and without it a path such as `/en/` matches every application's start page.

**4. Less in C# than you expect – but not nothing.** The CMS 13 REST API can create content types and display templates, and that is what the JavaScript CLI calls, so for an Astro-first site the Visual Builder model (experiences, sections, elements, display templates) can live in the frontend repository. Two caveats before you delete your `[ContentType]` classes. Optimizely's CMS 13 FAQ still describes .NET code as the typical source of truth for PaaS headless, with the SDK syncing types *to* the frontend, and calls full PaaS headless support an area of ongoing development – treat API-managed Visual Builder types on PaaS as supported but young. And the CMS project keeps a small amount of code regardless:

```csharp
// Startup.cs – the whole CMS-side footprint of this setup
services.AddCms();                      // CMS, REST API v1 and the OAuth token endpoint
services.AddContentGraph();             // Graph sync; gateway, app key and secret live in appsettings.json
services.AddCmsCloudPlatformSupport();  // DXP: token-signing certificate for the REST API
```

Plus the OAuth client from point 2 in `appsettings.json` and the version pin on `EPiServer.CMS.Core` (13.4.2 or later: 13.4.1, released on 26 October 2026, fixes a data-loss bug in culture-specific properties (CMS-57780), and the 13.4.2 database update, released the same day, restores the values that bug deleted; this repository is tested on 13.4.2 and 13.5.0). The frontend never calls anything else on the CMS at runtime.

## 2. Content model rules

Two details matter. Since SDK 3.0, `config push` rejects a `content` or `contentReference` property without a type constraint: a non-empty `allowedTypes` or `restrictedTypes`, or – on `contentReference` – `contentType`. The 3.1 beta types enforce the same rule, so the mistake fails in your editor before it fails the push. Without a constraint the query builder generates one fragment per registered type and throws above `fragment.maxThreshold` (100). And `compositionBehaviors` is what makes a component appear in Visual Builder: `sectionEnabled` lets it be used as a section, `elementEnabled` lets it be placed inside a column.

Display templates are what editors choose under **Style** on a row, a column or an element. Row and column templates carry abstract choices that the frontend maps to CSS; a template with a `tag` also changes which component renders:

```typescript
// src/lib/contentTypes/Tile.ts (excerpt)
import { contentType, displayTemplate } from '@optimizely/cms-sdk';

// …
export const TileRowDisplayTemplate = displayTemplate({
  key: 'TileRowDisplayTemplate',
  displayName: 'Row spacing',
  isDefault: true,
  nodeType: 'row',
  settings: {
    padding: {
      editor: 'select' as const,
      displayName: 'Padding',
      sortOrder: 0,
      choices: {
        small: { displayName: 'Small', sortOrder: 1 },
        medium: { displayName: 'Medium', sortOrder: 2 },
        large: { displayName: 'Large', sortOrder: 3 },
      },
    },
  },
});
// …
export const SquareDisplayTemplate = displayTemplate({
  key: 'SquareDisplayTemplate',
  displayName: 'Square',
  isDefault: false,
  contentType: 'Tile', // offered on Tile only; baseType: '_component' would offer "Square" on every element
  tag: 'Square',
  settings: {
    orientation: {
      editor: 'select' as const, // without `as const` the setting is typed `never` in ContentProps
      displayName: 'Orientation',
      sortOrder: 0,
      choices: {
        vertical: { displayName: 'Vertical', sortOrder: 1 },
        horizontal: { displayName: 'Horizontal', sortOrder: 2 },
      },
    },
  },
});
```

### Types that already exist in C#

On a greenfield site that is the whole story. On an upgraded CMS 12 site you have dozens of `[ContentType]` classes, and the CLI treats code-managed types as **read-only**: it will not overwrite them, and a push that tries fails with a clear message – after the CLI has printed ✔ *Configuration file uploaded*, because the CMS answers 200 with an `errors` list (measured on 13.5.0 with `StandardPage`; the exit code is non-zero). The direction is reversed for those types – pull them:

```bash
npx optimizely-cms-cli config pull --includeReadOnly
```

`config pull` writes one `contentType()` file per type. In a terminal it also offers to generate a `registry.ts` that registers every pulled type and display template; outside a terminal (CI, a redirected pipe) the 3.1.0-beta.0 CLI prints the manifest as JSON to stdout and writes no files, **even with `--output` and `--group`**, and still exits 0 (`shouldOutputJson = flags.json || !isInteractive` in `commands/config/pull.js`). Generate the files from a terminal; in CI, `--json > manifest.json` is enough to compare the model, not to regenerate it. The form for a terminal:

```bash
OPTIMIZELY_CMS_API_URL=https://<your-cms-edit-host> \
npx optimizely-cms-cli config pull --includeReadOnly --output ./src/lib/contentTypes/pulled --group
```

Two PaaS details hide in that line. The CLI does **not** read `OPTIMIZELY_CMS_URL` – that variable belongs to the preview route; it reads `OPTIMIZELY_CMS_API_URL` (or `--host`), treats anything that is not the SaaS gateway as a CMS instance and calls `<host>/_cms/v1`. Leave it unset and every push posts the client ID and secret to `api.cms.optimizely.com/oauth/token` and fails with *The client credentials are invalid* (measured with a dummy client). The CLI also loads `.env` from its working directory (`import 'dotenv/config'` in `bin/run.js`), so the variable in `web/.env` is enough when you run it from `web/`. And the generated files leave out the built-in `BlankExperience` and `BlankSection` types, which the SDK exports itself. The generated files are typed exactly like hand-written ones; `ContentProps<typeof ArticlePageContentType>` works the same whether the type came from C# or TypeScript.

## 3. Starting from the official Astro sample

Start from the official sample (`samples/astro-sample` in `episerver/content-js-sdk`) and copy it into your own repository; it is a private package in the monorepo, not an npm release. Then change five things before writing any code:

1. Replace the `workspace:*` dependencies with published versions (table below). The platform installs with npm or yarn and refuses `workspace:` specifiers.
2. Remove `export const prerender = true` and `getStaticPaths()` from `src/pages/[...slug].astro`. The sample prerenders up to 100 pages at build time, and a prerendered page can never be refreshed by a webhook.
3. Delete `src/pages/index.astro`. A static index outranks `[...slug]`, so `/` would never reach the CMS.
4. Delete `src/pages/svelte/`, which renders every CMS page a second time under `/svelte/`.
5. Add `src/pages/404.astro`, which Astro renders when an on-demand route returns a 404 `Response`.

| Package | Version used | Why it matters |
| --- | --- | --- |
| `@optimizely/cms-sdk`, `@optimizely/cms-cli` | `3.1.0-beta.0`, exact | first release with `/core` and `platform: 'paas'` |
| `astro` | `7.4.2` | Cache Provider API and `routeRules` (Part 2) |
| `@astrojs/node` | `11.1.9` | standalone Node server for DXP |
| `@astrojs/react`, `react`, `react-dom` | `7.1.1`, `19.3.1` | server rendering only (the sample pins `@astrojs/react` ^6) |
| `@astrojs/svelte`, `svelte` | `9.1.1`, `5.57.3` | one island |
| `engines.node` | `^22.23.4 \|\| ^24.0.0` | see below |

Node first, because it fails before anything else. Astro 7.4.2 declares `engines.node >=22.23.4`, and its CLI checks that range at startup and exits on an older Node. The sample's `^7.3.5` resolves to 7.4.2 today, so a build slot on Node 22.12 – the version Optimizely's deploy guide still names – stops before building. Set `"engines": { "node": "^22.23.4 || ^24.0.0" }` (DXP does not support odd-numbered releases) and confirm the runtime in the first deploy log. Staying on 22.12 means `astro ~7.3.5` and `@astrojs/react` ^6, because `@astrojs/react` 7.1.1 and `@astrojs/svelte` 9.1.1 declare `>=22.23.4` too; this repository does not test that combination. Astro 5 also deploys to DXP, but it has no Cache Provider API, so Part 2's cache would become middleware.

The SDK 3.0 migration guide lists five breaking changes, and each of them breaks a 2.x example:

| Change in 3.0 | Symptom when you copy 2.x code | Fix |
| --- | --- | --- |
| `config()` options moved into `fragment` and `query` | `maxFragmentThreshold`, `host`, `cache` silently ignored (TypeScript warns, JavaScript does not) | `fragment.maxThreshold`, `query.host`, `query.cache` |
| Rich text fetches `json` only by default | HTML-based rich text renders empty | `fragment: { richTextFormat: 'both' }`, or render the JSON tree |
| `config push` rejects unconstrained `content` / `contentReference` | push fails on a model that pushed on 2.x | `allowedTypes` or `restrictedTypes` |
| `'standard'` Rich Text preset removed | type error | `preset: 'default'` |
| `dam` no longer accepted per request | type error | `getClient({ fragment: { dam: 'on' } })` |

## 4. Problems and fixes (rendering, preview, CMS, CLI)

| Symptom | Cause | Fix |
| --- | --- | --- |
| `@optimizely/cms-sdk/core` does not resolve (`ERR_PACKAGE_PATH_NOT_EXPORTED`), or `platform` is not a known option | npm `latest` (3.0.2) has neither | `@optimizely/cms-sdk@3.1.0-beta.0` and the CLI at the same version, both exact |
| `config push`: *The client credentials are invalid* | the CLI ignores `OPTIMIZELY_CMS_URL` and sends the client credentials to `api.cms.optimizely.com` | `OPTIMIZELY_CMS_API_URL=https://<cms-edit-host>` or `--host` |
| Token endpoint returns 401 or 500 on DXP | no OAuth client, or no signing certificate | `Optimizely__Cms__Service__Oauth__Clients__0__ClientId/__ClientSecret` in App Settings, `AddCmsCloudPlatformSupport()` in startup |
| `config push` fails for types that exist in C# (*…can only be updated by modifying this model*, after ✔ *Configuration file uploaded*) | code-managed types (`source: "_server"`) are read-only through the REST API | `config pull --includeReadOnly --output … --group` from a terminal; keep `pulled/` out of `components` |
| `config push` fails with *entry points cannot overlap* | an application created by hand already owns the start page | let the CLI own the application, or drop `applications` from the config |
| Pages copied from the sample never update after a publish | the sample's `[...slug].astro` is prerendered | remove `prerender = true` and `getStaticPaths()` |
| A URL exists in the CMS but Astro returns 404; or `/` never resolves | page type not registered; or the sample's static `index.astro` outranks `[...slug]` | register the type (or pull it); delete `index.astro` |
| *Unable to render* with React and Svelte both installed | the sample's `OptimizelyComponent` is async, and neither renderer claims a Promise | resolve pages through the Astro-side registry (or keep the sample's synchronous `ContentPage` wrapper) |
| Public HTML carries `preview_token` in image URLs | no per-request SDK context | `MemoryAdapter(new AsyncLocalStorage())` plus `adapter.run(() => next())` in middleware |
| `config push` stops with 403 on the start content | the CLI's token has a scope but no roles, and content is checked against the ACL | Read and Create on the root for the OAuth client (section 1) |
| `/` is a 404, or renders an empty page | CMS 13 prefixes URLs with the language, and every application's start page matches the same path | `locale` on the application's host; `OPTIMIZELY_APPLICATION_HOST` for `query.host` |
| Images 404 on the site | Graph returns CMS media with a relative `url.default` and no `base` | `src/lib/media.ts` points `/globalassets`, `/siteassets` and `/contentassets` at the CMS origin (check 1d) |
| Rich-text images 404 on the site, some of the time | on its stored-query path (`?stored=true`, which the SDK sends) Graph returns rich text's `json` as a string, otherwise as an object, and its CDN serves whichever it cached | `src/lib/media.ts` parses a rich-text `json` string before rewriting its image URLs (check 1d; the mock sends the published article's `json` as a string) |
| Preview frame is blank | `http://` frame in the `https://` editor, hostname missing on the application, or CSP refusing the CMS as frame ancestor | `vite-plugin-mkcert`; add the hostname; `frame-ancestors <cms-origin>` |
| Preview shows 401 after a few idle minutes | the token lives five minutes | save in the editor (fresh token) or reload the pane |
