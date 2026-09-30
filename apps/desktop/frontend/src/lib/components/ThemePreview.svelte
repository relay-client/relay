<script lang="ts">
  import type { ThemeVariantId } from '../theme';

  let { variant }: { variant: ThemeVariantId } = $props();

  const requests = [
    { method: 'get', name: 11 },
    { method: 'post', name: 14, active: true },
    { method: 'put', name: 9 },
    { method: 'delete', name: 12 },
    { method: 'get', name: 8 },
  ];

  const params = [
    { key: 7, value: 12 },
    { key: 9, value: 8 },
    { key: 6, value: 14 },
    { key: 8, value: 10 },
    { key: 5, value: 7 },
  ];

  const json: Array<{ indent: number; key?: number; kind?: 'str' | 'num' | 'bool'; value?: number; brace?: boolean }> = [
    { indent: 0, brace: true },
    { indent: 1, key: 5, kind: 'str', value: 11 },
    { indent: 1, key: 7, kind: 'num', value: 4 },
    { indent: 1, key: 4, kind: 'bool', value: 5 },
    { indent: 1, key: 6, kind: 'str', value: 9 },
    { indent: 1, key: 5, brace: true },
    { indent: 2, key: 4, kind: 'num', value: 3 },
    { indent: 2, key: 6, kind: 'str', value: 8 },
    { indent: 1, brace: true },
    { indent: 0, brace: true },
  ];
</script>

