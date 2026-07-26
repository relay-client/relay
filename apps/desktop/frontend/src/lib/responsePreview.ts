import type { HttpResponse } from './backend';

export type ResponsePreview =
  | { kind: 'none' }
  | { kind: 'image'; src: string; mediaType: string }
  | { kind: 'html'; html: string };

function headerValue(response: HttpResponse, name: string): string {
  const wanted = name.toLowerCase();
  for (const header of response.headers ?? []) {
    if (header.key.toLowerCase() === wanted) return header.value;
  }
  return '';
}

export function responseMediaType(response: HttpResponse): string {
  return headerValue(response, 'Content-Type').split(';')[0].trim().toLowerCase();
}

// HTML-ish types worth rendering. XHTML is included because servers still send
// it; plain XML is not, since the syntax-highlighted body is more useful there.
const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml']);

export function responsePreviewFor(response: HttpResponse | null): ResponsePreview {
  if (!response) return { kind: 'none' };

  // Images arrive through their own base64 field: the body string cannot carry
  // non-UTF-8 bytes across the bridge intact.
  if (response.previewImageBase64 && response.previewMediaType) {
    return {
      kind: 'image',
      src: `data:${response.previewMediaType};base64,${response.previewImageBase64}`,
      mediaType: response.previewMediaType,
    };
  }

  // A server that labels binary as text/html would otherwise get a frame full
  // of replacement characters; the backend already told us what the bytes are.
  if (!response.bodyIsBinary && HTML_TYPES.has(responseMediaType(response)) && (response.body ?? '').trim() !== '') {
    return { kind: 'html', html: response.body };
  }

  return { kind: 'none' };
}

export function responseHasPreview(response: HttpResponse | null): boolean {
  return responsePreviewFor(response).kind !== 'none';
}
