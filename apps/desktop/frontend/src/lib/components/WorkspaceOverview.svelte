<script lang="ts">
  import type { Workspace } from '../types/models';
  import type { SettingsTab } from '../stores/ui';

  let {
    activeWorkspace,
    workspaceBlocked = false,
    defaultWorkspace,
    workspaceRequestCount,
    collectionCount,
    updateWorkspaceDescription,
    renameWorkspace,
    createWorkspace,
    openSettings,
    createCollection,
    createNewRequest,
    createEnvironment,
    codePanelAvailable = true,
    onOpenCodePanel,
    onOpenGit,
  }: {
    activeWorkspace: Workspace | undefined;
    workspaceBlocked?: boolean;
    defaultWorkspace: string;
    workspaceRequestCount: () => number;
    collectionCount: number;
    updateWorkspaceDescription: (value: string) => void;
    renameWorkspace: () => void;
    createWorkspace: () => void;
    openSettings: (tab?: SettingsTab) => void;
    createCollection: () => void;
    createNewRequest: () => void;
    createEnvironment: () => void;
    codePanelAvailable?: boolean;
    onOpenCodePanel: () => void;
    onOpenGit: () => void;
  } = $props();

  function inputValue(event: Event): string {
    const target = event.currentTarget;
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value : '';
  }
</script>

<section class="workspace-overview">
  <div class="workspace-overview-header">
    <div>
      <span class="overview-eyebrow">Workspace</span>
      <h1>{activeWorkspace?.name ?? defaultWorkspace}</h1>
      <p>{workspaceRequestCount()} requests · {collectionCount} collections</p>
    </div>
    <div class="overview-actions">
      <button class="btn-secondary btn-sm" type="button" onclick={renameWorkspace} disabled={workspaceBlocked}>Rename workspace</button>
      <button class="btn-secondary btn-sm" type="button" onclick={createWorkspace}>New workspace</button>
      <button class="btn-primary btn-sm" type="button" onclick={createCollection} disabled={workspaceBlocked}>New collection</button>
    </div>
  </div>
  {#if collectionCount === 0 && workspaceRequestCount() === 0}
    <div class="overview-empty-hero">
      <svg width="44" height="44" viewBox="0 0 32 32" fill="none" aria-hidden="true" opacity="0.5">
        <path d="M5 9h6l2 2h14v15a2 2 0 01-2 2H5a2 2 0 01-2-2V11a2 2 0 012-2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M11 18h12M11 22h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <h2>Start by creating a collection</h2>
      <p>Collections group related API requests together. You can also import from Bruno/OpenCollection, Postman, Insomnia, OpenAPI, or HAR to get going in seconds.</p>
      <div class="overview-empty-actions">
        <button class="btn-primary btn-sm" type="button" onclick={createCollection} disabled={workspaceBlocked}>Create collection</button>
        <button class="btn-secondary btn-sm" type="button" onclick={() => createNewRequest()} disabled={workspaceBlocked}>New request</button>
      </div>
    </div>
  {/if}
  <div class="workspace-overview-grid">
    <div class="overview-panel">
      <span class="overview-panel-title">Workspace notes</span>
      <textarea
        value={activeWorkspace?.description ?? ''}
        oninput={(event) => updateWorkspaceDescription(inputValue(event))}
        placeholder="Write workspace notes, API conventions, auth hints, links, or anything useful for this workspace…"
        spellcheck="false"
        disabled={workspaceBlocked}
      ></textarea>
    </div>
    <div class="overview-panel">
      <span class="overview-panel-title">Quick actions</span>
      <div class="overview-action-list">
        <button type="button" onclick={createCollection} disabled={workspaceBlocked}>Create collection</button>
        <button type="button" onclick={() => createNewRequest()} disabled={workspaceBlocked}>Create request</button>
        <button type="button" onclick={createEnvironment} disabled={workspaceBlocked}>Create environment</button>
        <button type="button" onclick={onOpenGit}>Open Git sync</button>
        {#if codePanelAvailable}<button type="button" onclick={onOpenCodePanel} disabled={workspaceBlocked}>Open code snippet drawer</button>{/if}
        <button type="button" onclick={() => openSettings('shortcuts')}>Manage keyboard shortcuts</button>
      </div>
    </div>
  </div>
</section>
