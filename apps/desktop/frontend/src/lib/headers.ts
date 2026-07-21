type HeaderDef = {
  name: string;
  values?: string[];
};

type HeaderValidationRow = {
  enabled: boolean;
  key: string;
  value: string;
};

export type HeaderValidationField = 'key' | 'value';

export type HeaderValidationIssue = {
  field: HeaderValidationField;
  message: string;
  rowIndex: number;
  key: string;
};

export const REQUEST_HEADERS: HeaderDef[] = [
  { name: 'Accept',           values: ['application/json', 'text/html', 'application/xml', 'text/plain', '*/*', 'application/json, text/plain, */*'] },
  { name: 'Accept-Charset',   values: ['UTF-8', 'ISO-8859-1'] },
  { name: 'Accept-Encoding',  values: ['gzip, deflate, br', 'gzip, deflate', 'identity', 'br'] },
  { name: 'Accept-Language',  values: ['en-US,en;q=0.9', 'ru-RU,ru;q=0.9', 'en'] },
  { name: 'Authorization',    values: ['Bearer ', 'Basic ', 'Digest ', 'AWS4-HMAC-SHA256 '] },
  { name: 'Cache-Control',    values: ['no-cache', 'no-store', 'max-age=0', 'max-age=3600', 'public, max-age=31536000', 'private, no-cache'] },
  { name: 'Connection',       values: ['keep-alive', 'close', 'Upgrade'] },
  { name: 'Content-Encoding', values: ['gzip', 'deflate', 'br', 'identity'] },
  { name: 'Content-Length' },
  { name: 'Content-Type',     values: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain', 'text/html; charset=UTF-8', 'application/xml', 'application/octet-stream', 'text/xml', 'application/graphql'] },
  { name: 'Cookie' },
  { name: 'DNT',              values: ['1', '0'] },
  { name: 'Expect',           values: ['100-continue'] },
  { name: 'Forwarded' },
  { name: 'Host' },
  { name: 'Idempotency-Key' },
  { name: 'If-Match' },
  { name: 'If-Modified-Since' },
  { name: 'If-None-Match' },
  { name: 'If-Unmodified-Since' },
  { name: 'Origin' },
  { name: 'Pragma',           values: ['no-cache'] },
  { name: 'Range' },
  { name: 'Referer' },
  { name: 'TE',               values: ['trailers'] },
  { name: 'Transfer-Encoding', values: ['chunked', 'gzip', 'compress', 'deflate', 'identity'] },
  { name: 'Upgrade' },
  { name: 'User-Agent',       values: ['Mozilla/5.0 (compatible; Relay/1.0)', 'curl/7.68.0', 'PostmanRuntime/7.29.0'] },
  { name: 'X-API-Key' },
  { name: 'X-Auth-Token' },
  { name: 'X-CSRF-Token' },
  { name: 'X-Correlation-ID' },
  { name: 'X-Forwarded-For' },
  { name: 'X-Forwarded-Host' },
  { name: 'X-Forwarded-Proto', values: ['https', 'http'] },
  { name: 'X-HTTP-Method-Override', values: ['DELETE', 'PATCH', 'PUT'] },
  { name: 'X-RateLimit-Limit' },
  { name: 'X-Request-ID' },
  { name: 'X-Requested-With', values: ['XMLHttpRequest'] },
  { name: 'X-Trace-ID' },
];

export const HEADER_NAMES = REQUEST_HEADERS.map(h => h.name);

export const POPULAR_HEADER_NAMES = [
  'Accept',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Type',
  'Cookie',
  'Origin',
  'Referer',
  'User-Agent',
  'X-API-Key',
  'X-Request-ID',
];

export const HEADER_PICKER_NAMES = [
  ...POPULAR_HEADER_NAMES,
  ...HEADER_NAMES.filter(name => !POPULAR_HEADER_NAMES.includes(name)),
];

export function getHeaderValues(name: string): string[] {
  const def = REQUEST_HEADERS.find(h => h.name.toLowerCase() === name.toLowerCase());
  return def?.values ?? [];
}

const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function validateHeaderName(name: string): string {
  if (!name) return '';
  if (name.trim() !== name) return 'Header name contains whitespace.';
  if (!HEADER_NAME_RE.test(name)) return 'Header name contains invalid characters.';
  return '';
}

export function validateHeaderValue(value: string): string {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0xff) return 'Value contains non-ISO-8859-1 characters.';
    if (code === 0x0a || code === 0x0d) return 'Value contains newline characters.';
    if ((code < 0x20 && code !== 0x09) || code === 0x7f) return 'Value contains invalid control characters.';
  }
  return '';
}

export function validateHeaderRow(row: HeaderValidationRow, rowIndex = -1): HeaderValidationIssue | null {
  if (!row.enabled || (!row.key && !row.value)) return null;
  if (!row.key) {
    return { field: 'key', message: 'Header name is required.', rowIndex, key: row.key };
  }

  const keyMessage = validateHeaderName(row.key);
  if (keyMessage) return { field: 'key', message: keyMessage, rowIndex, key: row.key };

  const valueMessage = validateHeaderValue(row.value);
  if (valueMessage) return { field: 'value', message: valueMessage, rowIndex, key: row.key };

  return null;
}

export function firstHeaderValidationIssue(rows: HeaderValidationRow[]): HeaderValidationIssue | null {
  for (let i = 0; i < rows.length; i += 1) {
    const issue = validateHeaderRow(rows[i], i);
    if (issue) return issue;
  }
  return null;
}

export function headerValidationIssueLabel(issue: HeaderValidationIssue): string {
  const name = issue.key.trim();
  return name ? `Header "${name}": ${issue.message}` : `Header row ${issue.rowIndex + 1}: ${issue.message}`;
}
