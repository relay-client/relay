<script lang="ts">
  import { onMount } from 'svelte';
  import VariableInput from './VariableInput.svelte';
  import type { VariableSuggestion } from '../variables';
  import type { GrpcMethodInfo, RequestType, SSEStatus, WebSocketStatus, SocketIOStatus } from '../types/models';

  type UrlInputElement = HTMLInputElement | HTMLTextAreaElement;

  let {
    requestName,
    requestType,
    method = $bindable('GET'),
    url = $bindable(''),
    urlInputRef = $bindable<UrlInputElement | undefined>(),
    requestTypes,
    methods,
    loading,
    methodColor,
    requestTypeLabel,
    requestTypeEditable = true,
    variableSuggestions = [],
    onRequestNameInput,
    onRequestNameCommit,
    onRequestTypeChange,
    onUrlPaste,
    onUrlInput = () => {},
    onSend,
    onSendAndDownload = () => {},
    sseStatus = undefined,
    wsStatus = undefined,
    sioStatus = undefined,
    grpcMethod = '',
    grpcMethods = [],
    grpcServiceLoading = false,
    grpcMethodLabel = (value: string) => value,
    onGrpcMethodChange = () => {},
    onGrpcDiscover = async () => {},
  }: {
    requestName: string;
    requestType: RequestType;
    method: string;
    url: string;
    urlInputRef?: UrlInputElement;
    requestTypes: RequestType[];
    methods: string[];
    loading: boolean;
    methodColor: (method: string) => string;
    requestTypeLabel: (type: RequestType) => string;
    requestTypeEditable?: boolean;
    variableSuggestions?: VariableSuggestion[];
    onRequestNameInput: (value: string) => void;
    onRequestNameCommit: () => void;
    onRequestTypeChange: (type: RequestType) => void;
    onUrlPaste: (event: ClipboardEvent) => void;
    onUrlInput?: (event: Event) => void;
    onSend: () => void;
    onSendAndDownload?: () => void;
    sseStatus?: SSEStatus;
    wsStatus?: WebSocketStatus;
    sioStatus?: SocketIOStatus;
    grpcMethod?: string;
    grpcMethods?: GrpcMethodInfo[];
    grpcServiceLoading?: boolean;
    grpcMethodLabel?: (fullName: string) => string;
    onGrpcMethodChange?: (fullName: string) => void;
    onGrpcDiscover?: () => Promise<void> | void;
  } = $props();

  let isSSE = $derived(method === 'SSE');
  let isGraphQL = $derived(requestType === 'graphql');
  let isGRPC = $derived(requestType === 'grpc');
  let sseConnected = $derived(sseStatus === 'connected');
  let sseConnecting = $derived(sseStatus === 'connecting');
  let showSSEControls = $derived(isSSE || sseConnected || sseConnecting);
  let isWS = $derived(requestType === 'ws');
  let wsConnected = $derived(wsStatus === 'connected');
  let wsConnecting = $derived(wsStatus === 'connecting' || wsStatus === 'reconnecting');
  let isSIO = $derived(requestType === 'socketio');
  let sioConnected = $derived(sioStatus === 'connected');
  let sioConnecting = $derived(sioStatus === 'connecting' || sioStatus === 'reconnecting');

  let requestTypeMenuOpen = $state(false);
  let methodMenuOpen = $state(false);
  let grpcMethodMenuOpen = $state(false);
  let sendMenuOpen = $state(false);
  let requestComposerRef: HTMLElement | undefined = undefined;
  let grpcMethodButtonRef = $state<HTMLButtonElement | undefined>();
  let grpcMethodFilter = $state('');
  let grpcFilteredMethods = $derived.by(() => {
    const query = grpcMethodFilter.trim().toLowerCase();
    if (!query) return grpcMethods;
    return grpcMethods.filter(option => `${option.fullName} ${option.service} ${option.name}`.toLowerCase().includes(query));
  });
  let grpcSelectedLabel = $derived(grpcMethodLabel(grpcMethod) || 'Select a method');

  onMount(() => {
    const closeMenusOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && requestComposerRef?.contains(target)) return;
      requestTypeMenuOpen = false;
      methodMenuOpen = false;
      grpcMethodMenuOpen = false;
      sendMenuOpen = false;
    };
    document.addEventListener('pointerdown', closeMenusOnOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', closeMenusOnOutsidePointerDown, true);
  });

  function keepHostVisible() {
    setTimeout(() => {
      if (!urlInputRef) return;
      urlInputRef.scrollLeft = 0;
      urlInputRef.setSelectionRange(0, 0);
    }, 0);
  }

  function closeMethodMenuOnFocusOut(event: FocusEvent) {
    const current = event.currentTarget;
    const next = event.relatedTarget;
    if (!(current instanceof HTMLElement)) return;
    if (!(next instanceof Node) || !current.contains(next)) methodMenuOpen = false;
  }

  function closeGrpcMethodMenuOnFocusOut(event: FocusEvent) {
    const current = event.currentTarget;
    const next = event.relatedTarget;
    if (!(current instanceof HTMLElement)) return;
    if (!(next instanceof Node) || !current.contains(next)) grpcMethodMenuOpen = false;
  }

  function closeRequestTypeMenuOnFocusOut(event: FocusEvent) {
    const current = event.currentTarget;
    const next = event.relatedTarget;
    if (!(current instanceof HTMLElement)) return;
    if (!(next instanceof Node) || !current.contains(next)) requestTypeMenuOpen = false;
  }

  function closeSendMenuOnFocusOut(event: FocusEvent) {
    const current = event.currentTarget;
    const next = event.relatedTarget;
    if (!(current instanceof HTMLElement)) return;
    if (!(next instanceof Node) || !current.contains(next)) sendMenuOpen = false;
  }

  function selectRequestType(type: RequestType) {
    if (!requestTypeEditable) return;
    onRequestTypeChange(type);
    requestTypeMenuOpen = false;
  }

  function selectMethod(nextMethod: string) {
    method = nextMethod;
    methodMenuOpen = false;
  }

  async function toggleGrpcMethodMenu() {
    grpcMethodMenuOpen = !grpcMethodMenuOpen;
    if (grpcMethodMenuOpen && !grpcMethods.length && !grpcServiceLoading) {
      await onGrpcDiscover();
    }
  }

  function selectGrpcMethod(fullName: string) {
    onGrpcMethodChange(fullName);
    grpcMethodMenuOpen = false;
    grpcMethodFilter = '';
  }

  function onGrpcMethodSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      grpcMethodMenuOpen = false;
      grpcMethodButtonRef?.focus();
    }
  }

  function onNameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onRequestNameCommit();
      if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.blur();
    }
  }

  function inputValue(event: Event): string {
    const target = event.currentTarget;
    return target instanceof HTMLInputElement ? target.value : '';
  }
