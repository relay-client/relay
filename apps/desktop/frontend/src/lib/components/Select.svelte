<script lang="ts">
  let {
    value = $bindable(''),
    options = [],
    className = '',
    disabled = false,
    onChange = () => {},
  }: {
    value: string;
    options: Array<{ value: string; label: string }>;
    className?: string;
    disabled?: boolean;
    onChange?: (value: string) => void;
  } = $props();

  let open = $state(false);
  let wrap = $state<HTMLDivElement>();

  const selected = $derived(options.find(o => o.value === value));

  function choose(v: string) {
    value = v;
    open = false;
    onChange(v);
  }

  function onFocusOut(event: FocusEvent) {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !wrap?.contains(next)) open = false;
  }
</script>

<div class="app-select {className}" class:open bind:this={wrap} onfocusout={onFocusOut}>
  <button
    class="app-select-trigger"
    type="button"
    {disabled}
    aria-haspopup="listbox"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <span>{selected?.label ?? value}</span>
    <svg class="app-select-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
      <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </button>
  {#if open}
    <div class="app-select-menu" role="listbox">
      {#each options as opt}
        <button
          class="app-select-option"
          class:active={opt.value === value}
          type="button"
          role="option"
          aria-selected={opt.value === value}
          onmousedown={(e) => e.preventDefault()}
          onclick={() => choose(opt.value)}
        >
          <span class="app-select-check">{opt.value === value ? '✓' : ''}</span>
          <span>{opt.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
