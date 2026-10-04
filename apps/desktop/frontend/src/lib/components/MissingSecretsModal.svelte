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
  <div class="modal missing-secrets-modal" role="dialog" aria-modal="true" aria-labelledby="missing-secrets-title" tabindex="-1" use:trapFocus>
    <div class="modal-head dialog-head">
      <h2 class="modal-title" id="missing-secrets-title">Missing secrets</h2>
      <button type="button" class="btn btn-ghost btn-icon dialog-close" onclick={onDismiss} aria-label="Close dialog">×</button>
    </div>
    <div class="missing-secrets-body">
      <p>This workspace references {secrets.length} secret{secrets.length === 1 ? '' : 's'} that {secrets.length === 1 ? "isn't" : "aren't"} stored on this machine. Kurlo keeps secret values out of Git.</p>
      <div class="missing-secrets-list">
        {#each secrets as secret, index (secret.key)}
          <label>
            <span>{secret.label}</span>
            <small>{secret.key}</small>
            <input class="field"
              type="password"
              value={values[secret.key] ?? ''}
              autocomplete="off"
              spellcheck="false"
              data-autofocus={index === 0 ? '' : undefined}
              oninput={(event) => onUpdate(secret.key, event.currentTarget.value)}
            />
          </label>
        {/each}
      </div>
      {#if error}
        <div class="missing-secrets-error">{error}</div>
      {/if}
    </div>
    <div class="modal-foot dialog-actions">
      <button class="btn btn-secondary btn-lg" type="button" onclick={onDismiss} disabled={saving}>Skip</button>
      <button class="btn btn-primary btn-lg" type="button" onclick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save secrets'}</button>
    </div>
  </div>
</div>
