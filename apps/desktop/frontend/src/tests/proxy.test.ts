import { describe, expect, it } from 'vitest';
import { normalizeProxyConfig, proxyConfigForPersistence, resolveProxy } from '../lib/proxy';
import { DEFAULT_PROXY_CONFIG } from '../lib/constants';
import type { ProxyConfig } from '../lib/types/models';

function cfg(partial: Partial<ProxyConfig>): ProxyConfig {
  return { ...DEFAULT_PROXY_CONFIG, auth: { ...DEFAULT_PROXY_CONFIG.auth }, ...partial };
}

describe('normalizeProxyConfig', () => {
  it('falls back to defaults for junk input', () => {
    expect(normalizeProxyConfig(null)).toEqual(DEFAULT_PROXY_CONFIG);
    expect(normalizeProxyConfig('nope')).toEqual(DEFAULT_PROXY_CONFIG);
  });

  it('coerces invalid mode/protocol/port and nested auth', () => {
    const out = normalizeProxyConfig({ mode: 'weird', protocol: 'socks4', port: 70000, auth: { enabled: 'yes' } });
    expect(out.mode).toBe('off');
    expect(out.protocol).toBe('http');
    expect(out.port).toBe(0);
    expect(out.auth).toEqual({ enabled: false, username: '', password: '' });
  });

  it('keeps valid values', () => {
    const out = normalizeProxyConfig({ mode: 'on', protocol: 'socks5', hostname: ' p.example.com ', port: 1080, auth: { enabled: true, username: 'u', password: 'p' }, bypass: 'a,b' });
    expect(out).toEqual({ mode: 'on', protocol: 'socks5', hostname: 'p.example.com', port: 1080, auth: { enabled: true, username: 'u', password: 'p' }, bypass: 'a,b' });
  });
});

describe('resolveProxy', () => {
  it('lets a request/collection proxyUrl override the global config', () => {
    const out = resolveProxy(cfg({ mode: 'on', hostname: 'global.example.com', port: 8080 }), 'http://override.local:3128');
    expect(out).toEqual({ proxyUrl: 'http://override.local:3128', proxyMode: 'on', proxyBypass: '' });
  });

  it('mode off → no proxy', () => {
    expect(resolveProxy(cfg({ mode: 'off' }))).toEqual({ proxyUrl: '', proxyMode: 'off', proxyBypass: '' });
  });

  it('mode system → environment, no explicit url', () => {
    expect(resolveProxy(cfg({ mode: 'system' }))).toEqual({ proxyUrl: '', proxyMode: 'system', proxyBypass: '' });
  });

  it('mode on builds protocol://host:port and carries the bypass list', () => {
    const out = resolveProxy(cfg({ mode: 'on', protocol: 'socks5', hostname: 'proxy.example.com', port: 1080, bypass: ' localhost, .internal ' }));
    expect(out).toEqual({ proxyUrl: 'socks5://proxy.example.com:1080', proxyMode: 'on', proxyBypass: 'localhost, .internal' });
  });

  it('encodes auth credentials into the proxy URL when auth is enabled', () => {
    const out = resolveProxy(cfg({ mode: 'on', hostname: 'h', port: 8080, auth: { enabled: true, username: 'us er', password: 'p@ss:/' } }));
    expect(out.proxyUrl).toBe('http://us%20er:p%40ss%3A%2F@h:8080');
  });

  it('omits credentials when auth is enabled but username is empty', () => {
    const out = resolveProxy(cfg({ mode: 'on', hostname: 'h', port: 8080, auth: { enabled: true, username: '', password: 'x' } }));
    expect(out.proxyUrl).toBe('http://h:8080');
  });

  it('mode on with empty hostname fails closed (mode on, empty url — never direct)', () => {
    expect(resolveProxy(cfg({ mode: 'on', hostname: '' }))).toEqual({ proxyUrl: '', proxyMode: 'on', proxyBypass: '' });
  });

  it('mode off always wins over an empty hostname', () => {
    expect(resolveProxy(cfg({ mode: 'off', hostname: '' }))).toEqual({ proxyUrl: '', proxyMode: 'off', proxyBypass: '' });
  });

  it('omits the port segment when port is 0 for http (Go defaults to :80)', () => {
    expect(resolveProxy(cfg({ mode: 'on', hostname: 'h', port: 0 })).proxyUrl).toBe('http://h');
  });

  it('injects the SOCKS5 default port (1080) when port is 0', () => {
    expect(resolveProxy(cfg({ mode: 'on', protocol: 'socks5', hostname: 'h', port: 0 })).proxyUrl).toBe('socks5://h:1080');
  });

  it('keeps an explicit port for socks5 instead of the default', () => {
    expect(resolveProxy(cfg({ mode: 'on', protocol: 'socks5', hostname: 'h', port: 9050 })).proxyUrl).toBe('socks5://h:9050');
  });
});

describe('proxyConfigForPersistence', () => {
  it('strips the password but keeps the rest of the config', () => {
    const out = proxyConfigForPersistence(cfg({
      mode: 'on', protocol: 'socks5', hostname: 'p.example.com', port: 1080,
      auth: { enabled: true, username: 'user', password: 'sup3rsecret' }, bypass: 'localhost',
    }));
    expect(out).toEqual({
      mode: 'on', protocol: 'socks5', hostname: 'p.example.com', port: 1080,
      auth: { enabled: true, username: 'user', password: '' }, bypass: 'localhost',
    });
  });

  it('never lets a password reach the serialized form', () => {
    const out = proxyConfigForPersistence(cfg({ auth: { enabled: true, username: 'u', password: 'leak-me' } }));
    expect(JSON.stringify(out)).not.toContain('leak-me');
    expect(out.auth.password).toBe('');
  });

  it('returns a normalized config (coerces junk) without a password', () => {
    const out = proxyConfigForPersistence({ mode: 'weird', port: 70000, auth: { password: 'x' } } as unknown as ProxyConfig);
    expect(out.mode).toBe('off');
    expect(out.port).toBe(0);
    expect(out.auth.password).toBe('');
  });
});
