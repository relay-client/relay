import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  applyUiScale,
  currentUiScale,
  DEFAULT_UI_SCALE,
  loadUiScale,
  normalizeUiScale,
  rem,
  saveUiScale,
  stepUiScale,
  toLogicalPx,
  toScreenPx,
  UI_SCALE_STEPS,
  UI_SCALE_STORAGE_KEY,
  uiScale,
} from '../lib/uiScale';
import { preferencesFeature } from '../lib/stores/features/preferences';
import { uiShellFeature } from '../lib/stores/features/uiShell';
import { virtualizeRows } from '../lib/sidebarVirtual';

describe('interface size', () => {
  let store: Record<string, string>;
  let rootStyle: Record<string, string>;

  beforeEach(() => {
    store = {};
    rootStyle = {};
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { store = {}; },
      key: () => null,
      length: 0,
    } as Storage;
    (globalThis as { document?: unknown }).document = {
      documentElement: {
        dataset: {},
        style: {
          get fontSize() { return rootStyle.fontSize ?? ''; },
          set fontSize(value: string) { rootStyle.fontSize = value; },
          removeProperty: (name: string) => { if (name === 'font-size') delete rootStyle.fontSize; },
        },
      },
    };
  });

  afterEach(() => {
    applyUiScale(DEFAULT_UI_SCALE);
    delete (globalThis as { localStorage?: Storage }).localStorage;
    delete (globalThis as { document?: unknown }).document;
  });

  it('snaps any input to the nearest supported step', () => {
    expect(normalizeUiScale(1)).toBe(1);
    expect(normalizeUiScale('1.25')).toBe(1.25);
    expect(normalizeUiScale(1.2)).toBe(1.25);
    expect(normalizeUiScale(0.1)).toBe(0.8);
    expect(normalizeUiScale(9)).toBe(1.5);
    expect(normalizeUiScale('garbage')).toBe(DEFAULT_UI_SCALE);
    expect(normalizeUiScale(null)).toBe(DEFAULT_UI_SCALE);
    expect(normalizeUiScale(Number.NaN)).toBe(DEFAULT_UI_SCALE);
  });

  it('steps through the scale and stops at both ends', () => {
    expect(stepUiScale(1, 1)).toBe(1.1);
    expect(stepUiScale(1, -1)).toBe(0.9);
    expect(stepUiScale(UI_SCALE_STEPS[0], -1)).toBe(UI_SCALE_STEPS[0]);
    expect(stepUiScale(UI_SCALE_STEPS[UI_SCALE_STEPS.length - 1], 1)).toBe(UI_SCALE_STEPS[UI_SCALE_STEPS.length - 1]);
    expect(UI_SCALE_STEPS).toEqual([0.8, 0.9, 1, 1.1, 1.25, 1.5]);
  });

  it('persists only non-default sizes and reads them back', () => {
    saveUiScale(1.25);
    expect(store[UI_SCALE_STORAGE_KEY]).toBe('1.25');
    expect(loadUiScale()).toBe(1.25);
    saveUiScale(1);
    expect(UI_SCALE_STORAGE_KEY in store).toBe(false);
    expect(loadUiScale()).toBe(1);
  });

  it('scales the root font size so every rem-based size follows', () => {
    applyUiScale(1.25);
    expect(rootStyle.fontSize).toBe('125%');
    expect(currentUiScale()).toBe(1.25);
    expect(get(uiScale)).toBe(1.25);
    applyUiScale(1);
    expect(rootStyle.fontSize).toBeUndefined();
    expect(get(uiScale)).toBe(1);
  });

  it('converts between logical and screen pixels at the current size', () => {
    expect(rem(280)).toBe('17.5rem');
    applyUiScale(1.25);
    expect(toScreenPx(280)).toBe(350);
    expect(toLogicalPx(350)).toBe(280);
  });

  it('zoom shortcuts change, persist and reset the size', () => {
    const host = {
      setUiScale: preferencesFeature.setUiScale,
      zoomIn: preferencesFeature.zoomIn,
      zoomOut: preferencesFeature.zoomOut,
      resetZoom: preferencesFeature.resetZoom,
    } as any;
    host.zoomIn();
    host.zoomIn();
    expect(currentUiScale()).toBe(1.25);
    expect(store[UI_SCALE_STORAGE_KEY]).toBe('1.25');
    expect(rootStyle.fontSize).toBe('125%');
    host.zoomOut();
    expect(currentUiScale()).toBe(1.1);
    host.resetZoom();
    expect(currentUiScale()).toBe(1);
    expect(UI_SCALE_STORAGE_KEY in store).toBe(false);
  });

  it('dragging the sidebar moves it by logical pixels at any size', () => {
    applyUiScale(1.25);
    const host: any = {
      sidebarResizing: true,
      sidebarResizeStartW: 280,
      sidebarResizeStartX: 400,
      sidebarWidth: 280,
      codePanelOpen: false,
      panelResizing: false,
      splitResizing: false,
      codePanelResizing: false,
      colResizing: null,
    };
    uiShellFeature.onWindowMouseMove.call(host, { clientX: 450, clientY: 0 } as MouseEvent);
    expect(host.sidebarWidth).toBe(320);
  });

  it('sizes virtual rows with the current scale unless they were measured', () => {
    const rows = [
      { key: 'a', height: 28 },
      { key: 'b', height: 28 },
      { key: 'c', height: 30 },
    ];
    expect(virtualizeRows(rows, 0, 1000, 0, 0, undefined, 1.25).totalHeight).toBe(107.5);
    expect(virtualizeRows(rows, 0, 1000, 0, 0, new Map([['c', 40]]), 1.25).totalHeight).toBe(110);
  });
});

