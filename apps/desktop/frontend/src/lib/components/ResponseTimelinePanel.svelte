<script lang="ts">
  import type { ConnectionInfo, SentRequest, TimelineEvent } from '../backend';

  let {
    sentRequests = [],
    connection,
    timeline = [],
  }: {
    sentRequests?: SentRequest[];
    connection?: ConnectionInfo;
    timeline?: TimelineEvent[];
  } = $props();

  let span = $derived(Math.max(...timeline.map(event => event.atMs), 1));

  const connectionRows = $derived.by(() => {
    if (!connection) return [];
    const rows: Array<[string, string]> = [];
    rows.push(['Connection', connection.reused ? 'Reused from the pool' : 'Newly opened']);
    if (connection.remoteAddr) rows.push(['Remote address', connection.remoteAddr]);
    if (connection.localAddr) rows.push(['Local address', connection.localAddr]);
    if (connection.addresses?.length) rows.push(['Resolved addresses', connection.addresses.join(', ')]);
    if (connection.tlsVersion) rows.push(['TLS version', connection.tlsVersion]);
    if (connection.tlsCipher) rows.push(['Cipher suite', connection.tlsCipher]);
    if (connection.alpn) rows.push(['ALPN', connection.alpn]);
    if (connection.serverName) rows.push(['Server name (SNI)', connection.serverName]);
    return rows;
  });

  function formatMs(value: number) {
    return value >= 100 ? `${Math.round(value)} ms` : `${value.toFixed(2)} ms`;
  }

  function hopLabel(index: number, total: number) {
    if (total === 1) return 'Request';
    return index === total - 1 ? `Hop ${index + 1} (final)` : `Hop ${index + 1}`;
  }
</script>

<div class="timeline-panel" id="response-panel-timeline" role="tabpanel">
  {#if !timeline.length && !sentRequests.length}
    <div class="timeline-empty">No connection details were captured for this response.</div>
  {:else}
    {#if timeline.length}
      <section class="timeline-section">
        <h4>Timeline</h4>
        <ol class="timeline-events">
          {#each timeline as event}
            <li>
              <span class="timeline-at">{formatMs(event.atMs)}</span>
              <span class="timeline-bar-track">
                <span class="timeline-bar" style="left: {(event.atMs / span) * 100}%"></span>
              </span>
              <span class="timeline-label">{event.label}</span>
              {#if event.detail}<span class="timeline-detail">{event.detail}</span>{/if}
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    {#if connectionRows.length}
      <section class="timeline-section">
        <h4>Connection</h4>
        <div class="timeline-facts">
          {#each connectionRows as [label, value]}
            <div class="timeline-fact">
              <span class="timeline-fact-key">{label}</span>
              <span class="timeline-fact-val">{value}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#each sentRequests as sent, index}
      <section class="timeline-section">
        <h4>{hopLabel(index, sentRequests.length)}</h4>
        <pre class="timeline-raw">{sent.method} {sent.url} {sent.proto}
{#each sent.headers as header}{header.key}: {header.value}
{/each}</pre>
      </section>
    {/each}
  {/if}
</div>
