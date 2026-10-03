<script lang="ts">
  import type { BodyMode, RawBodyType } from '../types/models';
  import BeautifyButton from './BeautifyButton.svelte';

  let {
    rawTypeMenuOpen = $bindable(false),
    rawBodyType,
    rawBodyTypes,
    bodyModeIs,
    setBodyMode,
    rawTypeLabel,
    setRawBodyType,
    showBeautify = false,
    beautified = false,
    beautifyDisabled = false,
    onBeautify,
  }: {
    rawTypeMenuOpen: boolean;
    rawBodyType: RawBodyType;
    rawBodyTypes: RawBodyType[];
    bodyModeIs: (mode: BodyMode) => boolean;
    setBodyMode: (mode: BodyMode) => void;
    rawTypeLabel: (type?: RawBodyType) => string;
    setRawBodyType: (type: RawBodyType) => void;
    showBeautify?: boolean;
    beautified?: boolean;
    beautifyDisabled?: boolean;
    onBeautify?: () => void;
  } = $props();

  let bodyModeMenuOpen = $state(false);

  const bodyModes: { mode: BodyMode; label: string }[] = [
    { mode: 'none', label: 'None' },
    { mode: 'form', label: 'Form data' },
    { mode: 'urlencoded', label: 'URL-encoded' },
    { mode: 'raw', label: 'Raw' },
    { mode: 'binary', label: 'Binary' },
  ];

  let activeBodyMode = $derived(bodyModes.find(({ mode }) => bodyModeIs(mode)) ?? bodyModes[0]);

  function chooseBodyMode(mode: BodyMode) {
    setBodyMode(mode);
    bodyModeMenuOpen = false;
  }

  function closeRawTypeMenuOnFocusOut(event: FocusEvent) {
    const current = event.currentTarget;
    const next = event.relatedTarget;

    if (!(current instanceof HTMLElement)) return;
    if (!(next instanceof Node) || !current.contains(next)) rawTypeMenuOpen = false;
  }

  function closeBodyModeMenuOnFocusOut(event: FocusEvent) {
    const current = event.currentTarget;
    const next = event.relatedTarget;

    if (!(current instanceof HTMLElement)) return;
    if (!(next instanceof Node) || !current.contains(next)) bodyModeMenuOpen = false;
  }
</script>

<div class="body-mode-row">
  <div class="body-mode-compact-menu" onfocusout={closeBodyModeMenuOnFocusOut}>
    <button
      class="field field-sm select-trigger body-mode-compact-trigger"
      class:open={bodyModeMenuOpen}
      type="button"
      aria-label="Body type"
      aria-haspopup="listbox"
      aria-expanded={bodyModeMenuOpen}
      onclick={() => (bodyModeMenuOpen = !bodyModeMenuOpen)}
    >
      <span>{activeBodyMode.label}</span>
      <svg width="0.625rem" height="0.375rem" viewBox="0 0 10 6" fill="none" aria-hidden="true">
        <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
    {#if bodyModeMenuOpen}
      <div class="menu body-mode-compact-list" role="listbox" aria-label="Body types">
        {#each bodyModes as item, eachIndex (eachIndex)}
          <button class="menu-item"
            class:active={bodyModeIs(item.mode)}
            role="option"
            aria-selected={bodyModeIs(item.mode)}
            type="button"
            onclick={() => chooseBodyMode(item.mode)}
          >
            <span class="body-mode-check">{bodyModeIs(item.mode) ? '✓' : ''}</span>
            <span>{item.label}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
  <div class="segmented body-mode-segments" role="radiogroup" aria-label="Body type">
    <label class="segmented-item body-mode-label" class:active={bodyModeIs('none')}>
      <input type="radio" name="bodyMode" value="none" checked={bodyModeIs('none')} onchange={() => setBodyMode('none')} />
      None
    </label>
    <label class="segmented-item body-mode-label" class:active={bodyModeIs('form')}>
      <input type="radio" name="bodyMode" value="form" checked={bodyModeIs('form')} onchange={() => setBodyMode('form')} />
      Form data
    </label>
    <label class="segmented-item body-mode-label" class:active={bodyModeIs('urlencoded')}>
      <input type="radio" name="bodyMode" value="urlencoded" checked={bodyModeIs('urlencoded')} onchange={() => setBodyMode('urlencoded')} />
      URL-encoded
    </label>
    <label class="segmented-item body-mode-label" class:active={bodyModeIs('raw')}>
      <input type="radio" name="bodyMode" value="raw" checked={bodyModeIs('raw')} onchange={() => setBodyMode('raw')} />
      Raw
    </label>
    <label class="segmented-item body-mode-label" class:active={bodyModeIs('binary')}>
      <input type="radio" name="bodyMode" value="binary" checked={bodyModeIs('binary')} onchange={() => setBodyMode('binary')} />
      Binary
    </label>
  </div>
  {#if bodyModeIs('raw')}
    <div
      class="raw-type-menu"
      onfocusout={closeRawTypeMenuOnFocusOut}
    >
      <button
        class="field field-sm select-trigger raw-type-button"
        class:open={rawTypeMenuOpen}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={rawTypeMenuOpen}
        onclick={() => (rawTypeMenuOpen = !rawTypeMenuOpen)}
      >
        {rawTypeLabel()}
        <svg width="0.625rem" height="0.375rem" viewBox="0 0 10 6" fill="none" aria-hidden="true">
          <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      {#if rawTypeMenuOpen}
        <div class="menu raw-type-list" role="listbox">
          {#each rawBodyTypes as type, eachIndex (eachIndex)}
            <button class="menu-item"
              class:active={rawBodyType === type}
              role="option"
              aria-selected={rawBodyType === type}
              type="button"
              onclick={() => setRawBodyType(type)}
            >
              {rawTypeLabel(type)}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  {#if showBeautify}
    <div class="body-mode-beautify">
      <BeautifyButton onbeautify={() => onBeautify?.()} beautified={beautified} disabled={beautifyDisabled} title="Beautify body" />
    </div>
  {/if}
</div>

<style>

  .body-mode-beautify {
    display: flex;
    align-items: center;
    margin-left: auto;
  }
</style>
