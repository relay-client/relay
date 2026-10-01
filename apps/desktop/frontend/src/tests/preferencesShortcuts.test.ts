import { describe, expect, it, vi } from 'vitest';
import {
  canonicalShortcutCombo,
  platformShortcutCombo,
  shortcutKeycaps,
  preferencesFeature,
  shortcutComboLabel,
  shortcutKeyLabelForPlatform,
  shortcutPlatform,
} from '../lib/stores/features/preferences';
import type { ShortcutId } from '../lib/types/models';

function shortcutHost(appRuntime: string, shortcutOverrides: Record<string, string> = {}) {
  return {
    appRuntime,
    shortcutOverrides,
    shortcutCombo: preferencesFeature.shortcutCombo,
    shortcutKeyLabel: preferencesFeature.shortcutKeyLabel,
    normalizeShortcutKey: preferencesFeature.normalizeShortcutKey,
    eventToCombo: preferencesFeature.eventToCombo,
    saveShortcutSettings: vi.fn(),
  } as any;
}

describe('platform shortcut defaults', () => {
  it('keeps macOS command-key defaults on darwin', () => {
    expect(shortcutPlatform('darwin/arm64')).toBe('darwin');
    expect(platformShortcutCombo('Shift+Meta+T', 'darwin/arm64')).toBe('Shift+Meta+T');
    expect(shortcutKeyLabelForPlatform('Meta', 'darwin/arm64')).toBe('⌘');
  });

  it('uses Ctrl-based defaults and plain key labels on Windows', () => {
    expect(shortcutPlatform('windows/amd64')).toBe('windows');
    expect(platformShortcutCombo('Shift+Meta+T', 'windows/amd64')).toBe('Ctrl+Shift+T');
    expect(platformShortcutCombo('Alt+Meta+\\', 'windows/amd64')).toBe('Ctrl+Alt+\\');
    expect(shortcutComboLabel('Ctrl+Alt+\\', 'windows/amd64')).toBe('Ctrl+Alt+\\');
    expect(shortcutKeyLabelForPlatform('Meta', 'windows/amd64')).toBe('Win');
    expect(shortcutKeyLabelForPlatform('Ctrl', 'windows/amd64')).toBe('Ctrl');
    expect(shortcutKeyLabelForPlatform('Alt', 'windows/amd64')).toBe('Alt');
  });

  it('returns platform defaults from the preferences feature', () => {
    const windows = shortcutHost('windows/amd64');
    const darwin = shortcutHost('darwin/arm64');

    expect(preferencesFeature.shortcutCombo.call(windows, 'search')).toBe('Ctrl+K');
    expect(preferencesFeature.shortcutCombo.call(darwin, 'search')).toBe('Meta+K');
    expect(shortcutKeycaps('Ctrl+K', 'windows/amd64').map(keycap => keycap.label)).toEqual(['Ctrl', 'K']);
    expect(shortcutKeycaps('Meta+K', 'darwin/arm64').map(keycap => keycap.label)).toEqual(['⌘', 'K']);
  });

  it('matches Ctrl default shortcuts from keyboard events on Windows', () => {
    const windows = shortcutHost('windows/amd64');
    const event = { key: 'k', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false } as KeyboardEvent;

    expect(preferencesFeature.shortcutForEvent.call(windows, event)).toBe('search');
  });

  it('preserves explicit user overrides across platforms', () => {
    const windows = shortcutHost('windows/amd64', { search: 'Alt+K' });

    expect(preferencesFeature.shortcutCombo.call(windows, 'search')).toBe('Alt+K');
    preferencesFeature.setShortcut.call(windows, 'search' as ShortcutId, 'Ctrl+K');
    expect(windows.shortcutOverrides.search).toBeUndefined();
  });

  it('matches multi-modifier defaults on Windows and Linux whatever order the modifiers come in', () => {
    for (const runtime of ['windows/amd64', 'linux/amd64']) {
      const host = shortcutHost(runtime);
      const reopen = { key: 'T', code: 'KeyT', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false } as KeyboardEvent;
      const codePanel = { key: '\\', code: 'Backslash', ctrlKey: true, altKey: true, shiftKey: false, metaKey: false } as KeyboardEvent;
      expect(preferencesFeature.shortcutForEvent.call(host, reopen)).toBe('reopen-tab');
      expect(preferencesFeature.shortcutForEvent.call(host, codePanel)).toBe('toggle-right-sidebar');
    }
    expect(canonicalShortcutCombo('Meta+Shift+Alt+Ctrl+K')).toBe('Ctrl+Alt+Shift+Meta+K');
  });

  it('matches shortcuts on a non-Latin keyboard layout by the physical key', () => {
    const windows = shortcutHost('windows/amd64');
    const darwin = shortcutHost('darwin/arm64');
    const cyrillicN = { key: 'т', code: 'KeyN', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false } as KeyboardEvent;
    const cyrillicK = { key: 'л', code: 'KeyK', ctrlKey: false, altKey: false, shiftKey: false, metaKey: true } as KeyboardEvent;
    const optionArrow = { key: 'ArrowRight', code: 'ArrowRight', ctrlKey: false, altKey: true, shiftKey: false, metaKey: false } as KeyboardEvent;
    const optionBackslash = { key: '«', code: 'Backslash', ctrlKey: false, altKey: true, shiftKey: false, metaKey: true } as KeyboardEvent;
    expect(preferencesFeature.shortcutForEvent.call(windows, cyrillicN)).toBe('new-request');
    expect(preferencesFeature.shortcutForEvent.call(darwin, cyrillicK)).toBe('search');
    expect(preferencesFeature.shortcutForEvent.call(darwin, optionArrow)).toBe('expand-all');
    expect(preferencesFeature.shortcutForEvent.call(darwin, optionBackslash)).toBe('toggle-right-sidebar');
  });

  it('records and shows a Windows-key binding as the Windows key, not Ctrl', () => {
    const windows = shortcutHost('windows/amd64');
    const winK = { key: 'k', code: 'KeyK', ctrlKey: false, altKey: false, shiftKey: true, metaKey: true } as KeyboardEvent;
    const combo = preferencesFeature.eventToCombo.call(windows, winK);
    expect(combo).toBe('Shift+Meta+K');
    preferencesFeature.setShortcut.call(windows, 'search' as ShortcutId, combo);
    expect(preferencesFeature.shortcutForEvent.call(windows, winK)).toBe('search');
    expect(shortcutComboLabel(preferencesFeature.shortcutCombo.call(windows, 'search'), 'windows/amd64')).toBe('Shift+Win+K');
    expect(shortcutKeycaps('Shift+Meta+K', 'windows/amd64')).toEqual([
      { key: 'Shift', label: '⇧ Shift', title: 'Shift' },
      { key: 'Meta', label: 'Win', title: 'Windows key', icon: 'windows' },
      { key: 'K', label: 'K', title: 'K' },
    ]);
    expect(shortcutKeycaps('Meta+K', 'linux/amd64')[0]).toMatchObject({ label: 'Super' });
  });

  it('lets a rebound shortcut fire and frees the combination from the shortcut that had it', () => {
    const linux = shortcutHost('linux/amd64');
    preferencesFeature.setShortcut.call(linux, 'send-request' as ShortcutId, 'Ctrl+K');
    const ctrlK = { key: 'k', code: 'KeyK', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false } as KeyboardEvent;
    expect(preferencesFeature.shortcutForEvent.call(linux, ctrlK)).toBe('send-request');
    expect(preferencesFeature.shortcutCombo.call(linux, 'search')).toBe('');
    const ctrlEnter = { key: 'Enter', code: 'Enter', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false } as KeyboardEvent;
    expect(preferencesFeature.shortcutForEvent.call(linux, ctrlEnter)).toBeNull();
  });
});
