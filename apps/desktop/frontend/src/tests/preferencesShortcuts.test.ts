import { describe, expect, it, vi } from 'vitest';
import {
  platformShortcutCombo,
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
    expect(platformShortcutCombo('Shift+Meta+T', 'windows/amd64')).toBe('Shift+Ctrl+T');
    expect(platformShortcutCombo('Alt+Meta+\\', 'windows/amd64')).toBe('Alt+Ctrl+\\');
    expect(shortcutComboLabel('Alt+Meta+\\', 'windows/amd64')).toBe('Alt Ctrl \\');
    expect(shortcutKeyLabelForPlatform('Meta', 'windows/amd64')).toBe('Win');
    expect(shortcutKeyLabelForPlatform('Ctrl', 'windows/amd64')).toBe('Ctrl');
    expect(shortcutKeyLabelForPlatform('Alt', 'windows/amd64')).toBe('Alt');
  });

  it('returns platform defaults from the preferences feature', () => {
    const windows = shortcutHost('windows/amd64');
    const darwin = shortcutHost('darwin/arm64');

    expect(preferencesFeature.shortcutCombo.call(windows, 'search')).toBe('Ctrl+K');
    expect(preferencesFeature.shortcutCombo.call(darwin, 'search')).toBe('Meta+K');
    expect(preferencesFeature.shortcutKeycaps.call(windows, 'Ctrl+K')).toEqual(['Ctrl', 'K']);
    expect(preferencesFeature.shortcutKeycaps.call(darwin, 'Meta+K')).toEqual(['⌘', 'K']);
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
});
