import { config, getClient, initContentTypeRegistry, initDisplayTemplateRegistry } from '@optimizely/cms-sdk';
import { OPTIMIZELY_GRAPH_SINGLE_KEY, OPTIMIZELY_GRAPH_GATEWAY, OPTIMIZELY_APPLICATION_HOST } from 'astro:env/server';
import * as types from './contentTypes';

let initialized = false;

export function initOptimizely() {
  if (initialized) return;

  config({
    apiKey: OPTIMIZELY_GRAPH_SINGLE_KEY,
    graphUrl: OPTIMIZELY_GRAPH_GATEWAY, // a URL with no path gets /content/v2 appended
    platform: 'paas', // CMS 13 PaaS; the SDK does not detect the product. Needs SDK >= 3.1.0-beta.0.
    fragment: { richTextFormat: 'both' }, // 3.x fetches json only by default
    // Path lookups also match _metadata.url.base. Without it every application on the CMS answers for
    // the same path, and the first hit may be another site's start page. The value is the Headless
    // application's primary host as Graph stores it, scheme included (https://localhost:3001).
    ...(OPTIMIZELY_APPLICATION_HOST ? { query: { host: OPTIMIZELY_APPLICATION_HOST } } : {}),
  });

  initContentTypeRegistry([
    types.LandingExperienceContentType,
    types.ArticlePageContentType,
    types.BlankSectionContentType,
    types.HeroContentType,
    types.TileContentType,
    types.CallToActionContentType,
    types.FAQContentType,
    types.FaqItemContentType,
    types.MonthlySpecialContentType,
    types.SpotlightContentType,
  ]);
  initDisplayTemplateRegistry([
    types.TileRowDisplayTemplate,
    types.TileColumnDisplayTemplate,
    types.SquareDisplayTemplate,
  ]);

  initialized = true;
}

export { getClient };
