import type { TopView } from './stores/ui';

export type StartupView = 'request' | 'restore' | 'overview';

export const STARTUP_VIEW_STORAGE_KEY = 'kurlo.startupView.v1';
export const DEFAULT_STARTUP_VIEW: StartupView = 'request';

export function normalizeStartupView(value: unknown): StartupView {
  return value === 'request' || value === 'restore' || value === 'overview' ? value : DEFAULT_STARTUP_VIEW;
}

export function loadStartupView(): StartupView {
  try {
    return normalizeStartupView(localStorage.getItem(STARTUP_VIEW_STORAGE_KEY));
  } catch {
    return DEFAULT_STARTUP_VIEW;
  }
}

export function saveStartupView(view: StartupView): void {
  try {
    localStorage.setItem(STARTUP_VIEW_STORAGE_KEY, view);
  } catch {}
}

export function startupNeedsDraftRequest(input: {
  view: StartupView;
  hasRequests: boolean;
  firstAppLaunch: boolean;
  savedTopView?: TopView;
}): boolean {
  if (input.hasRequests) return false;
  if (input.firstAppLaunch || input.view === 'request') return true;
  return input.view === 'restore' && input.savedTopView === 'request';
}

export function startupTopView(view: StartupView, input: { workspaceBlocked: boolean; hasActiveRequest: boolean }): TopView | null {
  if (view === 'restore') return null;
  if (input.workspaceBlocked || view === 'overview') return 'overview';
  return input.hasActiveRequest ? 'request' : 'overview';
}
