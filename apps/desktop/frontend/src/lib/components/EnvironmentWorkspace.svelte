<script lang="ts">
  import type { Environment, KVRow } from '../types/models';

  let {
    activeEnvironment,
    activeEnvironmentId,
    autosave,
    environmentSaveState,
    createEnvironment,
    renameEnvironment,
    useEnvironment,
    deleteEnvironment,
    saveEnvironment,
    updateEnvironmentRow,
    removeEnvironmentRow,
    importEnvFromFile,
  }: {
    activeEnvironment: Environment | undefined;
    activeEnvironmentId: string;
    autosave: boolean;
    environmentSaveState: 'idle' | 'dirty' | 'saving' | 'saved';
    createEnvironment: () => void;
    renameEnvironment: (environmentId: string) => void;
    useEnvironment: (environmentId: string) => void;
    deleteEnvironment: (environmentId: string) => void;
    saveEnvironment: () => void;
    updateEnvironmentRow: (environmentId: string, index: number, patch: Partial<KVRow>) => void;
    removeEnvironmentRow: (environmentId: string, index: number) => void;
    importEnvFromFile: (environmentId: string) => void;
  } = $props();

  const ENVIRONMENT_ROW_PAGE_SIZE = 100;
  let valuePage = $state(0);
  let valuePageCount = $derived(pageCount(activeEnvironment?.values.length ?? 0, ENVIRONMENT_ROW_PAGE_SIZE));
  let visibleEnvironmentRows = $derived.by(() => {
    const values = activeEnvironment?.values ?? [];
    const start = valuePage * ENVIRONMENT_ROW_PAGE_SIZE;
    return values.slice(start, start + ENVIRONMENT_ROW_PAGE_SIZE).map((row, index) => ({ row, index: start + index }));
  });

  $effect(() => {
    activeEnvironment?.id;
    valuePage = 0;
  });

  $effect(() => {
    activeEnvironment?.values.length;
    if (valuePage >= valuePageCount) valuePage = Math.max(0, valuePageCount - 1);
  });

  function pageCount(total: number, size: number): number {
    return Math.max(1, Math.ceil(total / size));
  }

  function rangeLabel(page: number, size: number, total: number): string {
    if (!total) return '0 of 0';
    const start = page * size + 1;
    const end = Math.min(total, (page + 1) * size);
    return `${start}-${end} of ${total}`;
  }

  function inputValue(event: Event): string {
    const target = event.currentTarget;
    return target instanceof HTMLInputElement ? target.value : '';
  }

  function inputChecked(event: Event): boolean {
    const target = event.currentTarget;
    return target instanceof HTMLInputElement ? target.checked : false;
  }
</script>

<section class="environment-workspace">
  {#if activeEnvironment}
    <div class="environment-workspace-head">
      <div>
        <span class="overview-eyebrow">Environment</span>
        <h1>{activeEnvironment.name}</h1>
        <p>Use these variables in requests as {'{{variableName}}'}.</p>
      </div>
      <div class="overview-actions">
        {#if environmentSaveState !== 'idle'}
          <span class="env-save-indicator" class:saved={environmentSaveState === 'saved'} class:dirty={environmentSaveState === 'dirty'}>{environmentSaveState === 'saving' ? 'Saving changes...' : environmentSaveState === 'dirty' ? 'Unsaved changes' : 'Saved'}</span>
        {/if}
        {#if !autosave}
          <button class="btn-primary btn-sm" type="button" onclick={saveEnvironment} disabled={environmentSaveState !== 'dirty'}>Save</button>
        {/if}
        <button class="btn-secondary btn-sm" type="button" onclick={() => renameEnvironment(activeEnvironment.id)}>Rename</button>
        <button class="btn-secondary btn-sm" type="button" onclick={() => importEnvFromFile(activeEnvironment.id)} title="Import variables from a .env file">Import .env</button>
        <button class="btn-secondary btn-sm" type="button" onclick={createEnvironment}>New environment</button>
        <button class="btn-primary btn-sm" class:feedback-ok={activeEnvironmentId === activeEnvironment.id} type="button" onclick={() => useEnvironment(activeEnvironment.id)}>
          {activeEnvironmentId === activeEnvironment.id ? 'In use' : 'Use environment'}
        </button>
        <button class="btn-secondary btn-sm danger" type="button" onclick={() => deleteEnvironment(activeEnvironment.id)}>Delete</button>
      </div>
    </div>
    <div class="environment-editor-card">
      <div class="kv-head env-kv-head">
        <span></span>
        <span>Variable</span>
        <span>Type</span>
        <span>Value</span>
        <span>Description</span>
        <span></span>
      </div>
      {#each visibleEnvironmentRows as item (item.row.id)}
        {@const row = item.row}
        {@const i = item.index}
        <div class="kv-row env-kv-row" data-testid="environment-variable-row" class:inactive-row={!row.enabled && (row.key || row.value || row.description)} title={!row.enabled && (row.key || row.value || row.description) ? 'Disabled variables are not applied to requests' : ''}>
          <input type="checkbox" class="kv-check" checked={row.enabled} onchange={(event) => updateEnvironmentRow(activeEnvironment.id, i, { enabled: inputChecked(event) })} aria-label="Enable variable" disabled={!row.key && !row.value} />
          <input class="kv-input" value={row.key} placeholder="baseUrl" aria-label="Environment variable key" oninput={(event) => updateEnvironmentRow(activeEnvironment.id, i, { key: inputValue(event) })} spellcheck="false" />
          <button
            class="env-type-toggle"
            class:secret={row.secret}
            type="button"
            title={row.secret ? 'Secret variables are masked in UI, logs, and snippets' : 'Default variable'}
            onclick={() => updateEnvironmentRow(activeEnvironment.id, i, { secret: !row.secret })}
            disabled={!row.key && !row.value}
          >
            {row.secret ? 'Secret' : 'Default'}
          </button>
          <input class="kv-input" type={row.secret ? 'password' : 'text'} value={row.value} placeholder="https://api.example.com" aria-label="Environment variable value" oninput={(event) => updateEnvironmentRow(activeEnvironment.id, i, { value: inputValue(event) })} spellcheck="false" autocomplete="off" />
          <input class="kv-input kv-desc" value={row.description} placeholder="Description" aria-label="Environment variable description" oninput={(event) => updateEnvironmentRow(activeEnvironment.id, i, { description: inputValue(event) })} />
          <button class="kv-del" type="button" onclick={() => removeEnvironmentRow(activeEnvironment.id, i)} aria-label="Remove variable">✕</button>
        </div>
      {/each}
      {#if activeEnvironment.values.length > ENVIRONMENT_ROW_PAGE_SIZE}
        <div class="environment-pagination" aria-label="Environment variable pages">
          <span>Variables {rangeLabel(valuePage, ENVIRONMENT_ROW_PAGE_SIZE, activeEnvironment.values.length)}</span>
          <div class="environment-page-buttons">
            <button type="button" onclick={() => (valuePage = Math.max(0, valuePage - 1))} disabled={valuePage === 0}>Prev</button>
            <span>{valuePage + 1}/{valuePageCount}</span>
            <button type="button" onclick={() => (valuePage = Math.min(valuePageCount - 1, valuePage + 1))} disabled={valuePage + 1 >= valuePageCount}>Next</button>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="environment-empty-main">
      <span>No environment selected</span>
      <small>Create an environment to reuse variables in URLs, headers, params, auth, and bodies.</small>
      <button class="btn-primary btn-sm" type="button" onclick={createEnvironment}>Create environment</button>
    </div>
  {/if}
</section>
