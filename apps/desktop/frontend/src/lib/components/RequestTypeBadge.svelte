<script lang="ts">
  import type { RequestType, SavedRequest } from '../types/models';
  import { methodColor, requestBadgeLabel, requestKindFor } from '../utils';

  type BadgeVariant = 'sidebar' | 'tab' | 'search';

  let {
    request,
    method = '',
    requestType = 'http',
    url = '',
    variant = 'sidebar',
    invalid = false,
  }: {
    request?: Pick<SavedRequest, 'method' | 'requestType' | 'url'>;
    method?: string;
    requestType?: RequestType;
    url?: string;
    variant?: BadgeVariant;
    invalid?: boolean;
  } = $props();

  function input() {
    return {
      method: request?.method ?? method,
      requestType: request?.requestType ?? requestType,
      url: request?.url ?? url,
    };
  }

  let currentKind = $derived(requestKindFor(input()));
  let currentLabel = $derived(requestBadgeLabel(input()));
  let currentMethodClass = $derived(currentKind === 'http' || currentKind === 'sse' ? methodColor(currentLabel) : '');
</script>

<span
  class="request-kind-badge {invalid ? '' : currentMethodClass}"
  class:request-kind-badge--sidebar={variant === 'sidebar'}
  class:request-kind-badge--tab={variant === 'tab'}
  class:request-kind-badge--search={variant === 'search'}
  class:request-kind-badge--http={!invalid && currentKind === 'http'}
  class:request-kind-badge--sse={!invalid && currentKind === 'sse'}
  class:request-kind-badge--ws={!invalid && currentKind === 'ws'}
  class:request-kind-badge--graphql={!invalid && currentKind === 'graphql'}
  class:request-kind-badge--socketio={!invalid && currentKind === 'socketio'}
  class:request-kind-badge--grpc={!invalid && currentKind === 'grpc'}
  class:request-kind-badge--invalid={invalid}
  title={invalid ? 'Invalid request — open the diagnostic for details' : currentLabel}
  aria-label={invalid ? 'Invalid request' : currentLabel}
>
  {#if invalid}
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 2.2l7 12.1H2L9 2.2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M9 7v3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="9" cy="12.4" r="0.95" fill="currentColor"/>
    </svg>
  {:else if currentKind === 'ws'}
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M6 3.4v3M12 3.4v3M4.6 6.4h8.8v2.1a4.4 4.4 0 01-8.8 0V6.4zM9 12.9v1.7M6.5 14.6h5" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  {:else if currentKind === 'graphql'}
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 2.7l5.2 3v6L9 14.8l-5.2-3.1v-6L9 2.7z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
      <circle cx="9" cy="2.7" r="1.25" fill="currentColor"/>
      <circle cx="14.2" cy="5.7" r="1.25" fill="currentColor"/>
      <circle cx="14.2" cy="11.7" r="1.25" fill="currentColor"/>
      <circle cx="9" cy="14.8" r="1.25" fill="currentColor"/>
      <circle cx="3.8" cy="11.7" r="1.25" fill="currentColor"/>
      <circle cx="3.8" cy="5.7" r="1.25" fill="currentColor"/>
    </svg>
  {:else if currentKind === 'socketio'}
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.4" stroke="currentColor" stroke-width="1.35"/>
      <path d="M9 4.5C6.5 7 7 11 9.5 13.5M9 13.5C11.5 11 11 7 8.5 4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <circle cx="9" cy="9" r="1.05" fill="currentColor"/>
    </svg>
  {:else if currentKind === 'grpc'}
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.2 9h4.1M10.7 9h4.1M7.3 5.2l3.4 7.6M10.7 5.2l-3.4 7.6" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
      <circle cx="3.2" cy="9" r="1.35" stroke="currentColor" stroke-width="1.2"/>
      <circle cx="14.8" cy="9" r="1.35" stroke="currentColor" stroke-width="1.2"/>
      <circle cx="7.3" cy="5.2" r="1.2" fill="currentColor"/>
      <circle cx="10.7" cy="12.8" r="1.2" fill="currentColor"/>
    </svg>
  {:else}
    <span class="request-kind-text">{currentLabel}</span>
  {/if}
</span>

<style>
  .request-kind-badge {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    flex: 0 0 auto;
    width: 42px;
    height: 22px;
    min-width: 0;
    line-height: 1;
  }

  .request-kind-badge--http,
  .request-kind-badge--sse {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 850;
  }

  .request-kind-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .request-kind-badge--ws,
  .request-kind-badge--graphql,
  .request-kind-badge--socketio,
  .request-kind-badge--grpc {
    justify-content: center;
    width: 26px;
    height: 24px;
    border: 1px solid color-mix(in srgb, currentColor 42%, transparent);
    border-radius: 7px;
    background: color-mix(in srgb, currentColor 13%, transparent);
  }

  .request-kind-badge--invalid {
    color: var(--diagnostic-badge-text);
  }

  .request-kind-badge--sidebar.request-kind-badge--invalid {
    justify-content: flex-start;
    width: 42px;
  }

  .request-kind-badge--ws {
    color: #fb923c;
  }

  .request-kind-badge--graphql {
    color: #e879f9;
  }

  .request-kind-badge--socketio {
    color: #8b8cff;
  }

  .request-kind-badge--grpc {
    color: #2dd4bf;
  }

  .request-kind-badge--tab {
    width: 24px;
    height: 22px;
  }

  .request-kind-badge--tab.request-kind-badge--http,
  .request-kind-badge--tab.request-kind-badge--sse {
    width: auto;
    max-width: 54px;
    height: 20px;
    font-weight: 900;
  }

  .request-kind-badge--tab.request-kind-badge--ws,
  .request-kind-badge--tab.request-kind-badge--graphql,
  .request-kind-badge--tab.request-kind-badge--socketio,
  .request-kind-badge--tab.request-kind-badge--grpc {
    width: 22px;
    height: 22px;
    border-radius: 6px;
  }

  .request-kind-badge--tab svg {
    width: 15px;
    height: 15px;
  }

  .request-kind-badge--search {
    justify-self: center;
    width: 48px;
    justify-content: center;
  }

  .request-kind-badge--search.request-kind-badge--ws,
  .request-kind-badge--search.request-kind-badge--graphql,
  .request-kind-badge--search.request-kind-badge--socketio,
  .request-kind-badge--search.request-kind-badge--grpc {
    width: 30px;
    height: 26px;
    margin-right: 0;
  }

  .request-kind-badge--sidebar.request-kind-badge--ws,
  .request-kind-badge--sidebar.request-kind-badge--graphql,
  .request-kind-badge--sidebar.request-kind-badge--socketio,
  .request-kind-badge--sidebar.request-kind-badge--grpc {
    justify-content: flex-start;
    width: 42px;
    height: 22px;
    border: none;
    border-radius: 0;
    background: transparent;
  }

  .request-kind-badge--sidebar svg {
    width: 16px;
    height: 16px;
  }
</style>
