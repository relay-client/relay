<script lang="ts">
  import { requestSupportsCurl } from '../utils';
  import RequestTypeBadge from './RequestTypeBadge.svelte';
  import type { SavedRequest, WorkspaceDiagnostic } from '../types/models';
  import type { TopView } from '../stores/ui';

  let {
    req,
    depth,
    menuKey,
    activeRequestId,
    topView,
    openRequestMenuId,
    requestTabLabel,
    switchRequest,
    toggleRequestMenu,
    renameRequest,
    duplicateRequest,
    copyRequestCurl,
    toggleRequestPinned,
    deleteRequest,
    openWorkspaceDiagnostic,
    disabled = false,
  }: {
    req: SavedRequest;
    depth: number;
    menuKey: string;
    activeRequestId: string;
    topView: TopView;
    openRequestMenuId: string;
    requestTabLabel: (request: SavedRequest) => string;
    switchRequest: (id: string) => void;
    toggleRequestMenu: (id: string, event: MouseEvent) => void;
    renameRequest: (id: string, name?: string) => void | Promise<void>;
    duplicateRequest: (id: string) => void;
    copyRequestCurl: (id: string) => void;
    toggleRequestPinned: (id: string) => void;
    deleteRequest: (id: string) => void;
    openWorkspaceDiagnostic: (diagnostics: WorkspaceDiagnostic[]) => void;
    disabled?: boolean;
  } = $props();

  let editingRequestName = $state('');
  let editingRequestInput = $state<HTMLInputElement | undefined>();
  let editingRequest = $state(false);

  $effect(() => {
    if (!editingRequest || !editingRequestInput) return;
    editingRequestInput.focus();
    editingRequestInput.select();
  });

  function startRequestInlineRename(event: MouseEvent) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    editingRequestName = requestTabLabel(req);
    editingRequest = true;
  }

  function cancelRequestInlineRename() {
    editingRequest = false;
    editingRequestName = '';
    editingRequestInput = undefined;
  }

  async function commitRequestInlineRename() {
    const name = editingRequestName.trim();
    const id = req.id;
    const currentName = requestTabLabel(req);
    cancelRequestInlineRename();
    if (!name || name === currentName) return;
    await renameRequest(id, name);
  }

  function onRequestNameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitRequestInlineRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelRequestInlineRename();
    }
  }

  function openDiagnostics(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    openWorkspaceDiagnostic(req.workspaceDiagnostics ?? []);
  }
</script>

<div
  class="collection-request-wrap"
  class:in-folder={depth >= 0}
  class:active={req.id === activeRequestId && topView === 'request'}
  class:editing={editingRequest}
  class:has-diagnostic={Boolean(req.workspaceDiagnostics?.length)}
  style={depth >= 0 ? `--tree-depth: ${depth}` : ''}
>
  {#if editingRequest}
    <div class="collection-request collection-request-editor">
      <RequestTypeBadge request={req} invalid={req.isInvalid} />
      <input
        class="sidebar-request-title-input"
        bind:this={editingRequestInput}
        bind:value={editingRequestName}
        aria-label="Sidebar request name"
        spellcheck="false"
        onblur={commitRequestInlineRename}
        onkeydown={onRequestNameKeydown}
      />
    </div>
  {:else}
    <button class="collection-request" type="button" title={requestTabLabel(req)} onclick={() => switchRequest(req.id)} ondblclick={startRequestInlineRename} disabled={disabled}>
      <RequestTypeBadge request={req} invalid={req.isInvalid} />
      <span class="collection-title">{requestTabLabel(req)}</span>
    </button>
  {/if}
  {#if req.workspaceDiagnostics?.length}
    <button
      class="workspace-diagnostic-chip request-diagnostic-chip"
      type="button"
      title={req.workspaceDiagnostics[0].message}
      aria-label="Request YAML error"
      onclick={openDiagnostics}
    >!</button>
  {/if}
  {#if !req.isDraft && !req.isInvalid}
    <button
      class="request-star-btn"
      class:active={req.isPinned}
      type="button"
      onclick={(event) => { event.stopPropagation(); toggleRequestPinned(req.id); }}
      aria-label={req.isPinned ? 'Unstar request' : 'Star request'}
      title={req.isPinned ? 'Unstar request' : 'Star request'}
      disabled={disabled}
    >★</button>
  {/if}
  {#if !req.isInvalid}
    <button class="request-menu-btn" type="button" onclick={(event) => toggleRequestMenu(menuKey, event)} aria-label="Request menu" disabled={disabled}>•••</button>
  {/if}
  {#if !req.isInvalid && openRequestMenuId === menuKey}
    <div class="request-menu">
      <button type="button" onclick={() => renameRequest(req.id)} disabled={disabled}>Rename</button>
      <button type="button" onclick={() => duplicateRequest(req.id)} disabled={disabled}>Duplicate</button>
      {#if !req.isDraft}<button type="button" onclick={() => toggleRequestPinned(req.id)} disabled={disabled}>{req.isPinned ? 'Unstar' : 'Star'}</button>{/if}
      {#if requestSupportsCurl(req)}<button type="button" onclick={() => copyRequestCurl(req.id)} disabled={disabled}>Copy cURL</button>{/if}
      <button class="danger" type="button" onclick={() => deleteRequest(req.id)} disabled={disabled}>Delete</button>
    </div>
  {/if}
</div>
