import { DEFAULT_PROXY_CONFIG, DEFAULT_REQUEST_SETTINGS, SHORTCUT_DEFINITIONS } from '../../constants';
import { normalizeProxyConfig, proxyConfigForPersistence } from '../../proxy';
import type { SettingsTab } from '../ui';
import {
  applyDocumentTheme,
  normalizeThemeSettings,
  syncNativeThemeBackground,
  THEME_KEY,
  type AppTheme,
  type AppThemeMode,
  type ThemeVariantId,
} from '../../theme';
import type { HttpVersion, ProxyConfig, RequestSettings, ScriptEngine, ShortcutId, Workspace } from '../../types/models';

type PreferencesHost = {
  autosave: boolean;
  scriptEngine: ScriptEngine;
  dirtyRequestIds: Set<string>;
  httpVersion: HttpVersion;
  enableSSLVerification: boolean;
  followRedirects: boolean;
  followOriginalMethod: boolean;
  followAuthorizationHeader: boolean;
  removeRefererHeader: boolean;
  encodeUrlAutomatically: boolean;
  disableCookieJar: boolean;
  maxRedirects: number;
  timeoutMs: number;
  proxyUrl: string;
  browserEmulation: boolean;
  browserOrigin: string;
  browserWithCredentials: boolean;
  browserEnforceCORS: boolean;
  browserEnforceCSP: boolean;
  browserCSP: string;
  wsHandshakeTimeoutMs: number;
  wsReconnectAttempts: number;
  wsReconnectIntervalMs: number;
  wsMaxMessageSizeMb: number;
  sioClientVersion: import('../../types/models').SocketIOClientVersion;
  sioPath: string;
  sioNamespace: string;
  grpcUseTls: boolean;
  grpcUseReflection: boolean;
  grpcServerName: string;
  grpcIncludeDefaultValues: boolean;
  grpcMaxResponseMessageSizeMb: number;
  settingsSaved: boolean;
  shortcutOverrides: Record<string, string>;
  shortcutEditingId: ShortcutId | '';
  shortcutCaptureMessage: string;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  appRuntime: string;
  appTheme: AppTheme;
  resolvedAppTheme: 'dark' | 'light';
  proxyConfig: ProxyConfig;
  activeWorkspaceId: string;
  workspaces: Workspace[];
  activeWorkspace: Workspace | undefined;
  closeFloatingMenus: () => void;
  openConfirmDialog: (title: string, message: string, confirmLabel?: string) => Promise<boolean>;
  persistRequestStore: () => Promise<boolean>;
  persistActiveRequestNow: (forceDisk?: boolean) => Promise<void>;
  saveDirtyRequestsToDisk: () => Promise<void>;
  currentRequestSettings: () => RequestSettings;
  applyRequestSettings: (settings: Partial<RequestSettings>) => void;
  saveShortcutSettings: () => void;
  markRequestSettingOverride?: (key: keyof RequestSettings) => void;
  clearRequestSettingOverrides?: () => void;
  shortcutCombo: (id: ShortcutId) => string;
  shortcutKeyLabel: (key: string) => string;
  normalizeShortcutKey: (key: string) => string;
  eventToCombo: (event: KeyboardEvent) => string;
  applyTheme: (theme?: AppTheme) => void;
  setTheme: (theme: AppTheme) => void;
};

const SETTINGS_STORAGE_KEY = 'relay.request.settings.v1';
const SHORTCUT_STORAGE_KEY = 'relay.shortcuts.v1';
const AUTOSAVE_STORAGE_KEY = 'relay.autosave.v1';
const PROXY_STORAGE_KEY = 'relay.proxy.v1';
const SCRIPT_ENGINE_STORAGE_KEY = 'relay.scriptEngine.v1';

export function shortcutPlatform(runtime = ''): string {
  const fromRuntime = runtime.split('/')[0];
  if (fromRuntime) return fromRuntime;
  if (typeof document !== 'undefined') return document.documentElement.dataset.platform ?? 'browser';
  return 'browser';
}

