<script lang="ts">
  import type { UpdateInfo } from '../backend';
  import type { SavedRequest } from '../types/models';
  import { requestTabLabel } from '../utils';
  import { vm } from '../stores/app.svelte';
  import { appLazyComponents as lazy } from '../stores/lazyComponents.svelte';
  import AppDialog from './AppDialog.svelte';
  import GitAuthModal from './GitAuthModal.svelte';
  import MissingSecretsModal from './MissingSecretsModal.svelte';

  type Props = {
    startupUpdateInfo: UpdateInfo | null;
    startupUpdateReady: boolean;
    autoUpdateInstall: boolean;
    autoUpdateInstalling: boolean;
    setAutoUpdateInstall: (value: boolean) => void;
    appRuntime: string;
    onUpdateInstalled: (info: UpdateInfo) => void;
  };

  let {
    startupUpdateInfo,
    startupUpdateReady,
    autoUpdateInstall,
    autoUpdateInstalling,
    setAutoUpdateInstall,
    appRuntime,
    onUpdateInstalled,
  }: Props = $props();
</script>

{#if vm.missingSecrets.length}
  <MissingSecretsModal
    secrets={vm.missingSecrets}
    values={vm.missingSecretValues}
    saving={vm.missingSecretsSaving}
    error={vm.missingSecretsError}
    onUpdate={vm.updateMissingSecretValue}
    onSave={vm.saveMissingSecrets}
    onDismiss={vm.dismissMissingSecretsWizard}
  />
{/if}

{#if vm.settingsOpen}
  {#if lazy.SettingsModalComponent}
    <lazy.SettingsModalComponent
      bind:settingsTab={vm.settingsTab}
      shortcutCaptureMessage={vm.shortcutCaptureMessage}
      shortcutEditingId={vm.shortcutEditingId}
      {appRuntime}
      appTheme={vm.appTheme}
      autosave={vm.autosave}
      scriptEngine={vm.scriptEngine}
      setScriptEngine={vm.setScriptEngine}
      shortcutGroups={vm.shortcutGroups}
      shortcutCombo={vm.shortcutCombo}
      shortcutKeycaps={vm.shortcutKeycaps}
      startShortcutCapture={vm.startShortcutCapture}
      resetShortcut={vm.resetShortcut}
      resetAllShortcuts={vm.resetAllShortcuts}
      setThemeMode={vm.setThemeMode}
      setThemeVariant={vm.setThemeVariant}
      proxyConfig={vm.proxyConfig}
      setProxyConfig={vm.setProxyConfig}
      setAutosave={vm.setAutosave}
      defaultWorkspaceLocationDraft={vm.defaultWorkspaceLocationDraft}
      defaultWorkspaceLocationStatus={vm.defaultWorkspaceLocationStatus}
      setDefaultWorkspaceLocationDraft={vm.setDefaultWorkspaceLocationDraft}
      saveDefaultWorkspaceLocation={vm.saveDefaultWorkspaceLocation}
      browseDefaultWorkspaceLocation={vm.browseDefaultWorkspaceLocation}
      exportAllData={vm.exportAllData}
      importAllData={vm.importAllData}
      dataTransferStatus={vm.dataTransferStatus}
      onClose={vm.closeSettings}
      {startupUpdateInfo}
      {startupUpdateReady}
      {autoUpdateInstall}
      {autoUpdateInstalling}
      {setAutoUpdateInstall}
      {onUpdateInstalled}
    />
  {/if}
{/if}

{#if vm.globalSearchOpen}
  {#if lazy.GlobalSearchModalComponent}
    <lazy.GlobalSearchModalComponent
      bind:query={vm.globalSearchQuery}
      results={vm.globalSearchResults}
      activeRequestId={vm.activeRequestId}
      {requestTabLabel}
      collectionLabel={(request: SavedRequest) => vm.collectionNameById(request.collectionId) || request.collection}
      {appRuntime}
      onSwitchRequest={vm.switchRequest}
      onClose={vm.closeGlobalSearch}
    />
  {/if}
{/if}

{#if vm.cookieJarOpen}
  {#if lazy.CookieJarModalComponent}
    <lazy.CookieJarModalComponent
      cookies={vm.cookies}
      loading={vm.cookieJarLoading}
      saving={vm.cookieJarSaving}
      error={vm.cookieJarError}
      defaultDomain={vm.cookieJarDefaultDomain}
      onRefresh={vm.refreshCookieJar}
      onSave={vm.saveCookie}
      onDelete={vm.removeCookie}
      onClear={vm.clearCookieJar}
      onClose={vm.closeCookieJar}
    />
  {/if}
{/if}

{#if vm.yamlEditorOpen}
  <div class="modal-overlay" role="presentation">
    <div class="modal yaml-editor-modal" role="dialog" aria-modal="true" aria-labelledby="yaml-editor-title" tabindex="-1">
      <div class="modal-header">
        <div>
          <span id="yaml-editor-title">Edit YAML</span>
          <small>{vm.yamlEditorPath}</small>
        </div>
        <button class="modal-close" type="button" onclick={vm.closeWorkspaceYAMLEditor} aria-label="Close">&times;</button>
      </div>
      {#if vm.yamlEditorLoading}
        <div class="yaml-editor-loading">Loading YAML&hellip;</div>
      {:else}
        <textarea
          class="modal-textarea yaml-editor-textarea"
          bind:value={vm.yamlEditorContent}
          spellcheck="false"
          disabled={vm.yamlEditorSaving}
        ></textarea>
      {/if}
      {#if vm.yamlEditorError}
        <div class="modal-error">{vm.yamlEditorError}</div>
      {/if}
      <div class="modal-footer">
        <button class="btn-secondary" type="button" onclick={vm.closeWorkspaceYAMLEditor} disabled={vm.yamlEditorSaving}>Cancel</button>
        <button class="btn-primary" type="button" onclick={vm.saveWorkspaceYAMLEditor} disabled={vm.yamlEditorLoading || vm.yamlEditorSaving}>
          {vm.yamlEditorSaving ? 'Saving\u2026' : 'Save YAML'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if vm.appDialog}
  <AppDialog
    dialog={vm.appDialog}
    bind:inputValue={vm.dialogInputValue}
    bind:selectOpen={vm.dialogSelectOpen}
    onCancel={vm.cancelDialog}
    onDismiss={vm.dismissDialog}
    onAlt={vm.altDialog}
    onSubmit={vm.submitDialog}
    onInputKeydown={vm.onDialogKeydown}
    onSelectKeydown={vm.onDialogSelectKeydown}
    selectLabel={vm.dialogSelectLabel}
    onChooseOption={vm.chooseDialogOption}
  />
{/if}

<GitAuthModal />
