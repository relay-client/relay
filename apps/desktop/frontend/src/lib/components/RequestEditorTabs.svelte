<script lang="ts">
  import { tick } from 'svelte';
  import { tabListKeyboard } from '../a11y';
  import type { RequestType } from '../types/models';

  type RequestTab = 'docs' | 'params' | 'query' | 'auth' | 'headers' | 'metadata' | 'body' | 'schema' | 'service' | 'scripts' | 'settings' | 'events';
  type BadgeKind = 'default' | 'on' | 'script';
  type TabItem = {
    id: RequestTab;
    label: string;
    badge?: string;
    badgeKind?: BadgeKind;
  };

  let {
    requestTab = $bindable<RequestTab>('params'),
    requestType = 'http',
    paramsCount,
    authConfigured,
    headerCount,
    bodyHasContent,
    bodyBadgeLabel,
    scriptLineCount,
    listenEventCount = 0,
    metadataCount = 0,
    grpcMethodSelected = false,
  }: {
    requestTab: RequestTab;
    requestType?: RequestType;
    paramsCount: number;
    authConfigured: boolean;
    headerCount: number;
    bodyHasContent: boolean;
    bodyBadgeLabel: string;
    scriptLineCount: number;
    listenEventCount?: number;
    metadataCount?: number;
    grpcMethodSelected?: boolean;
  } = $props();

  let compactMenuOpen = $state(false);
  let compact = $state(false);
  let tabsShellEl = $state<HTMLDivElement>();
  let tabsEl = $state<HTMLDivElement>();

  function buildTabItems(): TabItem[] {
    const docs: TabItem = { id: 'docs', label: 'Docs' };
    const params: TabItem = { id: 'params', label: 'Params', badge: paramsCount > 0 ? String(paramsCount) : undefined };
    const auth: TabItem = { id: 'auth', label: 'Authorization', badge: authConfigured ? 'On' : undefined, badgeKind: 'on' };
    const headers: TabItem = { id: 'headers', label: 'Headers', badge: headerCount > 0 ? String(headerCount) : undefined };
    const scripts: TabItem = { id: 'scripts', label: 'Scripts', badge: scriptLineCount > 0 ? `${scriptLineCount}L` : undefined, badgeKind: 'script' };
    const settings: TabItem = { id: 'settings', label: 'Settings' };

    if (requestType === 'graphql') {
      return [
        docs,
        { id: 'query', label: 'Query', badge: bodyHasContent ? bodyBadgeLabel : undefined, badgeKind: 'on' },
        auth,
        headers,
        { id: 'schema', label: 'Schema' },
        scripts,
      ];
    }

    if (requestType === 'grpc') {
      return [
        docs,
        { id: 'body', label: 'Message', badge: bodyHasContent ? bodyBadgeLabel : undefined, badgeKind: 'on' },
        auth,
        { id: 'metadata', label: 'Metadata', badge: metadataCount > 0 ? String(metadataCount) : undefined },
        { id: 'service', label: 'Service definition', badge: grpcMethodSelected ? 'On' : undefined, badgeKind: 'on' },
        scripts,
        settings,
      ];
    }

    if (requestType === 'socketio') {
      return [
        docs,
        { id: 'body', label: 'Message', badge: bodyHasContent ? bodyBadgeLabel : undefined, badgeKind: 'on' },
        { id: 'events', label: 'Events', badge: listenEventCount > 0 ? String(listenEventCount) : undefined, badgeKind: 'on' },
        params,
        headers,
        settings,
      ];
    }

    if (requestType === 'ws') {
      return [
        docs,
        { id: 'body', label: 'Message', badge: bodyHasContent ? bodyBadgeLabel : undefined, badgeKind: 'on' },
        params,
        headers,
        settings,
      ];
    }

    return [
      docs,
      params,
      auth,
      headers,
      { id: 'body', label: 'Body', badge: bodyHasContent ? bodyBadgeLabel : undefined, badgeKind: 'on' },
      scripts,
      settings,
    ];
  }

  let tabItems = $derived(buildTabItems());
  let activeTabItem = $derived(tabItems.find((item) => item.id === requestTab) ?? tabItems[0]);

  function updateCompactMode() {
    if (!tabsShellEl || !tabsEl) return;

    const availableWidth = tabsShellEl.clientWidth;
    const requiredWidth = tabsEl.scrollWidth;
    if (availableWidth <= 0 || requiredWidth <= 0) return;

    const nextCompact = requiredWidth > availableWidth + 1;

    if (nextCompact === compact) return;
    compact = nextCompact;
    if (!compact) compactMenuOpen = false;
  }

  function observeTabsWidth(node: HTMLDivElement) {
    const observer = new ResizeObserver(updateCompactMode);
    observer.observe(node);
    queueMicrotask(updateCompactMode);

    return {
      destroy() {
        observer.disconnect();
      },
    };
  }

  $effect(() => {
    const tabSignature = tabItems.map((item) => `${item.id}:${item.label}:${item.badge ?? ''}`).join('|');
    void tabSignature;
    void tick().then(updateCompactMode);
  });

  function selectTab(tab: RequestTab) {
    requestTab = tab;
    compactMenuOpen = false;
  }

  function closeCompactMenuOnFocusOut(event: FocusEvent) {
    const current = event.currentTarget;
    const next = event.relatedTarget;

    if (!(current instanceof HTMLElement)) return;
    if (!(next instanceof Node) || !current.contains(next)) compactMenuOpen = false;
  }
</script>

<div
  class="request-editor-tabs-shell"
  class:compact
  bind:this={tabsShellEl}
  use:observeTabsWidth
>
  <div class="tabs" role="tablist" use:tabListKeyboard bind:this={tabsEl}>
    {#each tabItems as item}
      <button
        role="tab"
        class:active={requestTab === item.id}
        aria-selected={requestTab === item.id}
        tabindex={requestTab === item.id ? 0 : -1}
        onclick={() => selectTab(item.id)}
        type="button"
      >
        {item.label}
        {#if item.badge}
          <span class="badge" class:badge-on={item.badgeKind === 'on'} class:badge-script={item.badgeKind === 'script'}>{item.badge}</span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="request-tab-compact-menu" onfocusout={closeCompactMenuOnFocusOut}>
    <button
      class="request-tab-compact-trigger"
      class:open={compactMenuOpen}
      type="button"
      aria-label="Request section"
      aria-haspopup="listbox"
      aria-expanded={compactMenuOpen}
      onclick={() => (compactMenuOpen = !compactMenuOpen)}
    >
      <span class="request-tab-compact-label">{activeTabItem.label}</span>
      {#if activeTabItem.badge}
        <span class="badge" class:badge-on={activeTabItem.badgeKind === 'on'} class:badge-script={activeTabItem.badgeKind === 'script'}>{activeTabItem.badge}</span>
      {/if}
      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
        <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>

    {#if compactMenuOpen}
      <div class="request-tab-compact-list" role="listbox" aria-label="Request sections">
        {#each tabItems as item}
          <button
            class:active={requestTab === item.id}
            role="option"
            aria-selected={requestTab === item.id}
            type="button"
            onclick={() => selectTab(item.id)}
          >
            <span class="request-tab-compact-check">{requestTab === item.id ? '✓' : ''}</span>
            <span>{item.label}</span>
            {#if item.badge}
              <span class="badge" class:badge-on={item.badgeKind === 'on'} class:badge-script={item.badgeKind === 'script'}>{item.badge}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
