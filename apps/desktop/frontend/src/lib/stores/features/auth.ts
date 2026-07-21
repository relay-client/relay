import { authorizeOAuth2 as requestOAuth2Authorize, fetchOAuth2Token as requestOAuth2Token, refreshOAuth2Token as requestOAuth2Refresh } from '../../backend';
import type { AuthConfig, OAuth2TokenResponse } from '../../backend';
import { AUTH_OPTIONS } from '../../constants';
import type { AuthType, OAuth2GrantType, RequestType, SavedRequest } from '../../types/models';
import { authForPersistence as resolveAuthForPersistence, authStateHasData as authHasPersistableData } from '../../utils';

type AuthHost = {
  activeRequestId: string;
  apiKeyIn: 'header' | 'query';
  apiKeyName: string;
  apiKeyValue: string;
  authMenuOpen: boolean;
  authType: AuthType;
  awsAccessKey: string;
  awsRegion: string;
  awsSecretKey: string;
  awsService: string;
  basicPass: string;
  basicUser: string;
  bearerToken: string;
  enableSSLVerification: boolean;
  oauth2ClientID: string;
  oauth2Loading: boolean;
  oauth2Scope: string;
  oauth2Secret: string;
  oauth2Token: string;
  oauth2TokenURL: string;
  oauth2GrantType: OAuth2GrantType;
  oauth2AuthURL: string;
  oauth2RefreshToken: string;
  oauth2TokenExpiry: number;
  oauth2UsePKCE: boolean;
  requestType: RequestType;
  requests: SavedRequest[];
  savedRequestSnapshots: Map<string, SavedRequest>;
  collectionForRequest: (req: Pick<SavedRequest, 'collectionId'>) => import('../../types/models').Collection | undefined;
  currentAuthState: () => SavedRequest['auth'];
  oauth2ConfigForRequest: () => AuthConfig;
  applyOAuth2Result: (result: OAuth2TokenResponse) => void;
  openAlertDialog: (title: string, message: string) => Promise<void>;
  resolveTemplate: (value: string, values?: Record<string, string>) => string;
  snapshotActiveRequest: (options?: { forPersistence?: boolean }) => SavedRequest;
  environmentValuesForRequest: (req: Pick<SavedRequest, 'collectionId'>, envValues?: Record<string, string>) => Record<string, string>;
};

