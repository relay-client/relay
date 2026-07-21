import { DEFAULT_PROXY_CONFIG } from './constants';
import type { ProxyConfig, ProxyMode, ProxyProtocol } from './types/models';

const PROXY_MODES: ProxyMode[] = ['off', 'on', 'system'];
const PROXY_PROTOCOLS: ProxyProtocol[] = ['http', 'https', 'socks5'];




const SOCKS5_DEFAULT_PORT = 1080;

function cloneDefaultProxyConfig(): ProxyConfig {
  return { ...DEFAULT_PROXY_CONFIG, auth: { ...DEFAULT_PROXY_CONFIG.auth } };
}

export function normalizeProxyConfig(input: unknown): ProxyConfig {
  if (!input || typeof input !== 'object') return cloneDefaultProxyConfig();
  const raw = input as Record<string, unknown>;
  const authRaw = (raw.auth && typeof raw.auth === 'object' ? raw.auth : {}) as Record<string, unknown>;
  const port = Number(raw.port);
  return {
    mode: PROXY_MODES.includes(raw.mode as ProxyMode) ? (raw.mode as ProxyMode) : DEFAULT_PROXY_CONFIG.mode,
    protocol: PROXY_PROTOCOLS.includes(raw.protocol as ProxyProtocol) ? (raw.protocol as ProxyProtocol) : DEFAULT_PROXY_CONFIG.protocol,
    hostname: typeof raw.hostname === 'string' ? raw.hostname.trim() : '',
    port: Number.isFinite(port) && port >= 0 && port <= 65535 ? Math.floor(port) : 0,
    auth: {
      enabled: authRaw.enabled === true,
      username: typeof authRaw.username === 'string' ? authRaw.username : '',
      password: typeof authRaw.password === 'string' ? authRaw.password : '',
    },
    bypass: typeof raw.bypass === 'string' ? raw.bypass : '',
  };
}




export function proxyConfigForPersistence(config: ProxyConfig): ProxyConfig {
  const cfg = normalizeProxyConfig(config);
  return { ...cfg, auth: { ...cfg.auth, password: '' } };
}

export type ResolvedProxy = { proxyUrl: string; proxyMode: '' | ProxyMode; proxyBypass: string };





export function resolveProxy(config: ProxyConfig, overrideUrl = ''): ResolvedProxy {
  const override = overrideUrl.trim();
  if (override) return { proxyUrl: override, proxyMode: 'on', proxyBypass: '' };

  const cfg = normalizeProxyConfig(config);
  if (cfg.mode === 'system') return { proxyUrl: '', proxyMode: 'system', proxyBypass: '' };
  if (cfg.mode === 'off') return { proxyUrl: '', proxyMode: 'off', proxyBypass: '' };




  if (!cfg.hostname) return { proxyUrl: '', proxyMode: 'on', proxyBypass: '' };

  const credentials = cfg.auth.enabled && cfg.auth.username
    ? `${encodeURIComponent(cfg.auth.username)}:${encodeURIComponent(cfg.auth.password)}@`
    : '';
  const effectivePort = cfg.port > 0
    ? cfg.port
    : cfg.protocol === 'socks5' ? SOCKS5_DEFAULT_PORT : 0;
  const portPart = effectivePort > 0 ? `:${effectivePort}` : '';
  return {
    proxyUrl: `${cfg.protocol}://${credentials}${cfg.hostname}${portPart}`,
    proxyMode: 'on',
    proxyBypass: cfg.bypass.trim(),
  };
}
