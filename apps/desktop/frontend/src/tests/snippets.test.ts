import { describe, expect, it } from 'vitest';
import { buildSnippet, type SnippetRequest } from '../lib/snippets';

function request(overrides: Partial<SnippetRequest> = {}): SnippetRequest {
  return {
    method: 'GET',
    url: 'https://example.test/search',
    params: [],
    headers: [],
    auth: { type: 'none', token: '', keyName: '', keyValue: '', keyIn: 'header' },
    bodyType: 'none',
    body: '',
    formData: [],
    ...overrides,
  };
}

describe('buildSnippet', () => {
  it('includes API key query auth in generated URLs', () => {
    const snippet = buildSnippet('javascript', request({
      params: [{ key: 'q', value: 'coffee', enabled: true }],
      auth: { type: 'apikey', token: '', keyName: 'api_key', keyValue: 'secret', keyIn: 'query' },
    }), () => '');

    expect(snippet).toContain('https://example.test/search?q=coffee&api_key=secret');
  });

  it('preserves duplicate urlencoded fields', () => {
    const snippet = buildSnippet('javascript', request({
      method: 'POST',
      bodyType: 'urlencoded',
      formData: [
        { key: 'scope', value: 'read', enabled: true },
        { key: 'scope', value: 'write', enabled: true },
      ],
    }), () => '');

    expect(snippet).toContain('scope=read&scope=write');
  });
});