</script>

<div class="request-composer" bind:this={requestComposerRef}>
  <div class="request-meta">
    <div class="request-type-wrap" onfocusout={closeRequestTypeMenuOnFocusOut}>
      <button
        class="request-type-trigger"
        class:open={requestTypeEditable && requestTypeMenuOpen}
        class:locked={!requestTypeEditable}
        type="button"
        aria-label="Request type"
        aria-haspopup={requestTypeEditable ? 'listbox' : undefined}
        aria-expanded={requestTypeEditable ? requestTypeMenuOpen : undefined}
        aria-disabled={!requestTypeEditable}
        disabled={!requestTypeEditable}
        title={requestTypeEditable ? 'Request type' : 'Request type can only be changed while the request is a draft'}
        onclick={() => { if (requestTypeEditable) requestTypeMenuOpen = !requestTypeMenuOpen; }}
      >
        <span class="request-type-glyph" class:gql={requestType === 'graphql'} class:ws={requestType === 'ws'} class:sio={requestType === 'socketio'} class:grpc={requestType === 'grpc'} aria-hidden="true">
          {#if requestType === 'ws'}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M6 3.4v3M12 3.4v3M4.6 6.4h8.8v2.1a4.4 4.4 0 01-8.8 0V6.4zM9 12.9v1.7M6.5 14.6h5" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {:else if requestType === 'graphql'}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2.6l5.3 3.1v6.2L9 15l-5.3-3.1V5.7L9 2.6z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
              <circle cx="9" cy="2.6" r="1.35" fill="currentColor"/>
              <circle cx="14.3" cy="5.7" r="1.35" fill="currentColor"/>
              <circle cx="14.3" cy="11.9" r="1.35" fill="currentColor"/>
              <circle cx="9" cy="15" r="1.35" fill="currentColor"/>
              <circle cx="3.7" cy="11.9" r="1.35" fill="currentColor"/>
              <circle cx="3.7" cy="5.7" r="1.35" fill="currentColor"/>
            </svg>
          {:else if requestType === 'socketio'}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.4"/>
              <path d="M9 4.5C6.5 7 7 11 9.5 13.5M9 13.5C11.5 11 11 7 8.5 4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
          {:else if requestType === 'grpc'}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3.2 9h4.1M10.7 9h4.1M7.3 5.2l3.4 7.6M10.7 5.2l-3.4 7.6" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
              <circle cx="3.2" cy="9" r="1.35" stroke="currentColor" stroke-width="1.2"/>
              <circle cx="14.8" cy="9" r="1.35" stroke="currentColor" stroke-width="1.2"/>
              <circle cx="7.3" cy="5.2" r="1.2" fill="currentColor"/>
              <circle cx="10.7" cy="12.8" r="1.2" fill="currentColor"/>
            </svg>
          {:else}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3.2 5.8h9.6M10.4 3.5l2.4 2.3-2.4 2.3M14.8 12.2H5.2M7.6 9.9l-2.4 2.3 2.4 2.3" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {/if}
        </span>
        <span>{requestTypeLabel(requestType)}</span>
        {#if requestTypeEditable}
          <svg class="request-type-caret" width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden="true">
            <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
          </svg>
        {/if}
      </button>
      {#if requestTypeEditable && requestTypeMenuOpen}
        <div class="request-type-menu" role="listbox" aria-label="Request type">
          {#each requestTypes as option}
            <button
              class:active={requestType === option}
              role="option"
              aria-selected={requestType === option}
              type="button"
              onclick={() => selectRequestType(option)}
            >
              <span class="method-check">{requestType === option ? '✓' : ''}</span>
              <span>{requestTypeLabel(option)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <input
      class="request-title-input"
      value={requestName}
      placeholder="New Request"
      spellcheck="false"
      aria-label="Request name"
      oninput={(event) => onRequestNameInput(inputValue(event))}
      onblur={onRequestNameCommit}
      onkeydown={onNameKeydown}
    />
  </div>

  <div class="request-bar" class:request-bar-ws={requestType === 'ws' || requestType === 'socketio' || requestType === 'graphql'} class:request-bar-grpc={requestType === 'grpc'}>
    {#if requestType === 'http'}
      <div class="method-wrap" onfocusout={closeMethodMenuOnFocusOut}>
        <button
          class="method-trigger {methodColor(method)}"
          class:open={methodMenuOpen}
          type="button"
          aria-label="HTTP method"
          aria-haspopup="listbox"
          aria-expanded={methodMenuOpen}
          onclick={() => (methodMenuOpen = !methodMenuOpen)}
        >
          <span>{method}</span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
            <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        {#if methodMenuOpen}
          <div class="method-menu" role="listbox" aria-label="HTTP method">
            {#each methods as option}
              <button
                class:active={method === option}
                class={methodColor(option)}
                role="option"
                aria-selected={method === option}
                type="button"
                onclick={() => selectMethod(option)}
              >
                <span class="method-check">{method === option ? '✓' : ''}</span>
                <span>{option}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <VariableInput
      className="url-input"
      bind:inputRef={urlInputRef}
      bind:value={url}
      multiline
      suggestions={variableSuggestions}
      placeholder={requestType === 'graphql' ? 'Enter GraphQL endpoint URL…' : requestType === 'ws' ? 'Enter WebSocket URL…' : requestType === 'socketio' ? 'Enter Socket.IO URL…' : requestType === 'grpc' ? 'Enter gRPC target, e.g. localhost:50051…' : 'Enter request URL or paste cURL…'}
      ariaLabel={requestType === 'grpc' ? 'gRPC target' : 'Request URL'}
      oninput={onUrlInput}
      onpaste={(event) => { onUrlPaste(event); keepHostVisible(); }}
    />

    {#if isGRPC}
      <div class="grpc-method-wrap" onfocusout={closeGrpcMethodMenuOnFocusOut}>
        <button
          class="grpc-method-trigger"
          class:open={grpcMethodMenuOpen}
          type="button"
          bind:this={grpcMethodButtonRef}
          aria-label="gRPC method"
          aria-haspopup="listbox"
          aria-expanded={grpcMethodMenuOpen}
          onclick={toggleGrpcMethodMenu}
        >
          <span class="grpc-method-icon" aria-hidden="true">↕</span>
          <span class="grpc-method-label" title={grpcMethod || grpcSelectedLabel}>{grpcSelectedLabel}</span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
            <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>

        {#if grpcMethodMenuOpen}
          <div class="grpc-method-menu" role="listbox" aria-label="gRPC methods">
            <div class="grpc-method-search">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <circle cx="5.8" cy="5.8" r="3.8" stroke="currentColor" stroke-width="1.3"/>
                <path d="M8.7 8.7l2.7 2.7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              </svg>
              <input bind:value={grpcMethodFilter} onkeydown={onGrpcMethodSearchKeydown} placeholder="Search methods" aria-label="Search gRPC methods" />
            </div>

            <button class="grpc-method-refresh" type="button" disabled={grpcServiceLoading} onclick={() => onGrpcDiscover()}>
              {#if grpcServiceLoading}<span class="spinner spinner-inline"></span>{/if}
              <span>{grpcMethods.length ? 'Refresh methods' : 'Load methods'}</span>
            </button>

            {#if grpcFilteredMethods.length}
              <div class="grpc-method-options">
                {#each grpcFilteredMethods as option}
                  <button
                    class:active={grpcMethod === option.fullName}
                    role="option"
                    aria-selected={grpcMethod === option.fullName}
                    type="button"
                    onclick={() => selectGrpcMethod(option.fullName)}
                  >
                    <span class="method-check">{grpcMethod === option.fullName ? '✓' : ''}</span>
                    <span class="grpc-option-main">
                      <strong>{grpcMethodLabel(option.fullName)}</strong>
                      <small>{option.requestType} -> {option.responseType}</small>
                    </span>
                  </button>
                {/each}
              </div>
            {:else}
              <div class="grpc-method-empty">
                {grpcMethodFilter.trim() ? 'No matching methods' : 'No methods loaded'}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if isGraphQL}
      <button
        class="btn-send btn-graphql-query"
        class:btn-send-cancel={loading}
        onclick={onSend}
        type="button"
      >
        {#if loading}<span class="spinner"></span>Cancel
        {:else}
          Query
        {/if}
      </button>
    {:else if isGRPC}
      <button
        class="btn-send btn-graphql-query"
        class:btn-send-cancel={loading}
        onclick={onSend}
        type="button"
      >
        {#if loading}<span class="spinner"></span>Cancel
        {:else}
          Invoke
        {/if}
      </button>
    {:else if isSIO}
      {#if sioConnected || sioConnecting}
        <button class="btn-send btn-ws-disconnect" onclick={onSend} type="button">
          {#if sioConnecting}
            <span class="spinner"></span>
          {:else}
            <span class="sse-dot-live"></span>
            Disconnect
          {/if}
        </button>
      {:else}
        <button class="btn-send btn-ws-connect" onclick={onSend} type="button">Connect</button>
      {/if}
    {:else if isWS}
      {#if wsConnected || wsConnecting}
        <button class="btn-send btn-ws-disconnect" onclick={onSend} type="button">
          {#if wsConnecting}
            <span class="spinner"></span>
          {:else}
            <span class="sse-dot-live"></span>
            Disconnect
          {/if}
        </button>
      {:else}
        <button class="btn-send btn-ws-connect" onclick={onSend} type="button">Connect</button>
      {/if}
    {:else if showSSEControls}
      {#if sseConnected || sseConnecting}
        <button class="btn-send btn-sse-disconnect" onclick={onSend} type="button">
          {#if sseConnecting}
            <span class="spinner"></span>
          {:else}
            <span class="sse-dot-live"></span>
            Disconnect
          {/if}
        </button>
      {:else}
        <button class="btn-send btn-sse-connect" onclick={onSend} type="button">Connect</button>
      {/if}
    {:else}
      <div class="send-split" class:loading onfocusout={closeSendMenuOnFocusOut}>
        <button
          class="btn-send"
          class:btn-send-cancel={loading}
          onclick={onSend}
          type="button"
        >
          {#if loading}<span class="spinner"></span>Cancel
          {:else}
            Send
          {/if}
        </button>
        {#if !loading}
          <button
            class="btn-send-caret"
            class:open={sendMenuOpen}
            type="button"
            aria-label="Send options"
            aria-haspopup="menu"
            aria-expanded={sendMenuOpen}
            onclick={() => (sendMenuOpen = !sendMenuOpen)}
          >
            <svg width="10" height="7" viewBox="0 0 10 7" fill="none" aria-hidden="true">
              <path d="M1.5 2L5 5.5L8.5 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          {#if sendMenuOpen}
            <div class="send-menu" role="menu" aria-label="Send options">
              <button
                class="send-menu-item"
                role="menuitem"
                type="button"
                onclick={() => { sendMenuOpen = false; onSendAndDownload(); }}
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                  <path d="M7.5 2v7m0 0L4.5 6m3 3l3-3M2.5 12h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Send and Download
              </button>
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</div>
