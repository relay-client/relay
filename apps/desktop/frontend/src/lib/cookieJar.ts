import type { CookieJarEntry } from './backend';

type DomainGroup = { domain: string; cookies: CookieJarEntry[] };

export function normalizeCookieDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^\.+|\.+$/g, '');
}

export function cookieKey(cookie: CookieJarEntry): string {
  return [cookie.domain.toLowerCase(), cookie.path, cookie.name, cookie.hostOnly ? '1' : '0'].join('\u001f');
}

function blankCookie(domain = '', timestamp = Date.now()): CookieJarEntry {
  return {
    name: '',
    value: '',
    domain,
    path: '/',
    expiresAt: 0,
    session: true,
    secure: false,
    httpOnly: false,
    sameSite: '',
    hostOnly: Boolean(domain),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function serializeCookie(cookie: CookieJarEntry): string {
  const parts = [`${cookie.name}=${cookie.value}`, `Path=${cookie.path || '/'}`];
  if (!cookie.hostOnly && cookie.domain) parts.push(`Domain=${cookie.domain}`);
  if (!cookie.session && cookie.expiresAt) parts.push(`Expires=${new Date(cookie.expiresAt).toUTCString()}`);
  if (cookie.secure) parts.push('Secure');
  if (cookie.httpOnly) parts.push('HttpOnly');
  if (cookie.sameSite) parts.push(`SameSite=${cookie.sameSite[0].toUpperCase()}${cookie.sameSite.slice(1)}`);
  return `${parts.join('; ')};`;
}

export function parseRawCookie(source: string, fallbackDomain: string, timestamp = Date.now()): CookieJarEntry {
  const parts = source.split(';').map(part => part.trim()).filter(Boolean);
  const [nameValue, ...attrs] = parts;
  const eq = nameValue?.indexOf('=') ?? -1;
  if (!nameValue || eq <= 0) throw new Error('Cookie must start with name=value.');
  const cookie = blankCookie(normalizeCookieDomain(fallbackDomain), timestamp);
  cookie.name = nameValue.slice(0, eq).trim();
  cookie.value = nameValue.slice(eq + 1).trim();
  cookie.hostOnly = true;
  for (const attr of attrs) {
    const attrEq = attr.indexOf('=');
    const key = (attrEq >= 0 ? attr.slice(0, attrEq) : attr).trim().toLowerCase();
    const value = attrEq >= 0 ? attr.slice(attrEq + 1).trim() : '';
    if (key === 'path') cookie.path = value || '/';
    else if (key === 'domain') {
      cookie.domain = normalizeCookieDomain(value);
      cookie.hostOnly = false;
    } else if (key === 'expires') {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        cookie.expiresAt = parsed;
        cookie.session = false;
      }
    } else if (key === 'max-age') {
      // RFC 6265 §5.2.2: empty/non-numeric Max-Age must be ignored.
      // Previously Number('') was 0, which silently expired the cookie.
      const trimmed = value.trim();
      if (trimmed !== '') {
        const seconds = Number(trimmed);
        if (Number.isFinite(seconds)) {
          cookie.expiresAt = seconds > 0 ? timestamp + seconds * 1000 : timestamp - 1000;
          cookie.session = false;
        }
      }
    } else if (key === 'secure') cookie.secure = true;
    else if (key === 'httponly') cookie.httpOnly = true;
    else if (key === 'samesite') {
      const sameSite = value.toLowerCase();
      cookie.sameSite = sameSite === 'lax' || sameSite === 'strict' || sameSite === 'none' ? sameSite : '';
    }
  }
  if (!cookie.name) throw new Error('Cookie name is required.');
  if (!cookie.domain) throw new Error('Cookie domain is required.');
  if (!cookie.path.startsWith('/')) cookie.path = `/${cookie.path}`;
  // RFC 6265bis §5.4.7: SameSite=None requires Secure. Browsers reject
  // such cookies; match that behavior so users don't author cookies that
  // appear to work locally but get silently dropped in real flows.
  if (cookie.sameSite === 'none' && !cookie.secure) {
    throw new Error('SameSite=None cookies must also be marked Secure.');
  }
  // Reject path attributes that try to traverse upward — they don't grant
  // extra privileges (cookie matching is prefix-based) but a leading
  // `/../...` is confusing and never what the user meant.
  if (cookie.path.includes('..')) {
    throw new Error('Cookie Path must not contain "..".');
  }
  return cookie;
}

export function parseCookieHeader(source: string, fallbackDomain: string, timestamp = Date.now()): CookieJarEntry[] {
  const domain = normalizeCookieDomain(fallbackDomain);
  if (!domain) return [];
  return source
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const eq = part.indexOf('=');
      if (eq <= 0) return null;
      const cookie = blankCookie(domain, timestamp);
      cookie.name = part.slice(0, eq).trim();
      cookie.value = part.slice(eq + 1).trim();
      return cookie.name ? cookie : null;
    })
    .filter((cookie): cookie is CookieJarEntry => Boolean(cookie));
}

export function buildCookieDomainGroups(cookies: CookieJarEntry[], manualDomains: string[], query = ''): DomainGroup[] {
  const q = normalizeCookieDomain(query);
  const domains = new Map<string, CookieJarEntry[]>();
  for (const cookie of cookies) {
    const domain = normalizeCookieDomain(cookie.domain);
    if (!domain) continue;
    if (!domains.has(domain)) domains.set(domain, []);
    domains.get(domain)?.push(cookie);
  }
  for (const domain of manualDomains.map(normalizeCookieDomain).filter(Boolean)) {
    if (!domains.has(domain)) domains.set(domain, []);
  }
  return [...domains.entries()]
    .filter(([domain]) => !q || domain.includes(q))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, groupCookies]) => ({
      domain,
      cookies: groupCookies.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path)),
    }));
}

function cookieMatchesUrl(cookie: CookieJarEntry, requestUrl: string, now = Date.now()): boolean {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return false;
  }
  const protocol = parsed.protocol === 'ws:' ? 'http:' : parsed.protocol === 'wss:' ? 'https:' : parsed.protocol;
  if (!['http:', 'https:'].includes(protocol)) return false;
  if (cookie.secure && protocol !== 'https:') return false;
  if (!cookie.session && cookie.expiresAt > 0 && cookie.expiresAt <= now) return false;
  const host = parsed.hostname.toLowerCase();
  const domain = normalizeCookieDomain(cookie.domain);
  const domainMatches = cookie.hostOnly ? host === domain : host === domain || host.endsWith(`.${domain}`);
  if (!domainMatches) return false;
  const requestPath = parsed.pathname || '/';
  const cookiePath = cookie.path || '/';
  return requestPath === cookiePath || requestPath.startsWith(cookiePath.endsWith('/') ? cookiePath : `${cookiePath}/`);
}

export function cookieHeaderForUrl(cookies: CookieJarEntry[], requestUrl: string, now = Date.now()): string {
  return cookies
    .filter(cookie => cookieMatchesUrl(cookie, requestUrl, now))
    .sort((a, b) => (b.path || '/').length - (a.path || '/').length || a.name.localeCompare(b.name))
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
}
