<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import RequestTypeBadge from './RequestTypeBadge.svelte';
  import SidebarRequestRow from './SidebarRequestRow.svelte';
  import { virtualizeRows } from '../sidebarVirtual';
  import { MAX_FOLDER_DEPTH, MAX_FOLDER_REQUESTS } from '../constants';
  import type {
    Collection,
    CollectionGroup,
    Environment,
    FolderGroup,
    HistoryDayGroup,
    RequestHistoryEntry,
    SavedRequest,
    SidebarView,
    WorkspaceDiagnostic,
  } from '../types/models';
  import type { TopView } from '../stores/ui';

  type DropPlacement = 'before' | 'after';
  type CollectionSidebarRow =
    | { type: 'onboarding'; key: string; height: number }
    | { type: 'pinned-head'; key: string; height: number; count: number; collapsed: boolean }
    | { type: 'request'; key: string; height: number; req: SavedRequest; depth: number; menuKey: string }
    | { type: 'collection'; key: string; height: number; group: CollectionGroup }
    | { type: 'collection-empty'; key: string; height: number; collectionId: string; depth: number }
    | { type: 'folder'; key: string; height: number; folder: FolderGroup; collectionId: string; depth: number }
    | { type: 'folder-empty'; key: string; height: number; folder: FolderGroup; collectionId: string; depth: number };
  type HistorySidebarRow =
    | { type: 'day'; key: string; height: number; group: HistoryDayGroup }
    | { type: 'entry'; key: string; height: number; entry: RequestHistoryEntry };
  type EnvironmentSidebarRow =
    | { type: 'none'; key: string; height: number }
    | { type: 'environment'; key: string; height: number; environment: Environment };

  // Initial per-row height estimates (px). The collection list measures real heights
  // after render (see measureRow) and uses those instead, so these only need to be
  // close enough to seed the first paint. History/environment lists still rely on them.
  const ROW_HEIGHT = 30; // history day toggle + history entry
  const REQUEST_ROW_HEIGHT = 28; // .collection-request-wrap
  const COLLECTION_ROW_HEIGHT = 28; // .collection-folder
  const FOLDER_ROW_HEIGHT = 30; // .collection-subfolder
  const PINNED_HEAD_HEIGHT = 24; // .pinned-head
  const EMPTY_ROW_HEIGHT = 58;
  const FOLDER_EMPTY_ROW_HEIGHT = 124;
  const ONBOARDING_ROW_HEIGHT = 210;
  const ENVIRONMENT_ROW_HEIGHT = 78;
  const ENVIRONMENT_NONE_ROW_HEIGHT = 58;
  const PINNED_REQUEST_DEPTH = -1;
  const COLLECTION_CHILD_DEPTH = 0;
  const VIRTUAL_OVERSCAN = 8 * ROW_HEIGHT;

  let {
    sidebarView = $bindable<SidebarView>('collections'),
    sidebarSearch = $bindable(''),
    sidebarSearchInput = $bindable<HTMLInputElement | undefined>(),
    topView,
    activeRequestId,
    activeEnvironmentId,
    collectionGroups,
    historyGroups,
    pinnedRequests,
    activeWorkspaceEnvironments,
    openCollectionMenuId,
    openRequestMenuId,
    historyHeaderMenuOpen,
    openHistoryMenuId,
    openPostmanImport,
    createCollection,
    toggleCollectionCollapsed,
    toggleCollectionMenu,
    createNewRequest,
    renameCollection,
    openCollectionSettings,
    exportCollection,
    deleteCollection,
    moveCollection,
    switchRequest,
    requestTabLabel,
    toggleRequestMenu,
    renameRequest,
    duplicateRequest,
    copyRequestCurl,
    toggleRequestPinned,
    deleteRequest,
    toggleFolderCollapsed,
    openFolderMenuKey,
    toggleFolderMenu,
    createRequestInFolder,
    createSubfolder,
    renameFolder,
    deleteFolder,
    createFolderInCollection,
    runFolder,
    toggleHistoryHeaderMenu,
    clearRequestHistory,
    toggleHistoryDay,
    openHistoryEntry,
    historyTitle,
    statusClass,
    toggleHistoryEntryMenu,
    activeWorkspaceCollections,
    saveHistoryEntryToCollection,
    saveHistoryEntryToNewCollection,
    deleteHistoryEntry,
    createEnvironment,
    openGlobals,
    globalVariableCount,
    selectEnvironment,
    openEnvironment,
    environmentValueCount,
    renameEnvironment,
    deleteEnvironment,
    exportEnvironmentToPostman,
    openWorkspaceDiagnostic,
    workspaceBlocked = false,
  }: {
    sidebarView: SidebarView;
    sidebarSearch: string;
    sidebarSearchInput?: HTMLInputElement;
    topView: TopView;
    activeRequestId: string;
    activeEnvironmentId: string;
    collectionGroups: CollectionGroup[];
    historyGroups: HistoryDayGroup[];
    pinnedRequests: SavedRequest[];
    activeWorkspaceEnvironments: Environment[];
    openCollectionMenuId: string;
    openRequestMenuId: string;
    historyHeaderMenuOpen: boolean;
    openHistoryMenuId: string;
    openPostmanImport: () => void;
    createCollection: () => void;
    toggleCollectionCollapsed: (id: string) => void;
    toggleCollectionMenu: (id: string, event: MouseEvent) => void;
    createNewRequest: (collectionId?: string) => void;
    renameCollection: (id: string, name?: string) => void | Promise<void>;
    openCollectionSettings: (id: string) => void | Promise<void>;
    exportCollection: (id: string) => void;
    deleteCollection: (id: string) => void;
    moveCollection: (sourceId: string, targetId: string, placement: DropPlacement) => void;
    switchRequest: (id: string) => void;
    requestTabLabel: (request: SavedRequest) => string;
    toggleRequestMenu: (id: string, event: MouseEvent) => void;
    renameRequest: (id: string, name?: string) => void | Promise<void>;
    duplicateRequest: (id: string) => void;
    copyRequestCurl: (id: string) => void;
    toggleRequestPinned: (id: string) => void;
    deleteRequest: (id: string) => void;
    toggleFolderCollapsed: (collectionId: string, path: string[]) => void;
    openFolderMenuKey: string;
    toggleFolderMenu: (key: string, event: MouseEvent) => void;
    createRequestInFolder: (collectionId: string, folderPath: string[]) => void;
    createSubfolder: (collectionId: string, parentPath: string[]) => void;
    renameFolder: (collectionId: string, folderPath: string[]) => void;
    deleteFolder: (collectionId: string, folderPath: string[]) => void;
    createFolderInCollection: (collectionId: string) => void;
    runFolder: (collectionId: string, folderPath: string[]) => void;
    toggleHistoryHeaderMenu: (event: MouseEvent) => void;
    clearRequestHistory: () => void;
    toggleHistoryDay: (key: string) => void;
    openHistoryEntry: (id: string) => void;
    historyTitle: (entry: RequestHistoryEntry) => string;
    statusClass: (statusCode: number) => string;
    toggleHistoryEntryMenu: (id: string, event: MouseEvent) => void;
    activeWorkspaceCollections: () => Collection[];
    saveHistoryEntryToCollection: (entryId: string, collectionId: string) => void;
    saveHistoryEntryToNewCollection: (entryId: string) => void;
    deleteHistoryEntry: (entryId: string) => void;
    createEnvironment: () => void;
    openGlobals: () => void;
    globalVariableCount: number;
    selectEnvironment: (environmentId: string) => void;
    openEnvironment: (environmentId: string) => void;
    environmentValueCount: (environment: Environment) => number;
    renameEnvironment: (environmentId: string) => void;
    deleteEnvironment: (environmentId: string) => void;
    exportEnvironmentToPostman: (environmentId: string) => void;
    openWorkspaceDiagnostic: (diagnostics: WorkspaceDiagnostic[]) => void;
    workspaceBlocked?: boolean;
  } = $props();

  let draggingCollectionId = $state('');
  let dragOverCollectionId = $state('');
  let dragOverPlacement = $state<DropPlacement>('before');
  let editingCollectionId = $state('');
  let editingCollectionName = $state('');
  let editingCollectionInput = $state<HTMLInputElement | undefined>();
  let collectionListEl = $state<HTMLElement | undefined>();
  let historyListEl = $state<HTMLElement | undefined>();
  let environmentListEl = $state<HTMLElement | undefined>();
  let collectionScrollTop = $state(0);
  let historyScrollTop = $state(0);
  let environmentScrollTop = $state(0);
  let collectionViewportHeight = $state(0);
  let historyViewportHeight = $state(0);
  let environmentViewportHeight = $state(0);
  let pinnedCollapsed = $state(false);

  const collectionRowHeights = new SvelteMap<string, number>();
  let collectionRows = $derived(buildCollectionRows());
  let visibleCollectionRows = $derived(virtualizeRows(collectionRows, collectionScrollTop, collectionViewportHeight, VIRTUAL_OVERSCAN, ROW_HEIGHT, collectionRowHeights));
  let historyRows = $derived(buildHistoryRows());
  let visibleHistoryRows = $derived(virtualizeRows(historyRows, historyScrollTop, historyViewportHeight, VIRTUAL_OVERSCAN, ROW_HEIGHT));
  let environmentRows = $derived(buildEnvironmentRows());
  let visibleEnvironmentRows = $derived(virtualizeRows(environmentRows, environmentScrollTop, environmentViewportHeight, VIRTUAL_OVERSCAN, ROW_HEIGHT));

  $effect(() => {
    if (!editingCollectionId || !editingCollectionInput) return;
    editingCollectionInput.focus();
    editingCollectionInput.select();
  });

  $effect(() => {
    sidebarView;
    collectionRows.length;
    historyRows.length;
    environmentRows.length;
    requestAnimationFrame(() => {
      syncCollectionViewport();
      syncHistoryViewport();
      syncEnvironmentViewport();
    });
  });

  // Cache of measured row heights keyed by row.key (SvelteMap so reads in the
  // virtualization derived re-run when a measurement lands).
  function measureRow(node: HTMLElement, key: string) {
    let currentKey = key;
    const report = () => {
      const h = node.getBoundingClientRect().height;
      if (h > 0 && collectionRowHeights.get(currentKey) !== h) collectionRowHeights.set(currentKey, h);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return {
      update(nextKey: string) { currentKey = nextKey; report(); },
      destroy() { observer.disconnect(); },
    };
  }

  // Scroll handlers read clientHeight (a forced layout) and trigger an O(n) re-window.
  // Coalesce bursts of scroll events into one update per animation frame so fast
  // flicks stay smooth instead of thrashing layout on every wheel tick.
  let collectionScrollRaf = 0;
  let historyScrollRaf = 0;
  let environmentScrollRaf = 0;

  function syncCollectionViewport() {
    if (!collectionListEl) return;
    collectionScrollTop = collectionListEl.scrollTop;
    collectionViewportHeight = collectionListEl.clientHeight;
  }

  function syncHistoryViewport() {
    if (!historyListEl) return;
    historyScrollTop = historyListEl.scrollTop;
    historyViewportHeight = historyListEl.clientHeight;
  }

  function syncEnvironmentViewport() {
    if (!environmentListEl) return;
    environmentScrollTop = environmentListEl.scrollTop;
    environmentViewportHeight = environmentListEl.clientHeight;
  }

  function onCollectionScroll() {
    if (collectionScrollRaf) return;
    collectionScrollRaf = requestAnimationFrame(() => {
      collectionScrollRaf = 0;
      syncCollectionViewport();
    });
  }

  function onHistoryScroll() {
    if (historyScrollRaf) return;
    historyScrollRaf = requestAnimationFrame(() => {
      historyScrollRaf = 0;
      syncHistoryViewport();
    });
  }

  function onEnvironmentScroll() {
    if (environmentScrollRaf) return;
    environmentScrollRaf = requestAnimationFrame(() => {
      environmentScrollRaf = 0;
      syncEnvironmentViewport();
    });
  }

  function folderCanAcceptRequest(value: FolderGroup) {
    return (value.requests?.length ?? 0) < MAX_FOLDER_REQUESTS;
  }

  function folderCanAcceptSubfolder(value: FolderGroup) {
    return (value.path?.length ?? 0) < MAX_FOLDER_DEPTH;
  }

  function addFolderRows(rows: CollectionSidebarRow[], collectionId: string, folder: FolderGroup, depth: number, forceExpanded: boolean) {
    rows.push({ type: 'folder', key: `folder:${folder.key}`, height: FOLDER_ROW_HEIGHT, folder, collectionId, depth });
    if (folder.collapsed && !forceExpanded) return;
    if (!folder.children.length && !folder.requests.length && !sidebarSearch.trim()) {
      rows.push({ type: 'folder-empty', key: `folder-empty:${folder.key}`, height: FOLDER_EMPTY_ROW_HEIGHT, folder, collectionId, depth: depth + 1 });
    }
    for (const child of folder.children) addFolderRows(rows, collectionId, child, depth + 1, forceExpanded);
    for (const req of folder.requests) rows.push({ type: 'request', key: `request:${req.id}`, height: REQUEST_ROW_HEIGHT, req, depth: depth + 1, menuKey: `request:${req.id}` });
  }

  function buildCollectionRows(): CollectionSidebarRow[] {
    const rows: CollectionSidebarRow[] = [];
    const hasSearch = Boolean(sidebarSearch.trim());
    if (!collectionGroups.length && !pinnedRequests.length && !hasSearch) {
      rows.push({ type: 'onboarding', key: 'onboarding', height: ONBOARDING_ROW_HEIGHT });
    }
    if (pinnedRequests.length) {
      rows.push({ type: 'pinned-head', key: 'pinned-head', height: PINNED_HEAD_HEIGHT, count: pinnedRequests.length, collapsed: pinnedCollapsed && !hasSearch });
      if (!pinnedCollapsed || hasSearch) {
        for (const req of pinnedRequests) rows.push({ type: 'request', key: `pinned:${req.id}`, height: REQUEST_ROW_HEIGHT, req, depth: PINNED_REQUEST_DEPTH, menuKey: `pinned:${req.id}` });
      }
    }
    for (const group of collectionGroups) {
      rows.push({ type: 'collection', key: `collection:${group.collection.id}`, height: COLLECTION_ROW_HEIGHT, group });
      if (group.collection.collapsed && !hasSearch) continue;
      if (!group.folders.length && !group.rootRequests.length && !hasSearch) {
        rows.push({ type: 'collection-empty', key: `collection-empty:${group.collection.id}`, height: EMPTY_ROW_HEIGHT, collectionId: group.collection.id, depth: COLLECTION_CHILD_DEPTH });
      }
      for (const folder of group.folders) addFolderRows(rows, group.collection.id, folder, COLLECTION_CHILD_DEPTH, hasSearch);
      for (const req of group.rootRequests) rows.push({ type: 'request', key: `request:${req.id}`, height: REQUEST_ROW_HEIGHT, req, depth: COLLECTION_CHILD_DEPTH, menuKey: `request:${req.id}` });
    }
    return rows;
  }

  function buildHistoryRows(): HistorySidebarRow[] {
    const rows: HistorySidebarRow[] = [];
    for (const group of historyGroups) {
      rows.push({ type: 'day', key: `day:${group.key}`, height: ROW_HEIGHT, group });
      if (!group.collapsed) {
        for (const entry of group.entries) rows.push({ type: 'entry', key: `history:${entry.id}`, height: ROW_HEIGHT, entry });
      }
    }
    return rows;
  }

  function buildEnvironmentRows(): EnvironmentSidebarRow[] {
    return [
      { type: 'none', key: 'environment:none', height: ENVIRONMENT_NONE_ROW_HEIGHT },
      ...activeWorkspaceEnvironments.map(environment => ({
        type: 'environment' as const,
        key: `environment:${environment.id}`,
        height: ENVIRONMENT_ROW_HEIGHT,
        environment,
      })),
    ];
  }

  function collectionDragDisabled() {
    return Boolean(workspaceBlocked || sidebarSearch.trim());
  }

  function clearCollectionDragState() {
    draggingCollectionId = '';
    dragOverCollectionId = '';
    dragOverPlacement = 'before';
  }

  function collectionById(collectionId: string) {
    return collectionGroups.find(group => group.collection.id === collectionId)?.collection;
  }

  function startCollectionInlineRename(collection: Collection, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    editingCollectionId = collection.id;
    editingCollectionName = collection.name;
  }

  function cancelCollectionInlineRename() {
    editingCollectionId = '';
    editingCollectionName = '';
    editingCollectionInput = undefined;
  }

  async function commitCollectionInlineRename() {
    const collectionId = editingCollectionId;
    const name = editingCollectionName.trim();
    const collection = collectionById(collectionId);
    cancelCollectionInlineRename();
    if (!collection || !name || name === collection.name) return;
    await renameCollection(collectionId, name);
  }

  function onCollectionNameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitCollectionInlineRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelCollectionInlineRename();
    }
  }

  function currentElement(event: Event) {
    return event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  }

  function onCollectionDragStart(collectionId: string, event: DragEvent) {
    if (collectionDragDisabled()) {
      event.preventDefault();
      return;
    }
    draggingCollectionId = collectionId;
    event.dataTransfer?.setData('application/x-relay-collection-id', collectionId);
    event.dataTransfer?.setData('text/plain', collectionId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function onCollectionDragOver(collectionId: string, event: DragEvent) {
    if (collectionDragDisabled() || !draggingCollectionId || draggingCollectionId === collectionId) return;
    event.preventDefault();
    const target = currentElement(event);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    dragOverCollectionId = collectionId;
    dragOverPlacement = event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  function onCollectionDragLeave(event: DragEvent) {
    const target = currentElement(event);
    const nextTarget = event.relatedTarget;
    if (target && nextTarget instanceof Node && target.contains(nextTarget)) return;
    dragOverCollectionId = '';
  }

  function onCollectionDrop(collectionId: string, event: DragEvent) {
    if (collectionDragDisabled()) return;
    event.preventDefault();
    const sourceId = event.dataTransfer?.getData('application/x-relay-collection-id') || draggingCollectionId;
    if (sourceId && sourceId !== collectionId) {
      moveCollection(sourceId, collectionId, dragOverPlacement);
    }
    clearCollectionDragState();
  }

</script>

<aside class="sidebar" class:workspace-blocked={workspaceBlocked}>
  <div class="brand titlebar-drag-region">
    <div class="brand-mark">
      <svg width="22" height="22" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path fill="#fff" d="M11.9 21.2h32.6v-6.1L53 23.7l-8.5 8.6v-6.1H11.9a2.5 2.5 0 0 1 0-5Z"/>
        <path fill="#fff" d="M52.1 37.8H19.5v-6.1L11 40.3l8.5 8.6v-6.1h32.6a2.5 2.5 0 0 0 0-5Z"/>
      </svg>
    </div>
    <div class="brand-text">
      <span class="brand-name">Relay</span>
    </div>
  </div>

  <div class="sidebar-nav">
    <button class="sidebar-nav-item" class:active={sidebarView === 'collections'} type="button" onclick={() => (sidebarView = 'collections')} disabled={workspaceBlocked}>
      <span class="nav-icon">HTTP</span>
      Collections
    </button>
    <button class="sidebar-nav-item" class:active={sidebarView === 'environments'} type="button" onclick={() => (sidebarView = 'environments')} disabled={workspaceBlocked}>
      <span class="nav-icon">ENV</span>
      Environments
    </button>
    <button class="sidebar-nav-item" class:active={sidebarView === 'history'} type="button" onclick={() => (sidebarView = 'history')} disabled={workspaceBlocked}>
      <span class="nav-icon">HIS</span>
      History
    </button>
  </div>

  {#if sidebarView === 'collections'}
    <div class="collections-panel">
      <div class="collections-head">
        <span>Collections</span>
        <div class="collections-head-actions">
          <button class="collection-add" type="button" onclick={openPostmanImport} aria-label="Import collection" title="Import collection" disabled={workspaceBlocked}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M6.5 1.5v6M4 5l2.5 2.5L9 5M2 9.5v1.2c0 .4.3.8.8.8h7.4c.5 0 .8-.4.8-.8V9.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="collection-add" type="button" onclick={createCollection} aria-label="New collection" disabled={workspaceBlocked}>+</button>
        </div>
      </div>
      <div class="sidebar-search">
        <svg width="12" height="12" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <circle cx="5.8" cy="5.8" r="3.8" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8.7 8.7l2.7 2.7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        <input bind:this={sidebarSearchInput} bind:value={sidebarSearch} placeholder="Search requests" spellcheck="false" disabled={workspaceBlocked} />
      </div>
      <div class="collection-list" role="list" bind:this={collectionListEl} onscroll={onCollectionScroll}>
        <div class="sidebar-virtual-spacer" style={`height: ${visibleCollectionRows.before}px`}></div>
        {#each visibleCollectionRows.rows as row (row.key)}
          <div class="sidebar-vrow" use:measureRow={row.key}>
          {#if row.type === 'onboarding'}
            <div class="sidebar-onboarding" role="status">
              <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true" opacity="0.4">
                <path d="M5 9h6l2 2h14v15a2 2 0 01-2 2H5a2 2 0 01-2-2V11a2 2 0 012-2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
              <p class="sidebar-onboarding-title">No collections yet</p>
              <p class="sidebar-onboarding-hint">Organize requests into collections — or import from Bruno/OpenCollection, Postman, Insomnia, OpenAPI, or HAR.</p>
              <div class="sidebar-onboarding-actions">
                <button class="btn-primary btn-sm" type="button" onclick={createCollection} disabled={workspaceBlocked}>New collection</button>
                <button class="btn-secondary btn-sm" type="button" onclick={openPostmanImport} disabled={workspaceBlocked}>Import collection</button>
              </div>
            </div>
          {:else if row.type === 'pinned-head'}
            <button
              class="pinned-head"
              class:collapsed={row.collapsed}
              type="button"
              onclick={() => (pinnedCollapsed = !pinnedCollapsed)}
              aria-expanded={!row.collapsed}
            >
              <svg class:collapsed={row.collapsed} width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>Starred</span>
              <span class="collection-count">{row.count}</span>
            </button>
          {:else if row.type === 'request'}
            <SidebarRequestRow
              req={row.req}
              depth={row.depth}
              menuKey={row.menuKey}
              {activeRequestId}
              {topView}
              {openRequestMenuId}
              {requestTabLabel}
              {switchRequest}
              {toggleRequestMenu}
              {renameRequest}
              {duplicateRequest}
              {copyRequestCurl}
              {toggleRequestPinned}
              {deleteRequest}
              {openWorkspaceDiagnostic}
              disabled={workspaceBlocked}
            />
          {:else if row.type === 'collection'}
            <div
              class="collection-group"
              class:has-diagnostic={Boolean(row.group.collection.workspaceDiagnostics?.length)}
              class:dragging={draggingCollectionId === row.group.collection.id}
              class:drop-before={dragOverCollectionId === row.group.collection.id && dragOverPlacement === 'before'}
              class:drop-after={dragOverCollectionId === row.group.collection.id && dragOverPlacement === 'after'}
              role="listitem"
              draggable={!row.group.collection.isInvalid && !collectionDragDisabled() && editingCollectionId !== row.group.collection.id}
              ondragstart={(event) => onCollectionDragStart(row.group.collection.id, event)}
              ondragover={(event) => onCollectionDragOver(row.group.collection.id, event)}
              ondragleave={onCollectionDragLeave}
              ondrop={(event) => onCollectionDrop(row.group.collection.id, event)}
              ondragend={clearCollectionDragState}
            >
              <div class="collection-folder">
                <span class="collection-drag-handle" aria-hidden="true">
                  <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
                    <circle cx="3" cy="3" r="1" fill="currentColor"/>
                    <circle cx="7" cy="3" r="1" fill="currentColor"/>
                    <circle cx="3" cy="7" r="1" fill="currentColor"/>
                    <circle cx="7" cy="7" r="1" fill="currentColor"/>
                    <circle cx="3" cy="11" r="1" fill="currentColor"/>
                    <circle cx="7" cy="11" r="1" fill="currentColor"/>
                  </svg>
                </span>
                <button class="collection-collapse" type="button" onclick={() => toggleCollectionCollapsed(row.group.collection.id)} aria-label={row.group.collection.collapsed ? 'Expand collection' : 'Collapse collection'} disabled={workspaceBlocked}>
                  <svg class:collapsed={row.group.collection.collapsed} width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <svg class="collection-root-icon" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M2 2.5h9v2H2v-2zM2 5.5h9v2H2v-2zM2 8.5h9v2H2v-2z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
                </svg>
                {#if editingCollectionId === row.group.collection.id}
                  <input
                    class="collection-name-input"
                    bind:this={editingCollectionInput}
                    bind:value={editingCollectionName}
                    aria-label="Collection name"
                    spellcheck="false"
                    onblur={commitCollectionInlineRename}
                    onkeydown={onCollectionNameKeydown}
                    onclick={(event) => event.stopPropagation()}
                    ondblclick={(event) => event.stopPropagation()}
                  />
                {:else}
                  <button
                    class="collection-name"
                    type="button"
                    title={row.group.collection.name}
                    onclick={(event) => { event.stopPropagation(); if (row.group.collection.workspaceDiagnostics?.length) openWorkspaceDiagnostic(row.group.collection.workspaceDiagnostics); else void openCollectionSettings(row.group.collection.id); }}
                    disabled={workspaceBlocked}
                    ondblclick={(event) => { if (!workspaceBlocked) startCollectionInlineRename(row.group.collection, event); }}
                  >{row.group.collection.name}</button>
                {/if}
                {#if row.group.collection.workspaceDiagnostics?.length}
                  <button
                    class="workspace-diagnostic-chip"
                    type="button"
                    title={row.group.collection.workspaceDiagnostics[0].message}
                    aria-label="Collection YAML error"
                    onclick={(event) => { event.stopPropagation(); openWorkspaceDiagnostic(row.group.collection.workspaceDiagnostics ?? []); }}
                  >!</button>
                {/if}
                <span class="collection-count">{row.group.requests.length}</span>
                {#if !row.group.collection.isInvalid}
                  <button class="collection-menu-btn" type="button" onclick={(event) => toggleCollectionMenu(row.group.collection.id, event)} aria-label="Collection menu" disabled={workspaceBlocked}>•••</button>
                {/if}
                {#if !row.group.collection.isInvalid && openCollectionMenuId === row.group.collection.id}
                  <div class="request-menu collection-menu">
                    <button type="button" onclick={() => createNewRequest(row.group.collection.id)} disabled={workspaceBlocked}>Add request</button>
                    <button type="button" onclick={() => createFolderInCollection(row.group.collection.id)} disabled={workspaceBlocked}>Add folder</button>
                    <button type="button" onclick={() => openCollectionSettings(row.group.collection.id)} disabled={workspaceBlocked}>Settings</button>
                    <button type="button" onclick={() => renameCollection(row.group.collection.id)} disabled={workspaceBlocked}>Rename</button>
                    <button type="button" onclick={() => exportCollection(row.group.collection.id)} disabled={workspaceBlocked}>Export collection</button>
                    <button class="danger" type="button" onclick={() => deleteCollection(row.group.collection.id)} disabled={workspaceBlocked}>Delete</button>
                  </div>
                {/if}
              </div>
            </div>
          {:else if row.type === 'collection-empty'}
            <div class="collection-empty" role="status" style={`--tree-depth: ${row.depth}`}>
              <button type="button" class="collection-empty-row" onclick={() => createNewRequest(row.collectionId)} disabled={workspaceBlocked}>
                <span class="collection-empty-plus" aria-hidden="true">+</span>
                Add request
              </button>
              <button type="button" class="collection-empty-row" onclick={() => createFolderInCollection(row.collectionId)} disabled={workspaceBlocked}>
                <span class="collection-empty-plus" aria-hidden="true">+</span>
                Add folder
              </button>
            </div>
          {:else if row.type === 'folder'}
            <div class="collection-tree-node" style={`--tree-depth: ${row.depth}`}>
              <div class="collection-subfolder">
                <button class="subfolder-collapse" type="button" onclick={() => toggleFolderCollapsed(row.collectionId, row.folder.path)} aria-label={row.folder.collapsed ? 'Expand folder' : 'Collapse folder'} disabled={workspaceBlocked}>
                  <svg class:collapsed={row.folder.collapsed} width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <svg class="folder-icon" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M1.5 3.2h3l1.1 1.1h5.9v5.5a1.2 1.2 0 01-1.2 1.2H2.7a1.2 1.2 0 01-1.2-1.2V3.2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
                <span class="folder-title">{row.folder.name}</span>
                <span class="collection-count">{row.folder.requestCount}</span>
                <button class="folder-menu-btn" type="button" onclick={(event) => toggleFolderMenu(row.folder.key, event)} aria-label="Folder menu" disabled={workspaceBlocked}>•••</button>
                {#if openFolderMenuKey === row.folder.key}
                  <div class="request-menu folder-menu">
                    <button
                      type="button"
                      disabled={workspaceBlocked || !folderCanAcceptRequest(row.folder)}
                      title={folderCanAcceptRequest(row.folder) ? 'Add request' : `Limit: ${MAX_FOLDER_REQUESTS} requests in one folder`}
                      onclick={() => createRequestInFolder(row.collectionId, row.folder.path)}
                    >Add request</button>
                    <button type="button" onclick={() => runFolder(row.collectionId, row.folder.path)} disabled={workspaceBlocked}>Run folder</button>
                    <button
                      type="button"
                      disabled={workspaceBlocked || !folderCanAcceptSubfolder(row.folder)}
                      title={folderCanAcceptSubfolder(row.folder) ? 'Add subfolder' : `Limit: ${MAX_FOLDER_DEPTH} folder levels`}
                      onclick={() => createSubfolder(row.collectionId, row.folder.path)}
                    >Add subfolder</button>
                    <button type="button" onclick={() => renameFolder(row.collectionId, row.folder.path)} disabled={workspaceBlocked}>Rename</button>
                    <button class="danger" type="button" onclick={() => deleteFolder(row.collectionId, row.folder.path)} disabled={workspaceBlocked}>Delete folder</button>
                  </div>
                {/if}
              </div>
            </div>
          {:else if row.type === 'folder-empty'}
            <div class="collection-empty folder-empty" role="status" style={`--tree-depth: ${row.depth}`}>
              <div class="folder-empty-copy">
                <span>Folder is empty</span>
                <small>Add a request, a folder, or drag items here to group them together.</small>
              </div>
              <button type="button" class="collection-empty-row" onclick={() => createRequestInFolder(row.collectionId, row.folder.path)} disabled={workspaceBlocked || !folderCanAcceptRequest(row.folder)}>
                <span class="collection-empty-plus" aria-hidden="true">+</span>
                Add request
              </button>
              <button type="button" class="collection-empty-row" onclick={() => createSubfolder(row.collectionId, row.folder.path)} disabled={workspaceBlocked || !folderCanAcceptSubfolder(row.folder)}>
                <span class="collection-empty-plus" aria-hidden="true">+</span>
                Add folder
              </button>
            </div>
          {/if}
          </div>
        {/each}
        <div class="sidebar-virtual-spacer" style={`height: ${visibleCollectionRows.after}px`}></div>
      </div>
    </div>
  {:else if sidebarView === 'history'}
    <div class="history-panel">
      <div class="history-head">
        <span>Request History</span>
        <button class="history-menu-btn" type="button" onclick={toggleHistoryHeaderMenu} aria-label="History menu" disabled={workspaceBlocked}>•••</button>
        {#if historyHeaderMenuOpen}
          <div class="request-menu history-header-menu">
            <button class="danger" type="button" onclick={clearRequestHistory} disabled={workspaceBlocked}>Clear all</button>
          </div>
        {/if}
      </div>
      {#if historyRows.length}
        <div class="history-list" bind:this={historyListEl} onscroll={onHistoryScroll}>
          <div class="sidebar-virtual-spacer" style={`height: ${visibleHistoryRows.before}px`}></div>
          {#each visibleHistoryRows.rows as row (row.key)}
            {#if row.type === 'day'}
              <button class="history-day-toggle" type="button" onclick={() => toggleHistoryDay(row.group.key)} aria-label={row.group.collapsed ? 'Expand history day' : 'Collapse history day'} disabled={workspaceBlocked}>
                <svg class:collapsed={row.group.collapsed} width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>{row.group.label}</span>
              </button>
            {:else if row.type === 'entry'}
              <div class="history-entry">
                <button class="history-entry-main" type="button" onclick={() => openHistoryEntry(row.entry.id)} title={historyTitle(row.entry)} disabled={workspaceBlocked}>
                  <RequestTypeBadge request={row.entry.request} />
                  <span class="history-url">{historyTitle(row.entry)}</span>
                  {#if row.entry.statusCode}
                    <span class="history-meta {statusClass(row.entry.statusCode)}">{row.entry.statusCode}</span>
                  {/if}
                </button>
                <button class="history-entry-menu-btn" type="button" onclick={(event) => toggleHistoryEntryMenu(row.entry.id, event)} aria-label="History request menu" disabled={workspaceBlocked}>•••</button>
                {#if openHistoryMenuId === row.entry.id}
                  <div class="request-menu history-entry-menu">
                    <button type="button" onclick={() => openHistoryEntry(row.entry.id)} disabled={workspaceBlocked}>Open</button>
                    {#each activeWorkspaceCollections() as collection}
                      <button type="button" onclick={() => saveHistoryEntryToCollection(row.entry.id, collection.id)} disabled={workspaceBlocked}>Save to {collection.name}</button>
                    {/each}
                    <button type="button" onclick={() => saveHistoryEntryToNewCollection(row.entry.id)} disabled={workspaceBlocked}>New collection...</button>
                    <button class="danger" type="button" onclick={() => deleteHistoryEntry(row.entry.id)} disabled={workspaceBlocked}>Delete</button>
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
          <div class="sidebar-virtual-spacer" style={`height: ${visibleHistoryRows.after}px`}></div>
        </div>
      {:else}
        <div class="history-empty">
          <span>No request history yet.</span>
          <small>Sent requests will be stored here for 14 days.</small>
        </div>
      {/if}
    </div>
  {:else}
    <div class="environment-panel">
      <div class="collections-head">
        <span>Environments</span>
        <button class="collection-add" type="button" onclick={createEnvironment} aria-label="New environment" disabled={workspaceBlocked}>+</button>
      </div>
      <button class="environment-globals-item" class:active={topView === 'globals'} type="button" onclick={openGlobals} disabled={workspaceBlocked}>
        <span>Globals</span>
        <small>{globalVariableCount} variables · every workspace</small>
      </button>
      {#if activeWorkspaceEnvironments.length}
        <div class="environment-list" bind:this={environmentListEl} onscroll={onEnvironmentScroll}>
          <div class="sidebar-virtual-spacer" style={`height: ${visibleEnvironmentRows.before}px`}></div>
          {#each visibleEnvironmentRows.rows as row (row.key)}
            {#if row.type === 'none'}
              <button class="environment-none-item" class:active={!activeEnvironmentId} type="button" onclick={() => selectEnvironment('')} disabled={workspaceBlocked}>
                <span>No environment</span>
                <small>Send requests without variables</small>
              </button>
            {:else if row.type === 'environment'}
              <div class="environment-item" class:active={row.environment.id === activeEnvironmentId}>
                <button class="environment-item-main" type="button" onclick={() => openEnvironment(row.environment.id)} disabled={workspaceBlocked}>
                  <span>{row.environment.name}</span>
                  <small>{environmentValueCount(row.environment)} variables</small>
                </button>
                <div class="environment-item-actions">
                  <button type="button" onclick={() => renameEnvironment(row.environment.id)} aria-label="Rename environment" disabled={workspaceBlocked}>Rename</button>
                  <button type="button" onclick={() => exportEnvironmentToPostman(row.environment.id)} aria-label="Export environment" disabled={workspaceBlocked}>Export</button>
                  <button class="danger" type="button" onclick={() => deleteEnvironment(row.environment.id)} aria-label="Delete environment" disabled={workspaceBlocked}>Delete</button>
                </div>
              </div>
            {/if}
          {/each}
          <div class="sidebar-virtual-spacer" style={`height: ${visibleEnvironmentRows.after}px`}></div>
        </div>
      {:else}
        <div class="history-empty">
          <span>No environments yet.</span>
          <small>Create one and use values as {'{{baseUrl}}'} in requests.</small>
          <button class="btn-secondary btn-sm" type="button" onclick={createEnvironment} disabled={workspaceBlocked}>Create environment</button>
        </div>
      {/if}
    </div>
  {/if}
</aside>