export function usesMacShortcutGlyphs(runtime = ''): boolean {
  return shortcutPlatform(runtime) === 'darwin';
}

export function platformShortcutCombo(combo: string, runtime = ''): string {
  if (!combo || usesMacShortcutGlyphs(runtime)) return combo;
  return combo.split('+').map(part => (part === 'Meta' ? 'Ctrl' : part)).join('+');
}

export function shortcutKeyLabelForPlatform(key: string, runtime = ''): string {
  const map = usesMacShortcutGlyphs(runtime)
    ? { Meta: '⌘', Shift: '⇧', Alt: '⌥', Ctrl: '⌃', Enter: '↵', Backspace: '⌫', Delete: '⌦', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ' ': 'Space', Space: 'Space' }
    : { Meta: 'Win', Shift: 'Shift', Alt: 'Alt', Ctrl: 'Ctrl', Enter: 'Enter', Backspace: 'Backspace', Delete: 'Del', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ' ': 'Space', Space: 'Space' };
  return (map as Record<string, string>)[key] ?? key.toUpperCase();
}

export function shortcutComboLabel(combo: string, runtime = ''): string {
  const platformCombo = platformShortcutCombo(combo, runtime);
  return platformCombo ? platformCombo.split('+').map(key => shortcutKeyLabelForPlatform(key, runtime)).join(' ') : 'Unassigned';
}

function persistProxyConfigSansPassword(config: ProxyConfig): void {
  try {
    localStorage.setItem(PROXY_STORAGE_KEY, JSON.stringify(proxyConfigForPersistence(config)));
  } catch {}
}

