<script lang="ts">
  import type { Collection, CollectionRunnerResult, SavedRequest } from '../types/models';
  import { MAX_RUNNER_CONCURRENCY, MIN_RUNNER_CONCURRENCY } from '../concurrency';
  import Select from './Select.svelte';

  let {
    collections,
    selectedCollectionId,
    requests,
    filteredRequests,
    selectedRequestIds,
    selectedCount,
    delayMs,
    includeTags,
    excludeTags,
    iterations,
    dataFileName,
    dataRowCount,
    dataError,
    parallel,
    concurrency,
    running,
    title,
    results,
    summary,
    methodColor,
    requestTabLabel,
    requestTransportLabel,
    requestTags,
    isRequestSkipped,
    onSelectCollection,
    onSetDelayMs,
    onSetIncludeTags,
    onSetExcludeTags,
    onSetIterations,
    onSelectDataFile,
    onClearDataFile,
    onSetParallel,
    onSetConcurrency,
    onToggleRequest,
    onSelectAll,
    onDeselectAll,
    onReset,
    onDownloadReport,
    onRun,
    onStop,
  }: {
    collections: Collection[];
    selectedCollectionId: string;
    requests: SavedRequest[];
    filteredRequests: SavedRequest[];
    selectedRequestIds: Set<string>;
    selectedCount: number;
    delayMs: number;
    includeTags: string;
    excludeTags: string;
    iterations: number;
    dataFileName: string;
    dataRowCount: number;
    dataError: string;
    parallel: boolean;
    concurrency: number;
    running: boolean;
    title: string;
    results: CollectionRunnerResult[];
    summary: { total: number; completed: number; passed: number; failed: number; skipped: number; testsPassed: number; testsTotal: number; duration: number; allPassed: boolean };
    methodColor: (method: string) => string;
    requestTabLabel: (request: SavedRequest) => string;
    requestTransportLabel: (request: SavedRequest) => string;
    requestTags: (request: SavedRequest) => string[];
    isRequestSkipped: (request: SavedRequest) => boolean;
    onSelectCollection: (collectionId: string) => void;
    onSetDelayMs: (value: string | number) => void;
    onSetIncludeTags: (value: string) => void;
    onSetExcludeTags: (value: string) => void;
    onSetIterations: (value: string | number) => void;
    onSelectDataFile: () => void | Promise<void>;
    onClearDataFile: () => void;
    onSetParallel: (value: boolean) => void;
    onSetConcurrency: (value: string | number) => void;
    onToggleRequest: (requestId: string) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onReset: () => void;
    onDownloadReport: () => void | Promise<void>;
    onRun: () => void | Promise<void>;
    onStop: () => void;
  } = $props();

  let selectedSet = $derived(selectedRequestIds);
  let collectionOptions = $derived(collections.map(collection => ({ value: collection.id, label: collection.name })));
  let runnableCount = $derived(filteredRequests.filter(request => !isRequestSkipped(request)).length);
  let runCount = $derived(selectedCount * Math.max(1, iterations));
  let hasResults = $derived(results.length > 0);
  const RUNNER_REQUEST_PAGE_SIZE = 100;
  const RUNNER_RESULT_PAGE_SIZE = 100;
  let requestPage = $state(0);
  let resultPage = $state(0);
  let requestPageCount = $derived(pageCount(filteredRequests.length, RUNNER_REQUEST_PAGE_SIZE));
  let resultPageCount = $derived(pageCount(results.length, RUNNER_RESULT_PAGE_SIZE));
  let visibleRequests = $derived(filteredRequests.slice(requestPage * RUNNER_REQUEST_PAGE_SIZE, (requestPage + 1) * RUNNER_REQUEST_PAGE_SIZE));
  let visibleResults = $derived(results.slice(resultPage * RUNNER_RESULT_PAGE_SIZE, (resultPage + 1) * RUNNER_RESULT_PAGE_SIZE));

  $effect(() => {
    filteredRequests.length;
    if (requestPage >= requestPageCount) requestPage = Math.max(0, requestPageCount - 1);
  });

  $effect(() => {
    results.length;
    if (resultPage >= resultPageCount) resultPage = Math.max(0, resultPageCount - 1);
  });

  function pageCount(total: number, size: number): number {
    return Math.max(1, Math.ceil(total / size));
  }

  function inputValue(event: Event): string {
    return event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
  }

  function inputChecked(event: Event): boolean {
    return event.currentTarget instanceof HTMLInputElement ? event.currentTarget.checked : false;
  }

  function rangeLabel(page: number, size: number, total: number): string {
    if (!total) return '0 of 0';
    const start = page * size + 1;
    const end = Math.min(total, (page + 1) * size);
    return `${start}-${end} of ${total}`;
  }

  function statusLabel(result: CollectionRunnerResult) {
    if (result.status === 'queued') return 'Queued';
    if (result.status === 'running') return 'Running';
    if (result.status === 'skipped') return 'Skipped';
    if (result.status === 'error') return 'Error';
    return result.status === 'passed' ? 'Passed' : 'Failed';
  }
