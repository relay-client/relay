import { describe, it, expect } from 'vitest';

import { responseHasPreview, responseMediaType, responsePreviewFor } from '../lib/responsePreview';
import type { HttpResponse } from '../lib/backend';

function response(over: Partial<HttpResponse> = {}): HttpResponse {
  return {
    statusCode: 200,
    status: '200 OK',
    headers: [],
    body: '',
    duration: 1,
    size: 0,
    preRequestResult: { tests: [] },
    testResult: { tests: [] },
    ...over,
  };
}

const ct = (value: string) => [{ key: 'Content-Type', value, enabled: true, isFile: false, fileName: '' }];

describe('responsePreviewFor', () => {
  it('builds a data URL from the backend base64 channel', () => {
    const preview = responsePreviewFor(response({
      previewImageBase64: 'AAAB',
      previewMediaType: 'image/png',
      headers: ct('image/png'),
    }));
    expect(preview.kind).toBe('image');
    if (preview.kind !== 'image') throw new Error('expected an image preview');
    expect(preview.src).toBe('data:image/png;base64,AAAB');
    expect(preview.mediaType).toBe('image/png');
  });

  // Images must never be rebuilt from the body string: it crosses the bridge as
  // JSON and any non-UTF-8 byte is replaced along the way.
  it('does not treat an image content-type as previewable without the base64 field', () => {
    const preview = responsePreviewFor(response({ headers: ct('image/png'), body: '��PNG' }));
    expect(preview.kind).toBe('none');
  });

  it('previews HTML from the body', () => {
    const preview = responsePreviewFor(response({ headers: ct('text/html; charset=utf-8'), body: '<h1>hi</h1>' }));
    expect(preview.kind).toBe('html');
    if (preview.kind !== 'html') throw new Error('expected an html preview');
    expect(preview.html).toBe('<h1>hi</h1>');
  });

  it('previews xhtml too', () => {
    expect(responsePreviewFor(response({ headers: ct('application/xhtml+xml'), body: '<p/>' })).kind).toBe('html');
  });

  it('does not preview an empty HTML body', () => {
    expect(responsePreviewFor(response({ headers: ct('text/html'), body: '   ' })).kind).toBe('none');
  });

  it.each([
    ['application/json', '{"a":1}'],
    ['text/plain', 'hello'],
    ['application/xml', '<a/>'],
  ])('does not preview %s', (type, body) => {
    expect(responsePreviewFor(response({ headers: ct(type), body })).kind).toBe('none');
  });

  it('handles a null response', () => {
    expect(responsePreviewFor(null).kind).toBe('none');
    expect(responseHasPreview(null)).toBe(false);
  });

  // The screenshot case: a server labels a binary payload text/html. Rendering
  // that in a frame would show the same replacement characters as the Body tab.
  it('does not offer an HTML preview when the backend says the body is binary', () => {
    const preview = responsePreviewFor(response({
      headers: ct('text/html'),
      body: '\ufffd\ufffd\ufffdPNG',
      bodyIsBinary: true,
      bodySniffedType: 'image/png',
    }));
    expect(preview.kind).toBe('none');
  });

  it('still previews HTML that is genuinely text', () => {
    const preview = responsePreviewFor(response({
      headers: ct('text/html'),
      body: '<h1>hi</h1>',
      bodyIsBinary: false,
    }));
    expect(preview.kind).toBe('html');
  });

  it('prefers the image channel over an HTML content-type', () => {
    const preview = responsePreviewFor(response({
      headers: ct('text/html'),
      body: '<h1>ignored</h1>',
      previewImageBase64: 'AAAB',
      previewMediaType: 'image/svg+xml',
    }));
    expect(preview.kind).toBe('image');
  });
});

describe('responseMediaType', () => {
  it('strips parameters and lowercases', () => {
    expect(responseMediaType(response({ headers: ct('Text/HTML; charset=UTF-8') }))).toBe('text/html');
  });

  it('matches the header name case-insensitively', () => {
    const headers = [{ key: 'content-type', value: 'image/png', enabled: true, isFile: false, fileName: '' }];
    expect(responseMediaType(response({ headers }))).toBe('image/png');
  });

  it('returns empty when there is no content type', () => {
    expect(responseMediaType(response())).toBe('');
  });
});
