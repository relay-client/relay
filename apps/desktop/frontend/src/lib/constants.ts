import type { Method, RequestType, RawBodyType, ShortcutDefinition, AuthType, RequestSettings, KVRow, ProxyConfig } from './types/models';

export const REQUEST_TYPES: RequestType[] = ['http', 'graphql', 'ws', 'socketio', 'grpc'];

export const BROWSER_LIKE_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
export const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'SSE'];
export const RAW_BODY_TYPES: RawBodyType[] = ['text', 'json', 'html', 'xml'];

export const DEFAULT_WORKSPACE = 'My Workspace';
export const DEFAULT_COLLECTION = 'Requests';
export const MAX_WORKSPACES = 15;
export const MAX_FOLDER_DEPTH = 4;
export const MAX_FOLDER_REQUESTS = 50;

export const DEFAULT_REQUEST_SETTINGS: RequestSettings = {
  httpVersion: 'auto',
  enableSSLVerification: true,
  followRedirects: true,
  followOriginalMethod: false,
  followAuthorizationHeader: false,
  removeRefererHeader: false,
  encodeUrlAutomatically: true,
  disableCookieJar: false,
  maxRedirects: 10,
  timeoutMs: 30000,
  scriptTimeoutMs: 0,
  allowSendRequest: false,
  proxyUrl: '',
  clientCertPath: '',
  clientKeyPath: '',
  clientKeyPassword: '',
  browserEmulation: false,
  browserOrigin: '',
  browserWithCredentials: false,
  browserEnforceCORS: false,
  browserEnforceCSP: false,
  browserCSP: '',
  wsHandshakeTimeoutMs: 0,
  wsReconnectAttempts: 0,
  wsReconnectIntervalMs: 5000,
  wsMaxMessageSizeMb: 10,
  sioClientVersion: 'v3',
  sioPath: '/socket.io',
  sioNamespace: '/',
  grpcUseTls: false,
  grpcUseReflection: true,
  grpcServerName: '',
  grpcIncludeDefaultValues: true,
  grpcMaxResponseMessageSizeMb: 10,
};

export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  mode: 'off',
  protocol: 'http',
  hostname: '',
  port: 0,
  auth: { enabled: false, username: '', password: '' },
  bypass: '',
};

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'close-tab', group: 'Tabs', label: 'Close Tab', defaultCombo: 'Meta+W' },
  { id: 'force-close-tab', group: 'Tabs', label: 'Force Close Tab', defaultCombo: 'Alt+Meta+W' },
  { id: 'next-tab', group: 'Tabs', label: 'Switch To Next Tab', defaultCombo: 'Shift+Meta+]' },
  { id: 'previous-tab', group: 'Tabs', label: 'Switch To Previous Tab', defaultCombo: 'Shift+Meta+[' },
  { id: 'tab-1', group: 'Tabs', label: 'Switch To Tab 1', defaultCombo: 'Meta+1' },
  { id: 'tab-2', group: 'Tabs', label: 'Switch To Tab 2', defaultCombo: 'Meta+2' },
  { id: 'tab-3', group: 'Tabs', label: 'Switch To Tab 3', defaultCombo: 'Meta+3' },
  { id: 'tab-4', group: 'Tabs', label: 'Switch To Tab 4', defaultCombo: 'Meta+4' },
  { id: 'tab-5', group: 'Tabs', label: 'Switch To Tab 5', defaultCombo: 'Meta+5' },
  { id: 'tab-6', group: 'Tabs', label: 'Switch To Tab 6', defaultCombo: 'Meta+6' },
  { id: 'tab-7', group: 'Tabs', label: 'Switch To Tab 7', defaultCombo: 'Meta+7' },
  { id: 'tab-8', group: 'Tabs', label: 'Switch To Tab 8', defaultCombo: 'Meta+8' },
  { id: 'last-tab', group: 'Tabs', label: 'Switch To Last Tab', defaultCombo: 'Meta+9' },
  { id: 'reopen-tab', group: 'Tabs', label: 'Reopen Last Closed Tab', defaultCombo: 'Shift+Meta+T' },
  { id: 'search-sidebar', group: 'Sidebar', label: 'Search Sidebar', defaultCombo: 'Meta+F' },
  { id: 'next-item', group: 'Sidebar', label: 'Next Item', defaultCombo: 'ArrowDown' },
  { id: 'previous-item', group: 'Sidebar', label: 'Previous Item', defaultCombo: 'ArrowUp' },
  { id: 'expand-item', group: 'Sidebar', label: 'Expand Item', defaultCombo: 'ArrowRight' },
  { id: 'collapse-item', group: 'Sidebar', label: 'Collapse Item', defaultCombo: 'ArrowLeft' },
  { id: 'expand-all', group: 'Sidebar', label: 'Expand All', defaultCombo: 'Alt+ArrowRight' },
  { id: 'collapse-all', group: 'Sidebar', label: 'Collapse All', defaultCombo: 'Alt+ArrowLeft' },
  { id: 'rename-item', group: 'Sidebar', label: 'Rename Item', defaultCombo: 'Meta+E' },
  { id: 'copy-item', group: 'Sidebar', label: 'Copy Item', defaultCombo: 'Meta+C' },
  { id: 'paste-item', group: 'Sidebar', label: 'Paste Item', defaultCombo: 'Meta+V' },
  { id: 'duplicate-item', group: 'Sidebar', label: 'Duplicate Item', defaultCombo: 'Meta+D' },
  { id: 'delete-item', group: 'Sidebar', label: 'Delete Item', defaultCombo: 'Backspace' },
  { id: 'request-url', group: 'Request', label: 'Request URL', defaultCombo: 'Meta+L' },
  { id: 'send-request', group: 'Request', label: 'Send Request', defaultCombo: 'Meta+Enter' },
  { id: 'save-request', group: 'Request', label: 'Save Request', defaultCombo: 'Meta+S' },
  { id: 'new-request', group: 'Window and modals', label: 'New...', defaultCombo: 'Meta+N' },
  { id: 'settings', group: 'Window and modals', label: 'Settings', defaultCombo: 'Meta+,' },
  { id: 'shortcut-help', group: 'Window and modals', label: 'Open Shortcut Help', defaultCombo: 'Meta+/' },
  { id: 'search', group: 'Window and modals', label: 'Search', defaultCombo: 'Meta+K' },
  { id: 'toggle-left-sidebar', group: 'Interface', label: 'Toggle Left Sidebar', defaultCombo: 'Meta+\\' },
  { id: 'toggle-right-sidebar', group: 'Interface', label: 'Toggle Right Sidebar', defaultCombo: 'Alt+Meta+\\' },
];

export const AUTH_OPTIONS: { value: AuthType; label: string }[] = [
  { value: 'inherit', label: 'Inherit Auth' },
  { value: 'none', label: 'No Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'digest', label: 'Digest Auth' },
  { value: 'apikey', label: 'API Key' },
  { value: 'oauth2', label: 'OAuth 2.0 - Client Credentials' },
  { value: 'aws', label: 'AWS Signature v4' },
];

export const COLLECTION_AUTH_OPTIONS = AUTH_OPTIONS.filter(option => option.value !== 'inherit');

let _rowCounter = 0;
export function mkRow(): KVRow {
  return { id: _rowCounter++, enabled: true, key: '', value: '', description: '', secret: false };
}