describe('zoom shortcuts', () => {
  function host(appRuntime: string) {
    return {
      appRuntime,
      shortcutOverrides: {},
      shortcutCombo: preferencesFeature.shortcutCombo,
      shortcutKeyLabel: preferencesFeature.shortcutKeyLabel,
      normalizeShortcutKey: preferencesFeature.normalizeShortcutKey,
      eventToCombo: preferencesFeature.eventToCombo,
    } as any;
  }
  const key = (init: Partial<KeyboardEvent>) => ({ key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...init }) as KeyboardEvent;

  it('maps ⌘=, ⌘+ and ⌘⇧= to zoom in on macOS', () => {
    const mac = host('darwin/arm64');
    expect(preferencesFeature.shortcutForEvent.call(mac, key({ key: '=', code: 'Equal', metaKey: true }))).toBe('zoom-in');
    expect(preferencesFeature.shortcutForEvent.call(mac, key({ key: '+', code: 'Equal', metaKey: true, shiftKey: true }))).toBe('zoom-in');
    expect(preferencesFeature.shortcutForEvent.call(mac, key({ key: '+', code: 'NumpadAdd', metaKey: true }))).toBe('zoom-in');
    expect(preferencesFeature.shortcutForEvent.call(mac, key({ key: '-', code: 'Minus', metaKey: true }))).toBe('zoom-out');
    expect(preferencesFeature.shortcutForEvent.call(mac, key({ key: '0', code: 'Digit0', metaKey: true }))).toBe('zoom-reset');
  });

  it('uses Ctrl on Windows', () => {
    const windows = host('windows/amd64');
    expect(preferencesFeature.shortcutForEvent.call(windows, key({ key: '=', code: 'Equal', ctrlKey: true }))).toBe('zoom-in');
    expect(preferencesFeature.shortcutForEvent.call(windows, key({ key: '-', code: 'Minus', ctrlKey: true }))).toBe('zoom-out');
    expect(preferencesFeature.shortcutForEvent.call(windows, key({ key: '0', code: 'Digit0', ctrlKey: true }))).toBe('zoom-reset');
  });
});
