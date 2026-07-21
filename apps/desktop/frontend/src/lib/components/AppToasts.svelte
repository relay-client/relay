<script lang="ts">
  import { vm } from '../stores/app.svelte';
</script>

<div
  class="save-status"
  class:visible={vm.saveStatus !== 'idle'}
  class:is-error={vm.saveStatus === 'error'}
  aria-live="polite"
>
  {#if vm.saveStatus === 'saving'}
    <span class="save-status-dot" aria-hidden="true"></span>Saving&hellip;
  {:else if vm.saveStatus === 'error'}
    <svg width="12" height="12" viewBox="0 0 13 13" fill="none" aria-hidden="true"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 3.6v3.6M6.5 9.2v.05" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Save failed
  {:else}
    <svg width="12" height="12" viewBox="0 0 13 13" fill="none" aria-hidden="true"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M4 6.5l2 2 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>Saved
  {/if}
</div>

{#if vm.curlPasteToast}<div class="curl-toast">cURL imported</div>{/if}
{#if vm.collectionImportToast}<div class="curl-toast">{vm.collectionImportToast}</div>{/if}
{#if vm.environmentToast}<div class="curl-toast">{vm.environmentToast}</div>{/if}
{#if vm.gitToast}<div class="git-toast" role="status" aria-live="polite"><span class="git-toast-dot"></span><span>{vm.gitToast}</span></div>{/if}
