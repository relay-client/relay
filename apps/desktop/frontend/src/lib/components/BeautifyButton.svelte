<script lang="ts">
  let {
    onbeautify,
    beautified = false,
    disabled = false,
    title = 'Beautify',
  }: {
    onbeautify: () => void | boolean | Promise<unknown>;
    beautified?: boolean;
    disabled?: boolean;
    title?: string;
  } = $props();
</script>

<button
  class="beautify-btn"
  class:feedback-ok={beautified}
  type="button"
  {title}
  {disabled}
  onclick={() => onbeautify()}
>
  {#if beautified}
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6l2.3 2.3L10 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Beautified
  {:else}
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M1 3h4M1 6h7M1 9h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M9 4l2 2-2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Beautify
  {/if}
</button>

<style>
  .beautify-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: 0 0 auto;
    height: 26px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: transparent;
    color: var(--text-2);
    font-size: 11px;
    white-space: nowrap;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .beautify-btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--text);
    background: var(--accent-dim);
  }
  .beautify-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    pointer-events: none;
  }
  .beautify-btn.feedback-ok {
    border-color: rgba(74, 222, 128, 0.5);
    background: rgba(74, 222, 128, 0.12);
    color: var(--s2xx);
  }
</style>
