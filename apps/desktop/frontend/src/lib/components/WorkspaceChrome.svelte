<script lang="ts">
  import { tabListKeyboard } from '../a11y';
  import RequestTypeBadge from './RequestTypeBadge.svelte';
  import WindowControls from './WindowControls.svelte';
  import { MAX_WORKSPACES } from '../constants';
  import { shortcutComboLabel } from '../stores/features/preferences';
  import type { Collection, Environment, SavedRequest, SidebarView, Workspace } from '../types/models';
  import type { SettingsTab, TopView } from '../stores/ui';

  let {
    workspaceSearch = $bindable(''),
    workspaceMenuOpen = $bindable(false),
    topView = $bindable<TopView>('request'),
    environmentMenuOpen = $bindable(false),
    sidebarView = $bindable<SidebarView>('collections'),
    codePanelOpen = $bindable(false),
    codePanelAvailable = true,
    defaultWorkspace,
    activeWorkspace,
    workspaces,
    activeWorkspaceId,
    openRequests,
    activeRequestId,
    activeWorkspaceEnvironments,
    activeEnvironmentId,
    dirtyRequestIds,
    activeRequestIsDirty,
    activeRequestCanRevert,
    collectionRunnerOpen = false,
    collectionRunnerRunning = false,
    activeCollectionSettings,
    gitTabOpen = false,
    gitChangeCount = 0,
    autosave,
    appRuntime = '',
    workspaceBlocked = false,
    saveActiveRequest,
    revertActiveRequestChanges,
    toggleWorkspaceMenu,
    createWorkspace,
    switchWorkspace,
    workspaceCollectionCountFor,
    workspaceRequestCountFor,
    deleteWorkspace,
    openGlobalSearch,
    openSettings,
    openCookieJar,
    openCollectionRunner,
    closeCollectionRunner,
    closeCollectionSettings,
    openGitTab,
    closeGitTab,
    cookieCount,
    requestTabLabel,
    switchRequest,
    closeRequestTab,
    createDraftRequest,
    toggleEnvironmentMenu,
    environmentLabel,
    useEnvironment,
    environmentHasValues,
    environmentValueCount,
  }: {
    workspaceSearch: string;
    workspaceMenuOpen: boolean;
    topView: TopView;
    environmentMenuOpen: boolean;
    sidebarView: SidebarView;
    codePanelOpen: boolean;
    codePanelAvailable?: boolean;
    defaultWorkspace: string;
    activeWorkspace: Workspace | undefined;
    workspaces: Workspace[];
    activeWorkspaceId: string;
    openRequests: SavedRequest[];
    activeRequestId: string;
    activeWorkspaceEnvironments: Environment[];
    activeEnvironmentId: string;
    dirtyRequestIds: string[];
    activeRequestIsDirty: boolean;
    activeRequestCanRevert: boolean;
    collectionRunnerOpen?: boolean;
    collectionRunnerRunning?: boolean;
    activeCollectionSettings?: Collection;
    gitTabOpen?: boolean;
    gitChangeCount?: number;
    autosave: boolean;
    appRuntime?: string;
    workspaceBlocked?: boolean;
    saveActiveRequest: () => void;
    revertActiveRequestChanges: () => void;
    toggleWorkspaceMenu: (event: MouseEvent) => void;
    createWorkspace: () => void;
    switchWorkspace: (workspaceId: string) => void;
    workspaceCollectionCountFor: (workspaceId: string) => number;
    workspaceRequestCountFor: (workspaceId: string) => number;
    deleteWorkspace: (workspaceId: string) => void;
    openGlobalSearch: () => void;
    openSettings: (tab?: SettingsTab) => void;
    openCookieJar: () => void;
    openCollectionRunner: () => void;
    closeCollectionRunner: () => void;
    closeCollectionSettings: () => void;
    openGitTab: () => void;
    closeGitTab: () => void;
    cookieCount: number;
    requestTabLabel: (request: SavedRequest) => string;
    switchRequest: (id: string) => void;
    closeRequestTab: (id: string) => void;
    createDraftRequest: () => void;
    toggleEnvironmentMenu: (event: MouseEvent) => void;
    environmentLabel: () => string;
    useEnvironment: (environmentId: string) => void;
    environmentHasValues: (environment: Environment) => boolean;
    environmentValueCount: (environment: Environment) => number;
  } = $props();

  let showSaveBtn = $derived(!workspaceBlocked && !autosave && topView === 'request' && activeRequestId !== '');
  let activeIsDirty = $derived(!workspaceBlocked && activeRequestIsDirty);
  let activeCanRevert = $derived(!workspaceBlocked && activeRequestCanRevert);
  let dirtyRequestIdSet = $derived(new Set(dirtyRequestIds));
  let workspaceLimitReached = $derived(workspaces.length >= MAX_WORKSPACES);
  let filteredWorkspaces = $derived(workspaces.filter(workspace => !workspaceSearch.trim() || workspace.name.toLowerCase().includes(workspaceSearch.trim().toLowerCase())));
  let globalSearchShortcut = $derived(shortcutComboLabel('Meta+K', appRuntime));
  let saveShortcut = $derived(shortcutComboLabel('Meta+S', appRuntime));
  let settingsShortcut = $derived(shortcutComboLabel('Meta+,', appRuntime));

