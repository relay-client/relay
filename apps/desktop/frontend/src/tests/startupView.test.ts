import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_STARTUP_VIEW,
  loadStartupView,
  normalizeStartupView,
  saveStartupView,
  STARTUP_VIEW_STORAGE_KEY,
  startupNeedsDraftRequest,
  startupTopView,
} from '../lib/startupView';

describe('startup view preference', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { store = {}; },
      key: () => null,
      length: 0,
    } as Storage;
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('falls back to the request editor without storage', () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(loadStartupView()).toBe('request');
    expect(() => saveStartupView('restore')).not.toThrow();
  });

  it('opens the request editor unless told otherwise', () => {
    expect(DEFAULT_STARTUP_VIEW).toBe('request');
    expect(loadStartupView()).toBe('request');
    expect(normalizeStartupView('git')).toBe('request');
    expect(normalizeStartupView(null)).toBe('request');
  });

  it('remembers the chosen view', () => {
    saveStartupView('restore');
    expect(loadStartupView()).toBe('restore');
    saveStartupView('overview');
    expect(loadStartupView()).toBe('overview');
    expect(store[STARTUP_VIEW_STORAGE_KEY]).toBe('overview');
  });
});

describe('startup top view', () => {
  it('lands on the request editor whatever screen the last session ended on', () => {
    expect(startupTopView('request', { workspaceBlocked: false, hasActiveRequest: true })).toBe('request');
  });

  it('leaves the last screen to the restore path', () => {
    expect(startupTopView('restore', { workspaceBlocked: false, hasActiveRequest: true })).toBeNull();
  });

  it('opens the overview when asked to', () => {
    expect(startupTopView('overview', { workspaceBlocked: false, hasActiveRequest: true })).toBe('overview');
  });

  it('shows the overview for a blocked workspace in every mode but restore', () => {
    expect(startupTopView('request', { workspaceBlocked: true, hasActiveRequest: true })).toBe('overview');
    expect(startupTopView('overview', { workspaceBlocked: true, hasActiveRequest: false })).toBe('overview');
  });
});

describe('startup draft request', () => {
  it('opens a draft when the request editor has nothing to show', () => {
    expect(startupNeedsDraftRequest({ view: 'request', hasRequests: false, firstAppLaunch: false, savedTopView: 'git' })).toBe(true);
  });

  it('never adds a draft next to saved requests', () => {
    expect(startupNeedsDraftRequest({ view: 'request', hasRequests: true, firstAppLaunch: true })).toBe(false);
  });

  it('keeps the first launch on a request in every mode', () => {
    expect(startupNeedsDraftRequest({ view: 'overview', hasRequests: false, firstAppLaunch: true })).toBe(true);
  });

  it('restores a draft only when the last session ended on a request', () => {
    expect(startupNeedsDraftRequest({ view: 'restore', hasRequests: false, firstAppLaunch: false, savedTopView: 'request' })).toBe(true);
    expect(startupNeedsDraftRequest({ view: 'restore', hasRequests: false, firstAppLaunch: false, savedTopView: 'git' })).toBe(false);
    expect(startupNeedsDraftRequest({ view: 'overview', hasRequests: false, firstAppLaunch: false, savedTopView: 'request' })).toBe(false);
  });
});
