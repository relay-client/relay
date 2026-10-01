export type MiddleClickHandler = (() => void) | undefined;

export function middleClick(node: HTMLElement, handler: MiddleClickHandler) {
  let current = handler;
  let pressed = false;

  function onMousedown(event: MouseEvent) {
    if (event.button !== 1) return;
    event.preventDefault();
    pressed = Boolean(current);
  }

  function onMouseup(event: MouseEvent) {
    if (event.button !== 1) return;
    const wasPressed = pressed;
    pressed = false;
    if (!wasPressed || !current) return;
    event.preventDefault();
    current();
  }

  function onMouseleave() {
    pressed = false;
  }

  function onAuxclick(event: MouseEvent) {
    if (event.button === 1) event.preventDefault();
  }

  node.addEventListener('mousedown', onMousedown);
  node.addEventListener('mouseup', onMouseup);
  node.addEventListener('mouseleave', onMouseleave);
  node.addEventListener('auxclick', onAuxclick);

  return {
    update(next: MiddleClickHandler) {
      current = next;
      if (!next) pressed = false;
    },
    destroy() {
      node.removeEventListener('mousedown', onMousedown);
      node.removeEventListener('mouseup', onMouseup);
      node.removeEventListener('mouseleave', onMouseleave);
      node.removeEventListener('auxclick', onAuxclick);
    },
  };
}
