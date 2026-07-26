import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/backend', () => ({
  authorizeOAuth2: vi.fn(),
  authorizeOAuth2Device: vi.fn(),
  fetchOAuth2Token: vi.fn(),
  refreshOAuth2Token: vi.fn(),
}));

import { authorizeOAuth2, authorizeOAuth2Device, fetchOAuth2Token, refreshOAuth2Token } from '../lib/backend';
import { authFeature } from '../lib/stores/features/auth';
import type { OAuth2TokenResponse } from '../lib/backend';

const mockAuthorize = vi.mocked(authorizeOAuth2);
const mockDevice = vi.mocked(authorizeOAuth2Device);
const mockFetch = vi.mocked(fetchOAuth2Token);
const mockRefresh = vi.mocked(refreshOAuth2Token);

function makeHost(over: Record<string, unknown> = {}) {
  return {
    authType: 'oauth2',
    enableSSLVerification: true,
    oauth2GrantType: 'client_credentials',
    oauth2TokenURL: 'https://auth.example.com/token',
    oauth2AuthURL: 'https://auth.example.com/authorize',
    oauth2DeviceAuthURL: 'https://auth.example.com/device/code',
    oauth2ClientID: 'cid',
    oauth2Secret: 'secret',
    oauth2Scope: 'read',
    oauth2Token: '',
    oauth2RefreshToken: '',
    oauth2TokenExpiry: 0,
    oauth2UsePKCE: true,
    oauth2Loading: false,
    oauth2Audience: '',
    oauth2Username: '',
    oauth2Password: '',
    oauth2ClientAuth: 'basic',
    oauth2AssertionAlgorithm: '',
    oauth2AssertionPrivateKey: '',
    oauth2AssertionKeyID: '',
    oauth2AssertionAudience: '',
    oauth2DevicePrompt: null,
    bearerToken: '',
    resolveTemplate: (value: string) => value,
    environmentValuesForRequest: () => ({}),
    snapshotActiveRequest: () => ({}),
    openAlertDialog: vi.fn(),
    oauth2ConfigForRequest: authFeature.oauth2ConfigForRequest,
    applyOAuth2Result: authFeature.applyOAuth2Result,
    fetchOAuth2Token: authFeature.fetchOAuth2Token,
    refreshOAuth2Token: authFeature.refreshOAuth2Token,
    ensureValidOAuth2Token: authFeature.ensureValidOAuth2Token,
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const tokenResponse = (over: Partial<OAuth2TokenResponse> = {}): OAuth2TokenResponse => ({
  access_token: 'AT', token_type: 'Bearer', expires_in: 3600, ...over,
});

describe('OAuth2 grant routing', () => {
  beforeEach(() => {
    mockAuthorize.mockReset();
    mockDevice.mockReset();
    mockFetch.mockReset();
    mockRefresh.mockReset();
  });

  it('routes client_credentials to the token endpoint', async () => {
    mockFetch.mockResolvedValue(tokenResponse({ access_token: 'cc-token' }));
    const host = makeHost({ oauth2GrantType: 'client_credentials' });
    await host.fetchOAuth2Token();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(host.oauth2Token).toBe('cc-token');
    expect(host.bearerToken).toBe('cc-token');
    expect(host.oauth2TokenExpiry).toBeGreaterThan(Date.now());
  });

  it('routes authorization_code to the interactive browser flow', async () => {
    mockAuthorize.mockResolvedValue(tokenResponse({ access_token: 'ac-token', expires_in: 60, refresh_token: 'rt-1' }));
    const host = makeHost({ oauth2GrantType: 'authorization_code' });
    await host.fetchOAuth2Token();
    expect(mockAuthorize).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(host.oauth2Token).toBe('ac-token');
    expect(host.oauth2RefreshToken).toBe('rt-1');
  });

  it('passes the grant type and PKCE flag through the config builder', async () => {
    mockAuthorize.mockResolvedValue(tokenResponse());
    const host = makeHost({ oauth2GrantType: 'authorization_code', oauth2UsePKCE: true });
    await host.fetchOAuth2Token();
    const cfg = mockAuthorize.mock.calls[0][0];
    expect(cfg.oauth2GrantType).toBe('authorization_code');
    expect(cfg.oauth2UsePKCE).toBe(true);
    expect(cfg.oauth2AuthURL).toBe('https://auth.example.com/authorize');
  });

  it('routes device_code to the device authorization flow', async () => {
    mockDevice.mockResolvedValue(tokenResponse({ access_token: 'dev-token', refresh_token: 'rt-dev' }));
    const host = makeHost({ oauth2GrantType: 'device_code' });
    await host.fetchOAuth2Token();
    expect(mockDevice).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(host.oauth2Token).toBe('dev-token');
    const cfg = mockDevice.mock.calls[0][0];
    expect(cfg.oauth2DeviceAuthURL).toBe('https://auth.example.com/device/code');
  });

  it('routes password to the token endpoint with credentials in the config', async () => {
    mockFetch.mockResolvedValue(tokenResponse({ access_token: 'pw-token' }));
    const host = makeHost({ oauth2GrantType: 'password', oauth2Username: 'alice', oauth2Password: 's3cret' });
    await host.fetchOAuth2Token();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockDevice).not.toHaveBeenCalled();
    const cfg = mockFetch.mock.calls[0][0];
    expect(cfg.oauth2GrantType).toBe('password');
    expect(cfg.oauth2Username).toBe('alice');
    expect(cfg.oauth2Password).toBe('s3cret');
  });

  it('clears a stale device prompt when the flow finishes', async () => {
    mockDevice.mockResolvedValue(tokenResponse({ access_token: 'dev' }));
    const host = makeHost({ oauth2GrantType: 'device_code', oauth2DevicePrompt: { userCode: 'OLD-CODE', verificationUri: 'https://x', expiresIn: 60, interval: 5 } });
    await host.fetchOAuth2Token();
    expect(host.oauth2DevicePrompt).toBeNull();
  });

  it('carries the client assertion config through to the backend', async () => {
    mockFetch.mockResolvedValue(tokenResponse());
    const host = makeHost({
      oauth2ClientAuth: 'private_key_jwt',
      oauth2AssertionPrivateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
      oauth2AssertionKeyID: 'kid-1',
      oauth2AssertionAudience: 'https://auth.example.com/token',
    });
    await host.fetchOAuth2Token();
    const cfg = mockFetch.mock.calls[0][0];
    expect(cfg.oauth2ClientAuth).toBe('private_key_jwt');
    expect(cfg.oauth2AssertionPrivateKey).toContain('BEGIN PRIVATE KEY');
    expect(cfg.oauth2AssertionKeyID).toBe('kid-1');
    expect(cfg.oauth2AssertionAudience).toBe('https://auth.example.com/token');
  });

  it('forwards the audience parameter', async () => {
    mockFetch.mockResolvedValue(tokenResponse());
    const host = makeHost({ oauth2Audience: 'https://api.example.com' });
    await host.fetchOAuth2Token();
    expect(mockFetch.mock.calls[0][0].oauth2Audience).toBe('https://api.example.com');
  });

  it('surfaces token errors through an alert', async () => {
    mockFetch.mockResolvedValue({ access_token: '', token_type: '', expires_in: 0, error: 'invalid_client' });
    const host = makeHost();
    await host.fetchOAuth2Token();
    expect(host.openAlertDialog).toHaveBeenCalled();
    expect(host.oauth2Token).toBe('');
  });
});

describe('applyOAuth2Result', () => {
  it('computes an absolute expiry from expires_in', () => {
    const host = makeHost();
    const before = Date.now();
    host.applyOAuth2Result(tokenResponse({ access_token: 'x', expires_in: 100 }));
    expect(host.oauth2TokenExpiry).toBeGreaterThanOrEqual(before + 100_000 - 50);
  });

  it('keeps the existing refresh token when the response omits one', () => {
    const host = makeHost({ oauth2RefreshToken: 'keep-me' });
    host.applyOAuth2Result(tokenResponse({ access_token: 'x' }));
    expect(host.oauth2RefreshToken).toBe('keep-me');
  });

  it('does nothing without an access token', () => {
    const host = makeHost({ oauth2Token: 'old' });
    host.applyOAuth2Result({ access_token: '', token_type: '', expires_in: 0 });
    expect(host.oauth2Token).toBe('old');
  });
});

describe('ensureValidOAuth2Token (auto-refresh before send)', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
  });

  it('refreshes a token that is expired or about to expire', async () => {
    mockRefresh.mockResolvedValue(tokenResponse({ access_token: 'fresh', refresh_token: 'rt-2' }));
    const host = makeHost({ oauth2Token: 'stale', oauth2RefreshToken: 'rt-1', oauth2TokenExpiry: Date.now() - 1000 });
    await host.ensureValidOAuth2Token();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(host.oauth2Token).toBe('fresh');
    expect(host.oauth2RefreshToken).toBe('rt-2');
  });

  it('leaves a still-valid token untouched', async () => {
    const host = makeHost({ oauth2Token: 'good', oauth2RefreshToken: 'rt-1', oauth2TokenExpiry: Date.now() + 3_600_000 });
    await host.ensureValidOAuth2Token();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(host.oauth2Token).toBe('good');
  });

  it('skips when there is no refresh token', async () => {
    const host = makeHost({ oauth2Token: 'good', oauth2RefreshToken: '', oauth2TokenExpiry: Date.now() - 1000 });
    await host.ensureValidOAuth2Token();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('skips entirely for non-oauth2 auth types', async () => {
    const host = makeHost({ authType: 'bearer', oauth2Token: 'x', oauth2RefreshToken: 'rt-1', oauth2TokenExpiry: Date.now() - 1000 });
    await host.ensureValidOAuth2Token();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('keeps the old token when the refresh call throws', async () => {
    mockRefresh.mockRejectedValue(new Error('network'));
    const host = makeHost({ oauth2Token: 'stale', oauth2RefreshToken: 'rt-1', oauth2TokenExpiry: Date.now() - 1000 });
    await host.ensureValidOAuth2Token();
    expect(host.oauth2Token).toBe('stale');
  });
});
