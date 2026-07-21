import { describe, expect, it } from 'vitest';
import {
  buildCookieDomainGroups,
  cookieHeaderForUrl,
  parseCookieHeader,
  parseRawCookie,
  serializeCookie,
} from '../lib/cookieJar';
import type { CookieJarEntry } from '../lib/backend';

const now = Date.UTC(2026, 0, 1, 0, 0, 0);

function cookie(overrides: Partial<CookieJarEntry>): CookieJarEntry {
  return {
    name: 'sessionId',
    value: 'abc',
    domain: 'api.example.test',
    path: '/',
    expiresAt: 0,
    session: true,
    secure: false,
    httpOnly: false,
    sameSite: '',
    hostOnly: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('cookie jar helpers', () => {
  it('parses and serializes Postman-style raw Set-Cookie text', () => {
    const parsed = parseRawCookie(
      'sessionId=abc; Path=/admin; Domain=.example.test; Expires=Mon, 03 May 2027 20:07:19 GMT; Secure; HttpOnly; SameSite=Lax;',
      'api.example.test',
      now,
    );

    expect(parsed).toMatchObject({
      name: 'sessionId',
      value: 'abc',
      domain: 'example.test',
      path: '/admin',
      session: false,
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      hostOnly: false,
    });
    expect(serializeCookie(parsed)).toContain('sessionId=abc');
    expect(serializeCookie(parsed)).toContain('Path=/admin');
    expect(serializeCookie(parsed)).toContain('Domain=example.test');
    expect(serializeCookie(parsed)).toContain('HttpOnly');
  });

  it('parses Cookie headers into host-only jar entries', () => {
    const parsed = parseCookieHeader(
      '__ddg10_=1774623151; __ddg1_=kr413tNEMRYMIRZHGNUG; __ddg8_=p9DbfJGnLAXgtc4r; __ddg9_=136.169.214.33',
      'api.hornybox.ru',
      now,
    );

    expect(parsed.map(item => [item.name, item.value, item.domain, item.path, item.hostOnly])).toEqual([
      ['__ddg10_', '1774623151', 'api.hornybox.ru', '/', true],
      ['__ddg1_', 'kr413tNEMRYMIRZHGNUG', 'api.hornybox.ru', '/', true],
      ['__ddg8_', 'p9DbfJGnLAXgtc4r', 'api.hornybox.ru', '/', true],
      ['__ddg9_', '136.169.214.33', 'api.hornybox.ru', '/', true],
    ]);
  });

  it('matches host-only and domain cookies for the auto Cookie header', () => {
    const header = cookieHeaderForUrl([
      cookie({ name: 'hostOnly', value: '1', domain: 'api.example.test', hostOnly: true }),
      cookie({ name: 'parentDomain', value: '2', domain: 'example.test', hostOnly: false }),
      cookie({ name: 'wrongHost', value: '3', domain: 'other.example.test', hostOnly: true }),
      cookie({ name: 'wrongPath', value: '4', path: '/admin' }),
    ], 'https://api.example.test/users', now);

    expect(header).toBe('hostOnly=1; parentDomain=2');
  });

  it('matches WebSocket URLs using their HTTP cookie scheme equivalents', () => {
    const cookies = [
      cookie({ name: 'session', value: '1', domain: 'api.example.test', hostOnly: true }),
      cookie({ name: 'secureSession', value: '2', domain: 'api.example.test', hostOnly: true, secure: true }),
    ];

    expect(cookieHeaderForUrl(cookies, 'wss://api.example.test/socket', now)).toBe('secureSession=2; session=1');
    expect(cookieHeaderForUrl(cookies, 'ws://api.example.test/socket', now)).toBe('session=1');
  });

  it('groups manual domains together with saved cookies', () => {
    const groups = buildCookieDomainGroups([
      cookie({ name: 'csrfToken', domain: 'api.example.test' }),
      cookie({ name: 'sessionId', domain: 'api.example.test' }),
    ], ['new-api.example.test'], '');

    expect(groups.map(group => [group.domain, group.cookies.map(item => item.name)])).toEqual([
      ['api.example.test', ['csrfToken', 'sessionId']],
      ['new-api.example.test', []],
    ]);
  });
});
