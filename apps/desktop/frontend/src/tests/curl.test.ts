import { describe, expect, it } from 'vitest';
import { parseCurl, toCurl } from '../lib/curl';

describe('parseCurl', () => {
  it('does not infer a JSON body from Content-Type when curl has no data flag', () => {
    const parsed = parseCurl(`curl \\
      'https://example.test/products' \\
      -H 'X-API-Key: ' \\
      -H 'MerchantId: 11' \\
      -H 'Secret: redacted' \\
      -H 'Content-Type: application/json'`);

    expect(parsed.url).toBe('https://example.test/products');
    expect(parsed.method).toBe('GET');
    expect(parsed.body).toBeUndefined();
    expect(parsed.bodyType).toBeUndefined();
    expect(parsed.headers).toContainEqual({ key: 'Content-Type', value: 'application/json' });
  });

  it('keeps Cookie headers from multiline curl input', () => {
    const parsed = parseCurl(`curl \\
      'https://api.hornybox.ru/api/public/steam-gift/detail/content/slay-the-spire-2' \\
      -H 'Cookie: __ddg10_=1774623151; __ddg1_=kr413tNEMRYMIRZHGNUG; __ddg8_=p9DbfJGnLAXgtc4r; __ddg9_=136.169.214.33'`);

    expect(parsed.url).toBe('https://api.hornybox.ru/api/public/steam-gift/detail/content/slay-the-spire-2');
    expect(parsed.headers).toContainEqual({
      key: 'Cookie',
      value: '__ddg10_=1774623151; __ddg1_=kr413tNEMRYMIRZHGNUG; __ddg8_=p9DbfJGnLAXgtc4r; __ddg9_=136.169.214.33',
    });
  });

  it('parses curl cookie data from -b without replacing the URL', () => {
    const parsed = parseCurl(`curl \\
      'http://localhost:4200/api/assets/resource/by/path/L2Fzc2V0cy9pY29ucy/icon.svg' \\
      -H 'Accept: application/json, text/plain, */*' \\
      -b 'sid=abc; app_lang=ru; refresh=def' \\
      -H 'Referer: http://localhost:4200/main/icons/summary'`);

    expect(parsed.url).toBe('http://localhost:4200/api/assets/resource/by/path/L2Fzc2V0cy9pY29ucy/icon.svg');
    expect(parsed.headers).toContainEqual({ key: 'Cookie', value: 'sid=abc; app_lang=ru; refresh=def' });
  });

  it('ignores -b cookie jar file paths when importing headers', () => {
    const parsed = parseCurl(`curl 'https://example.test/products' -b './cookies.txt'`);

    expect(parsed.url).toBe('https://example.test/products');
    expect(parsed.headers).toEqual([]);
  });

  it('keeps the request URL when option values appear after it', () => {
    const parsed = parseCurl(`curl 'https://example.test/products' \\
      --output '/tmp/products.json' \\
      --proxy 'http://proxy.local:8080'`);

    expect(parsed.url).toBe('https://example.test/products');
  });

  it('parses attached option values copied from compact curl commands', () => {
    const parsed = parseCurl(`curl --request=PATCH --url=https://example.test/products/1 \\
      --header='Content-Type: application/json' \\
      --data-raw='{"name":"Ada"}'`);

    expect(parsed.url).toBe('https://example.test/products/1');
    expect(parsed.method).toBe('PATCH');
    expect(parsed.bodyType).toBe('json');
    expect(parsed.body).toBe('{"name":"Ada"}');
    expect(parsed.headers).toContainEqual({ key: 'Content-Type', value: 'application/json' });
  });

  it('supports Windows cmd line continuations', () => {
    const parsed = parseCurl('curl "https://example.test/products" ^\r\n  -H "Accept: application/json" ^\r\n  -A "RelayTest/1.0"');

    expect(parsed.url).toBe('https://example.test/products');
    expect(parsed.headers).toContainEqual({ key: 'Accept', value: 'application/json' });
    expect(parsed.headers).toContainEqual({ key: 'User-Agent', value: 'RelayTest/1.0' });
  });

  it('imports curl -G data as query params instead of a request body', () => {
    const parsed = parseCurl(`curl -G 'https://example.test/search?existing=1' \\
      --data-urlencode 'q=hello world' \\
      -d 'page=2'`);

    expect(parsed.url).toBe('https://example.test/search?existing=1&q=hello world&page=2');
    expect(parsed.method).toBe('GET');
    expect(parsed.body).toBeUndefined();
    expect(parsed.bodyType).toBeUndefined();
    expect(parsed.formData).toEqual([]);
  });

  it('handles CRLF line continuations from copied curl commands', () => {
    const parsed = parseCurl("curl \\\r\n  'https://example.test/products' \\\r\n  -H 'Cookie: sid=abc'");

    expect(parsed.url).toBe('https://example.test/products');
    expect(parsed.headers).toContainEqual({ key: 'Cookie', value: 'sid=abc' });
  });

  it('detects JSON body only when a data flag is present', () => {
    const parsed = parseCurl(`curl 'https://example.test/products' \\
      -H 'Content-Type: application/json' \\
      --data-raw '{"CategoryId":68}'`);

    expect(parsed.method).toBe('POST');
    expect(parsed.bodyType).toBe('json');
    expect(parsed.body).toBe('{"CategoryId":68}');
  });

  it('maps JavaScript content-type bodies to text bodies', () => {
    const parsed = parseCurl(`curl 'https://example.test/script' \\
      -H 'Content-Type: application/javascript' \\
      --data-raw 'console.log("ok")'`);

    expect(parsed.method).toBe('POST');
    expect(parsed.bodyType).toBe('text');
    expect(parsed.body).toBe('console.log("ok")');
  });

  it('keeps --data-binary file paths as binary request files', () => {
    const parsed = parseCurl(`curl 'https://example.test/upload' --data-binary '@/tmp/payload.bin'`);

    expect(parsed.method).toBe('POST');
    expect(parsed.bodyType).toBe('binary');
    expect(parsed.bodyFilePath).toBe('/tmp/payload.bin');
    expect(parsed.body).toBeUndefined();
  });

  it('parses repeated --data-urlencode flags as urlencoded rows', () => {
    const parsed = parseCurl(`curl 'https://example.test/form' \\
      --data-urlencode 'name=Jane Doe' \\
      --data-urlencode 'city=New York'`);

    expect(parsed.method).toBe('POST');
    expect(parsed.bodyType).toBe('urlencoded');
    expect(parsed.formData).toEqual([
      { key: 'name', value: 'Jane Doe', isFile: false },
      { key: 'city', value: 'New York', isFile: false },
    ]);
  });

  it('parses shell-escaped single quotes and escaped double quotes', () => {
    const parsed = parseCurl(`curl 'https://example.test/it'\\''s?q=coffee' -H "X-Note: say \\"hello\\""`);

    expect(parsed.url).toBe("https://example.test/it's?q=coffee");
    expect(parsed.headers).toContainEqual({ key: 'X-Note', value: 'say "hello"' });
  });
});

