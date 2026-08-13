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

describe('auth in generated snippets', () => {
  const base = {
    method: 'GET', url: 'https://api.example.test/things',
    params: [], headers: [], bodyType: 'none', body: '', formData: [],
  };
  const curlStub = () => 'curl';

  // snippetHeaders only knew bearer and API key, so every other scheme was
  // dropped from all twelve languages at once.
  it('emits Basic credentials for every language that sends headers', () => {
    for (const language of ['python', 'go', 'javascript', 'ruby'] as const) {
      const out = buildSnippet(language, { ...base, auth: { type: 'basic', token: '', username: 'ada', password: 'hunter2', keyName: '', keyValue: '', keyIn: 'header' } }, curlStub);
      expect(out, language).toContain(`Basic ${btoa('ada:hunter2')}`);
    }
  });

  it('emits an OAuth 2.0 access token as a bearer header', () => {
    const out = buildSnippet('python', { ...base, auth: { type: 'oauth2', token: 'AT-1', keyName: '', keyValue: '', keyIn: 'header' } }, curlStub);
    expect(out).toContain('Bearer AT-1');
  });

  // Digest and SigV4 cannot be a fixed header, so the snippet says so rather
  // than looking complete and failing at runtime.
  it('explains the schemes that cannot be expressed as a header', () => {
    const digest = buildSnippet('python', { ...base, auth: { type: 'digest', token: '', username: 'ada', password: 'x', keyName: '', keyValue: '', keyIn: 'header' } }, curlStub);
    expect(digest).toContain('# Digest auth');

    const aws = buildSnippet('go', { ...base, auth: { type: 'aws', token: '', keyName: '', keyValue: '', keyIn: 'header', awsRegion: 'us-east-1', awsService: 'execute-api' } }, curlStub);
    expect(aws).toContain('// AWS Signature v4');
  });

  it('says nothing extra when the scheme needs no explanation', () => {
    const out = buildSnippet('python', { ...base, auth: { type: 'bearer', token: 'T', keyName: '', keyValue: '', keyIn: 'header' } }, curlStub);
    expect(out.startsWith('import requests')).toBe(true);
  });
});
