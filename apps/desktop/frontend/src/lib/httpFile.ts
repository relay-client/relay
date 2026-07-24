// Importer for `.http` / `.rest` files — the format shared by the JetBrains
// HTTP Client and the VS Code REST Client extension.
//
// Supported: `###` separators (with the trailing text as the request name),
// `# @name` directives, file variables (`@base = https://…`), request lines
// with an optional method and HTTP version, headers, bodies, and the
// `< ./file` / `> ./out` redirect syntax (recorded as a note rather than
// silently dropped).

import type { KVRow, Method, RawBodyType, RequestTab, SavedRequest } from './types/models';
import { DEFAULT_REQUEST_SETTINGS, mkRow } from './constants';
import { emptyAuthState, newRequestId } from './utils';
import { serializeGraphQLPayload } from './graphql';
import { isWebSocketUrl, socketIOImportDetails } from './importDetection';
import { filesystemNameFromName } from './normalizers';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT']);
const REALTIME_METHODS = new Set(['WEBSOCKET', 'WS', 'GRPC', 'GRAPHQL']);

export type HttpFileVariable = { key: string; value: string };

export type HttpFileImport = {
  requests: SavedRequest[];
  variables: HttpFileVariable[];
};

function row(key: string, value: string): KVRow {
  return { ...mkRow(), key, value, enabled: true };
}

function isSeparator(line: string) {
  return /^\s*###/.test(line);
}

function separatorLabel(line: string) {
  return line.replace(/^\s*#+/, '').trim();
}

function isComment(line: string) {
  return /^\s*(#|\/\/)/.test(line);
}

/** `@name = value`, with or without the spaces, and `@name value` too. */
function fileVariable(line: string): HttpFileVariable | null {
  const match = line.match(/^\s*@([A-Za-z0-9_.-]+)\s*(?:=|\s)\s*(.*)$/);
  if (!match) return null;
  return { key: match[1], value: match[2].trim() };
}

/** `# @name login` or `// @name login`, and JetBrains' `# @no-redirect` style flags. */
function directive(line: string): { key: string; value: string } | null {
  const match = line.match(/^\s*(?:#+|\/\/)\s*@([A-Za-z0-9_.-]+)\s*(?:=|\s)?\s*(.*)$/);
  if (!match) return null;
  return { key: match[1].toLowerCase(), value: match[2].trim() };
}

function rawTypeFromContentType(value: string): RawBodyType {
  const lower = value.toLowerCase();
  if (lower.includes('json')) return 'json';
  if (lower.includes('xml')) return 'xml';
  if (lower.includes('html')) return 'html';
  return 'text';
}

type RequestLine = { method: string; url: string };

function parseRequestLine(line: string): RequestLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  const head = parts[0].toUpperCase();
  if (METHODS.has(head) || REALTIME_METHODS.has(head)) {
    const rest = parts.slice(1);
    // Drop a trailing "HTTP/1.1" version token; it isn't part of the URL.
    if (rest.length > 1 && /^HTTP\/[\d.]+$/i.test(rest[rest.length - 1])) rest.pop();
    return { method: head, url: rest.join(' ').trim() };
  }
  // A bare URL line means GET, which both clients accept.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith('{{') || trimmed.startsWith('/')) {
    const rest = [...parts];
    if (rest.length > 1 && /^HTTP\/[\d.]+$/i.test(rest[rest.length - 1])) rest.pop();
    return { method: 'GET', url: rest.join(' ').trim() };
  }
  return null;
}

function splitBlocks(text: string): Array<{ label: string; lines: string[] }> {
  const blocks: Array<{ label: string; lines: string[] }> = [];
  let current = { label: '', lines: [] as string[] };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (isSeparator(line)) {
      blocks.push(current);
      current = { label: separatorLabel(line), lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  blocks.push(current);
  return blocks;
}

function nameFromUrl(method: string, url: string): string {
  const withoutQuery = url.split('?')[0];
  const path = withoutQuery.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '');
  const tail = path.split('/').filter(Boolean).pop();
  return tail ? `${method} /${tail}` : `${method} ${withoutQuery || 'request'}`;
}

type ParsedBlock = {
  name: string;
  method: string;
  url: string;
  headers: KVRow[];
  body: string;
  notes: string[];
};

function parseBlock(lines: string[], label: string, variables: HttpFileVariable[]): ParsedBlock | null {
  let name = label;
  const notes: string[] = [];
  let index = 0;

  // Leading comments, directives and file variables, before the request line.
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const variable = fileVariable(line);
    if (variable) {
      variables.push(variable);
      continue;
    }
    if (isComment(line)) {
      const found = directive(line);
      if (found?.key === 'name' && found.value) name = found.value;
      continue;
    }
    break;
  }

  const requestLine = index < lines.length ? parseRequestLine(lines[index]) : null;
  if (!requestLine) return null;
  index += 1;

  let url = requestLine.url;
  // A query string can be wrapped across following indented lines.
  while (index < lines.length && /^\s+[?&]/.test(lines[index])) {
    url += lines[index].trim();
    index += 1;
  }

  const headers: KVRow[] = [];
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) { index += 1; break; }
    if (isComment(line)) continue;
    const separatorAt = line.indexOf(':');
    if (separatorAt <= 0) break;
    headers.push(row(line.slice(0, separatorAt).trim(), line.slice(separatorAt + 1).trim()));
  }

  const bodyLines: string[] = [];
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    // `< ./payload.json` pulls the body from a file the importer can't reach,
    // and `>` / `>>` redirect the response. Record them instead of pretending.
    if (/^<\s*\S/.test(trimmed)) {
      notes.push(`Body was loaded from ${trimmed.replace(/^<\s*/, '')} in the source .http file.`);
      continue;
    }
    if (/^>>?\s*\S/.test(trimmed) && !trimmed.startsWith('> {%')) {
      notes.push(`Response was written to ${trimmed.replace(/^>>?\s*/, '')} in the source .http file.`);
      continue;
    }
    bodyLines.push(line);
  }

  let body = bodyLines.join('\n').trim();
  // JetBrains response handlers use a syntax Relay's pm.* scripts don't share,
  // so keep the source rather than generating a script that cannot run.
  const handlerAt = body.indexOf('> {%');
  if (handlerAt >= 0) {
    notes.push('The source file had a JetBrains response handler script, which Relay does not run.');
    body = body.slice(0, handlerAt).trim();
  }

  return { name: name || nameFromUrl(requestLine.method, url), method: requestLine.method, url, headers, body, notes };
}

