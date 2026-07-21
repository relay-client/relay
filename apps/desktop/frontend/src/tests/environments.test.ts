import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkRow } from '../lib/constants';
import { environmentFeature, mergeEnvironmentRowsWithValues } from '../lib/stores/features/environments';

afterEach(() => {
  vi.useRealTimers();
});

describe('mergeEnvironmentRowsWithValues', () => {
  it('updates active rows, removes unset active rows, keeps disabled rows, and appends script-created values', () => {
    const rows = [
      { ...mkRow(), key: 'token', value: 'old', enabled: true, secret: true },
      { ...mkRow(), key: 'removed', value: 'gone', enabled: true },
      { ...mkRow(), key: 'disabled', value: 'local', enabled: false },
      mkRow(),
    ];

    const merged = mergeEnvironmentRowsWithValues(rows, {
      token: 'new',
      created: 'from-script',
    });

    expect(merged.filter(row => row.key).map(row => [row.key, row.value, row.enabled, row.secret ?? false])).toEqual([
      ['token', 'new', true, true],
      ['disabled', 'local', false, false],
      ['created', 'from-script', true, false],
    ]);
    expect(merged.at(-1)?.key).toBe('');
  });

  it('preserves the existing trailing blank row when nothing changed', () => {
    const trailing = mkRow();
    const rows = [
      { ...mkRow(), key: 'token', value: 'same', enabled: true },
      trailing,
    ];

    const merged = mergeEnvironmentRowsWithValues(rows, { token: 'same' });

    expect(merged).toEqual(rows);
    expect(merged.at(-1)).toBe(trailing);
  });
});

describe('environment manual-save scheduling', () => {
  it('keeps a newer environment toast when an older timer expires', async () => {
    vi.useFakeTimers();
    const host = {
      environmentToast: '',
      environmentToastTimer: null,
      environments: [
        { id: 'env-one', name: 'One' },
        { id: 'env-two', name: 'Two' },
      ],
      selectEnvironment: vi.fn().mockResolvedValue(undefined),
    };

    await environmentFeature.useEnvironment.call(host as never, 'env-one');
    await vi.advanceTimersByTimeAsync(900);
    await environmentFeature.useEnvironment.call(host as never, 'env-two');
    await vi.advanceTimersByTimeAsync(1000);

    expect(host.environmentToast).toBe('Using Two');
    await vi.advanceTimersByTimeAsync(800);
    expect(host.environmentToast).toBe('');
  });

  it('marks environments dirty instead of autosaving when autosave is disabled', async () => {
    vi.useFakeTimers();
    const persistRequestStore = vi.fn().mockResolvedValue(true);
    const host = {
      autosave: false,
      environmentPersistTimer: setTimeout(() => undefined, 1000),
      environmentSavedTimer: setTimeout(() => undefined, 1000),
      environmentSaveState: 'idle',
      guardWorkspaceWritable: vi.fn(() => true),
      persistRequestStore,
    };

    environmentFeature.scheduleEnvironmentPersist.call(host as never, 10);
    await vi.advanceTimersByTimeAsync(20);

    expect(host.guardWorkspaceWritable).toHaveBeenCalledWith('Environment changes');
    expect(host.environmentPersistTimer).toBeNull();
    expect(host.environmentSavedTimer).toBeNull();
    expect(host.environmentSaveState).toBe('dirty');
    expect(persistRequestStore).not.toHaveBeenCalled();
  });

  it('autosaves environment edits when autosave is enabled', async () => {
    vi.useFakeTimers();
    const persistRequestStore = vi.fn().mockResolvedValue(true);
    const host = {
      autosave: true,
      environmentPersistTimer: null,
      environmentSavedTimer: null,
      environmentSaveState: 'idle',
      guardWorkspaceWritable: vi.fn(() => true),
      persistRequestStore,
    };

    environmentFeature.scheduleEnvironmentPersist.call(host as never, 10);

    expect(host.environmentSaveState).toBe('saving');
    await vi.advanceTimersByTimeAsync(10);

    expect(persistRequestStore).toHaveBeenCalledTimes(1);
    expect(host.environmentSaveState).toBe('saved');
  });

  it('keeps autosave dirty when persistence fails', async () => {
    vi.useFakeTimers();
    const host = {
      autosave: true,
      environmentPersistTimer: null,
      environmentSavedTimer: null,
      environmentSaveState: 'idle',
      guardWorkspaceWritable: vi.fn(() => true),
      persistRequestStore: vi.fn().mockResolvedValue(false),
    };

    environmentFeature.scheduleEnvironmentPersist.call(host as never, 10);
    await vi.advanceTimersByTimeAsync(10);

    expect(host.environmentSaveState).toBe('dirty');
    expect(host.environmentSavedTimer).toBeNull();
  });
});
