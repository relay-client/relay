<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { trapFocus } from '../a11y';
  import RequestTypeBadge from './RequestTypeBadge.svelte';
  import { shortcutComboLabel } from '../stores/features/preferences';
  import { filterPaletteCommands, parsePaletteQuery, type PaletteCommand } from '../commandPalette';
  import type { SavedRequest, ShortcutId } from '../types/models';

  const EMPTY_QUERY_REQUESTS = 6;
  const MAX_REQUESTS = 50;

  let {
    query = $bindable(''),
    results,
    commands,
    activeRequestId,
    requestTabLabel,
    collectionLabel,
    shortcutLabel,
    appRuntime = '',
    onSwitchRequest,
    onClose,
  }: {
    query: string;
    results: SavedRequest[];
    commands: PaletteCommand[];
    activeRequestId: string;
    requestTabLabel: (request: SavedRequest) => string;
    collectionLabel: (request: SavedRequest) => string;
    shortcutLabel: (id: ShortcutId) => string;
    appRuntime?: string;
    onSwitchRequest: (id: string) => void;
    onClose: () => void;
  } = $props();

  type Item =
    | { kind: 'request'; key: string; heading: string; request: SavedRequest }
    | { kind: 'command'; key: string; heading: string; command: PaletteCommand };

  let input: HTMLInputElement;
  let list: HTMLDivElement;
  let selectedIndex = $state(0);
  let searchShortcut = $derived(shortcutComboLabel('Meta+K', appRuntime));
  let parsed = $derived(parsePaletteQuery(query));
  let requestItems = $derived<Item[]>(parsed.commandsOnly
    ? []
    : results
      .slice(0, parsed.text ? MAX_REQUESTS : EMPTY_QUERY_REQUESTS)
      .map((request, index) => ({ kind: 'request', key: `request:${request.id}`, heading: index === 0 ? 'Requests' : '', request })));
  let commandItems = $derived.by<Item[]>(() => {
    const matched = filterPaletteCommands(commands, parsed.text);
    const grouped = parsed.text ? matched : [...matched].sort((a, b) => groupOrder(a) - groupOrder(b));
    return grouped.map((command, index) => ({
      kind: 'command',
      key: `command:${command.id}`,
      heading: parsed.text ? (index === 0 ? 'Commands' : '') : (index === 0 || grouped[index - 1].group !== command.group ? command.group : ''),
      command,
    }));
  });
  let items = $derived([...requestItems, ...commandItems]);

  $effect(() => {
    void query;
    selectedIndex = 0;
  });

  onMount(() => {
    setTimeout(() => input?.focus(), 0);
  });

  function run(item: Item | undefined) {
    if (!item) return;
    onClose();
    if (item.kind === 'request') onSwitchRequest(item.request.id);
    else void item.command.run();
  }

  async function select(index: number) {
    if (!items.length) return;
    selectedIndex = (index + items.length) % items.length;
    await tick();
    list?.querySelector<HTMLElement>(`[data-palette-index="${selectedIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      void select(selectedIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      void select(selectedIndex - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(items[selectedIndex]);
    }
  }

  function groupOrder(command: PaletteCommand) {
    return commands.findIndex(candidate => candidate.group === command.group);
  }

  function optionId(index: number) {
    return `palette-option-${index}`;
  }
</script>

<div class="global-search-backdrop" role="presentation" onmousedown={(event) => event.target === event.currentTarget && onClose()}>
  <div class="global-search-modal" role="dialog" aria-modal="true" aria-label="Search requests and commands" tabindex="-1" use:trapFocus>
    <div class="global-search-input-wrap">
      <svg width="16" height="16" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        <circle cx="5.8" cy="5.8" r="3.8" stroke="currentColor" stroke-width="1.4"/>
        <path d="M8.7 8.7l2.7 2.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <input
        bind:value={query}
        bind:this={input}
        placeholder="Search requests and commands…"
        spellcheck="false"
        role="combobox"
        aria-label="Search requests and commands"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={items.length ? optionId(selectedIndex) : undefined}
        onkeydown={onInputKeydown}
        data-autofocus
      />
      <kbd>Esc</kbd>
    </div>
    <div class="global-search-results" id="palette-list" role="listbox" aria-label="Results" bind:this={list}>
      {#each items as item, index (item.key)}
        {#if item.heading}
          <div class="palette-section" role="presentation">{item.heading}</div>
        {/if}
        {#if item.kind === 'request'}
          <button
            id={optionId(index)}
            class="global-search-item"
            class:selected={index === selectedIndex}
            class:current={item.request.id === activeRequestId}
            type="button"
            role="option"
            aria-selected={index === selectedIndex}
            data-palette-index={index}
            tabindex="-1"
            onmousemove={() => (selectedIndex = index)}
            onclick={() => run(item)}
          >
            <RequestTypeBadge request={item.request} variant="search" />
            <div class="gsr-info">
              <span class="gsr-name">{requestTabLabel(item.request)}</span>
              {#if item.request.url}<span class="gsr-url">{item.request.url}</span>{/if}
            </div>
            <span class="gsr-collection">{collectionLabel(item.request)}</span>
          </button>
        {:else}
          <button
            id={optionId(index)}
            class="palette-command"
            class:selected={index === selectedIndex}
            type="button"
            role="option"
            aria-selected={index === selectedIndex}
            data-palette-index={index}
            data-command-id={item.command.id}
            tabindex="-1"
            onmousemove={() => (selectedIndex = index)}
            onclick={() => run(item)}
          >
            <span class="palette-command-label">{item.command.label}</span>
            {#if item.command.shortcut && shortcutLabel(item.command.shortcut)}
              <kbd>{shortcutLabel(item.command.shortcut)}</kbd>
            {/if}
          </button>
        {/if}
      {/each}
      {#if !items.length}
        <div class="global-search-empty">{parsed.commandsOnly ? 'No matching commands' : 'No requests or commands found'}</div>
      {/if}
    </div>
    <div class="global-search-footer">
      <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
      <span><kbd>↵</kbd> open</span>
      <span><kbd>&gt;</kbd> commands only</span>
      <span class="palette-footer-end"><kbd>{searchShortcut}</kbd> palette</span>
    </div>
  </div>
</div>
