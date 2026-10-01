<script lang="ts">
  import { shortcutComboLabel, shortcutKeycaps } from '../stores/features/preferences';

  let {
    combo,
    runtime = '',
    size = 'sm',
  }: {
    combo: string;
    runtime?: string;
    size?: 'sm' | 'md';
  } = $props();

  let keycaps = $derived(shortcutKeycaps(combo, runtime));
</script>

{#if keycaps.length}
  <span class="keycaps keycaps-{size}" role="img" aria-label={shortcutComboLabel(combo, runtime)}>
    {#each keycaps as keycap, index (index)}
      <kbd class="keycap" class:keycap-glyph={keycap.label.length === 1} title={keycap.title} aria-hidden="true">
        {#if keycap.icon === 'windows'}
          <svg class="keycap-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1 2.3 6.7 1.5v5.6H1zM7.5 1.4 15 .3v6.8H7.5zM1 7.9h5.7v5.6L1 12.7zM7.5 7.9H15v6.8l-7.5-1.1z" fill="currentColor"/>
          </svg>
        {:else}
          {keycap.label}
        {/if}
      </kbd>
    {/each}
  </span>
{/if}

<style>
  .keycaps {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    vertical-align: middle;
    white-space: nowrap;
  }

  .keycap {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--elevated) 70%, transparent);
    color: var(--text-2);
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0;
  }

  .keycap-glyph {
    font-size: 12.5px;
    font-weight: 500;
  }

  .keycaps-md .keycap {
    min-width: 24px;
    height: 24px;
    padding: 0 7px;
    font-size: 12px;
    color: var(--text);
  }

  .keycaps-md .keycap-glyph {
    font-size: 13.5px;
  }

  .keycap-icon {
    width: 10px;
    height: 10px;
  }

  .keycaps-md .keycap-icon {
    width: 12px;
    height: 12px;
  }
</style>
