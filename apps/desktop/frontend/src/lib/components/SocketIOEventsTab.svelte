<script lang="ts">
  import { vm } from '../stores/app.svelte';

  function inputValue(event: Event): string {
    const target = event.currentTarget;
    return target instanceof HTMLInputElement ? target.value : '';
  }
</script>

<div class="sio-events-wrap">
  <div class="sio-events-header">
    <span class="sio-col-event">Event name</span>
    <span class="sio-col-listen">Listen</span>
    <span class="sio-col-desc">Description</span>
    <span class="sio-col-del"></span>
  </div>
  <div class="sio-events-body">
    {#each vm.sioEventsWithTrailing() as row (row.id)}
      <div class="sio-event-row" class:sio-row-disabled={!row.enabled}>
        <div class="sio-col-event">
          <input
            class="sio-input"
            type="text"
            value={row.key}
            placeholder="Add event…"
            spellcheck="false"
            oninput={(event) => vm.updateSioEventRow(row.id, { key: inputValue(event) })}
          />
        </div>
        <div class="sio-col-listen">
          <button
            class="sio-listen-btn"
            class:active={row.enabled}
            type="button"
            title={row.enabled ? 'Listening — click to stop' : 'Not listening — click to listen'}
            onclick={() => vm.updateSioEventRow(row.id, { enabled: !row.enabled })}
          >
            <span class="sio-listen-dot"></span>
            {row.enabled ? 'On' : 'Off'}
          </button>
        </div>
        <div class="sio-col-desc">
          <input
            class="sio-input"
            type="text"
            value={row.description}
            placeholder="Description"
            spellcheck="false"
            oninput={(event) => vm.updateSioEventRow(row.id, { description: inputValue(event) })}
          />
        </div>
        <div class="sio-col-del">
          {#if row.key !== ''}
            <button
              class="sio-del-btn"
              type="button"
              title="Remove"
              onclick={() => vm.removeSioEventRow(row.id)}
              aria-label="Remove event"
            >×</button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .sio-events-wrap {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: auto;
    font-size: 12.5px;
  }

  .sio-events-header {
    display: flex;
    align-items: center;
    padding: 0 6px;
    height: 30px;
    border-bottom: 1px solid var(--border, #e5e5e5);
    font-size: 11.5px;
    font-weight: 500;
    color: var(--text-secondary, #888);
    flex-shrink: 0;
  }

  .sio-events-body {
    flex: 1;
    overflow-y: auto;
  }

  .sio-event-row {
    display: flex;
    align-items: center;
    padding: 0 6px;
    min-height: 34px;
    border-bottom: 1px solid var(--border-subtle, #f0f0f0);
  }
  .sio-event-row:hover { background: var(--hover-bg, rgba(0,0,0,0.02)); }

  .sio-col-event { flex: 0 0 38%; min-width: 0; padding-right: 4px; }
  .sio-col-listen { flex: 0 0 80px; display: flex; justify-content: center; }
  .sio-col-desc { flex: 1; min-width: 0; padding-left: 4px; padding-right: 4px; }
  .sio-col-del { flex: 0 0 28px; display: flex; justify-content: center; }

  .sio-input {
    width: 100%;
    border: none;
    background: transparent;
    font-size: 12.5px;
    padding: 5px 6px;
    color: var(--text-primary, #eee);
    outline: none;
    font-family: inherit;
  }
  .sio-input:focus {
    background: var(--input-focus-bg, rgba(255,255,255,0.05));
    border-radius: 3px;
  }
  .sio-input::placeholder { color: var(--text-placeholder, #666); }
  .sio-row-disabled .sio-input { opacity: 0.4; }

  .sio-listen-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 10px;
    border: 1px solid var(--border, #555);
    background: transparent;
    font-size: 11px;
    color: var(--text-secondary, #888);
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s, color 0.1s;
  }
  .sio-listen-btn.active {
    background: color-mix(in srgb, #10b981 15%, transparent);
    border-color: color-mix(in srgb, #10b981 50%, transparent);
    color: #10b981;
  }
  .sio-listen-btn:hover:not(.active) {
    background: var(--hover-bg, rgba(255,255,255,0.05));
    border-color: var(--text-secondary, #888);
    color: var(--text-primary, #eee);
  }

  .sio-listen-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.8;
  }

  .sio-del-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary, #999);
    font-size: 16px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 3px;
  }
  .sio-del-btn:hover { color: var(--text-danger, #e53); background: var(--hover-bg, rgba(0,0,0,0.05)); }
</style>
