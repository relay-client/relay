import { describe, expect, it } from 'vitest';
import {
  buildBrowserSecurityPreview,
  normalizeBrowserOriginForPreview,
} from '../lib/browserSecurityPreview';
import { BROWSER_LIKE_USER_AGENT, DEFAULT_REQUEST_SETTINGS } from '../lib/constants';
import type { KVRow, RequestSettings } from '../lib/types/models';

function settings(partial: Partial<RequestSettings>): RequestSettings {
  return { ...DEFAULT_REQUEST_SETTINGS, ...partial };
}

function header(key: string, value: string): KVRow {
  return { id: Math.random(), enabled: true, key, value, description: '' };
}

describe('browser security header preview', () => {
  it('normalizes configured browser origins like the backend', () => {
    expect(normalizeBrowserOriginForPreview('https://App.Example.test:443/page')?.value).toBe('https://app.example.test');
    expect(normalizeBrowserOriginForPreview('http://[::1]:80/app')?.value).toBe('http://[::1]');
    expect(normalizeBrowserOriginForPreview('null')?.value).toBe('null');
  });

  it('prepends http:// when the configured origin has no scheme', () => {
    expect(normalizeBrowserOriginForPreview('localhost:5173')?.value).toBe('http://localhost:5173');
    expect(normalizeBrowserOriginForPreview('app.example.test')?.value).toBe('http://app.example.test');
    expect(normalizeBrowserOriginForPreview('//app.example.test')?.value).toBe('http://app.example.test');
  });

  it('keeps showing emulation headers when a scheme-less origin is entered', () => {
    const preview = buildBrowserSecurityPreview({
      settings: settings({ browserEmulation: true, browserOrigin: 'localhost:5173' }),
      requestUrl: 'http://localhost:5173/events',
      headers: [],
      kind: 'fetch',
    });

    expect(preview.fetchHeadersApplied).toBe(true);
    expect(preview.crossOrigin).toBe(false);
    expect(preview.headers).toContainEqual(expect.objectContaining({ key: 'Origin', value: 'http://localhost:5173' }));
    expect(preview.headers).toContainEqual(expect.objectContaining({ key: 'Sec-Fetch-Site', value: 'same-origin' }));
  });

  it('shows fetch browser headers and strips cookies for cross-origin requests without credentials', () => {
    const preview = buildBrowserSecurityPreview({
      settings: settings({ browserEmulation: true, browserOrigin: 'https://app.example.test/dashboard' }),
      requestUrl: 'https://api.example.test/users',
      headers: [],
      kind: 'fetch',
    });

    expect(preview.stripCookieJar).toBe(true);
    expect(preview.headers).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'User-Agent', value: BROWSER_LIKE_USER_AGENT }),
      expect.objectContaining({ key: 'Origin', value: 'https://app.example.test' }),
      expect.objectContaining({ key: 'Sec-Fetch-Dest', value: 'empty' }),
      expect.objectContaining({ key: 'Sec-Fetch-Mode', value: 'cors' }),
      expect.objectContaining({ key: 'Sec-Fetch-Site', value: 'cross-site' }),
    ]));
  });

  it('shows Sec-Fetch-Site none when emulation has no Origin', () => {
    const preview = buildBrowserSecurityPreview({
      settings: settings({ browserEmulation: true }),
      requestUrl: 'https://api.example.test/users',
      headers: [],
      kind: 'fetch',
    });

    expect(preview.stripCookieJar).toBe(false);
    expect(preview.headers.some(row => row.key === 'Origin')).toBe(false);
    expect(preview.headers).toContainEqual(expect.objectContaining({ key: 'Sec-Fetch-Site', value: 'none' }));
  });

  it('shows the effective Origin when browser emulation uses a custom Origin header', () => {
    const preview = buildBrowserSecurityPreview({
      settings: settings({ browserEmulation: true }),
      requestUrl: 'https://api.example.test/users',
      headers: [header('Origin', 'https://App.Example.test:443/dashboard')],
      kind: 'fetch',
    });

    expect(preview.headers).toContainEqual(expect.objectContaining({
      key: 'Origin',
      value: 'https://app.example.test',
      note: expect.stringContaining('normalized by browser emulation'),
    }));
    expect(preview.headers).toContainEqual(expect.objectContaining({ key: 'Sec-Fetch-Site', value: 'cross-site' }));
  });

  it('does not show Sec-Fetch headers for realtime handshakes', () => {
    const preview = buildBrowserSecurityPreview({
      settings: settings({ browserEmulation: true, browserOrigin: 'https://app.example.test' }),
      requestUrl: 'wss://api.example.test/socket',
      headers: [header('User-Agent', 'Custom UA'), header('Origin', 'https://custom.example.test')],
      kind: 'handshake',
    });

    expect(preview.headers).toContainEqual(expect.objectContaining({ key: 'User-Agent', overridden: true }));
    expect(preview.headers).toContainEqual(expect.objectContaining({ key: 'Origin', note: expect.stringContaining('replaces custom Origin') }));
    expect(preview.headers.some(row => row.key.startsWith('Sec-Fetch-'))).toBe(false);
  });

  it('treats same-host wss handshake from an https origin as same-site (keeps cookies)', () => {
    const preview = buildBrowserSecurityPreview({
      settings: settings({ browserEmulation: true, browserOrigin: 'https://app.example.test' }),
      requestUrl: 'wss://app.example.test/socket',
      headers: [],
      kind: 'handshake',
    });

    expect(preview.crossOrigin).toBe(false);
    expect(preview.stripCookieJar).toBe(false);
  });

  it('treats a different-host wss handshake as cross-origin (strips cookies without credentials)', () => {
    const preview = buildBrowserSecurityPreview({
      settings: settings({ browserEmulation: true, browserOrigin: 'https://app.example.test' }),
      requestUrl: 'wss://api.example.test/socket',
      headers: [],
      kind: 'handshake',
    });

    expect(preview.crossOrigin).toBe(true);
    expect(preview.stripCookieJar).toBe(true);
  });

  it('does not preview fetch headers when Origin validation would block preparation', () => {
    const preview = buildBrowserSecurityPreview({
      settings: settings({ browserEmulation: true, browserOrigin: 'ftp://example.test' }),
      requestUrl: 'https://api.example.test/users',
      headers: [],
      kind: 'fetch',
    });

    expect(preview.fetchHeadersApplied).toBe(false);
    expect(preview.headers).toEqual([
      expect.objectContaining({ key: 'User-Agent', value: BROWSER_LIKE_USER_AGENT }),
    ]);
  });
});
