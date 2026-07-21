<script lang="ts">
  import { onMount } from 'svelte';
  import { trapFocus } from '../a11y';
  import RequestTypeBadge from './RequestTypeBadge.svelte';
  import { shortcutComboLabel } from '../stores/features/preferences';
  import type { SavedRequest } from '../types/models';

  let {
    query = $bindable(''),
    results,
    activeRequestId,
    requestTabLabel,
    collectionLabel,
    appRuntime = '',
    onSwitchRequest,
    onClose,
  }: {
    query: string;
    results: SavedRequest[];
    activeRequestId: string;
    requestTabLabel: (request: SavedRequest) => string;
    collectionLabel: (request: SavedRequest) => string;
    appRuntime?: string;
    onSwitchRequest: (id: string) => void;
    onClose: () => void;
  } = $props();

  let input: HTMLInputElement;
  let searchShortcut = $derived(shortcutComboLabel('Meta+K', appRuntime));

  onMount(() => {
    setTimeout(() => input?.focus(), 0);
  });

  function openRequest(id: string) {
    onSwitchRequest(id);
    onClose();
  }

  function onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
    if (event.key === 'Enter' && results[0]) openRequest(results[0].id);
  }
</script>

<div class="global-search-backdrop" role="presentation" onmousedown={(event) => event.target === event.currentTarget && onClose()}>
  <div class="global-search-modal" role="dialog" aria-modal="true" aria-label="Search requests" tabindex="-1" use:trapFocus>
    <div class="global-search-input-wrap">
      <svg width="16" height="16" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        <circle cx="5.8" cy="5.8" r="3.8" stroke="currentColor" stroke-width="1.4"/>
        <path d="M8.7 8.7l2.7 2.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <input
        bind:value={query}
        bind:this={input}
        placeholder="Search requests by name, URL or method…"
        spellcheck="false"
        onkeydown={onInputKeydown}
        data-autofocus
      />
      <kbd>Esc</kbd>
    </div>
    <div class="global-search-results">
      {#each results as req}
        <button class="global-search-item" class:active={req.id === activeRequestId} type="button" onclick={() => openRequest(req.id)}>
          <RequestTypeBadge request={req} variant="search" />
          <div class="gsr-info">
            <span class="gsr-name">{requestTabLabel(req)}</span>
            {#if req.url}<span class="gsr-url">{req.url}</span>{/if}
          </div>
          <span class="gsr-collection">{collectionLabel(req)}</span>
        </button>
      {/each}
      {#if !results.length}
        <div class="global-search-empty">No requests found</div>
      {/if}
    </div>
    <div class="global-search-footer">
      <span><kbd>↵</kbd> open</span>
      <span><kbd>Esc</kbd> close</span>
      <span><kbd>{searchShortcut}</kbd> search</span>
    </div>
  </div>
</div>