</script>

<section class="collection-runner-workspace" aria-label="Collection runner">
  <aside class="collection-runner-config">
    <div class="collection-runner-title">
      <span class="runner-glyph" aria-hidden="true">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
          <circle cx="14.5" cy="4.5" r="2" stroke="currentColor" stroke-width="1.8"/>
          <path d="M9.5 9.5l3.4-1.8 2.4 3.1 3.2.6M12.2 10.6l-2 4.2-4 1.4M14.7 13.2l-1 3.7 2.5 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <div>
        <h2>Runner</h2>
        <p>{requests.length} request{requests.length === 1 ? '' : 's'} in this collection</p>
      </div>
    </div>

    <label class="runner-field">
      <span>Collection</span>
      <Select
        value={selectedCollectionId}
        options={collectionOptions}
        className="runner-select"
        disabled={running || !collections.length}
        onChange={onSelectCollection}
      />
    </label>

    <div class="runner-section-title">Timings</div>
    <label class="runner-field">
      <span>Delay between requests (ms)</span>
      <input type="number" min="0" step="1" value={delayMs || ''} placeholder="e.g. 5" oninput={(event) => onSetDelayMs(inputValue(event))} disabled={running} />
    </label>

    <div class="runner-section-title">Filters</div>
    <div class="runner-filter-grid">
      <label class="runner-field">
        <span>Include tags</span>
        <input value={includeTags} placeholder="e.g., smoke, regression" oninput={(event) => onSetIncludeTags(inputValue(event))} disabled={running} />
      </label>
      <label class="runner-field">
        <span>Exclude tags</span>
        <input value={excludeTags} placeholder="e.g., slow, local" oninput={(event) => onSetExcludeTags(inputValue(event))} disabled={running} />
      </label>
    </div>

    <div class="runner-section-title muted">Run with Parameters</div>
    <div class="runner-file-row">
      <button class="runner-file-btn" type="button" onclick={onSelectDataFile} disabled={running}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M3 1.5h5l3 3V12H3V1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <path d="M8 1.7V4.5h2.8" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
        </svg>
        {dataFileName || 'Select CSV or JSON file'}
      </button>
      {#if dataFileName}
        <button class="runner-file-clear" type="button" aria-label="Remove runner data file" onclick={onClearDataFile} disabled={running}>
          ×
        </button>
      {/if}
    </div>
    {#if dataFileName}
      <div class="runner-file-status">{dataRowCount} row{dataRowCount === 1 ? '' : 's'} loaded</div>
    {/if}
    {#if dataError}
      <div class="runner-file-error">{dataError}</div>
    {/if}

    <label class="runner-field">
      <span>Iterations</span>
      <input type="number" min="1" step="1" value={iterations} oninput={(event) => onSetIterations(inputValue(event))} disabled={running || dataRowCount > 0} />
    </label>

    <label class="runner-toggle">
      <input type="checkbox" checked={parallel} onchange={(event) => onSetParallel(inputChecked(event))} disabled={running} />
      <span></span>
      Run in parallel
    </label>

    {#if parallel}
      <label class="runner-field">
        <span>Max concurrent requests</span>
        <input
          type="number"
          min={MIN_RUNNER_CONCURRENCY}
          max={MAX_RUNNER_CONCURRENCY}
          step="1"
          value={concurrency}
          oninput={(event) => onSetConcurrency(inputValue(event))}
          disabled={running}
        />
      </label>
      <p class="runner-hint">
        Requests in an iteration run at the same time, so a test that saves a variable
        may not have finished before the next request reads it. Keep chained requests sequential.
      </p>
    {/if}

    <div class="runner-actions">
      {#if running}
        <button class="btn-secondary danger" type="button" onclick={onStop}>Stop</button>
      {:else}
        <button class="btn-primary runner-run-btn" type="button" onclick={onRun} disabled={!selectedCount || !collections.length}>
          Run {runCount} Request{runCount === 1 ? '' : 's'}
        </button>
      {/if}
      <button class="btn-secondary" type="button" onclick={onReset} disabled={running}>Reset</button>
    </div>
  </aside>

  <section class="collection-runner-main">
    <div class="runner-selection-head">
      <strong>{selectedCount} of {runnableCount} selected</strong>
      <div class="runner-selection-actions">
        <button type="button" onclick={onSelectAll} disabled={running || !runnableCount}>Select All</button>
        <button type="button" onclick={onDeselectAll} disabled={running || !selectedCount}>Deselect All</button>
        <button type="button" onclick={onReset} disabled={running}>Reset</button>
        {#if hasResults}
          <button class="runner-report-btn" type="button" onclick={onDownloadReport} disabled={running}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2v7m0 0 3-3m-3 3L5 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M3 11.5V13h10v-1.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Download Report
          </button>
        {/if}
      </div>
    </div>

    {#if filteredRequests.length > RUNNER_REQUEST_PAGE_SIZE}
      <div class="runner-pagination" aria-label="Runner request pages">
        <span>Requests {rangeLabel(requestPage, RUNNER_REQUEST_PAGE_SIZE, filteredRequests.length)}</span>
        <div class="runner-page-buttons">
          <button type="button" onclick={() => (requestPage = Math.max(0, requestPage - 1))} disabled={requestPage === 0}>Prev</button>
          <span>{requestPage + 1}/{requestPageCount}</span>
          <button type="button" onclick={() => (requestPage = Math.min(requestPageCount - 1, requestPage + 1))} disabled={requestPage + 1 >= requestPageCount}>Next</button>
        </div>
      </div>
    {/if}

    <div class="runner-request-list" class:with-results={hasResults}>
      {#if !collections.length}
        <div class="runner-empty">No collections in this workspace</div>
      {:else if !filteredRequests.length}
        <div class="runner-empty">No requests match the current filters</div>
      {:else}
        {#each visibleRequests as request (request.id)}
          {@const skipped = isRequestSkipped(request)}
          {@const tags = requestTags(request)}
          {@const transportLabel = requestTransportLabel(request)}
          <div class="runner-request-row" data-testid="runner-request-row" class:selected={selectedSet.has(request.id)} class:skipped={skipped}>
            <span class="runner-drag-dots" aria-hidden="true">⋮⋮</span>
            <input
              type="checkbox"
              checked={selectedSet.has(request.id)}
              disabled={running || skipped}
              aria-label={`Select ${requestTabLabel(request)}`}
              onchange={() => onToggleRequest(request.id)}
            />
            <span class="collection-method {methodColor(transportLabel)}">{transportLabel}</span>
            <div class="runner-request-copy">
              <strong>{requestTabLabel(request)}</strong>
              <small>{request.folderPath.length ? request.folderPath.join(' / ') : request.url}</small>
            </div>
            <div class="runner-request-tags">
              {#if skipped}
                <span>not runnable</span>
              {:else}
                {#each tags.slice(0, 3) as tag}
                  <span>{tag}</span>
                {/each}
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>

    {#if hasResults}
      <div class="runner-results-panel">
        <div class="runner-results-summary">
          <span class:pass={summary.allPassed && !running} class:fail={summary.failed > 0}>{running ? 'Running' : summary.allPassed ? 'Passed' : summary.skipped ? 'Stopped' : 'Failed'}</span>
          <span>{summary.completed}/{summary.total} requests</span>
          <span>{summary.testsPassed}/{summary.testsTotal} tests</span>
          <span>{summary.duration} ms</span>
        </div>
        {#if results.length > RUNNER_RESULT_PAGE_SIZE}
          <div class="runner-pagination runner-results-pagination" aria-label="Runner result pages">
            <span>Results {rangeLabel(resultPage, RUNNER_RESULT_PAGE_SIZE, results.length)}</span>
            <div class="runner-page-buttons">
              <button type="button" onclick={() => (resultPage = Math.max(0, resultPage - 1))} disabled={resultPage === 0}>Prev</button>
              <span>{resultPage + 1}/{resultPageCount}</span>
              <button type="button" onclick={() => (resultPage = Math.min(resultPageCount - 1, resultPage + 1))} disabled={resultPage + 1 >= resultPageCount}>Next</button>
            </div>
          </div>
        {/if}
        <div class="runner-results-table">
          {#each visibleResults as result (result.runId)}
            <div class="runner-result-row" data-testid="runner-result-row" class:running={result.status === 'running'} class:pass={result.status === 'passed'} class:fail={result.status === 'failed' || result.status === 'error'}>
              <span class="collection-method {methodColor(result.method)}">{result.method}</span>
              <div class="runner-request-main">
                <span>{result.name}</span>
                <small>{title}{iterations > 1 ? ` · iteration ${result.iteration}` : ''}</small>
              </div>
              <span class="runner-status">{statusLabel(result)}</span>
              <span class="runner-code">{result.statusCode || '-'}</span>
              <span class="runner-tests">{result.testsTotal ? `${result.testsPassed}/${result.testsTotal}` : '-'}</span>
              <span class="runner-time">{result.duration ? `${result.duration} ms` : '-'}</span>
              {#if result.error}<span class="runner-error">{result.error}</span>{/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </section>
</section>
