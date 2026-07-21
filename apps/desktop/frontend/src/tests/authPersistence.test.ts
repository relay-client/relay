import { describe, expect, it } from 'vitest';
import { authForPersistence, authStateHasData, emptyAuthState } from '../lib/utils';

describe('auth persistence', () => {
  it('keeps an empty auth type switch out of autosave payloads', () => {
    const stored = emptyAuthState();
    const current = { ...emptyAuthState(), type: 'basic' as const };

    expect(authForPersistence(current, stored).type).toBe('none');
  });

  it('persists the selected auth type once that auth form has data', () => {
    const current = { ...emptyAuthState(), type: 'basic' as const, basicUser: 'relay' };

    expect(authForPersistence(current, emptyAuthState())).toMatchObject({
      type: 'basic',
      basicUser: 'relay',
    });
  });

  it('preserves stored auth when switching to another empty auth form', () => {
    const stored = { ...emptyAuthState(), type: 'bearer' as const, bearerToken: 'token' };
    const current = { ...emptyAuthState(), type: 'apikey' as const };

    expect(authForPersistence(current, stored)).toMatchObject({
      type: 'bearer',
      bearerToken: 'token',
    });
  });

  it('treats API key defaults as empty until the user edits an auth field', () => {
    expect(authStateHasData({ ...emptyAuthState(), type: 'apikey' }, 'apikey')).toBe(false);
    expect(authStateHasData({ ...emptyAuthState(), type: 'apikey', apiKeyName: 'X-Relay-Key' }, 'apikey')).toBe(true);
  });
});
