<script lang="ts">
  import {
    buildResponseMatchOffsets,
    renderResponseBodyLine,
    responseMatchLine,
    type ResponseRenderMode,
  } from '../response-render';

  const VIRTUAL_LINE_HEIGHT = 20;
  const VIRTUAL_OVERSCAN = 600;
  const VIRTUAL_SCROLL_QUANTUM = VIRTUAL_LINE_HEIGHT * 4;

  let {
    source,
    mode,
    search,
    searchIndex,
    virtualized,
    page,
  }: {
    source: string;
    mode: ResponseRenderMode;
    search: string;
    searchIndex: number;
    virtualized: boolean;
    page: number;
  } = $props();

  let viewer: HTMLDivElement | undefined;
  let gutterScrollLeft = 0;
  let scrollTop = $state(0);
  let viewportHeight = $state(300);
  let lastPage = $state<number | null>(null);
  let lastSource = $state<string | null>(null);

  let rawLines = $derived(source.split(/\r\n|\r|\n/));
  let matchOffsets = $derived(buildResponseMatchOffsets(rawLines, search));
  let currentMatchLine = $derived(responseMatchLine(matchOffsets, searchIndex));
  let virtualWindow = $derived.by(() => {
    if (!virtualized) return { start: 0, end: rawLines.length, before: 0, after: 0 };
    const start = Math.max(0, Math.floor((scrollTop - VIRTUAL_OVERSCAN) / VIRTUAL_LINE_HEIGHT));
    const end = Math.min(
      rawLines.length,
      Math.ceil((scrollTop + viewportHeight + VIRTUAL_OVERSCAN) / VIRTUAL_LINE_HEIGHT),
    );
    return {
      start,
      end,
      before: start * VIRTUAL_LINE_HEIGHT,
      after: Math.max(0, (rawLines.length - end) * VIRTUAL_LINE_HEIGHT),
    };
  });
  let visibleLines = $derived.by(() => {
    const counter = { value: matchOffsets[virtualWindow.start] ?? 0 };
    return rawLines
      .slice(virtualWindow.start, virtualWindow.end)
      .map((line, index) => renderResponseBodyLine(
        line,
        virtualWindow.start + index + 1,
        mode,
        search,
        counter,
        searchIndex,
      ));
  });

  function trackViewport(node: HTMLDivElement) {
    viewer = node;
    const update = () => {
      viewportHeight = node.clientHeight || 300;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return {
      destroy() {
        observer.disconnect();
        if (viewer === node) viewer = undefined;
      },
    };
  }

  function onScroll(event: Event) {
    const node = event.currentTarget as HTMLDivElement;
    if (node.scrollLeft !== gutterScrollLeft) {
      gutterScrollLeft = node.scrollLeft;
      node.style.setProperty('--response-gutter-offset', `${gutterScrollLeft}px`);
    }
    if (!virtualized) return;
    const next = Math.floor(
      node.scrollTop / VIRTUAL_SCROLL_QUANTUM,
    ) * VIRTUAL_SCROLL_QUANTUM;
    if (next !== scrollTop) scrollTop = next;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.altKey || (!event.metaKey && !event.ctrlKey) || event.key.toLowerCase() !== 'a') return;
    const selection = window.getSelection();
    if (!selection) return;
    event.preventDefault();
    event.stopPropagation();
    const range = document.createRange();
    range.selectNodeContents(event.currentTarget as HTMLElement);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  $effect(() => {
    if (lastPage === null && lastSource === null) {
      lastPage = page;
      lastSource = source;
      return;
    }
    if (page === lastPage && source === lastSource) return;
    lastPage = page;
    lastSource = source;
    scrollTop = 0;
    if (viewer) viewer.scrollTop = 0;
  });

  $effect(() => {
    const line = currentMatchLine;
    if (line < 0 || !viewer) return;
    if (virtualized) {
      const targetTop = line * VIRTUAL_LINE_HEIGHT;
      const targetBottom = targetTop + VIRTUAL_LINE_HEIGHT;
      if (targetTop < viewer.scrollTop || targetBottom > viewer.scrollTop + viewer.clientHeight) {
        const nextTop = Math.max(0, targetTop - Math.floor(viewer.clientHeight / 2));
        viewer.scrollTop = nextTop;
        scrollTop = nextTop;
      }
    }
    queueMicrotask(() => viewer?.querySelector('.rsp-search-current')?.scrollIntoView({
      block: 'center',
      inline: 'nearest',
    }));
  });
</script>

<div
  bind:this={viewer}
  class="response-body-viewer"
  class:virtualized
  data-virtualized={virtualized ? 'true' : undefined}
  role="textbox"
  aria-label="Response body"
  aria-readonly="true"
  aria-multiline="true"
  tabindex="0"
  use:trackViewport
  onscroll={onScroll}
  onkeydown={onKeydown}
>
  {#if virtualWindow.before}
    <div class="response-lines-spacer" style={`height: ${virtualWindow.before}px`}></div>
  {/if}
  {#each visibleLines as line (line.number)}
    <div class="response-line" data-line-number={line.number}>
      <span class="response-line-no">{line.number}</span>
      <!-- Highlighted markup only; every interpolated value goes through escapeHtml(). -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <code class="response-line-code">{@html line.html}</code>
    </div>
  {/each}
  {#if virtualWindow.after}
    <div class="response-lines-spacer" style={`height: ${virtualWindow.after}px`}></div>
  {/if}
</div>