describe('toCurl', () => {
  it('exports urlencoded rows without pre-encoding them', () => {
    const curl = toCurl({
      method: 'POST',
      url: 'https://example.test/form',
      params: [],
      headers: [],
      auth: { type: 'none' },
      bodyType: 'urlencoded',
      body: '',
      formData: [
        { key: 'name', value: 'Jane Doe', enabled: true },
        { key: 'city', value: 'New York', enabled: true },
      ],
    });

    expect(curl).toContain("--data-urlencode 'name=Jane Doe'");
    expect(curl).toContain("--data-urlencode 'city=New York'");
    expect(curl).not.toContain('Jane%20Doe');
  });

  it('quotes binary paths as one curl argument', () => {
    const curl = toCurl({
      method: 'POST',
      url: 'https://example.test/upload',
      params: [],
      headers: [],
      auth: { type: 'none' },
      bodyType: 'binary',
      body: '',
      bodyFilePath: '/tmp/payload with spaces.bin',
      formData: [],
    });

    expect(curl).toContain("--data-binary '@/tmp/payload with spaces.bin'");
  });

  it('exports API key query auth into the URL', () => {
    const curl = toCurl({
      method: 'GET',
      url: 'https://example.test/search',
      params: [{ key: 'q', value: 'coffee', enabled: true }],
      headers: [],
      auth: { type: 'apikey', keyName: 'api_key', keyValue: 'secret', keyIn: 'query' },
      bodyType: 'none',
      body: '',
      formData: [],
    });

    expect(curl).toContain("'https://example.test/search?q=coffee&api_key=secret'");
  });

  it('ignores disabled Content-Type headers when adding JSON curl defaults', () => {
    const curl = toCurl({
      method: 'POST',
      url: 'https://example.test/items',
      params: [],
      headers: [{ key: 'Content-Type', value: 'text/plain', enabled: false }],
      auth: { type: 'none' },
      bodyType: 'json',
      body: '{"id":1}',
      formData: [],
    });

    expect(curl).toContain("-H 'Content-Type: application/json'");
  });
});
