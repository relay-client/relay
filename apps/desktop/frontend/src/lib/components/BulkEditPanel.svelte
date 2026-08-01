<script lang="ts">
  import { untrack } from 'svelte';
  import { bulkTextToRows, rowsToBulkText } from '../bulkEdit';
  import type { KVRow } from '../types/models';

  let {
    rows,
    apply,
    hint = 'One key:value per line. Prefix a line with // to disable it.',
  }: { rows: KVRow[]; apply: (next: KVRow[]) => void; hint?: string } = $props();

  // Seeded once from the rows as they are on open; from then on the textarea
  // owns the text so typing never fights the round-trip through the rows.
  let text = $state(untrack(() => rowsToBulkText(rows)));
  // What the rows looked like the last time this panel wrote them. When the
  // rows change to anything else — a different request was opened, or the
  // table was edited elsewhere — the textarea reloads instead of overwriting
  // with stale text.
  let lastApplied = $state(untrack(() => rowsToBulkText(rows)));

  $effect(() => {
    const current = rowsToBulkText(rows);
    if (current !== lastApplied) {
      text = current;
      lastApplied = current;
    }
  });

  function onInput(event: Event) {
    const target = event.currentTarget;
    if (!(target instanceof HTMLTextAreaElement)) return;
    text = target.value;
    const next = bulkTextToRows(text, rows);
    lastApplied = rowsToBulkText(next);
    apply(next);
  }
</script>

<div class="bulk-edit">
  <textarea
    class="bulk-edit-input"
    value={text}
    spellcheck="false"
    autocomplete="off"
    autocapitalize="off"
    placeholder={'Content-Type:application/json\nAuthorization:Bearer {{token}}\n//X-Debug:1'}
    aria-label="Bulk edit"
    oninput={onInput}
  ></textarea>
  <p class="bulk-edit-hint">{hint}</p>
</div>
