<script lang="ts">
  import { vm } from '../stores/app.svelte';
  import { guardTrailing, removeRow, activeCount } from '../utils';
  import VariableInput from './VariableInput.svelte';
</script>

<div class="request-section-bar">
  <span class="request-section-title">Query Params</span>
  <span class="request-section-meta">{activeCount(vm.params)} active</span>
</div>
<div class="kv-table headers-kv-table" style="--kw: {vm.kvKeyW}px; --vw: {vm.kvValW}px">
  <div class="kv-head">
    <span></span>
    <span class="kv-head-cell">Key</span>
    <span class="kv-head-cell">Value</span>
    <span class="kv-head-cell">Description</span>
    <span></span>
  </div>
  <button class="kv-col-resizer kv-col-resizer--key" type="button" onmousedown={(e) => vm.startColResize('key', e)} aria-label="Resize key column"></button>
  <button class="kv-col-resizer kv-col-resizer--value" type="button" onmousedown={(e) => vm.startColResize('val', e)} aria-label="Resize value column"></button>
  {#each vm.params as row, i (row.id)}
    <div class="kv-row" data-testid="params-row">
      <input type="checkbox" class="kv-check" bind:checked={row.enabled} onchange={() => vm.syncUrlFromParams()} aria-label="Enable" disabled={!row.key && !row.value} />
      <VariableInput className="kv-input" bind:value={row.key} suggestions={vm.variableSuggestions} placeholder="Key" oninput={() => { guardTrailing(vm.params, i); vm.syncUrlFromParams(); }} />
      <VariableInput className="kv-input" bind:value={row.value} suggestions={vm.variableSuggestions} placeholder="Value" oninput={() => { guardTrailing(vm.params, i); vm.syncUrlFromParams(); }} />
      <input class="kv-input kv-desc" bind:value={row.description} placeholder="Description" />
      <button class="kv-del" type="button" onclick={() => { removeRow(vm.params, i); vm.syncUrlFromParams(); }} aria-label="Remove">✕</button>
    </div>
  {/each}
</div>
