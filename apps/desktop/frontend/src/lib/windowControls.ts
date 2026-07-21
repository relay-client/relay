const TITLEBAR_DRAG_REGION = '.titlebar-drag-region';

const INTERACTIVE_TITLEBAR_TARGET = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="tab"]',
  '.workspace-menu',
  '.environment-menu',
].join(', ');

function isTitlebarDoubleClickTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (!target.closest(TITLEBAR_DRAG_REGION)) return false;
  return !target.closest(INTERACTIVE_TITLEBAR_TARGET);
}

function toggleWindowMaximise() {
  void window.runtime?.WindowToggleMaximise?.();
}

export function installTitlebarDoubleClickHandler() {
  const onDoubleClick = (event: MouseEvent) => {
    if (isTitlebarDoubleClickTarget(event.target)) toggleWindowMaximise();
  };
  document.addEventListener('dblclick', onDoubleClick);
  return () => document.removeEventListener('dblclick', onDoubleClick);
}
