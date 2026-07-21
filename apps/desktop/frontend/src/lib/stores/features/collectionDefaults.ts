import {
  applyCollectionDefaultsToRequest,
  collectionDefaultsHaveContent,
  REQUEST_SETTING_KEYS,
} from '../../collectionDefaults';
import { DEFAULT_REQUEST_SETTINGS } from '../../constants';
import type { AuthState, AuthType, Collection, KVRow, RequestSettings, RequestSettingsOverrides, SavedRequest } from '../../types/models';
import { rowHasContent, scriptLineCount } from '../../utils';

type CollectionDefaultsHost = {
  activeCollectionSettingsId: string;
  activeWorkspaceId: string;
  authType: AuthType;
  collections: Collection[];
  reqHeaders: KVRow[];
  requestSettingsOverrides: RequestSettingsOverrides;
  activeCollectionId: () => string;
  activeRequestCollection: () => Collection | undefined;
  authLabel: (type: AuthType) => string;
  authStateHasData: (auth: AuthState, type: AuthType) => boolean;
  collectionForRequest: (req: Pick<SavedRequest, 'collectionId'>) => Collection | undefined;
  collectionSettingDisplayName: (key: keyof RequestSettings) => string;
  collectionSettingDisplayValue: (key: keyof RequestSettings, value: RequestSettings[keyof RequestSettings]) => string;
  collectionSettingHasCustomDefault: (key: keyof RequestSettings) => boolean;
  collectionSettingIsInherited: (key: keyof RequestSettings) => boolean;
  maskedProxyUrl: (value: string) => string;
  previewNames: (names: string[], limit?: number) => string;
  snapshotActiveRequest: (options?: { forPersistence?: boolean }) => SavedRequest;
};

