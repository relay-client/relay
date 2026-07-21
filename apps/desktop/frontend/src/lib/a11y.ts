const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function visibleFocusable(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((item) => !item.hasAttribute('disabled') && item.getAttribute('aria-hidden') !== 'true');
}

export function trapFocus(node: HTMLElement) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  function focusInitial() {
    const target = node.querySelector<HTMLElement>('[data-autofocus]') ?? visibleFocusable(node)[0] ?? node;
    target.focus();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const items = visibleFocusable(node);
    if (!items.length) {
      event.preventDefault();
      node.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  node.addEventListener('keydown', onKeydown);
  queueMicrotask(focusInitial);

  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown);
      previous?.focus();
    },
  };
}

export function tabListKeyboard(node: HTMLElement) {
  function enabledTabs() {
    return Array.from(node.querySelectorAll<HTMLElement>('[role="tab"]'))
      .filter((tab) => !tab.hasAttribute('disabled') && tab.getAttribute('aria-disabled') !== 'true');
  }

  function onKeydown(event: KeyboardEvent) {
    const vertical = node.getAttribute('aria-orientation') === 'vertical';
    const backwardKey = vertical ? 'ArrowUp' : 'ArrowLeft';
    const forwardKey = vertical ? 'ArrowDown' : 'ArrowRight';
    if (![backwardKey, forwardKey, 'Home', 'End'].includes(event.key)) return;
    const tabs = enabledTabs();
    if (!tabs.length) return;
    const current = document.activeElement instanceof HTMLElement && tabs.includes(document.activeElement)
      ? tabs.indexOf(document.activeElement)
      : tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    let next = current >= 0 ? current : 0;
    if (event.key === forwardKey) next = (next + 1) % tabs.length;
    else if (event.key === backwardKey) next = (next - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    event.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
  }

  node.addEventListener('keydown', onKeydown);
  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown);
    },
  };
}
