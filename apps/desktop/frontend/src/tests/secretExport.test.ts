import { describe, expect, it } from 'vitest';
import { DEFAULT_REQUEST_SETTINGS } from '../lib/constants';
import { requestsHaveExportSecrets } from '../lib/secretExport';
import type { SavedRequest } from '../lib/types/models';
import { emptyAuthState } from '../lib/utils';

function request(overrides: Partial<SavedRequest> = {}): SavedRequest {
  return {
    id: 'req-secret',
    name: 'Secret request',
    filesystemName: 'Secret-request',
    collectionId: 'collection-1',
    collection: 'API',
    folderPath: [],
    method: 'GET',
    url: 'https://api.example.test/me',
    requestTab: 'auth',
    params: [],
    headers: [],
    auth: emptyAuthState(),
    bodyType: 'none',
    rawBodyType: 'json',
    bodyContent: '',
    bodyFilePath: '',
    bodyFileName: '',
    formRows: [],
    preRequestScript: '',
    testScript: '',
    requestNotes: '',
    settings: { ...DEFAULT_REQUEST_SETTINGS },
    ...overrides,
  };
}

describe('requestsHaveExportSecrets', () => {
  it('treats OAuth refresh tokens as export secrets', () => {
    const req = request({
      auth: {
        ...emptyAuthState(),
        type: 'oauth2',
        oauth2RefreshToken: 'raw-refresh-token',
      },
    });

    expect(requestsHaveExportSecrets([req])).toBe(true);
  });
});