export const preferencesFeature = {
  currentRequestSettings(this: PreferencesHost): RequestSettings {
    return {
      httpVersion: this.httpVersion,
      enableSSLVerification: this.enableSSLVerification,
      followRedirects: this.followRedirects,
      followOriginalMethod: this.followOriginalMethod,
      followAuthorizationHeader: this.followAuthorizationHeader,
      removeRefererHeader: this.removeRefererHeader,
      encodeUrlAutomatically: this.encodeUrlAutomatically,
      disableCookieJar: this.disableCookieJar,
      maxRedirects: this.maxRedirects,
      timeoutMs: this.timeoutMs,
      proxyUrl: this.proxyUrl,
      browserEmulation: this.browserEmulation,
      browserOrigin: this.browserOrigin,
      browserWithCredentials: this.browserWithCredentials,
      browserEnforceCORS: this.browserEnforceCORS,
      browserEnforceCSP: this.browserEnforceCSP,
      browserCSP: this.browserCSP,
      wsHandshakeTimeoutMs: this.wsHandshakeTimeoutMs,
      wsReconnectAttempts: this.wsReconnectAttempts,
      wsReconnectIntervalMs: this.wsReconnectIntervalMs,
      wsMaxMessageSizeMb: this.wsMaxMessageSizeMb,
      sioClientVersion: this.sioClientVersion,
      sioPath: this.sioPath,
      sioNamespace: this.sioNamespace,
      grpcUseTls: this.grpcUseTls,
      grpcUseReflection: this.grpcUseReflection,
      grpcServerName: this.grpcServerName,
      grpcIncludeDefaultValues: this.grpcIncludeDefaultValues,
      grpcMaxResponseMessageSizeMb: this.grpcMaxResponseMessageSizeMb,
    };
  },
  applyRequestSettings(this: PreferencesHost, settings: Partial<RequestSettings>) {
    this.httpVersion = settings.httpVersion ?? DEFAULT_REQUEST_SETTINGS.httpVersion;
    this.enableSSLVerification = settings.enableSSLVerification ?? DEFAULT_REQUEST_SETTINGS.enableSSLVerification;
    this.followRedirects = settings.followRedirects ?? DEFAULT_REQUEST_SETTINGS.followRedirects;
    this.followOriginalMethod = settings.followOriginalMethod ?? DEFAULT_REQUEST_SETTINGS.followOriginalMethod;
    this.followAuthorizationHeader = settings.followAuthorizationHeader ?? DEFAULT_REQUEST_SETTINGS.followAuthorizationHeader;
    this.removeRefererHeader = settings.removeRefererHeader ?? DEFAULT_REQUEST_SETTINGS.removeRefererHeader;
    this.encodeUrlAutomatically = settings.encodeUrlAutomatically ?? DEFAULT_REQUEST_SETTINGS.encodeUrlAutomatically;
    this.disableCookieJar = settings.disableCookieJar ?? DEFAULT_REQUEST_SETTINGS.disableCookieJar;
    this.maxRedirects = settings.maxRedirects ?? DEFAULT_REQUEST_SETTINGS.maxRedirects;
    this.timeoutMs = settings.timeoutMs ?? DEFAULT_REQUEST_SETTINGS.timeoutMs;
    this.proxyUrl = settings.proxyUrl ?? DEFAULT_REQUEST_SETTINGS.proxyUrl;
    this.browserEmulation = settings.browserEmulation ?? DEFAULT_REQUEST_SETTINGS.browserEmulation;
    this.browserOrigin = settings.browserOrigin ?? DEFAULT_REQUEST_SETTINGS.browserOrigin;
    this.browserWithCredentials = settings.browserWithCredentials ?? DEFAULT_REQUEST_SETTINGS.browserWithCredentials;
    this.browserEnforceCORS = settings.browserEnforceCORS ?? DEFAULT_REQUEST_SETTINGS.browserEnforceCORS;
    this.browserEnforceCSP = settings.browserEnforceCSP ?? DEFAULT_REQUEST_SETTINGS.browserEnforceCSP;
    this.browserCSP = settings.browserCSP ?? DEFAULT_REQUEST_SETTINGS.browserCSP;
    this.wsHandshakeTimeoutMs = settings.wsHandshakeTimeoutMs ?? DEFAULT_REQUEST_SETTINGS.wsHandshakeTimeoutMs;
    this.wsReconnectAttempts = settings.wsReconnectAttempts ?? DEFAULT_REQUEST_SETTINGS.wsReconnectAttempts;
    this.wsReconnectIntervalMs = settings.wsReconnectIntervalMs ?? DEFAULT_REQUEST_SETTINGS.wsReconnectIntervalMs;
    this.wsMaxMessageSizeMb = settings.wsMaxMessageSizeMb ?? DEFAULT_REQUEST_SETTINGS.wsMaxMessageSizeMb;
    this.sioClientVersion = settings.sioClientVersion ?? DEFAULT_REQUEST_SETTINGS.sioClientVersion;
    this.sioPath = settings.sioPath ?? DEFAULT_REQUEST_SETTINGS.sioPath;
    this.sioNamespace = settings.sioNamespace ?? DEFAULT_REQUEST_SETTINGS.sioNamespace;
    this.grpcUseTls = settings.grpcUseTls ?? DEFAULT_REQUEST_SETTINGS.grpcUseTls;
    this.grpcUseReflection = settings.grpcUseReflection ?? DEFAULT_REQUEST_SETTINGS.grpcUseReflection;
    this.grpcServerName = settings.grpcServerName ?? DEFAULT_REQUEST_SETTINGS.grpcServerName;
    this.grpcIncludeDefaultValues = settings.grpcIncludeDefaultValues ?? DEFAULT_REQUEST_SETTINGS.grpcIncludeDefaultValues;
    this.grpcMaxResponseMessageSizeMb = settings.grpcMaxResponseMessageSizeMb ?? DEFAULT_REQUEST_SETTINGS.grpcMaxResponseMessageSizeMb;
  },
  loadRequestSettings(this: PreferencesHost) {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) this.applyRequestSettings(JSON.parse(raw));
    } catch {
      this.applyRequestSettings(DEFAULT_REQUEST_SETTINGS);
    }
  },
  saveRequestSettings(this: PreferencesHost) {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.currentRequestSettings()));
    this.settingsSaved = true;
    setTimeout(() => (this.settingsSaved = false), 1600);
  },
  resetRequestSettings(this: PreferencesHost) {
    this.applyRequestSettings(DEFAULT_REQUEST_SETTINGS);
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    this.clearRequestSettingOverrides?.();
  },
  async toggleSSLVerification(this: PreferencesHost) {
    if (this.enableSSLVerification) {
      const confirmed = await this.openConfirmDialog(
        'Disable SSL verification',
        'Disabling SSL verification exposes this request to man-in-the-middle attacks. Only use this against trusted hosts in a controlled environment.',
        'Disable'
      );
      if (confirmed) {
        this.enableSSLVerification = false;
        this.markRequestSettingOverride?.('enableSSLVerification');
      }
    } else {
      this.enableSSLVerification = true;
      this.markRequestSettingOverride?.('enableSSLVerification');
    }
  },
  loadShortcutSettings(this: PreferencesHost) {
    try {
      const raw = localStorage.getItem(SHORTCUT_STORAGE_KEY);
      this.shortcutOverrides = raw ? JSON.parse(raw) : {};
    } catch {
      this.shortcutOverrides = {};
    }
  },
  saveShortcutSettings(this: PreferencesHost) {
    localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(this.shortcutOverrides));
  },
  shortcutCombo(this: PreferencesHost, id: ShortcutId) {
    const override = this.shortcutOverrides[id];
    if (override !== undefined) return override;
    const defaultCombo = SHORTCUT_DEFINITIONS.find(definition => definition.id === id)?.defaultCombo ?? '';
    return platformShortcutCombo(defaultCombo, this.appRuntime);
  },
  shortcutGroups() {
    const groups: { name: string; items: typeof SHORTCUT_DEFINITIONS }[] = [];
    for (const item of SHORTCUT_DEFINITIONS) {
      let group = groups.find(candidate => candidate.name === item.group);
      if (!group) {
        group = { name: item.group, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  },
  shortcutKeyLabel(this: PreferencesHost, key: string) {
    return shortcutKeyLabelForPlatform(key, this.appRuntime);
  },
  shortcutKeycaps(this: PreferencesHost, combo: string) {
    return combo ? combo.split('+').map(key => this.shortcutKeyLabel(key)) : ['Unassigned'];
  },
  normalizeShortcutKey(this: PreferencesHost, key: string) {
    if (key === ' ') return 'Space';
    if (key === 'Esc') return 'Escape';
    if (key.length === 1) return key.toUpperCase();
    return key;
  },
  eventToCombo(this: PreferencesHost, event: KeyboardEvent) {
    const key = this.normalizeShortcutKey(event.key);
    if (['Meta', 'Control', 'Shift', 'Alt'].includes(event.key)) return '';
    const parts: string[] = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
    parts.push(key);
    return parts.join('+');
  },
  shortcutForEvent(this: PreferencesHost, event: KeyboardEvent) {
    const combo = this.eventToCombo(event);
    if (!combo) return null;
    return SHORTCUT_DEFINITIONS.find(definition => this.shortcutCombo(definition.id) === combo)?.id ?? null;
  },
  setShortcut(this: PreferencesHost, id: ShortcutId, combo: string) {
    const defaultCombo = platformShortcutCombo(SHORTCUT_DEFINITIONS.find(definition => definition.id === id)?.defaultCombo ?? '', this.appRuntime);
    const next = { ...this.shortcutOverrides };
    for (const definition of SHORTCUT_DEFINITIONS) {
      if (definition.id !== id && this.shortcutCombo(definition.id) === combo) next[definition.id] = '';
    }
    if (combo === defaultCombo) delete next[id];
    else next[id] = combo;
    this.shortcutOverrides = next;
    this.saveShortcutSettings();
  },
  resetShortcut(this: PreferencesHost, id: ShortcutId) {
    const next = { ...this.shortcutOverrides };
    delete next[id];
    this.shortcutOverrides = next;
    this.saveShortcutSettings();
  },
  resetAllShortcuts(this: PreferencesHost) {
    this.shortcutOverrides = {};
    this.shortcutEditingId = '';
    this.shortcutCaptureMessage = '';
    this.saveShortcutSettings();
  },
  startShortcutCapture(this: PreferencesHost, id: ShortcutId) {
    this.shortcutEditingId = id;
    this.shortcutCaptureMessage = 'Press a new shortcut';
  },
  openShortcutHelp(this: PreferencesHost) {
    this.closeFloatingMenus();
    this.shortcutsOpen = true;
    this.shortcutEditingId = '';
    this.shortcutCaptureMessage = '';
  },
  closeShortcutHelp(this: PreferencesHost) {
    this.shortcutsOpen = false;
    this.shortcutEditingId = '';
    this.shortcutCaptureMessage = '';
  },
  loadTheme(this: PreferencesHost) {
    const { appTheme, resolvedAppTheme, themeVariant } = applyDocumentTheme();
    this.appTheme = appTheme;
    this.resolvedAppTheme = resolvedAppTheme;
    syncNativeThemeBackground(resolvedAppTheme, themeVariant);
  },
  applyTheme(this: PreferencesHost, theme: AppTheme = this.appTheme) {
    const { appTheme, resolvedAppTheme, themeVariant } = applyDocumentTheme(theme);
    this.appTheme = appTheme;
    this.resolvedAppTheme = resolvedAppTheme;
    syncNativeThemeBackground(resolvedAppTheme, themeVariant);
  },
  setTheme(this: PreferencesHost, theme: AppTheme) {
    this.appTheme = normalizeThemeSettings(theme);
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify(this.appTheme));
    } catch {}
    this.applyTheme(this.appTheme);
  },
  setThemeMode(this: PreferencesHost, mode: AppThemeMode) {
    this.setTheme({ ...this.appTheme, mode });
  },
  setThemeVariant(this: PreferencesHost, id: ThemeVariantId) {
    const next = id.startsWith('light') || id === 'catppuccin-latte' || id === 'vscode-light'
      ? { ...this.appTheme, light: id as AppTheme['light'] }
      : { ...this.appTheme, dark: id as AppTheme['dark'] };
    this.setTheme(next);
  },
  loadAutosaveSettings(this: PreferencesHost) {
    try {
      const raw = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
      if (raw !== null) this.autosave = raw !== 'false';
    } catch {}
  },
  setAutosave(this: PreferencesHost, value: boolean) {
    this.autosave = value;
    localStorage.setItem(AUTOSAVE_STORAGE_KEY, String(value));
    if (value) {
      void this.saveDirtyRequestsToDisk();
    } else {
      void this.persistActiveRequestNow(true);
    }
  },
  loadScriptEngine(this: PreferencesHost) {
    try {
      const raw = localStorage.getItem(SCRIPT_ENGINE_STORAGE_KEY);
      if (raw === 'js' || raw === 'tengo') this.scriptEngine = raw;
    } catch {}
  },
  setScriptEngine(this: PreferencesHost, value: ScriptEngine) {
    this.scriptEngine = value;
    try {
      localStorage.setItem(SCRIPT_ENGINE_STORAGE_KEY, value);
    } catch {}
  },
  loadProxyConfig(this: PreferencesHost) {
    try {
      const raw = localStorage.getItem(PROXY_STORAGE_KEY);
      this.proxyConfig = normalizeProxyConfig(raw ? JSON.parse(raw) : DEFAULT_PROXY_CONFIG);
    } catch {
      this.proxyConfig = normalizeProxyConfig(DEFAULT_PROXY_CONFIG);
    }


    if (this.proxyConfig.auth.password) persistProxyConfigSansPassword(this.proxyConfig);
  },
  setProxyConfig(this: PreferencesHost, next: ProxyConfig) {
    this.proxyConfig = normalizeProxyConfig(next);
    persistProxyConfigSansPassword(this.proxyConfig);
  },
};
