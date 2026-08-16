// Last-resort safety net: if the Svelte scheduler hits an unrecoverable error
// (e.g. effect_update_depth_exceeded), the UI freezes with no way out. This
// renders a dependency-free DOM overlay offering reload/quit so the window is
// never just a frozen white screen.

const FATAL_MARKERS = [
  'effect_update_depth_exceeded',
  'Maximum update depth exceeded',
  'svelte.dev/e/effect_',
];

const IGNORED_MARKERS = [
  'ResizeObserver loop',
  '[vite]',
  'Failed to fetch dynamically imported module',
];

// A burst this tight means the app is wedged rather than hitting one bad
// render: the overlay is the only way back out.
export const ERROR_STORM_THRESHOLD = 15;
export const ERROR_STORM_WINDOW_MS = 1000;

let overlayShown = false;
let recentErrors: number[] = [];

function getRuntime(): Record<string, undefined | (() => void)> | undefined {
  return (window as unknown as { runtime?: Record<string, undefined | (() => void)> }).runtime;
}

function reloadApp() {
  const rt = getRuntime();
  try {
    if (typeof rt?.WindowReload === 'function') { rt.WindowReload(); return; }
  } catch { /* fall through to hard reload */ }
  window.location.reload();
}

function quitApp() {
  const rt = getRuntime();
  try {
    if (typeof rt?.Quit === 'function') { rt.Quit(); return; }
  } catch { /* fall through */ }
  try { window.close(); } catch { /* no-op */ }
}

function showFatalOverlay(detail: string) {
  if (overlayShown) return;
  overlayShown = true;

  const root = document.createElement('div');
  root.id = 'relay-fatal-overlay';
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-modal', 'true');
  Object.assign(root.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(15, 16, 22, 0.72)', backdropFilter: 'blur(4px)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    padding: '24px',
  } as CSSStyleDeclaration);

  const card = document.createElement('div');
  Object.assign(card.style, {
    maxWidth: '440px', width: '100%', boxSizing: 'border-box',
    background: '#1c1d24', color: '#e9eaf0',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px',
    padding: '24px 24px 20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  } as CSSStyleDeclaration);

  const title = document.createElement('div');
  title.textContent = 'Relay stopped responding';
  Object.assign(title.style, { fontSize: '17px', fontWeight: '700', marginBottom: '8px' } as CSSStyleDeclaration);

  const body = document.createElement('div');
  body.textContent = 'A rendering error left the app in a broken state. Reload to recover your workspace, or quit the app.';
  Object.assign(body.style, { fontSize: '13px', lineHeight: '1.5', color: '#a9abbb', marginBottom: '18px' } as CSSStyleDeclaration);

  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', gap: '10px', justifyContent: 'flex-end' } as CSSStyleDeclaration);

  const quitBtn = document.createElement('button');
  quitBtn.type = 'button';
  quitBtn.textContent = 'Quit';
  Object.assign(quitBtn.style, {
    appearance: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
    padding: '9px 16px', borderRadius: '9px', color: '#e9eaf0',
    background: 'transparent', border: '1px solid rgba(255,255,255,0.16)',
  } as CSSStyleDeclaration);
  quitBtn.onclick = quitApp;

  const reloadBtn = document.createElement('button');
  reloadBtn.type = 'button';
  reloadBtn.textContent = 'Reload';
  Object.assign(reloadBtn.style, {
    appearance: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
    padding: '9px 18px', borderRadius: '9px', color: '#fff',
    background: '#5865f2', border: '1px solid #5865f2',
  } as CSSStyleDeclaration);
  reloadBtn.onclick = reloadApp;

  const details = document.createElement('details');
  Object.assign(details.style, { marginTop: '16px' } as CSSStyleDeclaration);
  const summary = document.createElement('summary');
  summary.textContent = 'Technical details';
  Object.assign(summary.style, { fontSize: '12px', color: '#7f8194', cursor: 'pointer', userSelect: 'none' } as CSSStyleDeclaration);
  const pre = document.createElement('pre');
  pre.textContent = detail;
  Object.assign(pre.style, {
    marginTop: '10px', maxHeight: '160px', overflow: 'auto',
    fontSize: '11px', lineHeight: '1.45', color: '#9092a4',
    background: 'rgba(0,0,0,0.28)', borderRadius: '8px', padding: '10px',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  } as CSSStyleDeclaration);
  details.append(summary, pre);

  actions.append(quitBtn, reloadBtn);
  card.append(title, body, actions, details);
  root.append(card);

  const mount = () => {
    if (!document.body) return;
    document.body.appendChild(root);
    // Focus must happen *after* attach. Calling focus() on a detached node is
    // a silent no-op, so without this the Reload button never gained
    // keyboard focus when the fatal-overlay was shown before DOMContentLoaded.
    reloadBtn.focus();
  };
  if (document.body) mount();
  else window.addEventListener('DOMContentLoaded', mount, { once: true });
}

function shouldIgnore(message: string): boolean {
  return IGNORED_MARKERS.some(marker => message.includes(marker));
}

function isFatal(message: string): boolean {
  return FATAL_MARKERS.some(marker => message.includes(marker));
}

export type FatalVerdict = 'ignore' | 'fatal' | 'storm' | 'watch';

/**
 * Decides what an uncaught error means, and returns the timestamps still
 * inside the storm window.
 *
 * Kept pure and exported so it can be tested: this is the one piece of Relay
 * that has to behave correctly at the moment everything else already has not,
 * which is exactly when a bug in it would go unnoticed.
 */
export function classifyFatalError(
  message: string,
  recent: readonly number[],
  now: number,
): { verdict: FatalVerdict; recent: number[] } {
  if (!message || shouldIgnore(message)) return { verdict: 'ignore', recent: [...recent] };
  if (isFatal(message)) return { verdict: 'fatal', recent: [...recent] };
  const within = [...recent, now].filter(ts => now - ts < ERROR_STORM_WINDOW_MS);
  return { verdict: within.length >= ERROR_STORM_THRESHOLD ? 'storm' : 'watch', recent: within };
}

export function stormOverlayMessage(message: string): string {
  return 'The application became unresponsive after repeated errors.\n\nLast error:\n' + message;
}

function handle(message: string) {
  const { verdict, recent } = classifyFatalError(message, recentErrors, Date.now());
  recentErrors = recent;
  if (verdict === 'fatal') showFatalOverlay(message);
  else if (verdict === 'storm') showFatalOverlay(stormOverlayMessage(message));
}

export function installFatalErrorGuard() {
  window.addEventListener('error', event => {
    const err = (event as ErrorEvent).error;
    const message = (err && (err.stack || err.message)) || (event as ErrorEvent).message || '';
    handle(String(message));
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = (event as PromiseRejectionEvent).reason;
    const message = (reason && (reason.stack || reason.message)) || String(reason ?? '');
    handle(String(message));
  });
}