<div class="tp" data-theme-preview={variant} aria-hidden="true">
  <div class="tp-rail">
    <span class="tp-rail-icon active"></span>
    <span class="tp-rail-icon"></span>
    <span class="tp-rail-icon"></span>
    <span class="tp-rail-icon"></span>
  </div>

  <div class="tp-sidebar">
    <span class="tp-filter"></span>
    <span class="tp-folder"><i class="tp-bar muted" style="width: 12cqw"></i></span>
    {#each requests as request, index (index)}
      <span class="tp-request" class:active={request.active}>
        <i class="tp-bar tp-method {request.method}"></i>
        <i class="tp-bar muted" style="width: {request.name}cqw"></i>
      </span>
    {/each}
  </div>

  <div class="tp-main">
    <div class="tp-tabs">
      <span class="tp-tab active"><i class="tp-bar tp-method post short"></i><i class="tp-bar" style="width: 7cqw"></i></span>
      <span class="tp-tab"><i class="tp-bar tp-method get short"></i><i class="tp-bar muted" style="width: 6cqw"></i></span>
      <span class="tp-search"></span>
    </div>

    <div class="tp-request-bar">
      <span class="tp-url">
        <i class="tp-bar tp-method post"></i>
        <i class="tp-bar muted" style="width: 9cqw"></i>
        <i class="tp-bar tp-var" style="width: 6cqw"></i>
        <i class="tp-bar muted" style="width: 8cqw"></i>
      </span>
      <span class="tp-send"></span>
    </div>

    <div class="tp-split">
      <div class="tp-editor">
        <div class="tp-editor-tabs">
          <i class="tp-bar strong" style="width: 5cqw"></i>
          <i class="tp-bar faint" style="width: 5cqw"></i>
          <i class="tp-bar faint" style="width: 4cqw"></i>
        </div>
        {#each params as param, index (index)}
          <span class="tp-row">
            <i class="tp-check"></i>
            <i class="tp-bar" style="width: {param.key}cqw"></i>
            <i class="tp-bar muted" style="width: {param.value}cqw"></i>
          </span>
        {/each}
      </div>

      <div class="tp-response">
        <div class="tp-status">
          <i class="tp-bar tp-ok" style="width: 4cqw"></i>
          <i class="tp-bar faint" style="width: 4cqw"></i>
          <i class="tp-bar faint" style="width: 4cqw"></i>
        </div>
        {#each json as line, index (index)}
          <span class="tp-code" style="padding-left: {1.6 + line.indent * 2.4}cqw">
            {#if line.brace}
              {#if line.key}<i class="tp-bar tp-key" style="width: {line.key}cqw"></i>{/if}
              <i class="tp-bar faint" style="width: 1.2cqw"></i>
            {:else}
              <i class="tp-bar tp-key" style="width: {line.key}cqw"></i>
              <i class="tp-bar tp-{line.kind}" style="width: {line.value}cqw"></i>
            {/if}
          </span>
        {/each}
      </div>
    </div>
  </div>

  <div class="tp-statusbar">
    <i class="tp-bar faint" style="width: 6cqw"></i>
    <i class="tp-bar faint" style="width: 3cqw; margin-left: auto"></i>
  </div>
</div>

<style>
  .tp {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: 5cqw 23cqw minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) 3.4cqw;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
  }

  i {
    display: block;
    flex: 0 0 auto;
  }

  .tp-bar {
    height: 1.15cqw;
    border-radius: 1cqw;
    background: var(--text-2);
    opacity: 0.85;
  }

  .tp-bar.strong {
    background: var(--text);
    opacity: 1;
  }

  .tp-bar.muted {
    background: var(--text-3);
    opacity: 0.55;
  }

  .tp-bar.faint {
    background: var(--text-3);
    opacity: 0.35;
  }

  .tp-method {
    width: 3.4cqw;
    opacity: 1;
  }

  .tp-method.short {
    width: 2.4cqw;
  }

  .tp-method.get { background: var(--get); }
  .tp-method.post { background: var(--post); }
  .tp-method.put { background: var(--put); }
  .tp-method.delete { background: var(--delete); }

  .tp-var {
    background: var(--accent);
    opacity: 0.9;
  }

  .tp-ok {
    background: var(--s2xx);
    opacity: 1;
  }

  .tp-key { background: var(--syn-key); opacity: 1; }
  .tp-str { background: var(--syn-str); opacity: 1; }
  .tp-num { background: var(--syn-num); opacity: 1; }
  .tp-bool { background: var(--syn-bool); opacity: 1; }

  .tp-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.6cqw;
    padding-top: 2.6cqw;
    border-right: 1px solid var(--border-subtle);
    background: var(--surface);
  }

  .tp-rail-icon {
    width: 2cqw;
    height: 2cqw;
    border-radius: 0.6cqw;
    background: var(--text-3);
    opacity: 0.4;
  }

  .tp-rail-icon.active {
    background: var(--text);
    opacity: 0.9;
  }

  .tp-sidebar {
    display: flex;
    flex-direction: column;
    gap: 0.4cqw;
    min-width: 0;
    padding: 2cqw 1.4cqw;
    border-right: 1px solid var(--border-subtle);
    background: var(--surface);
  }

  .tp-filter {
    height: 3.2cqw;
    margin-bottom: 1.2cqw;
    border: 1px solid var(--border-subtle);
    border-radius: 0.9cqw;
  }

  .tp-folder,
  .tp-request {
    display: flex;
    align-items: center;
    gap: 1cqw;
    height: 3cqw;
    padding: 0 1cqw;
    border-radius: 0.7cqw;
  }

  .tp-request {
    padding-left: 2.2cqw;
  }

  .tp-request.active {
    background: var(--hover);
  }

  .tp-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .tp-tabs {
    display: flex;
    align-items: center;
    gap: 0.8cqw;
    height: 6.4cqw;
    padding: 0 1.6cqw;
    border-bottom: 1px solid var(--border-subtle);
  }

  .tp-tab {
    display: flex;
    align-items: center;
    gap: 0.8cqw;
    height: 3.6cqw;
    padding: 0 1.2cqw;
    border-radius: 0.8cqw;
  }

  .tp-tab.active {
    background: var(--hover);
  }

  .tp-search {
    width: 16cqw;
    height: 3.4cqw;
    margin-left: auto;
    border: 1px solid var(--border-subtle);
    border-radius: 0.9cqw;
  }

  .tp-request-bar {
    display: flex;
    align-items: center;
    gap: 1.2cqw;
    padding: 2cqw 1.8cqw 1.4cqw;
  }

  .tp-url {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.9cqw;
    height: 4.4cqw;
    padding: 0 1.4cqw;
    border: 1px solid var(--border);
    border-radius: 1cqw;
    background: var(--surface);
  }

  .tp-send {
    width: 8cqw;
    height: 4.4cqw;
    border-radius: 1cqw;
    background: var(--accent);
  }

  .tp-split {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    min-height: 0;
    border-top: 1px solid var(--border-subtle);
  }

  .tp-editor,
  .tp-response {
    display: flex;
    flex-direction: column;
    gap: 0.4cqw;
    min-width: 0;
    padding: 1.4cqw 1.8cqw;
  }

  .tp-response {
    padding-left: 0;
    border-left: 1px solid var(--border-subtle);
  }

  .tp-editor-tabs,
  .tp-status {
    display: flex;
    align-items: center;
    gap: 1.4cqw;
    height: 3.2cqw;
    margin-bottom: 0.6cqw;
  }

  .tp-status {
    padding-left: 1.6cqw;
  }

  .tp-row {
    display: flex;
    align-items: center;
    gap: 1.2cqw;
    height: 3cqw;
    border-bottom: 1px solid var(--border-subtle);
  }

  .tp-check {
    width: 1.6cqw;
    height: 1.6cqw;
    border-radius: 0.4cqw;
    background: var(--accent);
  }

  .tp-code {
    display: flex;
    align-items: center;
    gap: 1cqw;
    height: 2.3cqw;
  }

  .tp-statusbar {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
    gap: 1.4cqw;
    padding: 0 1.6cqw;
    border-top: 1px solid var(--border-subtle);
    background: var(--surface);
  }
</style>
