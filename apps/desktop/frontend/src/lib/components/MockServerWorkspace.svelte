<script lang="ts">
  import type { MockRequestLog, MockRoute, MockServerStatus } from '../backend';

  let {
    status,
    routes,
    collections,
    selectedCollectionId,
    port,
    simulateLatency,
    busy,
    error,
    log,
    onToggle,
    onRestart,
    onSelectCollection,
    onPortChange,
    onSimulateLatencyChange,
    onClearLog,
    onCopyUrl,
  }: {
    status: MockServerStatus;
    routes: MockRoute[];
    collections: Array<{ id: string; name: string; exampleCount: number }>;
    selectedCollectionId: string;
    port: number;
    simulateLatency: boolean;
    busy: boolean;
    error: string;
    log: MockRequestLog[];
    onToggle: () => void;
    onRestart: () => void;
    onSelectCollection: (id: string) => void;
    onPortChange: (port: number) => void;
    onSimulateLatencyChange: (value: boolean) => void;
    onClearLog: () => void;
    onCopyUrl: (url: string) => void;
  } = $props();

  const reversedLog = $derived([...log].reverse());
  const servedElsewhere = $derived(
    status.running && status.collectionId !== '' && status.collectionId !== selectedCollectionId,
  );

  function statusClass(code: number) {
    if (code >= 500) return 'mock-status-5xx';
    if (code >= 400) return 'mock-status-4xx';
    if (code >= 300) return 'mock-status-3xx';
    return 'mock-status-2xx';
  }

  function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleTimeString();
  }
</script>

<div class="mock-workspace">
  <header class="mock-head">
    <div class="mock-head-text">
      <h1>Mock server</h1>
      <p>Serve a collection's saved examples over HTTP, so a client can be built before the API exists.</p>
    </div>
    <button
      class="mock-toggle"
      class:running={status.running}
      type="button"
      disabled={busy || (!status.running && routes.length === 0)}
      onclick={onToggle}
    >
      {status.running ? 'Stop' : 'Start'}
    </button>
  </header>

  {#if status.running}
    <div class="mock-running">
      <span class="mock-dot" aria-hidden="true"></span>
      <code>{status.url}</code>
      <button type="button" class="mock-copy" onclick={() => onCopyUrl(status.url)}>Copy</button>
      <span class="mock-running-meta">
        serving {status.routeCount} example{status.routeCount === 1 ? '' : 's'} from {status.collectionName || 'this collection'}
      </span>
    </div>
  {/if}

  {#if error}
    <p class="mock-error" role="alert">{error}</p>
  {/if}

  {#if servedElsewhere}
    <p class="mock-note">
      The running server is serving <strong>{status.collectionName}</strong>. Starting again switches it to the collection selected below.
    </p>
  {/if}

  <section class="mock-config">
    <label class="mock-field">
      <span>Collection</span>
      <select
        value={selectedCollectionId}
        onchange={(event) => onSelectCollection((event.currentTarget as HTMLSelectElement).value)}
      >
        {#each collections as collection}
          <option value={collection.id}>
            {collection.name} — {collection.exampleCount} example{collection.exampleCount === 1 ? '' : 's'}
          </option>
        {/each}
      </select>
    </label>

    <label class="mock-field mock-field-narrow">
      <span>Port</span>
      <input
        type="number"
        min="1"
        max="65535"
        value={port}
        onchange={(event) => onPortChange(Number((event.currentTarget as HTMLInputElement).value))}
      />
    </label>

    <label class="mock-check">
      <input
        type="checkbox"
        checked={simulateLatency}
        onchange={(event) => onSimulateLatencyChange((event.currentTarget as HTMLInputElement).checked)}
      />
      <span>Reproduce each example's recorded response time</span>
    </label>

    {#if status.running}
      <button type="button" class="mock-secondary" onclick={onRestart} disabled={busy}>
        Reload examples
      </button>
    {/if}
  </section>

  <section class="mock-routes">
    <h2>Routes <span class="mock-count">{routes.length}</span></h2>
    {#if routes.length === 0}
      <p class="mock-empty">
        This collection has no saved examples yet. Send a request and use <strong>Save as example</strong> in the response panel — the mock serves what you captured.
      </p>
    {:else}
      <ul>
        {#each routes as route (route.exampleId)}
          <li>
            <span class="mock-method">{route.method.toUpperCase()}</span>
            <code class="mock-path">{route.pathTemplate}</code>
            <span class={`mock-code ${statusClass(route.statusCode)}`}>{route.statusCode}</span>
            <span class="mock-route-name">{route.requestName} · {route.exampleName}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="mock-log">
    <h2>
      Requests <span class="mock-count">{log.length}</span>
      {#if log.length}
        <button type="button" class="mock-secondary mock-clear" onclick={onClearLog}>Clear</button>
      {/if}
    </h2>
    {#if log.length === 0}
      <p class="mock-empty">
        {status.running
          ? 'Nothing has hit the mock yet. Point a client at the URL above.'
          : 'Start the server to see what your client asks for.'}
      </p>
    {:else}
      <ul>
        {#each reversedLog as entry (entry.id)}
          <li class:unmatched={!entry.matched}>
            <span class="mock-time">{formatTime(entry.timestamp)}</span>
            <span class="mock-method">{entry.method}</span>
            <code class="mock-path">{entry.path}{entry.query ? `?${entry.query}` : ''}</code>
            <span class={`mock-code ${statusClass(entry.statusCode)}`}>{entry.statusCode}</span>
            <span class="mock-route-name">
              {entry.matched ? `${entry.requestName} · ${entry.exampleName}` : 'no example matched'}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
