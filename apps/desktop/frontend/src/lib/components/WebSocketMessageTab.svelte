<script lang="ts">
  import CodeEditor from '../CodeEditor.svelte';
  import BeautifyButton from './BeautifyButton.svelte';
  import { RAW_BODY_TYPES } from '../constants';
  import { vm } from '../stores/app.svelte';
  import type { RawBodyType } from '../types/models';

  type WebSocketMessageBodyType = RawBodyType | 'binary';

  const WS_MESSAGE_TYPES: WebSocketMessageBodyType[] = [...RAW_BODY_TYPES, 'binary'];

  let editorRef = $state<CodeEditor>();

  function onKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void vm.webSocketSendCurrentMessage();
    }
  }
</script>

<div class="body-section">
  <div class="body-editor-wrap ws-body-editor-wrap" role="presentation" onkeydown={onKeydown}>
    <div class="body-editor-toolbar ws-message-toolbar">
      <div class="raw-type-menu ws-type-menu">
        <button
          class="raw-type-button"
          class:open={vm.wsMessageTypeMenuOpen}
          type="button"
          onclick={() => (vm.wsMessageTypeMenuOpen = !vm.wsMessageTypeMenuOpen)}
        >
          {vm.webSocketMessageTypeLabel()}
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
            <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        {#if vm.wsMessageTypeMenuOpen}
          <div class="raw-type-list ws-type-options" role="listbox">
            {#each WS_MESSAGE_TYPES as type}
              <button
                class:active={vm.webSocketMessageBodyType() === type}
                role="option"
                aria-selected={vm.webSocketMessageBodyType() === type}
                type="button"
                onclick={() => { vm.setWebSocketMessageBodyType(type); vm.wsMessageTypeMenuOpen = false; }}
              >
                <span class="method-check">{vm.webSocketMessageBodyType() === type ? '✓' : ''}</span>
                {vm.webSocketMessageTypeLabel(type)}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <BeautifyButton onbeautify={() => editorRef?.format()} beautified={vm.beautifiedBody} disabled={vm.bodyLang !== 'json'} title="Beautify message" />

      <div class="ws-message-actions">
        <button class="toolbar-btn ws-toolbar-btn" type="button" disabled={!vm.webSocketConnected} onclick={() => vm.webSocketSendControl('ping')} title="Send ping">
          Ping
        </button>
        <button class="btn-send ws-message-send" type="button" disabled={!vm.webSocketConnected} onclick={vm.webSocketSendCurrentMessage}>
          Send
        </button>
      </div>
    </div>

    <CodeEditor
      bind:this={editorRef}
      bind:value={vm.bodyContent}
      language={vm.bodyLang}
      placeholder={vm.webSocketMessagePlaceholder()}
      fillHeight={true}
      compact={true}
      testId="websocket-message-editor"
      ariaLabel="WebSocket message editor"
      variableSuggestions={vm.variableSuggestions}
      onformat={vm.markBodyFormatted}
    />
  </div>
</div>