export const collectionDefaultsFeature = {
  currentRequestSettingsOverrides(this: CollectionDefaultsHost): RequestSettingsOverrides {
    const overrides: RequestSettingsOverrides = {};
    for (const key of REQUEST_SETTING_KEYS) {
      if (this.requestSettingsOverrides[key]) overrides[key] = true;
    }
    return overrides;
  },

  markRequestSettingOverride(this: CollectionDefaultsHost, key: keyof RequestSettings) {
    this.requestSettingsOverrides = { ...this.requestSettingsOverrides, [key]: true };
  },

  clearRequestSettingOverrides(this: CollectionDefaultsHost) {
    this.requestSettingsOverrides = {};
  },

  collectionForRequest(this: CollectionDefaultsHost, req: Pick<SavedRequest, 'collectionId'>): Collection | undefined {
    return this.collections.find(collection => collection.id === req.collectionId);
  },

  requestWithCollectionDefaults(this: CollectionDefaultsHost, req: SavedRequest): SavedRequest {
    return applyCollectionDefaultsToRequest(req, this.collectionForRequest(req));
  },

  activeRequestCollection(this: CollectionDefaultsHost): Collection | undefined {
    const collectionId = this.activeCollectionId();
    return this.collections.find(collection => collection.id === collectionId && collection.workspaceId === this.activeWorkspaceId)
      ?? this.collectionForRequest(this.snapshotActiveRequest());
  },

  previewNames(this: CollectionDefaultsHost, names: string[], limit = 4): string {
    const visible = names.slice(0, limit).join(', ');
    const extra = names.length - limit;
    return extra > 0 ? `${visible}, +${extra}` : visible;
  },

  maskedProxyUrl(this: CollectionDefaultsHost, value: string): string {
    return value.replace(/:\/\/([^:@/?#]+):([^@/?#]*)@/, '://$1:***@');
  },

  collectionSettingDisplayName(this: CollectionDefaultsHost, key: keyof RequestSettings): string {
    const labels: Record<keyof RequestSettings, string> = {
      httpVersion: 'HTTP version',
      enableSSLVerification: 'SSL verification',
      followRedirects: 'Follow redirects',
      followOriginalMethod: 'Follow original method',
      followAuthorizationHeader: 'Follow Authorization header',
      removeRefererHeader: 'Remove Referer on redirect',
      encodeUrlAutomatically: 'Encode URL',
      disableCookieJar: 'Disable cookie jar',
      maxRedirects: 'Max redirects',
      timeoutMs: 'Timeout',
      proxyUrl: 'HTTP proxy',
      browserEmulation: 'Browser emulation',
      browserOrigin: 'Browser origin',
      browserWithCredentials: 'Browser credentials',
      browserEnforceCORS: 'CORS checks',
      browserEnforceCSP: 'CSP checks',
      browserCSP: 'CSP policy',
      wsHandshakeTimeoutMs: 'WS handshake timeout',
      wsReconnectAttempts: 'WS reconnect attempts',
      wsReconnectIntervalMs: 'WS reconnect interval',
      wsMaxMessageSizeMb: 'WS max message size',
      sioClientVersion: 'Socket.IO client',
      sioPath: 'Socket.IO path',
      sioNamespace: 'Socket.IO namespace',
      grpcUseTls: 'gRPC TLS',
      grpcUseReflection: 'gRPC reflection',
      grpcServerName: 'gRPC server name',
      grpcIncludeDefaultValues: 'gRPC default values',
      grpcMaxResponseMessageSizeMb: 'gRPC max response size',
    };
    return labels[key];
  },

  collectionSettingDisplayValue(this: CollectionDefaultsHost, key: keyof RequestSettings, value: RequestSettings[keyof RequestSettings]): string {
    if (key === 'httpVersion') {
      if (value === '1.1') return 'HTTP/1.1';
      if (value === '2') return 'HTTP/2 preferred';
      return 'Auto';
    }
    if (key === 'timeoutMs' || key === 'wsHandshakeTimeoutMs' || key === 'wsReconnectIntervalMs') return `${value} ms`;
    if (key === 'wsMaxMessageSizeMb') return `${value} MB`;
    if (key === 'grpcMaxResponseMessageSizeMb') return `${value} MB`;
    if (key === 'proxyUrl') return this.maskedProxyUrl(String(value).trim());
    if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
    return String(value);
  },

  collectionSettingHasCustomDefault(this: CollectionDefaultsHost, key: keyof RequestSettings): boolean {
    const settings = this.activeRequestCollection()?.defaults.settings;
    return Boolean(settings && settings[key] !== DEFAULT_REQUEST_SETTINGS[key]);
  },

  collectionSettingIsInherited(this: CollectionDefaultsHost, key: keyof RequestSettings): boolean {
    return this.collectionSettingHasCustomDefault(key) && !this.requestSettingsOverrides[key];
  },

  collectionSettingDefaultNote(this: CollectionDefaultsHost, key: keyof RequestSettings): string {
    const settings = this.activeRequestCollection()?.defaults.settings;
    if (!settings || !this.collectionSettingHasCustomDefault(key)) return '';
    const value = settings[key];
    if (key === 'proxyUrl' && !String(value).trim()) return '';
    const prefix = this.collectionSettingIsInherited(key) ? 'Applied from collection' : 'Collection default';
    return `${prefix}: ${this.collectionSettingDisplayValue(key, value)}`;
  },

  get appliedCollectionDefaultNotes(): string[] {
    const host = this as unknown as CollectionDefaultsHost;
    const collection = host.activeRequestCollection();
    const defaults = collection?.defaults;
    if (!defaults || !collectionDefaultsHaveContent(defaults)) return [];
    const notes: string[] = [];
    const requestHeaderKeys = new Set(
      host.reqHeaders
        .filter(rowHasContent)
        .map(row => row.key.trim().toLowerCase())
        .filter(Boolean),
    );
    const headerNames = defaults.headers
      .filter(row => row.enabled && row.key.trim() && !requestHeaderKeys.has(row.key.trim().toLowerCase()))
      .map(row => row.key.trim());
    if (headerNames.length) notes.push(`Headers: ${host.previewNames(headerNames)}`);
    const variableNames = defaults.variables
      .filter(row => row.enabled && row.key.trim())
      .map(row => `${row.key.trim()}${row.secret ? ' (secret)' : ''}`);
    if (variableNames.length) notes.push(`Variables: ${host.previewNames(variableNames)}`);
    if (host.authType === 'inherit' && host.authStateHasData(defaults.auth, defaults.auth.type)) {
      notes.push(`Auth: ${host.authLabel(defaults.auth.type)}`);
    }
    const preRequestLines = scriptLineCount(defaults.preRequestScript);
    if (preRequestLines) notes.push(`Pre-request script: ${preRequestLines}L`);
    const testLines = scriptLineCount(defaults.testScript);
    if (testLines) notes.push(`Test script: ${testLines}L`);
    const settings = REQUEST_SETTING_KEYS
      .filter(key => host.collectionSettingIsInherited(key))
      .map(key => `${host.collectionSettingDisplayName(key)} ${host.collectionSettingDisplayValue(key, defaults.settings[key])}`);
    if (settings.length) notes.push(`Settings: ${host.previewNames(settings, 3)}`);
    return notes;
  },
};
