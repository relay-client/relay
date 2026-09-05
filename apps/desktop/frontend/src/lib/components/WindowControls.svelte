<script lang="ts">
  import { onMount } from 'svelte';

  let maximised = $state(false);

  async function refreshMaximised() {
    try {
      maximised = !!(await window.runtime?.WindowIsMaximised?.());
    } catch {
    }
  }

  function minimise() {
    void window.runtime?.WindowMinimise?.();
  }

  function toggleMaximise() {
    void window.runtime?.WindowToggleMaximise?.();
    setTimeout(refreshMaximised, 60);
  }

  function requestClose() {
    void window.runtime?.Quit?.();
  }

  onMount(() => {
    refreshMaximised();
    const onResize = () => refreshMaximised();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });
</script>

<div class="win-controls">
  <button class="win-control win-min" type="button" onclick={minimise} aria-label="Minimize" title="Minimize">
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <path d="M2 5.5h7" stroke="currentColor" stroke-width="1" />
    </svg>
  </button>
  <button
    class="win-control win-max"
    type="button"
    onclick={toggleMaximise}
    aria-label={maximised ? 'Restore' : 'Maximize'}
    title={maximised ? 'Restore' : 'Maximize'}
  >
    {#if maximised}
      <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
        <rect x="2" y="3" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1" />
        <path d="M4 3V1.5h5.5V7H8" fill="none" stroke="currentColor" stroke-width="1" />
      </svg>
    {:else}
      <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
        <rect x="2" y="2" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1" />
      </svg>
    {/if}
  </button>
  <button class="win-control win-close" type="button" onclick={requestClose} aria-label="Close" title="Close">
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <path d="M2.5 2.5l6 6M8.5 2.5l-6 6" stroke="currentColor" stroke-width="1" />
    </svg>
  </button>
</div>
