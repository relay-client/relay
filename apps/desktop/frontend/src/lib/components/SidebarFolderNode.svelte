<script lang="ts">
  import { MAX_FOLDER_DEPTH, MAX_FOLDER_REQUESTS } from '../constants';
  import SidebarFolderNode from './SidebarFolderNode.svelte';
  import SidebarRequestRow from './SidebarRequestRow.svelte';
  import type { FolderGroup, SavedRequest, WorkspaceDiagnostic } from '../types/models';
  import type { TopView } from '../stores/ui';

  let {
    folder,
    collectionId,
    depth,
    sidebarSearch,
    activeRequestId,
    topView,
    openFolderMenuKey,
    openRequestMenuId,
    requestTabLabel,
    toggleFolderCollapsed,
    toggleFolderMenu,
    createRequestInFolder,
    createSubfolder,
    renameFolder,
    deleteFolder,
    runFolder,
    switchRequest,
    toggleRequestMenu,
    renameRequest,
    duplicateRequest,
    copyRequestCurl,
    toggleRequestPinned,
    deleteRequest,
    openWorkspaceDiagnostic,
  }: {
    folder: FolderGroup;
    collectionId: string;
    depth: number;
    sidebarSearch: string;
    activeRequestId: string;
    topView: TopView;
    openFolderMenuKey: string;
    openRequestMenuId: string;
    requestTabLabel: (request: SavedRequest) => string;
    toggleFolderCollapsed: (collectionId: string, path: string[]) => void;
    toggleFolderMenu: (key: string, event: MouseEvent) => void;
    createRequestInFolder: (collectionId: string, folderPath: string[]) => void;
    createSubfolder: (collectionId: string, parentPath: string[]) => void;
    renameFolder: (collectionId: string, folderPath: string[]) => void;
    deleteFolder: (collectionId: string, folderPath: string[]) => void;
    runFolder: (collectionId: string, folderPath: string[]) => void;
    switchRequest: (id: string) => void;
    toggleRequestMenu: (id: string, event: MouseEvent) => void;
    renameRequest: (id: string, name?: string) => void | Promise<void>;
    duplicateRequest: (id: string) => void;
    copyRequestCurl: (id: string) => void;
    toggleRequestPinned: (id: string) => void;
    deleteRequest: (id: string) => void;
    openWorkspaceDiagnostic: (diagnostics: WorkspaceDiagnostic[]) => void;
  } = $props();

  function folderCanAcceptRequest(value: FolderGroup) {
    return (value.requests?.length ?? 0) < MAX_FOLDER_REQUESTS;
  }

  function folderCanAcceptSubfolder(value: FolderGroup) {
    return (value.path?.length ?? 0) < MAX_FOLDER_DEPTH;
  }
</script>

<div class="collection-tree-node" style={`--tree-depth: ${depth}`}>
  <div class="collection-subfolder">
    <button class="subfolder-collapse" type="button" onclick={() => toggleFolderCollapsed(collectionId, folder.path)} aria-label={folder.collapsed ? 'Expand folder' : 'Collapse folder'}>
      <svg class:collapsed={folder.collapsed} width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <svg class="folder-icon" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M1.5 3.2h3l1.1 1.1h5.9v5.5a1.2 1.2 0 01-1.2 1.2H2.7a1.2 1.2 0 01-1.2-1.2V3.2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
    <span class="folder-title">{folder.name}</span>
    <span class="collection-count">{folder.requestCount}</span>
    <button class="folder-menu-btn" type="button" onclick={(event) => toggleFolderMenu(folder.key, event)} aria-label="Folder menu">•••</button>
    {#if openFolderMenuKey === folder.key}
      <div class="request-menu folder-menu">
        <button
          type="button"
          disabled={!folderCanAcceptRequest(folder)}
          title={folderCanAcceptRequest(folder) ? 'Add request' : `Limit: ${MAX_FOLDER_REQUESTS} requests in one folder`}
          onclick={() => createRequestInFolder(collectionId, folder.path)}
        >Add request</button>
        <button type="button" onclick={() => runFolder(collectionId, folder.path)}>Run folder</button>
        <button
          type="button"
          disabled={!folderCanAcceptSubfolder(folder)}
          title={folderCanAcceptSubfolder(folder) ? 'Add subfolder' : `Limit: ${MAX_FOLDER_DEPTH} folder levels`}
          onclick={() => createSubfolder(collectionId, folder.path)}
        >Add subfolder</button>
        <button type="button" onclick={() => renameFolder(collectionId, folder.path)}>Rename</button>
        <button class="danger" type="button" onclick={() => deleteFolder(collectionId, folder.path)}>Delete folder</button>
      </div>
    {/if}
  </div>
  {#if !folder.collapsed || sidebarSearch.trim()}
    <div class="collection-tree-children">
      {#if !folder.children.length && !folder.requests.length && !sidebarSearch.trim()}
        <div class="collection-empty" role="status" style={`--tree-depth: ${depth + 1}`}>
          <button type="button" class="collection-empty-row" onclick={() => createRequestInFolder(collectionId, folder.path)} disabled={!folderCanAcceptRequest(folder)}>
            <span class="collection-empty-plus" aria-hidden="true">+</span>
            Add request
          </button>
          <button type="button" class="collection-empty-row" onclick={() => createSubfolder(collectionId, folder.path)} disabled={!folderCanAcceptSubfolder(folder)}>
            <span class="collection-empty-plus" aria-hidden="true">+</span>
            Add folder
          </button>
        </div>
      {/if}
      {#each folder.children as child (child.key)}
        <SidebarFolderNode
          folder={child}
          {collectionId}
          depth={depth + 1}
          {sidebarSearch}
          {activeRequestId}
          {topView}
          {openFolderMenuKey}
          {openRequestMenuId}
          {requestTabLabel}
          {toggleFolderCollapsed}
          {toggleFolderMenu}
          {createRequestInFolder}
          {createSubfolder}
          {renameFolder}
          {deleteFolder}
          {runFolder}
          {switchRequest}
          {toggleRequestMenu}
          {renameRequest}
          {duplicateRequest}
          {copyRequestCurl}
          {toggleRequestPinned}
          {deleteRequest}
          {openWorkspaceDiagnostic}
        />
      {/each}
      {#each folder.requests as req}
        <SidebarRequestRow
          {req}
          depth={depth + 1}
          menuKey={`request:${req.id}`}
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
        />
      {/each}
    </div>
  {/if}
</div>
