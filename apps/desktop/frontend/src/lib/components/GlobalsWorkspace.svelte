<script lang="ts">
  import type { KVRow } from '../types/models';

  let {
    rows,
    autosave,
    saveState,
    updateRow,
    removeRow,
    clearAll,
    save,
  }: {
    rows: KVRow[];
    autosave: boolean;
    saveState: 'idle' | 'dirty' | 'saving' | 'saved';
    updateRow: (index: number, patch: Partial<KVRow>) => void;
    removeRow: (index: number) => void;
    clearAll: () => void;
    save: () => void;
  } = $props();

  let filled = $derived(rows.filter(row => row.key.trim() !== '').length);
  let saveLabel = $derived(
    saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'dirty' ? 'Unsaved changes' : '',
  );
</script>

<div class="globals-workspace">
  <header class="globals-header">
    <div class="globals-heading">
      <h2>Global variables</h2>
      <p>
        Available to every request in every workspace, and the scope
        <code>pm.globals.set()</code> writes to. An environment value with the same name wins.
      </p>
    </div>
    <div class="globals-actions">
      {#if saveLabel}<span class="globals-save-state" class:dirty={saveState === 'dirty'}>{saveLabel}</span>{/if}
      {#if !autosave}
        <button class="btn-primary btn-sm" type="button" onclick={save} disabled={saveState === 'saving'}>Save</button>
      {/if}
      <button class="btn-secondary btn-sm" type="button" onclick={clearAll} disabled={!filled}>Clear all</button>
    </div>
  </header>

  <div class="globals-table" role="table" aria-label="Global variables">
    <div class="globals-row globals-row-head" role="row">
      <span role="columnheader" class="globals-col-toggle"><span class="sr-only">Enabled</span></span>
      <span role="columnheader">Variable</span>
      <span role="columnheader">Value</span>
      <span role="columnheader" class="globals-col-actions"><span class="sr-only">Actions</span></span>
    </div>
    {#each rows as row, index (row.id)}
      <div class="globals-row" role="row">
        <span role="cell" class="globals-col-toggle">
          <input
            type="checkbox"
            checked={row.enabled}
            aria-label={`Enable ${row.key || 'variable'}`}
            onchange={event => updateRow(index, { enabled: event.currentTarget.checked })}
          />
        </span>
        <span role="cell">
          <input
            class="globals-input"
            value={row.key}
            placeholder="name"
            spellcheck="false"
            aria-label="Variable name"
            oninput={event => updateRow(index, { key: event.currentTarget.value })}
          />
        </span>
        <span role="cell">
          <input
            class="globals-input globals-input-mono"
            value={row.value}
            type={row.secret ? 'password' : 'text'}
            placeholder="value"
            spellcheck="false"
            aria-label="Variable value"
            oninput={event => updateRow(index, { value: event.currentTarget.value })}
          />
        </span>
        <span role="cell" class="globals-col-actions">
          <button
            class="globals-secret-toggle"
            class:active={row.secret}
            type="button"
            aria-pressed={Boolean(row.secret)}
            title={row.secret ? 'Shown as a secret' : 'Mark as secret'}
            onclick={() => updateRow(index, { secret: !row.secret })}
          >Secret</button>
          <button
            class="globals-remove"
            type="button"
            aria-label={`Remove ${row.key || 'variable'}`}
            onclick={() => removeRow(index)}
          >×</button>
        </span>
      </div>
    {/each}
  </div>
</div>

<style>
  .globals-workspace {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .globals-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    padding: 16px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .globals-heading h2 {
    margin: 0;
    color: var(--text);
    font-size: 13px;
    font-weight: 800;
  }

  .globals-heading p {
    margin: 5px 0 0;
    max-width: 62ch;
    color: var(--text-3);
    font-size: 12px;
    line-height: 1.5;
  }

  .globals-heading code {
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .globals-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .globals-save-state {
    color: var(--text-3);
    font-size: 11px;
  }
  .globals-save-state.dirty { color: var(--accent); }

  .globals-table {
    display: flex;
    flex-direction: column;
    padding: 8px 16px 24px;
  }

  .globals-row {
    display: grid;
    grid-template-columns: 34px minmax(140px, 1fr) minmax(180px, 2fr) 110px;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .globals-row-head {
    color: var(--text-3);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .globals-col-toggle { display: grid; place-items: center; }
  .globals-col-toggle input { accent-color: var(--accent); }

  .globals-col-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }

  .globals-input {
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--text);
    font-size: 12px;
  }
  .globals-input:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--elevated);
  }
  .globals-input-mono { font-family: var(--font-mono); font-size: 11px; }

  .globals-secret-toggle {
    height: 22px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: transparent;
    color: var(--text-3);
    font-size: 10px;
    font-weight: 700;
  }
  .globals-secret-toggle.active {
    border-color: var(--accent);
    background: var(--accent-dim);
    color: var(--text);
  }

  .globals-remove {
    width: 22px;
    height: 22px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--text-3);
    font-size: 14px;
    line-height: 1;
  }
  .globals-remove:hover {
    border-color: var(--border);
    color: var(--text);
    background: var(--hover);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
