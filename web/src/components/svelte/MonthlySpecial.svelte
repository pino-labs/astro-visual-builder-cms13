<script lang="ts">
  import type { ContentProps } from '@optimizely/cms-sdk';
  import { getPreviewUtils } from '@optimizely/cms-sdk/core';
  import type { MonthlySpecialContentType } from '@/lib/contentTypes';

  let { content }: { content: ContentProps<typeof MonthlySpecialContentType> } = $props();
  const { pa } = $derived(getPreviewUtils(content));
  const until = $derived(content.validUntil ? new Date(content.validUntil).toLocaleDateString('en-GB') : null);
</script>

<aside class="monthly-special">
  <h3 {...pa('title')}>{content.title}</h3>
  {#if content.price != null}<p class="price" {...pa('price')}>€{content.price.toFixed(2)}</p>{/if}
  {#if until}<p class="until" {...pa('validUntil')}>Until {until}</p>{/if}
</aside>
