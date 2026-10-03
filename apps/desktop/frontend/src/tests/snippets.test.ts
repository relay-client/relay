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

describe('snippet quoting per language', () => {
  const graphql = request({
    method: 'POST',
    url: "https://example.test/graphql?a=1&b=it's",
    bodyType: 'json',
    body: '{"query":"query($id: ID!) { user(id: $id) { name } }","note":"#{x} \\u0001"}',
    auth: { type: 'bearer', token: 'abc 123', keyName: '', keyValue: '', keyIn: 'header' },
  });

  it('quotes every HTTPie argument for the shell and sends the body raw', () => {
    const out = buildSnippet('httpie', graphql, () => '');
    expect(out).toContain(`'https://example.test/graphql?a=1&b=it'\\''s'`);
    expect(out).toContain(`'Authorization:Bearer abc 123'`);
    expect(out).toContain(`--raw '{"query":"query($id: ID!)`);
    expect(out).not.toContain('body=');
  });

  it('keeps $ literal in PHP and Kotlin strings', () => {
    expect(buildSnippet('php', graphql, () => '')).toContain(`CURLOPT_POSTFIELDS => '{"query":"query($id: ID!)`);
    expect(buildSnippet('kotlin', graphql, () => '')).toContain('query(\\$id: ID!) { user(id: \\$id)');
  });

  it('keeps #{ literal in Ruby strings', () => {
    expect(buildSnippet('ruby', graphql, () => '')).toContain('\\#{x}');
  });

  it('writes braced unicode escapes for Swift and Rust', () => {
    const body = request({ method: 'POST', bodyType: 'text', body: 'a\u0001b' });
    expect(buildSnippet('swift', body, () => '')).toContain('"a\\u{0001}b"');
    expect(buildSnippet('rust', body, () => '')).toContain('"a\\u{0001}b"');
  });

  it('accepts custom methods', () => {
    const propfind = request({ method: 'PROPFIND' });
    expect(buildSnippet('csharp', propfind, () => '')).toContain('new HttpMethod("PROPFIND")');
    expect(buildSnippet('ruby', propfind, () => '')).toContain('Net::HTTPGenericRequest.new("PROPFIND"');
    expect(buildSnippet('rust', propfind, () => '')).toContain('reqwest::Method::from_bytes("PROPFIND".as_bytes())?');
  });
});

describe('snippet bodies', () => {
  const form = request({
    method: 'POST',
    bodyType: 'form',
    headers: [{ key: 'Content-Type', value: 'multipart/form-data', enabled: true }],
    formData: [
      { key: 'name', value: 'bob', enabled: true },
      { key: 'avatar', value: '/tmp/me.png', enabled: true, isFile: true, fileName: 'me.png' },
    ],
  });

  it.each(['javascript', 'node', 'axios', 'python', 'httpie', 'go', 'java', 'kotlin', 'csharp', 'php', 'ruby', 'swift', 'rust'] as const)('%s sends multipart fields and files', language => {
    const out = buildSnippet(language, form, () => '');
    expect(out).toContain('bob');
    expect(out).toContain('/tmp/me.png');
    expect(out).not.toMatch(/Content-Type["']?\s*[:,=]\s*["']?multipart\/form-data["']/);
  });

  it.each(['javascript', 'python', 'go', 'php', 'ruby', 'httpie'] as const)('%s sends a file body', language => {
    const out = buildSnippet(language, request({ method: 'PUT', bodyType: 'binary', bodyFilePath: '/tmp/blob.bin' }), () => '');
    expect(out).toContain('/tmp/blob.bin');
  });

  it('labels a urlencoded body with its Content-Type', () => {
    const out = buildSnippet('javascript', request({ method: 'POST', bodyType: 'urlencoded', formData: [{ key: 'a', value: '1', enabled: true }] }), () => '');
    expect(out).toContain('"Content-Type": "application/x-www-form-urlencoded"');
    expect(out).toContain('body: "a=1"');
  });
});
