<script lang="ts">
  import { vm } from '../stores/app.svelte';
</script>

<div class="docs-tab">
  <textarea
    class="docs-textarea"
    bind:value={vm.requestNotes}
    placeholder="Add notes about this request — purpose, example responses, edge cases, links to documentation…"
    spellcheck="false"
  ></textarea>
</div>
