<script lang="ts">
  type Item = { question: string; answerHtml: string };
  let { heading, items }: { heading?: string | null; items: Item[] } = $props();
  let open = $state<number | null>(null);
</script>

<section class="faq">
  {#if heading}<h2>{heading}</h2>{/if}
  {#each items as item, i (i)}
    <h3>
      <button type="button" aria-expanded={open === i} aria-controls={`faq-${i}`} onclick={() => (open = open === i ? null : i)}>
        {item.question}
      </button>
    </h3>
    <div id={`faq-${i}`} hidden={open !== i}>{@html item.answerHtml}</div>
  {/each}
</section>
