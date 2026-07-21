<script lang="ts">
  import { trapFocus } from '../a11y';
  import type { WorkspaceSecretRef } from '../backend';

  let {
    secrets,
    values,
    saving,
    error,
    onUpdate,
    onSave,
    onDismiss,
  }: {
    secrets: WorkspaceSecretRef[];
    values: Record<string, string>;
    saving: boolean;
    error: string;
    onUpdate: (key: string, value: string) => void;
    onSave: () => void | Promise<void>;
    onDismiss: () => void;
  } = $props();
</script>

<div class="dialog-backdrop" role="presentation" onmousedown={(event) => event.target === event.currentTarget && onDismiss()}>
  <div class="missing-secrets-modal" role="dialog" aria-modal="true" aria-labelledby="missing-secrets-title" tabindex="-1" use:trapFocus>
    <div class="dialog-head">
      <h2 id="missing-secrets-title">Missing secrets</h2>
      <button type="button" class="dialog-close" onclick={onDismiss} aria-label="Close dialog">×</button>
    </div>
    <div class="missing-secrets-body">
      <p>{secrets.length} secret value{secrets.length === 1 ? '' : 's'} needed for this workspace.</p>
      <div class="missing-secrets-list">
        {#each secrets as secret}
          <label>
            <span>{secret.label}</span>
            <small>{secret.key}</small>
            <input
              type="password"
              value={values[secret.key] ?? ''}
              autocomplete="off"
              spellcheck="false"
              data-autofocus
              oninput={(event) => onUpdate(secret.key, event.currentTarget.value)}
            />
          </label>
        {/each}
      </div>
      {#if error}
        <div class="missing-secrets-error">{error}</div>
      {/if}
    </div>
    <div class="dialog-actions">
      <button class="btn-secondary" type="button" onclick={onDismiss} disabled={saving}>Skip</button>
      <button class="btn-primary" type="button" onclick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save secrets'}</button>
    </div>
  </div>
</div>