</script>

<div class="workspace-searchbar titlebar-drag-region">
  <div class="workspace-searchbar-left">
    <div class="workspace-switcher">
      <button class="workspace-switcher-trigger" type="button" onclick={toggleWorkspaceMenu} aria-label="Workspace switcher" aria-expanded={workspaceMenuOpen} title="Workspace switcher">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
          <path d="M4.5 6V4.2a3 3 0 016 0V6M3.2 6h8.6v6.2H3.2V6z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
        </svg>
        <span>{activeWorkspace?.name ?? defaultWorkspace}</span>
        <svg width="10" height="7" viewBox="0 0 10 7" fill="none" aria-hidden="true">
          <path d="M1.5 2L5 5.5L8.5 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      {#if workspaceMenuOpen}
        <div class="workspace-menu">
          <div class="workspace-menu-top">
            <input bind:value={workspaceSearch} placeholder="Search workspaces..." spellcheck="false" />
            <button
              type="button"
              onclick={createWorkspace}
              disabled={workspaceLimitReached}
              title={workspaceLimitReached ? `Limit: ${MAX_WORKSPACES} workspaces in this storage` : 'Create workspace'}
            >Create</button>
          </div>
          <div class="workspace-menu-limit" class:limit-reached={workspaceLimitReached}>
            {workspaces.length}/{MAX_WORKSPACES} workspaces
          </div>
          <div class="workspace-menu-list">
            {#each filteredWorkspaces as workspace}
              <div class="workspace-menu-item" class:active={workspace.id === activeWorkspaceId} class:invalid={workspace.isInvalid}>
                <button class="workspace-menu-select" type="button" onclick={() => switchWorkspace(workspace.id)} title={workspace.isInvalid ? 'Open the Git tab to fix this workspace YAML' : 'Open workspace'}>
                  <span class="workspace-lock">
                    {#if workspace.isInvalid}
                      <span class="workspace-menu-badge" aria-hidden="true">!</span>
                    {:else}
                      <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                        <path d="M4.5 6V4.3a3 3 0 016 0V6M3.2 6h8.6v6.2H3.2V6z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                      </svg>
                    {/if}
                  </span>
                  <span>{workspace.name}</span>
                  <small>{workspace.isInvalid ? 'Fix workspace.yml first' : `${workspaceCollectionCountFor(workspace.id)} collections · ${workspaceRequestCountFor(workspace.id)} requests`}</small>
                </button>
                {#if workspaces.length >= 2}
                  <button class="workspace-delete-btn" type="button" onclick={(event) => { event.stopPropagation(); deleteWorkspace(workspace.id); }} aria-label="Delete workspace" title={workspace.isInvalid ? 'Fix workspace.yml before deleting this workspace' : 'Delete workspace'} disabled={workspaceBlocked || workspace.isInvalid}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                      <path d="M2 3.5h9M5 3.5V2.5h3v1M3.5 3.5l.5 7h5l.5-7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
          <button class="workspace-menu-footer" type="button" onclick={() => { workspaceMenuOpen = false; topView = 'overview'; }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2h4v4H2V2zM8 2h4v4H8V2zM2 8h4v4H2V8zM8 8h4v4H8V8z" stroke="currentColor" stroke-width="1.2"/>
            </svg>
            View all workspaces
          </button>
        </div>
      {/if}
    </div>
  </div>
  <button class="global-search" type="button" onclick={openGlobalSearch} disabled={workspaceBlocked} title={workspaceBlocked ? 'Fix workspace YAML before searching requests' : 'Search requests'}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7.5" stroke="currentColor" stroke-width="2"/>
      <path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <span>Search requests…</span>
    <kbd>{globalSearchShortcut}</kbd>
  </button>
  <div class="searchbar-right">
    {#if showSaveBtn}
      <button class="save-btn" class:dirty={activeIsDirty} type="button" onclick={saveActiveRequest} title={`Save (${saveShortcut})`} disabled={!activeIsDirty}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M2 2h7.5L11 3.5V11H2V2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <rect x="4" y="7.5" width="5" height="3" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
          <rect x="4.5" y="2" width="3.5" height="2.5" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
        </svg>
        <span class="save-btn-label">Save</span>
      </button>
      <button class="save-btn revert-btn" class:dirty={activeCanRevert} type="button" onclick={revertActiveRequestChanges} title="Revert unsaved changes" aria-label="Revert unsaved changes" disabled={!activeCanRevert}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M4.2 3.2H2v-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2.3 3.1A4.5 4.5 0 117 11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </button>
    {/if}
    <button class="searchbar-settings-btn" class:active={topView === 'runner'} type="button" onclick={openCollectionRunner} title="Collection runner" aria-label="Collection runner" disabled={workspaceBlocked}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="14.5" cy="4.5" r="2" stroke="currentColor" stroke-width="1.8"/>
        <path d="M9.5 9.5l3.4-1.8 2.4 3.1 3.2.6M12.2 10.6l-2 4.2-4 1.4M14.7 13.2l-1 3.7 2.5 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button class="searchbar-settings-btn searchbar-cookie-btn" type="button" onclick={openCookieJar} title="Cookies" aria-label="Cookies" disabled={workspaceBlocked}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20.6 13.1A8.5 8.5 0 1110.9 3.4a3 3 0 003.9 3.9 3 3 0 003.9 3.9 3 3 0 001.9 1.9z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        <path d="M8.2 9h.01M11.5 14.2h.01M7.4 16.2h.01M14.8 11.7h.01" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
      </svg>
      {#if cookieCount > 0}
        <span class="searchbar-cookie-count">{cookieCount > 99 ? '99+' : cookieCount}</span>
      {/if}
    </button>
    <button class="searchbar-settings-btn" type="button" onclick={() => openSettings('general')} title={`Settings (${settingsShortcut})`} aria-label="Settings">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z" stroke="currentColor" stroke-width="1.8"/>
        <path d="M19.6 13.5a7.8 7.8 0 000-3l2-1.45-2-3.46-2.42 1a8 8 0 00-2.6-1.5L14.25 2h-4.5l-.33 3.08a8 8 0 00-2.6 1.5l-2.42-1-2 3.46 2 1.45a7.8 7.8 0 000 3l-2 1.45 2 3.46 2.42-1a8 8 0 002.6 1.5l.33 3.08h4.5l.33-3.08a8 8 0 002.6-1.5l2.42 1 2-3.46-2-1.45z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      </svg>
    </button>
    <WindowControls />
  </div>
</div>

<div class="request-tabbar">
  <div class="request-tab-strip">
    <div class="saved-request-tabs" role="tablist" use:tabListKeyboard>
      <div class="saved-request-tab overview-request-tab" class:active={topView === 'overview'}>
        <button role="tab" type="button" aria-selected={topView === 'overview'} tabindex={topView === 'overview' ? 0 : -1} onclick={() => (topView = 'overview')}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 8.2h4.5M2 4.2h11M2 12.2h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <span class="tab-title">Overview</span>
        </button>
      </div>
      {#if collectionRunnerOpen}
        <div class="saved-request-tab runner-tab" class:active={topView === 'runner'} class:dirty={collectionRunnerRunning}>
          <button role="tab" type="button" aria-selected={topView === 'runner'} tabindex={topView === 'runner' ? 0 : -1} onclick={() => (topView = 'runner')} disabled={workspaceBlocked}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="14.5" cy="4.5" r="2" stroke="currentColor" stroke-width="1.8"/>
              <path d="M9.5 9.5l3.4-1.8 2.4 3.1 3.2.6M12.2 10.6l-2 4.2-4 1.4M14.7 13.2l-1 3.7 2.5 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="tab-title">Runner</span>
          </button>
          <button class="tab-close" type="button" onclick={closeCollectionRunner} aria-label="Close runner tab" disabled={workspaceBlocked}>×</button>
        </div>
      {/if}
      {#if gitTabOpen}
        <div class="saved-request-tab runner-tab git-workspace-tab" class:active={topView === 'git'} class:dirty={gitChangeCount > 0}>
          <button role="tab" type="button" aria-selected={topView === 'git'} tabindex={topView === 'git' ? 0 : -1} onclick={openGitTab}>
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <path d="M4 12.2V4.8a2 2 0 114 0v5.4a2 2 0 104 0V3" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
            </svg>
            <span class="tab-title">Git</span>
            {#if gitChangeCount > 0}
              <span class="git-tab-count">{gitChangeCount > 99 ? '99+' : gitChangeCount}</span>
            {/if}
          </button>
          <button class="tab-close" type="button" onclick={closeGitTab} aria-label="Close Git tab">×</button>
        </div>
      {/if}
      {#if activeCollectionSettings}
        <div class="saved-request-tab runner-tab" class:active={topView === 'collection'}>
          <button role="tab" type="button" aria-selected={topView === 'collection'} tabindex={topView === 'collection' ? 0 : -1} onclick={() => (topView = 'collection')} disabled={workspaceBlocked}>
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <path d="M2.2 4h3.3l1.2 1.2h6.1v6.1a1.2 1.2 0 01-1.2 1.2H3.4a1.2 1.2 0 01-1.2-1.2V4z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
              <path d="M5 8.2h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            <span class="tab-title">{activeCollectionSettings.name}</span>
          </button>
          <button class="tab-close" type="button" onclick={closeCollectionSettings} aria-label="Close collection settings" disabled={workspaceBlocked}>×</button>
        </div>
      {/if}
      {#each openRequests as req}
        <div class="saved-request-tab" class:active={req.id === activeRequestId && topView === 'request'} class:draft={req.isDraft} class:dirty={!autosave && !req.isDraft && dirtyRequestIdSet.has(req.id)}>
          <button role="tab" type="button" aria-selected={req.id === activeRequestId && topView === 'request'} tabindex={req.id === activeRequestId && topView === 'request' ? 0 : -1} onclick={() => switchRequest(req.id)} disabled={workspaceBlocked}>
            {#if req.isDraft}
              <span class="draft-dot" title="Unsaved draft"></span>
            {:else if !autosave && dirtyRequestIdSet.has(req.id)}
              <span class="dirty-dot" title="Unsaved changes"></span>
            {:else}
              <RequestTypeBadge request={req} variant="tab" />
            {/if}
            <span class="tab-title">{requestTabLabel(req)}</span>
          </button>
          <button class="tab-close" type="button" onclick={() => closeRequestTab(req.id)} aria-label="Close tab" disabled={workspaceBlocked}>×</button>
        </div>
      {/each}
    </div>
    <button class="tabbar-icon new-request-tab-btn" type="button" onclick={() => createDraftRequest()} title={workspaceBlocked ? 'Fix workspace YAML before creating requests' : 'New unsaved request'} aria-label="New unsaved request" disabled={workspaceBlocked}>+</button>
  </div>
  <div class="environment-switcher">
    <button class="environment-select" type="button" onclick={toggleEnvironmentMenu} aria-expanded={environmentMenuOpen} disabled={workspaceBlocked}>
      <span>{environmentLabel()}</span>
      <svg width="10" height="7" viewBox="0 0 10 7" fill="none" aria-hidden="true">
        <path d="M1.5 2L5 5.5L8.5 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
    {#if environmentMenuOpen}
      <div class="environment-menu">
        <button class:active={!activeEnvironmentId} type="button" onclick={() => useEnvironment('')} disabled={workspaceBlocked}>No environment</button>
        {#each activeWorkspaceEnvironments as environment}
          <button class:active={environment.id === activeEnvironmentId} type="button" onclick={() => useEnvironment(environment.id)} disabled={workspaceBlocked}>
            {environment.name}
            {#if environmentHasValues(environment)}<small>{environmentValueCount(environment)}</small>{/if}
          </button>
        {/each}
        <button type="button" onclick={() => { environmentMenuOpen = false; sidebarView = 'environments'; topView = 'environment'; }} disabled={workspaceBlocked}>Manage environments</button>
      </div>
    {/if}
  </div>
  {#if codePanelAvailable}
    <button class="tabbar-icon" class:active={codePanelOpen} type="button" onclick={() => (codePanelOpen = !codePanelOpen)} title="Code snippet" aria-label="Code snippet">
      &lt;/&gt;
    </button>
  {/if}
</div>
