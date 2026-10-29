import { ComponentRegistry } from '@optimizely/cms-sdk/core';
import LandingExperience from '@/components/LandingExperience.astro';
import ArticlePage from '@/components/ArticlePage.astro';
import BlankSection from '@/components/BlankSection.astro';
import Hero from '@/components/react/Hero';
import Tile, { SquareTile } from '@/components/react/Tile';
import CallToAction from '@/components/react/CallToAction';
import MonthlySpecial from '@/components/svelte/MonthlySpecial.svelte';
import FAQIsland from '@/components/islands/FAQIsland.astro';
import Spotlight from '@/components/Spotlight.astro';

// One registry for .astro, React and Svelte components. Everything renders on the server;
// the only client JavaScript comes from the wrappers in src/components/islands/.
export const registry = new ComponentRegistry({
  LandingExperience,
  ArticlePage,
  BlankSection,
  Hero,
  Tile: { default: Tile, tags: { Square: SquareTile } },
  CallToAction,
  MonthlySpecial,
  FAQ: FAQIsland,
  Spotlight,
});
