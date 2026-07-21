import { BROWSER_LIKE_USER_AGENT } from './constants';
import type { KVRow, PreviewHeader, RequestSettings } from './types/models';

export type BrowserSecurityPreviewKind = 'fetch' | 'handshake';

type BrowserSecuritySettings = Pick<
  RequestSettings,
  'browserEmulation' | 'browserOrigin' | 'browserWithCredentials' | 'browserEnforceCORS' | 'browserEnforceCSP'
>;

type PreviewOrigin = {
  value: string;
  url: URL | null;
};

export type BrowserSecurityPreview = {
  active: boolean;
  crossOrigin: boolean;
  stripCookieJar: boolean;
  fetchHeadersApplied: boolean;
  headers: PreviewHeader[];
};

export function browserSecurityActiveForPreview(settings: BrowserSecuritySettings): boolean {
  return settings.browserEmulation || settings.browserEnforceCORS || settings.browserEnforceCSP;
}

function enabledHeaderValue(headers: KVRow[], name: string): string {
  const lower = name.toLowerCase();
  return headers.find(header => header.enabled && header.key.trim().toLowerCase() === lower)?.value.trim() ?? '';
}

function hasEnabledHeader(headers: KVRow[], name: string): boolean {
  const lower = name.toLowerCase();
  return headers.some(header => header.enabled && header.key.trim().toLowerCase() === lower);
}

function defaultPort(scheme: string): string {
  switch (scheme.toLowerCase()) {
    case 'http':
    case 'ws':
      return '80';
    case 'https':
    case 'wss':
      return '443';
    default:
      return '';
  }
}

function normalizedHostname(url: URL): string {
  const hostname = url.hostname.toLowerCase();
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function hostForOrigin(hostname: string): string {
  return hostname.includes(':') ? `[${hostname}]` : hostname;
}

function effectivePort(url: URL): string {
  return url.port || defaultPort(url.protocol.replace(/:$/, ''));
}

function originMatchesTarget(origin: URL, target: URL, kind: BrowserSecurityPreviewKind): boolean {
  if (normalizedHostname(origin) !== normalizedHostname(target)) return false;
  if (effectivePort(origin) !== effectivePort(target)) return false;
  const originScheme = origin.protocol.replace(/:$/, '').toLowerCase();
  const targetScheme = target.protocol.replace(/:$/, '').toLowerCase();
  if (originScheme === targetScheme) return true;
  // WS/Socket.IO handshakes upgrade scheme (http↔ws, https↔wss); treat them as same-site.
  if (kind !== 'handshake') return false;
  if (originScheme === 'http') return targetScheme === 'https' || targetScheme === 'ws' || targetScheme === 'wss';
  if (originScheme === 'https') return targetScheme === 'wss';
  return false;
}

function parseURL(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function normalizeBrowserOriginForPreview(raw: string): PreviewOrigin | null {
  let value = raw.trim();
  if (!value) return null;
  if (value.toLowerCase() === 'null') return { value: 'null', url: null };
  if (!value.includes('://')) {
    value = value.startsWith('//') ? `http:${value}` : `http://${value}`;
  }

  const parsed = parseURL(value);
  if (!parsed) return null;

  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return null;

  const hostname = normalizedHostname(parsed);
  if (!hostname) return null;

  const port = parsed.port && parsed.port !== defaultPort(scheme) ? `:${parsed.port}` : '';
  const origin = `${scheme}://${hostForOrigin(hostname)}${port}`;
  return { value: origin, url: parseURL(origin) };
}

export function buildBrowserSecurityPreview(input: {
  settings: BrowserSecuritySettings;
  requestUrl: string;
  headers: KVRow[];
  kind: BrowserSecurityPreviewKind;
}): BrowserSecurityPreview {
  const active = browserSecurityActiveForPreview(input.settings);
  const result: BrowserSecurityPreview = {
    active,
    crossOrigin: false,
    stripCookieJar: false,
    fetchHeadersApplied: false,
    headers: [],
  };
  if (!active) return result;

  const settingOriginRaw = input.settings.browserOrigin.trim();
  const settingOrigin = normalizeBrowserOriginForPreview(settingOriginRaw);
  const headerOriginRaw = settingOriginRaw ? '' : enabledHeaderValue(input.headers, 'Origin');
  const headerOrigin = settingOrigin ? null : normalizeBrowserOriginForPreview(headerOriginRaw);
  const origin = settingOrigin ?? headerOrigin;
  const target = parseURL(input.requestUrl);
  const originInvalid = Boolean((settingOriginRaw && !settingOrigin) || (headerOriginRaw && !headerOrigin));
  const missingRequiredOrigin = !origin && (input.settings.browserEnforceCORS || input.settings.browserEnforceCSP);
  const prepareBlocked = originInvalid || missingRequiredOrigin;
  const note = input.settings.browserEmulation ? 'from browser request emulation' : 'from browser security checks';

  if (origin) {
    result.crossOrigin = !origin.url || !target || !originMatchesTarget(origin.url, target, input.kind);
  }
  result.stripCookieJar = result.crossOrigin && !input.settings.browserWithCredentials;
  result.fetchHeadersApplied = input.kind === 'fetch' && !prepareBlocked;

  result.headers.push({
    key: 'User-Agent',
    value: BROWSER_LIKE_USER_AGENT,
    note,
    overridden: hasEnabledHeader(input.headers, 'User-Agent'),
  });

  if (settingOrigin) {
    const replacesCustomOrigin = hasEnabledHeader(input.headers, 'Origin') ? '; replaces custom Origin' : '';
    result.headers.push({
      key: 'Origin',
      value: settingOrigin.value,
      note: `from browser origin${replacesCustomOrigin}`,
    });
  } else if (headerOrigin) {
    const normalized = headerOrigin.value === headerOriginRaw ? '' : '; normalized by browser emulation';
    result.headers.push({
      key: 'Origin',
      value: headerOrigin.value,
      note: `from custom Origin header${normalized}`,
    });
  }

  if (result.fetchHeadersApplied) {
    const site = !origin ? 'none' : result.crossOrigin ? 'cross-site' : 'same-origin';
    result.headers.push(
      { key: 'Sec-Fetch-Dest', value: 'empty', note },
      { key: 'Sec-Fetch-Mode', value: 'cors', note },
      { key: 'Sec-Fetch-Site', value: site, note },
    );
  }

  return result;
}
