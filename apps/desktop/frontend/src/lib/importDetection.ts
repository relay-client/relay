import type { RequestSettings } from './types/models';

import { serializeGraphQLPayload } from './graphql';
import { asText, isRecord } from './utils';

export type SocketIOImportDetails = {
  url: string;
  settings: Partial<RequestSettings>;
};

const SOCKET_IO_PATH = '/socket.io';
const SOCKET_IO_TRANSPORT_PARAMS = new Set(['eio', 'transport', 'sid', 't']);

function normalizeSocketIOBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}

function socketIOSettingsFromQuery(query: string): Partial<RequestSettings> {
  const params = new URLSearchParams(query.replace(/^\?/, ''));
  return {
    sioClientVersion: params.get('EIO') === '3' ? 'v2' : 'v3',
    sioPath: SOCKET_IO_PATH,
    sioNamespace: '/'
  };
}

function socketIODetailsFromParsedUrl(parsed: URL): SocketIOImportDetails | null {
  const pathParts = parsed.pathname.split('/').filter(Boolean);
  const socketPathIndex = pathParts.findIndex((part) => part.toLowerCase() === 'socket.io');
  const hasEngineIOQuery =
    Boolean(parsed.searchParams.get('EIO')) &&
    ['websocket', 'polling'].includes((parsed.searchParams.get('transport') ?? '').toLowerCase());

  if (socketPathIndex < 0 && !hasEngineIOQuery) {
    return null;
  }

  const basePathParts = socketPathIndex >= 0 ? pathParts.slice(0, socketPathIndex) : pathParts;
  const base = new URL(parsed.toString());
  base.pathname = basePathParts.length ? `/${basePathParts.join('/')}` : '';
  base.search = '';
  base.hash = '';
  if (base.protocol === 'ws:') {
    base.protocol = 'http:';
  } else if (base.protocol === 'wss:') {
    base.protocol = 'https:';
  }

  return {
    url: normalizeSocketIOBaseUrl(base.toString()),
    settings: socketIOSettingsFromQuery(parsed.search)
  };
}

export function socketIOImportDetails(rawUrl: string): SocketIOImportDetails | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const details = socketIODetailsFromParsedUrl(parsed);
    if (details) {
      return details;
    }
  } catch {
  }

  const match = trimmed.match(/^(.*?)(\/socket\.io)(?:\/)?(?:\?([^#]*))?(?:#.*)?$/i);
  if (!match?.[1]) {
    return null;
  }

  return {
    url: normalizeSocketIOBaseUrl(match[1]),
    settings: socketIOSettingsFromQuery(match[3] ?? '')
  };
}

export function isWebSocketUrl(rawUrl: string): boolean {
  return /^wss?:\/\//i.test(rawUrl.trim());
}

function isSocketIOTransportParam(key: string): boolean {
  return SOCKET_IO_TRANSPORT_PARAMS.has(key.trim().toLowerCase());
}

export function filterSocketIOTransportParams<T extends { key: string }>(params: T[]): T[] {
  return params.filter((param) => !isSocketIOTransportParam(param.key));
}

function looksLikeGraphQLQuery(query: string): boolean {
  return /^(query|mutation|subscription|fragment)\b/i.test(query.trim()) || query.trim().startsWith('{');
}

export function graphQLBodyContentFromJsonText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isRecord(parsed) || typeof parsed.query !== 'string' || !looksLikeGraphQLQuery(parsed.query)) {
      return null;
    }

    const variables = parsed.variables;
    return serializeGraphQLPayload({
      query: parsed.query,
      operationName: asText(parsed.operationName),
      variables:
        typeof variables === 'string'
          ? variables
          : variables === undefined
            ? ''
            : JSON.stringify(variables, null, 2)
    });
  } catch {
    return null;
  }
}