export const authFeature = {
  authLabel(this: AuthHost, type: AuthType = this.authType) {
    if (this.requestType === 'grpc' && type === 'oauth2') return 'OAuth 2.0';
    return AUTH_OPTIONS.find(o => o.value === type)?.label ?? 'No Auth';
  },

  currentAuthState(this: AuthHost): SavedRequest['auth'] {
    return {
      type: this.authType,
      bearerToken: this.bearerToken,
      basicUser: this.basicUser,
      basicPass: this.basicPass,
      apiKeyName: this.apiKeyName,
      apiKeyValue: this.apiKeyValue,
      apiKeyIn: this.apiKeyIn,
      oauth2TokenURL: this.oauth2TokenURL,
      oauth2ClientID: this.oauth2ClientID,
      oauth2Secret: this.oauth2Secret,
      oauth2Scope: this.oauth2Scope,
      oauth2Token: this.oauth2Token,
      oauth2GrantType: this.oauth2GrantType,
      oauth2AuthURL: this.oauth2AuthURL,
      oauth2RefreshToken: this.oauth2RefreshToken,
      oauth2TokenExpiry: this.oauth2TokenExpiry,
      oauth2UsePKCE: this.oauth2UsePKCE,
      awsAccessKey: this.awsAccessKey,
      awsSecretKey: this.awsSecretKey,
      awsRegion: this.awsRegion,
      awsService: this.awsService,
    };
  },

  selectAuthType(this: AuthHost, type: AuthType) {
    this.authType = type;
    this.authMenuOpen = false;
  },

  authHasConfig(this: AuthHost) {
    if (this.authType === 'inherit') {
      const auth = this.collectionForRequest(this.snapshotActiveRequest())?.defaults.auth;
      return Boolean(auth && authHasPersistableData(auth, auth.type));
    }
    if (this.authType === 'bearer') return Boolean(this.bearerToken);
    if (this.authType === 'basic' || this.authType === 'digest') return Boolean(this.basicUser || this.basicPass);
    if (this.authType === 'apikey') return Boolean(this.apiKeyName && this.apiKeyValue);
    if (this.authType === 'oauth2') {
      if (this.oauth2Token) return true;
      if (this.oauth2GrantType === 'authorization_code') return Boolean(this.oauth2AuthURL && this.oauth2TokenURL && this.oauth2ClientID);
      return Boolean(this.oauth2TokenURL && this.oauth2ClientID);
    }
    if (this.authType === 'aws') return Boolean(this.awsAccessKey && this.awsSecretKey && this.awsRegion && this.awsService);
    return false;
  },

  authStateHasData(this: AuthHost, auth: SavedRequest['auth'], type: AuthType = auth.type) {
    return authHasPersistableData(auth, type);
  },

  authForPersistence(this: AuthHost, auth: SavedRequest['auth'] = this.currentAuthState()): SavedRequest['auth'] {
    const stored = this.savedRequestSnapshots.get(this.activeRequestId)?.auth ?? this.requests.find(request => request.id === this.activeRequestId)?.auth;
    return resolveAuthForPersistence(auth, stored);
  },

  basicAuthPreview(this: AuthHost) {
    try {
      return `Basic ${btoa(`${this.basicUser}:${this.basicPass}`)}`;
    } catch {
      return 'Basic <generated>';
    }
  },

  oauth2ConfigForRequest(this: AuthHost): AuthConfig {
    const values = this.environmentValuesForRequest(this.snapshotActiveRequest());
    return {
      type: 'oauth2',
      token: '',
      username: '',
      password: '',
      keyName: '',
      keyValue: '',
      keyIn: 'header',
      oauth2GrantType: this.oauth2GrantType,
      oauth2TokenURL: this.resolveTemplate(this.oauth2TokenURL, values),
      oauth2AuthURL: this.resolveTemplate(this.oauth2AuthURL, values),
      oauth2ClientID: this.resolveTemplate(this.oauth2ClientID, values),
      oauth2Secret: this.resolveTemplate(this.oauth2Secret, values),
      oauth2Scope: this.resolveTemplate(this.oauth2Scope, values),
      oauth2UsePKCE: this.oauth2UsePKCE,
      oauth2RefreshToken: this.oauth2RefreshToken,
      oauth2InsecureSkipVerify: !this.enableSSLVerification,
      awsAccessKey: '',
      awsSecretKey: '',
      awsRegion: '',
      awsService: '',
    };
  },

  applyOAuth2Result(this: AuthHost, result: OAuth2TokenResponse) {
    if (!result.access_token) return;
    this.oauth2Token = result.access_token;
    this.bearerToken = result.access_token;
    this.oauth2TokenExpiry = result.expires_in > 0 ? Date.now() + result.expires_in * 1000 : 0;
    if (result.refresh_token) this.oauth2RefreshToken = result.refresh_token;
  },

  async fetchOAuth2Token(this: AuthHost) {
    this.oauth2Loading = true;
    try {
      const cfg = this.oauth2ConfigForRequest();
      const result = this.oauth2GrantType === 'authorization_code'
        ? await requestOAuth2Authorize(cfg)
        : await requestOAuth2Token(cfg);
      if (result?.error) void this.openAlertDialog('OAuth2 error', `${result.error}${result.error_description ? ' — ' + result.error_description : ''}`);
      else if (result?.access_token) this.applyOAuth2Result(result);
    } catch (e) {
      void this.openAlertDialog('OAuth2 error', String(e));
    } finally {
      this.oauth2Loading = false;
    }
  },

  async refreshOAuth2Token(this: AuthHost) {
    if (!this.oauth2RefreshToken) return;
    this.oauth2Loading = true;
    try {
      const result = await requestOAuth2Refresh(this.oauth2ConfigForRequest());
      if (result?.error) void this.openAlertDialog('OAuth2 error', `${result.error}${result.error_description ? ' — ' + result.error_description : ''}`);
      else if (result?.access_token) this.applyOAuth2Result(result);
    } catch (e) {
      void this.openAlertDialog('OAuth2 error', String(e));
    } finally {
      this.oauth2Loading = false;
    }
  },

  // Best-effort silent refresh run right before a send: if the access token is
  // about to expire and we hold a refresh token, swap it for a fresh one so the
  // request goes out authenticated. Failures fall through to the existing token.
  async ensureValidOAuth2Token(this: AuthHost) {
    if (this.authType !== 'oauth2') return;
    if (!this.oauth2RefreshToken || !this.oauth2Token || !this.oauth2TokenExpiry) return;
    if (Date.now() < this.oauth2TokenExpiry - 30_000) return;
    try {
      const result = await requestOAuth2Refresh(this.oauth2ConfigForRequest());
      if (result?.access_token) this.applyOAuth2Result(result);
    } catch {
      // keep the current token and let the request proceed
    }
  },
};
