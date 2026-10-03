import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REQUEST_SETTINGS } from '../lib/constants';
import { preferencesFeature } from '../lib/stores/features/preferences';
import type { RequestSettings } from '../lib/types/models';

const KEY = 'relay.request.settings.v1';

describe('request settings in localStorage', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    } as Storage;
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    vi.useRealTimers();
  });

  it('saves the defaults without the client key passphrase', () => {
    vi.useFakeTimers();
    const host = {
      settingsSaved: false,
      currentRequestSettings: (): RequestSettings => ({ ...DEFAULT_REQUEST_SETTINGS, clientKeyPath: '/keys/client.key', clientKeyPassword: 's3cret' }),
    };
    preferencesFeature.saveRequestSettings.call(host as never);
    const saved = JSON.parse(store.get(KEY) ?? '{}');
    expect(saved.clientKeyPath).toBe('/keys/client.key');
    expect(saved).not.toHaveProperty('clientKeyPassword');
    expect(store.get(KEY)).not.toContain('s3cret');
  });

  it('drops a passphrase an older version stored and does not load it', () => {
    store.set(KEY, JSON.stringify({ timeoutMs: 1234, clientKeyPassword: 's3cret' }));
    const applied: Array<Partial<RequestSettings>> = [];
    const host = { applyRequestSettings: (settings: Partial<RequestSettings>) => applied.push(settings) };
    preferencesFeature.loadRequestSettings.call(host as never);
    expect(applied).toEqual([{ timeoutMs: 1234 }]);
    expect(store.get(KEY)).not.toContain('s3cret');
  });
});
