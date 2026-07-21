<script lang="ts">
  import type { ResponseTimings } from '../backend';

  type TimingRow = {
    label: string;
    value: number;
    valueText?: string;
    color: string;
  };

  let {
    timings = null,
    total = 0,
    label = '',
    streaming = false,
  }: {
    timings?: ResponseTimings | null;
    total?: number;
    label?: string;
    streaming?: boolean;
  } = $props();

  function numeric(value: number | undefined | null): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
  }

  function formatDuration(ms: number): string {
    const safe = numeric(ms);
    if (safe >= 1000) {
      const seconds = safe / 1000;
      return `${seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2)} s`;
    }
    if (safe > 0 && safe < 1) return `${safe.toFixed(2)} ms`;
    if (safe > 0 && safe < 10) return `${safe.toFixed(2).replace(/\.?0+$/, '')} ms`;
    return `${Math.round(safe)} ms`;
  }

  function rowsFor(source: ResponseTimings | null | undefined): TimingRow[] {
    return [
      { label: 'Prepare', value: numeric(source?.prepare), color: 'var(--text-3)' },
      { label: 'Socket Initialization', value: numeric(source?.socketInitialization), color: 'var(--s4xx)' },
      { label: 'DNS Lookup', value: numeric(source?.dnsLookup), color: 'var(--s4xx)' },
      { label: 'TCP Handshake', value: numeric(source?.tcpHandshake), color: 'var(--s3xx)' },
      { label: 'TLS Handshake', value: numeric(source?.tlsHandshake), color: 'var(--s3xx)' },
      { label: 'Waiting (TTFB)', value: numeric(source?.waitingTTFB), color: 'var(--s5xx)' },
      {
        label: 'Download',
        value: streaming ? 0 : numeric(source?.download),
        valueText: streaming ? 'Stream' : undefined,
        color: 'var(--s2xx)',
      },
      { label: 'Process', value: numeric(source?.process), color: 'var(--text-3)' },
    ];
  }

  let rows = $derived(rowsFor(timings));
  let maxValue = $derived(Math.max(1, ...rows.map((row) => row.value)));
  let triggerLabel = $derived(label || formatDuration(numeric(timings?.total) || total));
  let totalLabel = $derived(formatDuration(numeric(timings?.total) || total));

  function barWidth(value: number): number {
    return Math.max(0, Math.min(100, (numeric(value) / maxValue) * 100));
  }
</script>

<span class="response-time">
  <button class="response-time-trigger" type="button" aria-label="Response time details">{triggerLabel}</button>
  <span class="response-time-popover" role="tooltip">
    <span class="rt-header">
      <span class="rt-title">
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.4"/>
          <path d="M9 4.8V9l2.8 1.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Response Time
      </span>
      <span class="rt-total">{totalLabel}</span>
    </span>

    <span class="rt-rows">
      {#each rows as row}
        <span class="rt-row">
          <span class="rt-label">{row.label}</span>
          <span class="rt-track">
            <span
              class="rt-bar"
              style={`--bar-width: ${barWidth(row.value)}%; --bar-color: ${row.color};`}
            ></span>
          </span>
          <span class="rt-value">{row.valueText ?? formatDuration(row.value)}</span>
        </span>
      {/each}
    </span>
  </span>
</span>

<style>
  .response-time {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-width: 0;
    padding-bottom: 10px;
    margin-bottom: -10px;
  }

  .response-time-trigger {
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-3);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1;
    cursor: default;
    outline: none;
    white-space: nowrap;
  }

  .response-time-trigger:hover,
  .response-time-trigger:focus-visible {
    color: var(--text-2);
  }

  .response-time-popover {
    position: absolute;
    top: calc(100% + 10px);
    left: 0;
    z-index: 50;
    display: none;
    width: min(430px, calc(100vw - 24px));
    padding: 15px 16px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 94%, var(--bg));
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
    color: var(--text-2);
    font-family: var(--font-sans, sans-serif);
  }

  .response-time-popover::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 100%;
    height: 10px;
  }

  .response-time:hover .response-time-popover,
  .response-time:focus-within .response-time-popover {
    display: block;
  }

  .rt-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 10px;
    color: var(--text);
    font-size: 13px;
    font-weight: 700;
  }

  .rt-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .rt-title svg {
    flex: 0 0 auto;
    color: var(--text-3);
  }

  .rt-total {
    flex: 0 0 auto;
    font-family: var(--font-mono);
    font-size: 13px;
  }

  .rt-rows {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .rt-row {
    display: grid;
    grid-template-columns: minmax(126px, 0.85fr) minmax(120px, 1.25fr) minmax(66px, auto);
    align-items: center;
    gap: 10px;
    min-height: 24px;
  }

  .rt-label {
    overflow: hidden;
    color: var(--text-2);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rt-track {
    position: relative;
    height: 14px;
    border-left: 1px solid color-mix(in srgb, var(--text-3) 25%, transparent);
    border-right: 1px solid color-mix(in srgb, var(--text-3) 14%, transparent);
    background: color-mix(in srgb, var(--s2xx) 7%, transparent);
    overflow: hidden;
  }

  .rt-bar {
    display: block;
    width: var(--bar-width);
    height: 100%;
    background: var(--bar-color);
    min-width: 0;
  }

  .rt-value {
    color: var(--text-3);
    font-family: var(--font-mono);
    font-size: 11px;
    text-align: right;
    white-space: nowrap;
  }

  @media (max-width: 700px) {
    .response-time-popover {
      padding: 14px;
    }

    .rt-row {
      grid-template-columns: minmax(108px, 0.7fr) minmax(80px, 1fr) minmax(58px, auto);
      gap: 8px;
    }
  }
</style>
