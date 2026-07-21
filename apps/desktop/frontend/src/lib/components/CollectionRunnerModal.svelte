<script lang="ts">
  import { trapFocus } from '../a11y';
  import type { CollectionRunnerResult } from '../types/models';

  let {
    title,
    running,
    results,
    summary,
    methodColor,
    onStop,
    onClose,
  }: {
    title: string;
    running: boolean;
    results: CollectionRunnerResult[];
    summary: { total: number; completed: number; passed: number; failed: number; skipped: number; testsPassed: number; testsTotal: number; duration: number; allPassed: boolean };
    methodColor: (method: string) => string;
    onStop: () => void;
    onClose: () => void;
  } = $props();

  const RUNNER_RESULT_PAGE_SIZE = 100;
  let resultPage = $state(0);
  let resultPageCount = $derived(pageCount(results.length, RUNNER_RESULT_PAGE_SIZE));
  let visibleResults = $derived(results.slice(resultPage * RUNNER_RESULT_PAGE_SIZE, (resultPage + 1) * RUNNER_RESULT_PAGE_SIZE));

  $effect(() => {
    results.length;
    if (resultPage >= resultPageCount) resultPage = Math.max(0, resultPageCount - 1);
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

  function statusLabel(result: CollectionRunnerResult) {
    if (result.status === 'queued') return 'Queued';
    if (result.status === 'running') return 'Running';
    if (result.status === 'skipped') return 'Skipped';
    if (result.status === 'error') return 'Error';
    return result.status === 'passed' ? 'Passed' : 'Failed';
  }
</script>

<div class="runner-backdrop" role="presentation" onmousedown={(event) => event.target === event.currentTarget && !running && onClose()}>
  <div class="runner-modal" role="dialog" aria-modal="true" aria-labelledby="runner-title" tabindex="-1" use:trapFocus>
    <div class="runner-head">
      <div>
        <span class="overview-eyebrow">Collection Runner</span>
        <h2 id="runner-title">{title}</h2>
      </div>
      <div class="runner-head-actions">
        {#if running}
          <button class="btn-secondary btn-sm" type="button" onclick={onStop}>Stop</button>
        {/if}
        <button class="dialog-close" type="button" onclick={onClose} aria-label="Close runner">×</button>
      </div>
    </div>

    <div class="runner-summary">
      <div class="runner-summary-item">
        <span>Status</span>
        <strong class:pass={summary.allPassed && !running} class:fail={summary.failed > 0}>{running ? 'Running' : summary.allPassed ? 'Passed' : summary.skipped ? 'Stopped' : 'Failed'}</strong>
      </div>
      <div class="runner-summary-item">
        <span>Requests</span>
        <strong>{summary.completed}/{summary.total}</strong>
      </div>
      <div class="runner-summary-item">
        <span>Tests</span>
        <strong>{summary.testsPassed}/{summary.testsTotal}</strong>
      </div>
      <div class="runner-summary-item">
        <span>Time</span>
        <strong>{summary.duration} ms</strong>
      </div>
    </div>

    {#if results.length > RUNNER_RESULT_PAGE_SIZE}
      <div class="runner-modal-pagination" aria-label="Runner result pages">
        <span>Results {rangeLabel(resultPage, RUNNER_RESULT_PAGE_SIZE, results.length)}</span>
        <div class="runner-modal-page-buttons">
          <button type="button" onclick={() => (resultPage = Math.max(0, resultPage - 1))} disabled={resultPage === 0}>Prev</button>
          <span>{resultPage + 1}/{resultPageCount}</span>
          <button type="button" onclick={() => (resultPage = Math.min(resultPageCount - 1, resultPage + 1))} disabled={resultPage + 1 >= resultPageCount}>Next</button>
        </div>
      </div>
    {/if}

    <div class="runner-results">
      {#each visibleResults as result (result.requestId)}
        <div class="runner-row" class:running={result.status === 'running'} class:pass={result.status === 'passed'} class:fail={result.status === 'failed' || result.status === 'error'}>
          <span class="collection-method {methodColor(result.method)}">{result.method}</span>
          <div class="runner-request-main">
            <span>{result.name}</span>
            <small>{result.url}</small>
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
</div>