export function httpFileCollectionName(fileName: string): string {
  return fileName.replace(/\.(http|rest)$/i, '') || 'HTTP File';
}

export function parseHttpFile(text: string, collectionId: string, collectionName: string): HttpFileImport {
  const variables: HttpFileVariable[] = [];
  const requests: SavedRequest[] = [];

  for (const block of splitBlocks(text)) {
    const parsed = parseBlock(block.lines, block.label, variables);
    if (!parsed || !parsed.url) continue;

    const contentType = parsed.headers.find(header => header.key.toLowerCase() === 'content-type')?.value ?? '';
    const requestTypeHeader = parsed.headers.find(header => header.key.toLowerCase() === 'x-request-type')?.value ?? '';

    const socketIO = socketIOImportDetails(parsed.url);
    const isGraphQL = parsed.method === 'GRAPHQL'
      || requestTypeHeader.toLowerCase() === 'graphql'
      || contentType.toLowerCase().includes('graphql');
    const isWebSocket = parsed.method === 'WEBSOCKET' || parsed.method === 'WS' || isWebSocketUrl(parsed.url);

    const requestType = isGraphQL ? 'graphql' : socketIO ? 'socketio' : isWebSocket ? 'ws' : 'http';
    const method = (requestType === 'graphql' ? 'POST' : METHODS.has(parsed.method) ? parsed.method : 'GET') as Method;

    const rawBodyType = rawTypeFromContentType(contentType);
    let bodyType: SavedRequest['bodyType'] = 'none';
    let bodyContent = '';
    if (isGraphQL) {
      bodyType = 'graphql';
      bodyContent = serializeGraphQLPayload({ query: parsed.body, variables: '{}', operationName: '' });
    } else if (parsed.body) {
      bodyType = rawBodyType;
      bodyContent = parsed.body;
    }

    let requestTab: RequestTab = 'params';
    if (requestType === 'socketio') requestTab = 'events';
    else if (requestType === 'ws') requestTab = 'body';
    else if (requestType === 'graphql') requestTab = 'query';
    else if (bodyType !== 'none') requestTab = 'body';
    else if (parsed.headers.length) requestTab = 'headers';

    const id = newRequestId();
    const name = parsed.name || nameFromUrl(method, parsed.url);
    requests.push({
      id,
      name,
      filesystemName: filesystemNameFromName(name, id),
      collectionId,
      collection: collectionName,
      folderPath: [],
      requestType,
      method,
      url: socketIO?.url ?? parsed.url,
      requestTab,
      params: [],
      headers: parsed.headers,
      auth: emptyAuthState(),
      bodyType,
      rawBodyType,
      bodyContent,
      bodyFilePath: '',
      bodyFileName: '',
      formRows: [],
      preRequestScript: '',
      testScript: '',
      requestNotes: parsed.notes.join('\n'),
      settings: { ...DEFAULT_REQUEST_SETTINGS, ...(socketIO?.settings ?? {}) },
    });
  }

  if (!requests.length) throw new Error('No requests found in the .http file');

  // Later definitions of the same variable win, matching how both clients
  // evaluate a file top to bottom.
  const deduped = new Map<string, string>();
  for (const variable of variables) deduped.set(variable.key, variable.value);

  return { requests, variables: [...deduped].map(([key, value]) => ({ key, value })) };
}
