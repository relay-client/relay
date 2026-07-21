<script lang="ts">
  import { onMount } from 'svelte';

  // Custom Windows window controls. Only rendered/visible on the frameless
  // Windows build (CSS gates visibility on data-platform="windows"). On macOS
  // and Linux the native frame provides these, so this stays hidden.
  let maximised = $state(false);

  async function refreshMaximised() {
    try {
      maximised = !!(await window.runtime?.WindowIsMaximised?.());
    } catch {
      /* runtime not available (browser/dev) — ignore */
    }
  }

  function minimise() {
    void window.runtime?.WindowMinimise?.();
  }

  function toggleMaximise() {
    void window.runtime?.WindowToggleMaximise?.();
    // The maximise toggle is async; re-read shortly after so the icon matches.
    setTimeout(refreshMaximised, 60);
  }

  function requestClose() {
    // Mirror the native close button: go through Quit so the backend's
    // BeforeClose hook runs (unsaved-draft review via relay:before-quit).
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
