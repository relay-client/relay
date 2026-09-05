import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/backend', () => ({
  openDirectoryDialog: vi.fn(),
  readCollectionTextFiles: vi.fn(),
  sendHttpRequest: vi.fn(),
  writeCollectionTextFiles: vi.fn(),
}));

import { openApiNameFromUrl, parseOpenApiResponse } from '../lib/openapi';
import { normalizeSpecUrl } from '../lib/stores/features/importExport';

const minimalSpec = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Petstore' },
  paths: { '/pets': { get: { summary: 'List pets' } } },
});

describe('normalizeSpecUrl', () => {
  it('defaults a bare host to https', () => {
    expect(normalizeSpecUrl('api.example.test/openapi.json')).toBe('https://api.example.test/openapi.json');
  });

  it('leaves an explicit scheme alone', () => {
    expect(normalizeSpecUrl('http://localhost:8080/v3/api-docs')).toBe('http://localhost:8080/v3/api-docs');
    expect(normalizeSpecUrl('https://api.example.test/spec.yaml')).toBe('https://api.example.test/spec.yaml');
  });

  it('trims surrounding whitespace from a pasted link', () => {
    expect(normalizeSpecUrl('  https://api.example.test/spec.json \n')).toBe('https://api.example.test/spec.json');
  });

  it('returns nothing for an empty value', () => {
    expect(normalizeSpecUrl('   ')).toBe('');
  });
});

describe('parseOpenApiResponse', () => {
  it('accepts an OpenAPI 3 JSON document', () => {
    expect(parseOpenApiResponse(minimalSpec, 'application/json')).toMatchObject({ openapi: '3.0.0' });
  });

  it('accepts a Swagger 2 document', () => {
    const swagger = JSON.stringify({ swagger: '2.0', info: { title: 'Legacy' }, paths: {} });
    expect(parseOpenApiResponse(swagger, 'application/json')).toMatchObject({ swagger: '2.0' });
  });

  it('accepts YAML, which is how half of these are served', () => {
    const yaml = 'openapi: 3.0.0\ninfo:\n  title: Petstore\npaths: {}\n';
    expect(parseOpenApiResponse(yaml, 'text/yaml')).toMatchObject({ openapi: '3.0.0' });
  });

  // The single most common mistake: pasting the Swagger UI page rather than the
  // document it renders. "Could not parse" would send someone looking at the
  // wrong end of the problem.
  it('names the Swagger UI page for what it is', () => {
    const page = '<!DOCTYPE html><html><head><title>Swagger UI</title></head><body></body></html>';
    expect(() => parseOpenApiResponse(page, 'text/html; charset=utf-8')).toThrow(/web page, not a spec/);
    expect(() => parseOpenApiResponse(page, 'text/html')).toThrow(/swagger\.json/);
  });

  it('detects an HTML page even when the content type does not say so', () => {
    expect(() => parseOpenApiResponse('<html><body>hi</body></html>', 'application/octet-stream'))
      .toThrow(/web page, not a spec/);
  });

  it('rejects an empty document', () => {
    expect(() => parseOpenApiResponse('   ', 'application/json')).toThrow(/empty document/);
  });

  it('rejects something that parses but is not a spec', () => {
    expect(() => parseOpenApiResponse(JSON.stringify({ info: { title: 'Nope' } }), 'application/json'))
      .toThrow(/no "openapi" or "swagger" version field/);
  });

  // The YAML parser answers {} for most junk rather than throwing, so the
  // version field is what actually decides. Either way the user is told the
  // document is not a spec, which is the fact they need.
  it('rejects junk that no parser makes sense of', () => {
    expect(() => parseOpenApiResponse('{ this is not: valid ]', 'application/json'))
      .toThrow(/not a spec Relay can import/);
    expect(() => parseOpenApiResponse('just some words', 'text/plain'))
      .toThrow(/not a spec Relay can import/);
  });

  it('rejects a document of the wrong shape entirely', () => {
    expect(() => parseOpenApiResponse('[1, 2, 3]', 'application/json'))
      .toThrow(/not a spec Relay can import/);
  });
});

describe('openApiNameFromUrl', () => {
  it('uses a meaningful last path segment', () => {
    expect(openApiNameFromUrl('https://api.example.test/petstore.json')).toBe('petstore');
    expect(openApiNameFromUrl('https://api.example.test/specs/billing.yaml')).toBe('billing');
  });

  // These segments name the format, not the API, so the host is the better label.
  it('falls back to the host for a generic segment', () => {
    expect(openApiNameFromUrl('https://api.example.test/v3/api-docs')).toBe('api.example.test');
    expect(openApiNameFromUrl('https://api.example.test/openapi.json')).toBe('api.example.test');
    expect(openApiNameFromUrl('https://api.example.test/swagger.json')).toBe('api.example.test');
  });

  it('handles a root URL and an unparseable one', () => {
    expect(openApiNameFromUrl('https://api.example.test/')).toBe('api.example.test');
    expect(openApiNameFromUrl('not a url')).toBe('');
  });
});
