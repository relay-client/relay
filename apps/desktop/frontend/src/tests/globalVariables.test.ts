import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/backend', () => ({
  getGlobalVariables: vi.fn(),
  setGlobalVariables: vi.fn(),
}));

import { getGlobalVariables, setGlobalVariables } from '../lib/backend';
import { globalsFeature, mergeGlobalRowsWithValues, withTrailingRow } from '../lib/stores/features/globals';
import type { KVRow } from '../lib/types/models';

const mockGet = vi.mocked(getGlobalVariables);
const mockSet = vi.mocked(setGlobalVariables);

function row(id: number, key: string, value: string, over: Partial<KVRow> = {}): KVRow {
  return { id, enabled: true, key, value, description: '', ...over };
}

function makeHost(rows: KVRow[] = []) {
  return {
    globalVariables: withTrailingRow(rows),
    globalsSaveState: 'idle',
    globalsPersistTimer: null,
    globalsSavedTimer: null,
    autosave: true,
    persistRequestStore: vi.fn().mockResolvedValue(true),
    guardWorkspaceWritable: () => true,
    ...globalsFeature,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset();
});

describe('withTrailingRow', () => {
  it('always leaves one empty row to type into', () => {
    expect(withTrailingRow([]).length).toBe(1);
    const rows = withTrailingRow([row(1, 'a', '1')]);
    expect(rows.length).toBe(2);
    expect(rows[1].key).toBe('');
  });

  it('does not stack multiple empty rows', () => {
    const rows = withTrailingRow([row(1, 'a', '1'), row(2, '', ''), row(3, '', '')]);
    expect(rows.filter(r => r.key === '' && r.value === '').length).toBe(1);
  });
});

describe('globalVariableValues', () => {
  it('collects enabled, named rows and trims keys', () => {
    const host = makeHost([row(1, ' token ', 'abc'), row(2, 'other', 'x')]);
    expect(host.globalVariableValues()).toEqual({ token: 'abc', other: 'x' });
  });

  it('skips disabled and unnamed rows', () => {
    const host = makeHost([row(1, 'off', 'v', { enabled: false }), row(2, '', 'orphan')]);
    expect(host.globalVariableValues()).toEqual({});
    expect(host.globalVariableCount()).toBe(0);
  });
});

describe('mergeGlobalRowsWithValues', () => {
  // Scripts write to the backend pool; folding values back must not destroy the
  // metadata the user set on each row.
  it('updates values in place and keeps row identity and flags', () => {
    const rows = [row(7, 'token', 'old', { secret: true, description: 'from CI' })];
    const merged = mergeGlobalRowsWithValues(rows, { token: 'new' });
    expect(merged[0]).toMatchObject({ id: 7, key: 'token', value: 'new', secret: true, description: 'from CI' });
  });

  it('appends a variable a script introduced', () => {
    const merged = mergeGlobalRowsWithValues([row(1, 'known', 'a')], { known: 'a', fresh: 'b' });
    expect(merged.find(r => r.key === 'fresh')).toMatchObject({ value: 'b', enabled: true });
  });

  it('assigns non-colliding ids to appended rows', () => {
    const merged = mergeGlobalRowsWithValues([row(4, 'a', '1'), row(9, 'b', '2')], { c: '3' });
    const ids = merged.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // A variable the user removed locally must not be silently resurrected just
  // because the backend still remembers it... but the backend is the source of
  // truth during a run, so it is re-added. Pin the behaviour either way.
  it('re-adds a key present in backend values', () => {
    const merged = mergeGlobalRowsWithValues([], { fromScript: 'v' });
    expect(merged.some(r => r.key === 'fromScript')).toBe(true);
  });

  it('leaves rows untouched when nothing changed', () => {
    const rows = withTrailingRow([row(1, 'a', '1')]);
    expect(mergeGlobalRowsWithValues(rows, { a: '1' })).toEqual(rows);
  });
});

describe('syncBackendGlobals', () => {
  it('pushes enabled values to the backend', async () => {
    const host = makeHost([row(1, 'token', 'abc'), row(2, 'off', 'x', { enabled: false })]);
    await host.syncBackendGlobals();
    expect(mockSet).toHaveBeenCalledWith({ token: 'abc' });
  });
});

describe('syncGlobalsFromBackend', () => {
  it('persists when a script changed a value', async () => {
    mockGet.mockResolvedValue({ token: 'written-by-script' });
    const host = makeHost([row(1, 'token', 'old')]);
    const changed = await host.syncGlobalsFromBackend();
    expect(changed).toBe(true);
    expect(host.globalVariables[0].value).toBe('written-by-script');
    expect(host.persistRequestStore).toHaveBeenCalledTimes(1);
  });

  it('does not persist when nothing changed', async () => {
    mockGet.mockResolvedValue({ token: 'same' });
    const host = makeHost([row(1, 'token', 'same')]);
    expect(await host.syncGlobalsFromBackend()).toBe(false);
    expect(host.persistRequestStore).not.toHaveBeenCalled();
  });
});

describe('row editing', () => {
  it('updates a row and schedules a save', () => {
    const host = makeHost([row(1, 'a', '1')]);
    host.updateGlobalVariableRow(0, { value: '2' });
    expect(host.globalVariables[0].value).toBe('2');
    expect(host.globalsSaveState).toBe('saving');
  });

  it('marks dirty instead of saving when autosave is off', () => {
    const host = makeHost([row(1, 'a', '1')]);
    host.autosave = false;
    host.updateGlobalVariableRow(0, { value: '2' });
    expect(host.globalsSaveState).toBe('dirty');
  });

  it('removes a row', () => {
    const host = makeHost([row(1, 'a', '1'), row(2, 'b', '2')]);
    host.removeGlobalVariableRow(0);
    expect(host.globalVariables.map((r: KVRow) => r.key)).toEqual(['b', '']);
  });

  it('clears everything back to one empty row', () => {
    const host = makeHost([row(1, 'a', '1'), row(2, 'b', '2')]);
    host.clearGlobalVariables();
    expect(host.globalVariables.length).toBe(1);
    expect(host.globalVariableCount()).toBe(0);
  });

  it('refuses edits in a read-only workspace', () => {
    const host = makeHost([row(1, 'a', '1')]);
    host.guardWorkspaceWritable = () => false;
    host.updateGlobalVariableRow(0, { value: 'nope' });
    expect(host.globalVariables[0].value).toBe('1');
  });
});
