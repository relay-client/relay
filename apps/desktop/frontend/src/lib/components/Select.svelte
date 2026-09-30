<script lang="ts">
  let {
    value = $bindable(''),
    options = [],
    className = '',
    disabled = false,
    ariaLabel = undefined,
    onChange = () => {},
  }: {
    value: string;
    options: Array<{ value: string; label: string }>;
    className?: string;
    disabled?: boolean;
    ariaLabel?: string;
    onChange?: (value: string) => void;
  } = $props();

  let open = $state(false);
  let wrap = $state<HTMLDivElement>();
  let menu = $state<HTMLDivElement>();
  let menuStyle = $state('');

  const selected = $derived(options.find(o => o.value === value));

  const MENU_MARGIN = 10;
  const MENU_MIN_HEIGHT = 120;

  function clipBounds(from: HTMLElement) {
    let node = from.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (style.overflow !== 'visible' || style.overflowY !== 'visible') {
        return node.getBoundingClientRect();
      }
      node = node.parentElement;
    }
    return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function fitMenu() {
    if (!wrap || !menu) return;
    const trigger = wrap.getBoundingClientRect();
    const bounds = clipBounds(wrap);
    const below = bounds.bottom - trigger.bottom - MENU_MARGIN;
    const above = trigger.top - bounds.top - MENU_MARGIN;
    const natural = menu.scrollHeight;
    if (natural <= below || below >= above) {
      menuStyle = `max-height:${Math.max(MENU_MIN_HEIGHT, Math.floor(below))}px`;
      return;
    }
    menuStyle = `top:auto;bottom:calc(100% + 4px);max-height:${Math.max(MENU_MIN_HEIGHT, Math.floor(above))}px`;
  }

  function onPointerDownOutside(event: PointerEvent) {
    const target = event.target;
    if (target instanceof Node && wrap?.contains(target)) return;
    open = false;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    open = false;
  }

  $effect(() => {
    if (!open) {
      menuStyle = '';
      return;
    }
    if (menu) fitMenu();
    document.addEventListener('pointerdown', onPointerDownOutside, true);
    document.addEventListener('keydown', onKeydown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDownOutside, true);
      document.removeEventListener('keydown', onKeydown, true);
    };
  });

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
    aria-label={ariaLabel ? `${ariaLabel}: ${selected?.label ?? value}` : undefined}
    onclick={() => (open = !open)}
  >
    <span>{selected?.label ?? value}</span>
    <svg class="app-select-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
      <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </button>
  {#if open}
    <div class="app-select-menu" role="listbox" bind:this={menu} style={menuStyle}>
      {#each options as opt, eachIndex (eachIndex)}
        <button
          class="app-select-option"
          class:active={opt.value === value}
          type="button"
          role="option"
          aria-selected={opt.value === value}
          onmousedown={(e) => e.preventDefault()}
          onclick={(event) => { event.preventDefault(); choose(opt.value); }}
        >
          <span class="app-select-check">{opt.value === value ? '✓' : ''}</span>
          <span>{opt.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
