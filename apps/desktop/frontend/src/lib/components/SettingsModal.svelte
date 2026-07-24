<script lang="ts">
  import { untrack } from 'svelte';
  import { tabListKeyboard, trapFocus } from '../a11y';
  import type { SettingsTab } from '../stores/ui';
  import type { UpdateInfo } from '../backend';
  import type { ProxyConfig, ProxyMode, ProxyProtocol, ScriptEngine, ShortcutId } from '../types/models';
  import {
    DARK_THEME_VARIANTS,
    LIGHT_THEME_VARIANTS,
    type AppTheme,
    type AppThemeMode,
    type ThemeVariant,
    type ThemeVariantId,
  } from '../theme';
  import { checkForUpdate, applyUpdate, restartApp, getAppInfo } from '../backend';
  import { cleanReleaseNotes } from '../releaseNotes';
  import { friendlyUpdateError } from '../updateErrors';
  import { shortcutComboLabel } from '../stores/features/preferences';

  function openExternalURL(url: string) {
    if (window.runtime?.BrowserOpenURL) {
      window.runtime.BrowserOpenURL(url);
    } else {
      window.open(url, '_blank');
    }
  }

  type ShortcutGroup = {
    name: string;
    items: Array<{ id: ShortcutId; label: string }>;
  };
  type UpdateState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'installing' | 'ready' | 'error';

  type SettingsNavItem = {
    id: SettingsTab;
    label: string;
    keywords: string;
  };

  function inputValue(event: Event): string {
    return event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
  }

  function inputChecked(event: Event): boolean {
    return event.currentTarget instanceof HTMLInputElement ? event.currentTarget.checked : false;
  }

  const NAV_ITEMS: SettingsNavItem[] = [
    { id: 'general', label: 'General', keywords: 'general saving autosave manual save default location workspace collection folder data export import backup script engine javascript tengo' },
    { id: 'theme', label: 'Theme', keywords: 'theme appearance dark light system color scheme' },
    { id: 'proxy', label: 'Proxy', keywords: 'proxy http https socks5 system bypass network hostname port credentials' },
    { id: 'shortcuts', label: 'Shortcuts', keywords: 'shortcuts keybindings keyboard hotkeys' },
    { id: 'updates', label: 'Updates', keywords: 'updates version release notes upgrade' },
    { id: 'support', label: 'Support', keywords: 'support report issues bug github questions telegram help' },
    { id: 'about', label: 'About', keywords: 'about version platform runtime auto update install' },
  ];

  let {
    settingsTab = $bindable<SettingsTab>('general'),
    shortcutCaptureMessage,
    shortcutEditingId,
    appRuntime = '',
    appTheme,
    autosave,
    scriptEngine,
    setScriptEngine,
    shortcutGroups,
    shortcutCombo,
    shortcutKeycaps,
    startShortcutCapture,
    resetShortcut,
    resetAllShortcuts,
    setThemeMode,
    setThemeVariant,
    proxyConfig,
    setProxyConfig,
    setAutosave,
    defaultWorkspaceLocationDraft,
    defaultWorkspaceLocationStatus,
    setDefaultWorkspaceLocationDraft,
    saveDefaultWorkspaceLocation,
    browseDefaultWorkspaceLocation,
    exportAllData,
    importAllData,
    dataTransferStatus,
    onClose,
    startupUpdateInfo = null,
    startupUpdateReady = false,
    autoUpdateInstall = false,
    autoUpdateInstalling = false,
    setAutoUpdateInstall,
    onUpdateInstalled = () => {},
    whatsNewAvailable = false,
    onShowWhatsNew = () => {},
  }: {
    settingsTab: SettingsTab;
    shortcutCaptureMessage: string;
    shortcutEditingId: string;
    appRuntime?: string;
    appTheme: AppTheme;
    autosave: boolean;
    scriptEngine: ScriptEngine;
    setScriptEngine: (value: ScriptEngine) => void;
    shortcutGroups: () => ShortcutGroup[];
    shortcutCombo: (id: ShortcutId) => string;
    shortcutKeycaps: (combo: string) => string[];
    startShortcutCapture: (id: ShortcutId) => void;
    resetShortcut: (id: ShortcutId) => void;
    resetAllShortcuts: () => void;
    setThemeMode: (mode: AppThemeMode) => void;
    setThemeVariant: (id: ThemeVariantId) => void;
    proxyConfig: ProxyConfig;
    setProxyConfig: (next: ProxyConfig) => void;
    setAutosave: (value: boolean) => void;
    defaultWorkspaceLocationDraft: string;
    defaultWorkspaceLocationStatus: string;
    setDefaultWorkspaceLocationDraft: (path: string) => void;
    saveDefaultWorkspaceLocation: () => Promise<void> | void;
    browseDefaultWorkspaceLocation: () => Promise<void> | void;
    exportAllData: () => Promise<void> | void;
    importAllData: () => Promise<void> | void;
    dataTransferStatus: string;
    onClose: () => void;
    startupUpdateInfo?: UpdateInfo | null;
    startupUpdateReady?: boolean;
    autoUpdateInstall?: boolean;
    autoUpdateInstalling?: boolean;
    setAutoUpdateInstall: (value: boolean) => void;
    onUpdateInstalled?: (info: UpdateInfo) => void;
    whatsNewAvailable?: boolean;
    onShowWhatsNew?: () => void;
  } = $props();

  const UPDATE_READY_KEY = 'relay:update-ready';

  const _pendingRestart = localStorage.getItem(UPDATE_READY_KEY);
  const _initialUpdate = untrack(() => startupUpdateInfo);
  const _initialUpdateReady = untrack(() => startupUpdateReady);
  const _initialAutoUpdateInstalling = untrack(() => autoUpdateInstalling);
  let updateState = $state<UpdateState>(
    _pendingRestart || _initialUpdateReady ? 'ready' : (_initialAutoUpdateInstalling ? 'installing' : (_initialUpdate ? 'available' : 'idle'))
  );
  let updateInfo = $state<UpdateInfo | null>(_initialUpdate ?? null);
  let updateError = $state('');
  let manualUpdateInstalling = $state(false);
  let currentVersion = $state('');
  let isDevBuild = $derived(currentVersion === 'dev');


  let settingsQuery = $state('');
  let saveShortcut = $derived(shortcutComboLabel('Meta+S', appRuntime));
  let normalizedQuery = $derived(settingsQuery.trim().toLowerCase());
  let filteredNav = $derived(
    !normalizedQuery
      ? NAV_ITEMS
      : NAV_ITEMS.filter(item =>
          item.label.toLowerCase().includes(normalizedQuery) ||
          item.keywords.toLowerCase().includes(normalizedQuery),
        ),
  );

  function matchesQuery(...needles: string[]): boolean {
    if (!normalizedQuery) return true;
    return needles.some(n => n.toLowerCase().includes(normalizedQuery));
  }


  let generalSavingOpen = $state(false);
  let generalScriptsOpen = $state(false);
  let generalLocationOpen = $state(false);
  let generalAdvancedOpen = $state(false);


  function onNavKeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
    const items = filteredNav;
    if (!items.length) return;
    const currentIdx = items.findIndex(item => item.id === settingsTab);
    let nextIdx = currentIdx;
    if (event.key === 'ArrowDown') nextIdx = currentIdx >= 0 ? (currentIdx + 1) % items.length : 0;
    else if (event.key === 'ArrowUp') nextIdx = currentIdx >= 0 ? (currentIdx - 1 + items.length) % items.length : items.length - 1;
    else if (event.key === 'Home') nextIdx = 0;
    else if (event.key === 'End') nextIdx = items.length - 1;
    if (nextIdx === currentIdx || nextIdx < 0) return;
    event.preventDefault();
    settingsTab = items[nextIdx].id;
  }


  type AboutInfo = { version: string; platform: string; arch: string; runtime: string };
  type NavigatorWithUAData = Navigator & {
    userAgentData: {
      getHighEntropyValues: (hints: string[]) => Promise<{ architecture: string }>;
    };
  };

  let aboutInfo = $state<AboutInfo | null>(null);

  function hasUAData(nav: Navigator): nav is NavigatorWithUAData {
    return 'userAgentData' in nav;
  }

  function rememberCurrentVersion(version: string) {
    currentVersion = version;
    const pendingReadyVersion = localStorage.getItem(UPDATE_READY_KEY);
    if (pendingReadyVersion && pendingReadyVersion === version) {
      localStorage.removeItem(UPDATE_READY_KEY);
      if (updateState === 'ready') updateState = 'idle';
    }
  }

  $effect(() => {
    if ((settingsTab === 'updates' || settingsTab === 'about') && !currentVersion) {
      void getAppInfo().then(info => { rememberCurrentVersion(info.version); });
    }
    if (settingsTab === 'about' && !aboutInfo) {
      void (async () => {
        const info = await getAppInfo();
        rememberCurrentVersion(info.version);
        const platformKey = document.documentElement.dataset.platform ?? '';
        const platformLabel: Record<string, string> = { darwin: 'macOS', windows: 'Windows', linux: 'Linux' };
        let arch = 'unknown';
        try {
          if (hasUAData(navigator)) {
            const ua = await navigator.userAgentData.getHighEntropyValues(['architecture']);
            arch = ua.architecture || arch;
          } else {
            const ua = navigator.userAgent;
            if (/arm64|aarch64/i.test(ua)) arch = 'arm64';
            else if (/x86_64|x64|amd64|WOW64/i.test(ua)) arch = 'x86_64';
          }
        } catch {}
        aboutInfo = {
          version: info.version,
          platform: platformLabel[platformKey] ?? platformKey,
          arch,
          runtime: info.goVersion,
        };
      })();
    }
  });

  $effect(() => {
    const info = startupUpdateInfo;
    if (info) updateInfo = info;

    if (startupUpdateReady && info) {
      updateError = '';
      updateState = 'ready';
      return;
    }
    if (autoUpdateInstalling && info) {
      updateError = '';
      updateState = 'installing';
      return;
    }
    if (info && updateState === 'installing' && !manualUpdateInstalling) {
      updateState = 'available';
      return;
    }
    if (info && updateState === 'idle') {
      updateState = 'available';
    }
  });

  async function handleCheck() {
    if (isDevBuild) return;
    updateState = 'checking';
    updateError = '';
    try {
      const result = await checkForUpdate();
      if (result.error) {
        updateError = friendlyUpdateError(result.error, 'check for updates');
        updateState = 'error';
      } else if (result.info) {
        updateInfo = result.info;
        updateState = 'available';
      } else {
        updateInfo = null;
        updateState = 'up-to-date';
      }
    } catch (err) {
      updateError = friendlyUpdateError(err instanceof Error ? err.message : String(err), 'check for updates');
      updateState = 'error';
    }
  }

  async function handleInstall() {
    if (isDevBuild) return;
    if (!updateInfo) return;
    manualUpdateInstalling = true;
    updateState = 'installing';
    updateError = '';
    try {
      const err = await applyUpdate(updateInfo);
      if (err) {
        updateError = friendlyUpdateError(err, 'install the update');
        updateState = 'error';
      } else {
        localStorage.setItem(UPDATE_READY_KEY, updateInfo.version);
        onUpdateInstalled(updateInfo);
        updateState = 'ready';
      }
    } catch (err) {
      updateError = friendlyUpdateError(err instanceof Error ? err.message : String(err), 'install the update');
      updateState = 'error';
    } finally {
      manualUpdateInstalling = false;
    }
  }

  function handleRestart() {
    localStorage.removeItem(UPDATE_READY_KEY);
    void restartApp();
  }

  function handleAutoUpdateToggle(event: Event) {
    const enabled = inputChecked(event);
    setAutoUpdateInstall(enabled);
    if (enabled && updateState === 'available' && updateInfo && !isDevBuild) {
      void handleInstall();
    }
  }

  function handleDefaultLocationKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void saveDefaultWorkspaceLocation();
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  }

  let proxyPasswordVisible = $state(false);
  const PROXY_MODES: { value: ProxyMode; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'on', label: 'On' },
    { value: 'system', label: 'System Proxy' },
  ];
  const PROXY_PROTOCOLS: ProxyProtocol[] = ['http', 'https', 'socks5'];

  function updateProxy(patch: Partial<ProxyConfig>) {
    setProxyConfig({ ...proxyConfig, ...patch });
  }
  function updateProxyAuth(patch: Partial<ProxyConfig['auth']>) {
    setProxyConfig({ ...proxyConfig, auth: { ...proxyConfig.auth, ...patch } });
  }
  function proxyPortInput(event: Event) {
    const raw = inputValue(event);
    const value = Number(raw);
    updateProxy({ port: Number.isFinite(value) && value > 0 ? Math.floor(value) : 0 });
  }

  function themePreviewStyle(variant: ThemeVariant): string {
    const { background, surface, rail, border, accent, text } = variant.preview;
    return [
      `--theme-card-bg: ${background}`,
      `--theme-card-surface: ${surface}`,
      `--theme-card-rail: ${rail}`,
      `--theme-card-border: ${border}`,
      `--theme-card-accent: ${accent}`,
      `--theme-card-text: ${text}`,
    ].join('; ');
  }

</script>

<div class="settings-backdrop" role="presentation" onmousedown={(event) => event.target === event.currentTarget && onClose()}>
  <div class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" tabindex="-1" use:trapFocus>
    <div class="settings-modal-head">
      <h2 id="settings-modal-title">Settings</h2>
      <button class="settings-close" type="button" onclick={onClose} aria-label="Close settings">×</button>
    </div>

    <div class="settings-layout">
      <nav class="settings-sidebar" aria-label="Settings navigation">
        <div class="settings-search">
          <svg width="12" height="12" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <circle cx="5.8" cy="5.8" r="3.8" stroke="currentColor" stroke-width="1.3"/>
            <path d="M8.7 8.7l2.7 2.7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          <input
            bind:value={settingsQuery}
            placeholder="Search…"
            spellcheck="false"
            aria-label="Search settings"
            type="search"
            data-autofocus
          />
        </div>
        <div class="settings-nav-list" role="tablist" aria-orientation="vertical" tabindex="-1" onkeydown={onNavKeydown} use:tabListKeyboard>
          {#each filteredNav as item (item.id)}
            <button
              class="settings-nav-item"
              class:active={settingsTab === item.id}
              class:settings-nav-about={item.id === 'about'}
              type="button"
              role="tab"
              aria-selected={settingsTab === item.id}
              aria-controls={`settings-panel-${item.id}`}
              tabindex={settingsTab === item.id ? 0 : -1}
              onclick={() => (settingsTab = item.id)}
            >
              {#if item.id === 'general'}
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                  <circle cx="7.5" cy="7.5" r="2.2" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M7.5 1.5v1.2M7.5 12.3v1.2M1.5 7.5h1.2M12.3 7.5h1.2M3.4 3.4l.85.85M10.75 10.75l.85.85M3.4 11.6l.85-.85M10.75 4.25l.85-.85" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
              {:else if item.id === 'theme'}
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                  <circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M7.5 1.5v1.5M7.5 12v1.5M1.5 7.5H3M12 7.5h1.5M3.2 3.2l1.1 1.1M10.7 10.7l1.1 1.1M3.2 11.8l1.1-1.1M10.7 4.3l1.1-1.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
              {:else if item.id === 'proxy'}
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                  <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M1.5 7.5h12M7.5 1.5c2 2 2 10 0 12M7.5 1.5c-2 2-2 10 0 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
              {:else if item.id === 'shortcuts'}
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                  <rect x="1.5" y="3.5" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
                  <rect x="3.5" y="5.5" width="1.5" height="1.5" rx="0.3" fill="currentColor"/>
                  <rect x="7" y="5.5" width="1.5" height="1.5" rx="0.3" fill="currentColor"/>
                  <rect x="10" y="5.5" width="1.5" height="1.5" rx="0.3" fill="currentColor"/>
                  <rect x="3.5" y="8" width="1.5" height="1.5" rx="0.3" fill="currentColor"/>
                  <rect x="6.25" y="8" width="3" height="1.5" rx="0.3" fill="currentColor"/>
                  <rect x="10" y="8" width="1.5" height="1.5" rx="0.3" fill="currentColor"/>
                </svg>
              {:else if item.id === 'updates'}
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                  <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M7.5 4.5v6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  <path d="M4.5 8l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {:else if item.id === 'support'}
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                  <path d="M2.2 6.8c0-2.8 2.2-4.8 5.3-4.8s5.3 2 5.3 4.8-2.2 4.8-5.3 4.8c-.7 0-1.4-.1-2-.3l-2.4 1 .7-2.1c-1-.9-1.6-2-1.6-3.4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                  <path d="M5.4 6h4.2M5.4 8.3h2.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
              {:else if item.id === 'about'}
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                  <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M7.5 6.5v5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  <circle cx="7.5" cy="4.5" r="0.8" fill="currentColor"/>
                </svg>
              {/if}
              {item.label}
            </button>
          {/each}
          {#if filteredNav.length === 0}
            <p class="settings-nav-empty">No settings match "{settingsQuery}"</p>
          {/if}
        </div>
      </nav>

      {#if settingsTab === 'shortcuts'}
        <div class="settings-body" id="settings-panel-shortcuts" role="tabpanel">
          <div class="shortcut-modal-head">
            <p>{shortcutCaptureMessage || 'Click a shortcut to record a new combination.'}</p>
            <button class="btn-secondary btn-sm" type="button" onclick={resetAllShortcuts}>Reset all</button>
          </div>
          <div class="shortcut-list">
            {#each shortcutGroups() as group}
              <div class="shortcut-group">
                <h3>{group.name}</h3>
                {#each group.items as shortcut}
                  <div class="shortcut-row" class:editing={shortcutEditingId === shortcut.id}>
                    <span>{shortcut.label}</span>
                    <div class="shortcut-controls">
                      <button class="shortcut-combo" type="button" onclick={() => startShortcutCapture(shortcut.id)}>
                        {#if shortcutEditingId === shortcut.id}
                          <span class="shortcut-recording">Recording...</span>
                        {:else}
                          {#each shortcutKeycaps(shortcutCombo(shortcut.id)) as keycap}
                            <kbd>{keycap}</kbd>
                          {/each}
                        {/if}
                      </button>
                      <button class="shortcut-reset" type="button" onclick={() => resetShortcut(shortcut.id)} aria-label="Reset shortcut">↺</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if settingsTab === 'theme'}
        <div class="settings-body settings-theme" id="settings-panel-theme" role="tabpanel">
          <div class="theme-mode-options" role="group" aria-label="Theme mode">
            <button class="theme-mode-option" class:active={appTheme.mode === 'light'} type="button" onclick={() => setThemeMode('light')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.4"/>
                <path d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
              <span>Light</span>
            </button>
            <button class="theme-mode-option" class:active={appTheme.mode === 'dark'} type="button" onclick={() => setThemeMode('dark')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M13.2 10.5A5.8 5.8 0 015.5 2.8 6.2 6.2 0 1013.2 10.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
              </svg>
              <span>Dark</span>
            </button>
            <button class="theme-mode-option" class:active={appTheme.mode === 'system'} type="button" onclick={() => setThemeMode('system')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="2.2" y="3" width="11.6" height="8" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
                <path d="M6 14h4M8 11v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
              <span>System</span>
            </button>
          </div>

          <div class="theme-section">
            <p class="settings-section-label">Light theme</p>
            <div class="theme-variant-grid">
              {#each LIGHT_THEME_VARIANTS as variant}
                <button
                  class="theme-variant-card"
                  class:active={appTheme.light === variant.id}
                  type="button"
                  onclick={() => setThemeVariant(variant.id)}
                >
                  <div class="theme-card-preview" style={themePreviewStyle(variant)} aria-hidden="true">
                    <span class="tcp-rail">
                      <span class="tcp-rail-dot"></span>
                      <span class="tcp-rail-bar"></span>
                      <span class="tcp-rail-bar"></span>
                    </span>
                    <span class="tcp-main">
                      <span class="tcp-bar">
                        <span class="tcp-chip"></span>
                        <span class="tcp-url"></span>
                      </span>
                      <span class="tcp-line wide"></span>
                      <span class="tcp-line"></span>
                      <span class="tcp-line short"></span>
                    </span>
                  </div>
                  <span class="theme-variant-name">{variant.name}</span>
                  <span class="theme-card-check" aria-hidden="true">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6.3l2.4 2.4 4.6-4.9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                </button>
              {/each}
            </div>
          </div>

          <div class="theme-section">
            <p class="settings-section-label">Dark theme</p>
            <div class="theme-variant-grid">
              {#each DARK_THEME_VARIANTS as variant}
                <button
                  class="theme-variant-card"
                  class:active={appTheme.dark === variant.id}
                  type="button"
                  onclick={() => setThemeVariant(variant.id)}
                >
                  <div class="theme-card-preview" style={themePreviewStyle(variant)} aria-hidden="true">
                    <span class="tcp-rail">
                      <span class="tcp-rail-dot"></span>
                      <span class="tcp-rail-bar"></span>
                      <span class="tcp-rail-bar"></span>
                    </span>
                    <span class="tcp-main">
                      <span class="tcp-bar">
                        <span class="tcp-chip"></span>
                        <span class="tcp-url"></span>
                      </span>
                      <span class="tcp-line wide"></span>
                      <span class="tcp-line"></span>
                      <span class="tcp-line short"></span>
                    </span>
                  </div>
                  <span class="theme-variant-name">{variant.name}</span>
                  <span class="theme-card-check" aria-hidden="true">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6.3l2.4 2.4 4.6-4.9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                </button>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      {#if settingsTab === 'proxy'}
        <div class="settings-body settings-proxy" id="settings-panel-proxy" role="tabpanel">
          <p class="settings-section-label">Proxy settings</p>
          <p class="proxy-intro">Applied to every request. A request- or collection-level proxy URL overrides this global proxy.</p>

          <div class="proxy-form">
            <div class="proxy-row">
              <span class="proxy-label">Mode</span>
              <div class="proxy-radio-group" role="radiogroup" aria-label="Proxy mode">
                {#each PROXY_MODES as option}
                  <label class="proxy-radio">
                    <input type="radio" name="proxy-mode" value={option.value} checked={proxyConfig.mode === option.value} onchange={() => updateProxy({ mode: option.value })} />
                    <span>{option.label}</span>
                  </label>
                {/each}
              </div>
            </div>

            <div class="proxy-row" class:proxy-disabled={proxyConfig.mode !== 'on'}>
              <span class="proxy-label">Protocol</span>
              <div class="proxy-radio-group" role="radiogroup" aria-label="Proxy protocol">
                {#each PROXY_PROTOCOLS as protocol}
                  <label class="proxy-radio">
                    <input type="radio" name="proxy-protocol" value={protocol} checked={proxyConfig.protocol === protocol} disabled={proxyConfig.mode !== 'on'} onchange={() => updateProxy({ protocol })} />
                    <span>{protocol.toUpperCase()}</span>
                  </label>
                {/each}
              </div>
            </div>

            <div class="proxy-row" class:proxy-disabled={proxyConfig.mode !== 'on'}>
              <label class="proxy-label" for="proxy-hostname">Hostname</label>
              <input id="proxy-hostname" class="proxy-input" type="text" spellcheck="false" autocomplete="off" placeholder="proxy.example.com" value={proxyConfig.hostname} disabled={proxyConfig.mode !== 'on'} oninput={(event) => updateProxy({ hostname: inputValue(event) })} />
            </div>

            {#if proxyConfig.mode === 'on' && !proxyConfig.hostname.trim()}
              <p class="proxy-warning" role="alert">Mode is <strong>On</strong> but no hostname is set — requests fail until you add one. Traffic is never sent direct.</p>
            {/if}

            <div class="proxy-row" class:proxy-disabled={proxyConfig.mode !== 'on'}>
              <label class="proxy-label" for="proxy-port">Port</label>
              <input id="proxy-port" class="proxy-input proxy-input-sm" type="number" min="0" max="65535" step="1" placeholder="0" value={proxyConfig.port} disabled={proxyConfig.mode !== 'on'} oninput={proxyPortInput} />
            </div>

            <div class="proxy-row" class:proxy-disabled={proxyConfig.mode !== 'on'}>
              <span class="proxy-label">Auth</span>
              <span class="switch-control">
                <input type="checkbox" checked={proxyConfig.auth.enabled} disabled={proxyConfig.mode !== 'on'} onchange={(event) => updateProxyAuth({ enabled: inputChecked(event) })} />
                <span class="switch-track"></span>
                <span class="switch-state">{proxyConfig.auth.enabled ? 'ON' : 'OFF'}</span>
              </span>
            </div>

            {#if proxyConfig.auth.enabled}
              <div class="proxy-row" class:proxy-disabled={proxyConfig.mode !== 'on'}>
                <label class="proxy-label" for="proxy-username">Username</label>
                <input id="proxy-username" class="proxy-input" type="text" spellcheck="false" autocomplete="off" value={proxyConfig.auth.username} disabled={proxyConfig.mode !== 'on'} oninput={(event) => updateProxyAuth({ username: inputValue(event) })} />
              </div>
              <div class="proxy-row" class:proxy-disabled={proxyConfig.mode !== 'on'}>
                <label class="proxy-label" for="proxy-password">Password</label>
                <span class="proxy-password">
                  <input id="proxy-password" class="proxy-input" type={proxyPasswordVisible ? 'text' : 'password'} autocomplete="off" value={proxyConfig.auth.password} disabled={proxyConfig.mode !== 'on'} oninput={(event) => updateProxyAuth({ password: inputValue(event) })} />
                  <button type="button" class="proxy-eye" aria-label={proxyPasswordVisible ? 'Hide password' : 'Show password'} onclick={() => (proxyPasswordVisible = !proxyPasswordVisible)}>
                    {#if proxyPasswordVisible}
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="1.8" stroke="currentColor" stroke-width="1.3"/><path d="M3 13L13 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
                    {:else}
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="1.8" stroke="currentColor" stroke-width="1.3"/></svg>
                    {/if}
                  </button>
                </span>
              </div>
            {/if}

            <div class="proxy-row" class:proxy-disabled={proxyConfig.mode !== 'on'}>
              <label class="proxy-label" for="proxy-bypass">Proxy Bypass</label>
              <input id="proxy-bypass" class="proxy-input" type="text" spellcheck="false" autocomplete="off" placeholder="localhost, 127.0.0.1, .internal" value={proxyConfig.bypass} disabled={proxyConfig.mode !== 'on'} oninput={(event) => updateProxy({ bypass: inputValue(event) })} />
            </div>
          </div>
        </div>
      {/if}

      {#if settingsTab === 'updates'}
        <div class="settings-body updates-tab" id="settings-panel-updates" role="tabpanel">
          <div class="updates-current">
            <p class="settings-section-label">Current version</p>
            <span class="updates-version-badge">{currentVersion || '…'}</span>
            {#if isDevBuild}<span class="updates-dev-tag">dev build</span>{/if}
          </div>

          {#if isDevBuild}
            <div class="updates-dev-notice">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 1.5l6.5 11h-13l6.5-11z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                <path d="M8 6v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                <circle cx="8" cy="11.6" r="0.75" fill="currentColor"/>
              </svg>
              <div>
                <strong>Updates aren't available in development builds.</strong>
                <p>You're running Relay from a local <code>make dev</code> / <code>go run</code> build. To receive auto-updates, install a release build from the <a href="https://github.com/relay-client/relay/releases/latest" onclick={(e) => { e.preventDefault(); openExternalURL('https://github.com/relay-client/relay/releases/latest'); }}>releases page</a>.</p>
              </div>
            </div>
          {:else}
          <div class="updates-status">
            {#if updateState === 'idle'}
              <button class="btn-secondary btn-sm" type="button" onclick={handleCheck}>
                Check for updates
              </button>

            {:else if updateState === 'checking'}
              <div class="updates-row">
                <span class="updates-spinner" aria-hidden="true"></span>
                <span class="updates-label">Checking…</span>
              </div>

            {:else if updateState === 'up-to-date'}
              <div class="updates-row">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" class="updates-ok-icon">
                  <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M4.5 7.5l2 2 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="updates-label">You're on the latest version</span>
                <button class="btn-secondary btn-sm" type="button" onclick={handleCheck}>Check again</button>
              </div>

            {:else if updateState === 'available' && updateInfo}
              <div class="updates-available">
                <div class="updates-available-head">
                  <span class="updates-new-badge">v{updateInfo.version}</span>
                  {#if updateInfo.publishedAt}
                    <span class="updates-date">{formatDate(updateInfo.publishedAt)}</span>
                  {/if}
                  <button class="btn-secondary btn-sm" type="button" onclick={handleInstall}>
                    Install update
                  </button>
                </div>
                {#if cleanReleaseNotes(updateInfo.releaseNotes)}
                  <div class="updates-notes">
                    <p class="settings-section-label">What's new</p>
                    <pre class="updates-notes-text">{cleanReleaseNotes(updateInfo.releaseNotes)}</pre>
                  </div>
                {/if}
              </div>

            {:else if updateState === 'installing'}
              <div class="updates-row">
                <span class="updates-spinner" aria-hidden="true"></span>
                <span class="updates-label">Downloading and installing…</span>
              </div>

            {:else if updateState === 'ready'}
              <div class="updates-ready">
                <div class="updates-row">
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" class="updates-ok-icon">
                    <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" stroke-width="1.3"/>
                    <path d="M4.5 7.5l2 2 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span class="updates-label">Update installed — restart to apply</span>
                </div>
                <button class="btn-secondary btn-sm" type="button" onclick={handleRestart}>
                  Restart now
                </button>
              </div>

            {:else if updateState === 'error'}
              <div class="updates-error-block">
                <span class="updates-error-text">{updateError}</span>
                <button class="btn-secondary btn-sm" type="button" onclick={handleCheck}>Try again</button>
              </div>
            {/if}
          </div>
          {/if}
        </div>
      {/if}
      {#if settingsTab === 'general'}
        <div class="settings-body general-tab" id="settings-panel-general" role="tabpanel">
          {#if matchesQuery('Saving', 'autosave', 'manual save')}
            <details class="settings-card" bind:open={generalSavingOpen}>
              <summary class="settings-card-summary">
                <span class="settings-card-icon">
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                    <path d="M3 3h10.5L15 4.5V15H3V3z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                    <rect x="5.5" y="10" width="7" height="4" rx="0.6" stroke="currentColor" stroke-width="1.2"/>
                  </svg>
                </span>
                <span class="settings-card-title">Saving</span>
                <span class="settings-card-subtitle">{autosave ? 'Autosave is on' : `Manual save (${saveShortcut})`}</span>
                <span class="settings-card-chevron" aria-hidden="true">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </summary>
              <div class="settings-card-body">
                <div class="general-save-options">
                  <button
                    class="save-mode-option"
                    class:active={autosave}
                    type="button"
                    onclick={() => setAutosave(true)}
                  >
                    <div class="save-mode-icon">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <path d="M3 3h10.5L15 4.5V15H3V3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                        <rect x="5.5" y="10" width="7" height="4" rx="0.6" stroke="currentColor" stroke-width="1.15"/>
                        <rect x="6" y="3" width="5" height="3.5" rx="0.6" stroke="currentColor" stroke-width="1.15"/>
                      </svg>
                    </div>
                    <div class="save-mode-copy">
                      <strong>Autosave</strong>
                      <small>Changes save automatically as you type</small>
                    </div>
                    {#if autosave}<span class="save-mode-check">✓</span>{/if}
                  </button>
                  <button
                    class="save-mode-option"
                    class:active={!autosave}
                    type="button"
                    onclick={() => setAutosave(false)}
                  >
                    <div class="save-mode-icon">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <path d="M3 3h10.5L15 4.5V15H3V3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                        <rect x="5.5" y="10" width="7" height="4" rx="0.6" stroke="currentColor" stroke-width="1.15"/>
                        <rect x="6" y="3" width="5" height="3.5" rx="0.6" stroke="currentColor" stroke-width="1.15"/>
                        <path d="M11.5 1.5l1.5 1.5M13 1.5l-1.5 1.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
                      </svg>
                    </div>
                    <div class="save-mode-copy">
                      <strong>Manual save</strong>
                      <small>Use the Save button or {saveShortcut} to save changes</small>
                    </div>
                    {#if !autosave}<span class="save-mode-check">✓</span>{/if}
                  </button>
                </div>
                {#if !autosave}
                  <p class="general-save-hint">
                    Unsaved changes are shown with a dot on the tab. Press <kbd>{saveShortcut}</kbd> or click the Save button to save.
                  </p>
                {/if}
              </div>
            </details>
          {/if}

          {#if matchesQuery('Scripts', 'script engine javascript tengo pre-request tests')}
            <details class="settings-card" bind:open={generalScriptsOpen}>
              <summary class="settings-card-summary">
                <span class="settings-card-icon">
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                    <path d="M6.5 5 3.5 9l3 4M11.5 5l3 4-3 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
                <span class="settings-card-title">Scripts</span>
                <span class="settings-card-subtitle">{scriptEngine === 'js' ? 'JavaScript engine' : 'Tengo engine'}</span>
                <span class="settings-card-chevron" aria-hidden="true">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </summary>
              <div class="settings-card-body">
                <div class="general-save-options">
                  <button
                    class="save-mode-option"
                    class:active={scriptEngine === 'js'}
                    type="button"
                    onclick={() => setScriptEngine('js')}
                  >
                    <div class="save-mode-icon">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <path d="M6 4.5 2.5 9 6 13.5M12 4.5 15.5 9 12 13.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </div>
                    <div class="save-mode-copy">
                      <strong>JavaScript</strong>
                      <small>Postman-style: pm.test(), pm.expect().to.eql(), real JS syntax</small>
                    </div>
                    {#if scriptEngine === 'js'}<span class="save-mode-check">✓</span>{/if}
                  </button>
                  <button
                    class="save-mode-option"
                    class:active={scriptEngine === 'tengo'}
                    type="button"
                    onclick={() => setScriptEngine('tengo')}
                  >
                    <div class="save-mode-icon">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <path d="M4 5h10M9 5v9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </div>
                    <div class="save-mode-copy">
                      <strong>Tengo</strong>
                      <small>Lightweight sandboxed scripting (pm.test(name, cond))</small>
                    </div>
                    {#if scriptEngine === 'tengo'}<span class="save-mode-check">✓</span>{/if}
                  </button>
                </div>
                <p class="general-save-hint">
                  Applies to all pre-request and test scripts. Each request keeps a separate script per engine, so switching back and forth never loses your work.
                </p>
              </div>
            </details>
          {/if}

          {#if matchesQuery('Default Location', 'workspace collection folder path documents relay')}
            <details class="settings-card" bind:open={generalLocationOpen}>
              <summary class="settings-card-summary">
                <span class="settings-card-icon">
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                    <path d="M2.5 5.2c0-.8.6-1.4 1.4-1.4h3.4l1.4 1.6h5.4c.8 0 1.4.6 1.4 1.4v6c0 .8-.6 1.4-1.4 1.4H3.9c-.8 0-1.4-.6-1.4-1.4V5.2z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/>
                  </svg>
                </span>
                <span class="settings-card-title">Default location</span>
                <span class="settings-card-subtitle">Used for new folder workspaces and collection exports</span>
                <span class="settings-card-chevron" aria-hidden="true">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </summary>
              <div class="settings-card-body">
                <div class="default-location-field">
                  <label for="settings-default-location">Default location</label>
                  <p>Used as the default location for new workspaces and exported collections.</p>
                  <div class="default-location-row">
                    <input
                      id="settings-default-location"
                      value={defaultWorkspaceLocationDraft}
                      spellcheck="false"
                      oninput={(event) => setDefaultWorkspaceLocationDraft(inputValue(event))}
                      onblur={() => saveDefaultWorkspaceLocation()}
                      onkeydown={handleDefaultLocationKeydown}
                      aria-describedby="settings-default-location-help"
                    />
                    <button class="btn-secondary btn-sm" type="button" onclick={() => saveDefaultWorkspaceLocation()}>Save</button>
                  </div>
                  <button class="settings-link-button" type="button" onclick={browseDefaultWorkspaceLocation}>Browse</button>
                  <p
                    id="settings-default-location-help"
                    class:settings-inline-status={defaultWorkspaceLocationStatus}
                    class:settings-inline-error={defaultWorkspaceLocationStatus && defaultWorkspaceLocationStatus !== 'Default location saved'}
                  >
                    {defaultWorkspaceLocationStatus}
                  </p>
                </div>
              </div>
            </details>
          {/if}

          {#if matchesQuery('Data', 'export', 'import', 'backup')}
            <details class="settings-card settings-card-danger" bind:open={generalAdvancedOpen}>
              <summary class="settings-card-summary">
                <span class="settings-card-icon settings-card-icon-danger">
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                    <path d="M9 1.8l7.5 13H1.5l7.5-13z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                    <path d="M9 7v3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                    <circle cx="9" cy="12.6" r="0.8" fill="currentColor"/>
                  </svg>
                </span>
                <span class="settings-card-title">Advanced data</span>
                <span class="settings-card-subtitle">Export or replace all your local data</span>
                <span class="settings-card-chevron" aria-hidden="true">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </summary>
              <div class="settings-card-body">
                <p class="settings-danger-warning">
                  <strong>Import replaces every workspace, collection, environment, and request</strong>
                  in this profile. Export is safe to run any time.
                </p>
                <div class="general-data-actions">
                  <button class="data-action-button" type="button" onclick={exportAllData}>
                    <span class="data-action-icon">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <path d="M9 2.5v8.2M5.8 7.6 9 10.8l3.2-3.2" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M3.2 11.5v2.7c0 .7.6 1.3 1.3 1.3h9c.7 0 1.3-.6 1.3-1.3v-2.7" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
                      </svg>
                    </span>
                    <span>Export all data</span>
                  </button>
                  <button class="data-action-button data-action-danger" type="button" onclick={importAllData}>
                    <span class="data-action-icon">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <path d="M9 15.5V7.3M5.8 10.4 9 7.2l3.2 3.2" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M3.2 6.5V3.8c0-.7.6-1.3 1.3-1.3h9c.7 0 1.3.6 1.3 1.3v2.7" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
                      </svg>
                    </span>
                    <span>Import all data</span>
                  </button>
                </div>
                {#if dataTransferStatus}
                  <p class="general-data-status">{dataTransferStatus}</p>
                {/if}
              </div>
            </details>
          {/if}
        </div>
      {/if}

      {#if settingsTab === 'support'}
        <div class="settings-body support-tab" id="settings-panel-support" role="tabpanel">
          <div class="support-head">
            <h3>Support</h3>
            <p>Send bugs or questions to the public tracker.</p>
          </div>

          <div class="support-actions">
            <button class="support-link-card" type="button" onclick={() => openExternalURL('https://github.com/relay-client/relay/issues')}>
              <span class="support-link-icon" aria-hidden="true">
                <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M9 5.4v4.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                  <circle cx="9" cy="12.2" r="0.8" fill="currentColor"/>
                </svg>
              </span>
              <span class="support-link-copy">
                <span class="support-link-title">Report issues</span>
                <span class="support-link-meta">github.com/relay-client/relay/issues</span>
              </span>
              <svg width="11" height="11" viewBox="0 0 10 10" fill="none" aria-hidden="true" class="support-link-arrow">
                <path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <button class="support-link-card" type="button" onclick={() => openExternalURL('https://github.com/relay-client/relay/issues/new')}>
              <span class="support-link-icon" aria-hidden="true">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M21.8 2.2L1.2 10.1c-1.4.6-1.3 1.5-.2 1.9l5.2 1.6 2 6.3c.3.8.6.9 1 .6l2.7-2.6 5.2 3.9c1 .5 1.6.3 1.9-.9L22.9 3.6c.4-1.5-.5-2.1-1.1-1.4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                </svg>
              </span>
              <span class="support-link-copy">
                <span class="support-link-title">Questions</span>
                <span class="support-link-meta">github.com/relay-client/relay/issues/new</span>
              </span>
              <svg width="11" height="11" viewBox="0 0 10 10" fill="none" aria-hidden="true" class="support-link-arrow">
                <path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      {/if}

      {#if settingsTab === 'about'}
        <div class="settings-body about-tab" id="settings-panel-about" role="tabpanel">
          <div class="about-logo">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 7h11M11 4.5l3 2.5-3 2.5" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M17 13H6M9 10.5l-3 2.5 3 2.5" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h3 class="about-name">Relay</h3>

          {#if aboutInfo}
            <div class="about-info">
              <div class="about-row">
                <span class="about-label">Version</span>
                <span class="about-value">{aboutInfo.version}</span>
              </div>
              <div class="about-row">
                <span class="about-label">Platform</span>
                <span class="about-value">{aboutInfo.platform}</span>
              </div>
            </div>
          {:else}
            <div class="about-loading">
              <span class="updates-spinner" aria-hidden="true"></span>
            </div>
          {/if}

          {#if whatsNewAvailable}
            <button class="about-whats-new" type="button" onclick={onShowWhatsNew}>
              <span class="about-whats-new-copy">
                <strong>What's new</strong>
                <span>Release notes for this build.</span>
              </span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          {/if}

          <div class="about-update-card">
            <div class="about-update-copy">
              <p class="about-update-label">Updates</p>
              <strong>Automatically install updates</strong>
              <span>Relay checks in the background, installs the new build, then asks for a restart.</span>
            </div>
            <label class="switch-control" aria-label="Automatically install updates">
              <input
                type="checkbox"
                checked={autoUpdateInstall}
                disabled={isDevBuild || updateState === 'installing'}
                onchange={handleAutoUpdateToggle}
              />
              <span class="switch-track"></span>
              <span class="switch-state">{autoUpdateInstall ? 'ON' : 'OFF'}</span>
            </label>
          </div>
          {#if isDevBuild}
            <p class="about-update-note">Auto-updates are available in release builds.</p>
          {:else if autoUpdateInstall && updateState === 'installing'}
            <p class="about-update-note">Downloading and installing the update…</p>
          {:else if autoUpdateInstall && updateState === 'ready'}
            <p class="about-update-note">Update installed. Restart Relay from Updates to apply it.</p>
          {:else if autoUpdateInstall}
            <p class="about-update-note">Auto-update is on. New releases install after the background check finds them.</p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .updates-tab {
    padding-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .updates-current {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .updates-current .settings-section-label {
    margin-bottom: 0;
  }

  .updates-version-badge {
    font-size: 11px;
    font-weight: 600;
    font-family: var(--font-mono, monospace);
    padding: 2px 8px;
    border-radius: 5px;
    background: var(--hover, rgba(255,255,255,0.06));
    color: var(--text-2, #c0c0d8);
    border: 1px solid var(--border, #333);
  }

  .updates-dev-tag {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent-hover, var(--accent));
    border: 1px solid color-mix(in srgb, var(--accent) 38%, transparent);
  }

  .updates-dev-notice {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 5%, transparent);
    color: var(--text-2);
  }

  .updates-dev-notice > svg {
    color: var(--accent-hover, var(--accent));
    flex-shrink: 0;
    margin-top: 1px;
  }

  .updates-dev-notice strong {
    display: block;
    margin-bottom: 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .updates-dev-notice p {
    margin: 0;
    font-size: 12px;
    line-height: 1.55;
    color: var(--text-3);
  }

  .updates-dev-notice code {
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--hover);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
  }

  .updates-dev-notice a {
    color: var(--accent-hover, var(--accent));
    text-decoration: none;
  }

  .updates-dev-notice a:hover {
    text-decoration: underline;
  }

  .updates-status {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .updates-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .updates-label {
    font-size: 13px;
    color: var(--text-2, #c0c0d8);
  }

  .updates-ok-icon {
    color: var(--success, #4ade80);
    flex-shrink: 0;
  }

  .updates-spinner {
    width: 13px;
    height: 13px;
    border: 1.5px solid var(--border, #444);
    border-top-color: var(--accent, #7c6af7);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .updates-available {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .updates-available-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .updates-new-badge {
    font-size: 12px;
    font-weight: 700;
    font-family: var(--font-mono, monospace);
    padding: 2px 8px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--accent, #7c6af7) 18%, transparent);
    color: var(--accent, #7c6af7);
    border: 1px solid color-mix(in srgb, var(--accent, #7c6af7) 40%, transparent);
  }

  .updates-date {
    font-size: 12px;
    color: var(--text-3, #666);
    flex: 1;
  }

  .updates-notes {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .updates-notes .settings-section-label {
    margin-bottom: 0;
  }

  .updates-notes-text {
    font-size: 12px;
    color: var(--text-2, #c0c0d8);
    font-family: var(--font-mono, monospace);
    background: var(--hover, rgba(255,255,255,0.04));
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    padding: 10px 12px;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 160px;
    overflow-y: auto;
    line-height: 1.6;
    margin: 0;
  }

  .updates-ready {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .updates-error-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .updates-error-text {
    font-size: 12px;
    color: var(--error, #f87171);
    background: color-mix(in srgb, var(--error, #f87171) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--error, #f87171) 30%, transparent);
    border-radius: 6px;
    padding: 8px 10px;
  }


  .settings-search {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    margin: 0 6px 8px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg);
    color: var(--text-3);
  }

  .settings-search:focus-within {
    border-color: var(--accent);
    color: var(--text);
  }

  .settings-search input {
    flex: 1;
    min-width: 0;
    width: 100%;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 12px;
    outline: none;
    padding: 2px 0;
    text-overflow: ellipsis;
  }

  .settings-search input::placeholder {
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  .settings-search input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    height: 12px;
    width: 12px;
    background: var(--text-3);
    -webkit-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 3l6 6M9 3l-6 6' stroke='black' stroke-width='1.5' stroke-linecap='round'/></svg>") no-repeat center / contain;
    cursor: pointer;
  }

  .settings-nav-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .settings-nav-empty {
    margin: 8px 10px;
    font-size: 12px;
    color: var(--text-3);
    line-height: 1.4;
  }


  .settings-card {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--elevated);
    flex-shrink: 0;
    overflow: hidden;
    transition: border-color 0.12s;
  }

  .settings-card[open] {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  }

  .settings-card-summary {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    cursor: pointer;
    user-select: none;
    list-style: none;
  }

  .settings-card-summary::-webkit-details-marker {
    display: none;
  }

  .settings-card-icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent-hover, var(--accent));
    flex-shrink: 0;
  }

  .settings-card-icon-danger {
    background: color-mix(in srgb, var(--error, #f87171) 14%, transparent);
    color: var(--error, #f87171);
  }

  .settings-card-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .settings-card-subtitle {
    flex: 1;
    font-size: 12px;
    color: var(--text-3);
  }

  .settings-card-chevron {
    color: var(--text-3);
    transition: transform 0.18s;
  }

  .settings-card[open] .settings-card-chevron {
    transform: rotate(180deg);
  }

  .settings-card-body {
    padding: 0 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .settings-card-danger {
    border-color: color-mix(in srgb, var(--error, #f87171) 25%, var(--border));
  }

  .settings-card-danger[open] {
    border-color: color-mix(in srgb, var(--error, #f87171) 45%, var(--border));
  }

  .settings-danger-warning {
    margin: 0;
    padding: 8px 10px;
    background: color-mix(in srgb, var(--error, #f87171) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--error, #f87171) 25%, transparent);
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-2);
  }

  .settings-danger-warning strong {
    color: var(--text);
    font-weight: 600;
  }

  .data-action-danger {
    border-color: color-mix(in srgb, var(--error, #f87171) 25%, var(--border));
    color: var(--error, #f87171);
  }

  .data-action-danger:hover {
    border-color: var(--error, #f87171);
    background: color-mix(in srgb, var(--error, #f87171) 10%, transparent);
    color: var(--error, #f87171);
  }

  .data-action-danger .data-action-icon {
    color: var(--error, #f87171);
  }


  .settings-theme {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding-top: 18px;
  }

  .theme-mode-options {
    display: inline-flex;
    gap: 3px;
    margin-bottom: 24px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
  }

  .theme-mode-option {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 32px;
    padding: 0 15px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text-2);
    font-size: 13px;
    font-weight: 600;
    transition: background 0.14s ease, color 0.14s ease, box-shadow 0.14s ease;
  }

  .theme-mode-option svg {
    flex-shrink: 0;
    opacity: 0.8;
  }

  .theme-mode-option:hover {
    color: var(--text);
    background: var(--hover);
  }

  .theme-mode-option.active {
    color: var(--accent-hover);
    background: color-mix(in srgb, var(--accent) 16%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 42%, transparent);
  }

  .theme-mode-option.active svg {
    opacity: 1;
  }

  .theme-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .theme-section + .theme-section {
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid var(--border-subtle);
  }

  .theme-section .settings-section-label {
    margin-bottom: 0;
  }

  .theme-variant-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
    gap: 14px;
  }

  .theme-variant-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    text-align: left;
    transition: border-color 0.14s ease, background 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease;
  }

  .theme-variant-card:hover {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
  }

  .theme-variant-card.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 9%, var(--surface));
    box-shadow: 0 0 0 1px var(--accent);
  }

  .theme-card-preview {
    display: grid;
    grid-template-columns: 26px 1fr;
    height: 80px;
    border-radius: 8px;
    border: 1px solid var(--theme-card-border);
    background: var(--theme-card-bg);
    overflow: hidden;
  }

  .tcp-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 9px 0;
    background: var(--theme-card-rail);
    border-right: 1px solid color-mix(in srgb, var(--theme-card-border) 55%, transparent);
  }

  .tcp-rail-dot {
    width: 13px;
    height: 13px;
    border-radius: 4px;
    background: var(--theme-card-accent);
  }

  .tcp-rail-bar {
    width: 13px;
    height: 4px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--theme-card-text) 26%, transparent);
  }

  .tcp-main {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
    padding: 10px 10px 0;
  }

  .tcp-bar {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tcp-chip {
    width: 22px;
    height: 11px;
    border-radius: 3px;
    background: var(--theme-card-accent);
  }

  .tcp-url {
    flex: 1;
    height: 11px;
    border-radius: 3px;
    background: var(--theme-card-surface);
    border: 1px solid color-mix(in srgb, var(--theme-card-border) 65%, transparent);
  }

  .tcp-line {
    width: 80%;
    height: 5px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--theme-card-text) 40%, transparent);
  }

  .tcp-line.wide {
    width: 100%;
  }

  .tcp-line.short {
    width: 52%;
    background: color-mix(in srgb, var(--theme-card-text) 22%, transparent);
  }

  .theme-variant-name {
    display: flex;
    align-items: center;
    padding: 0 2px 2px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-2);
    line-height: 1.2;
    transition: color 0.14s ease;
  }

  .theme-variant-card:hover .theme-variant-name,
  .theme-variant-card.active .theme-variant-name {
    color: var(--text);
  }

  .theme-card-check {
    position: absolute;
    top: 9px;
    right: 9px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    opacity: 0;
    transform: scale(0.6);
    transition: opacity 0.14s ease, transform 0.14s ease;
  }

  .theme-variant-card.active .theme-card-check {
    opacity: 1;
    transform: scale(1);
  }

  @media (prefers-reduced-motion: reduce) {
    .theme-variant-card,
    .theme-variant-card:hover,
    .theme-card-check {
      transition: none;
      transform: none;
    }
  }


  .settings-proxy {
    padding-top: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .proxy-intro {
    margin: 0 0 14px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-3);
  }

  .proxy-warning {
    margin: -4px 0 0;
    padding: 8px 10px;
    background: color-mix(in srgb, var(--error, #f87171) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--error, #f87171) 25%, transparent);
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-2);
  }

  .proxy-warning strong {
    color: var(--text);
    font-weight: 600;
  }

  .proxy-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 460px;
  }

  .proxy-row {
    display: grid;
    grid-template-columns: 110px 1fr;
    align-items: center;
    gap: 14px;
  }

  .proxy-disabled {
    opacity: 0.45;
  }

  .proxy-label {
    font-size: 13px;
    color: var(--text-2);
  }

  .proxy-radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .proxy-radio {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
  }

  .proxy-radio input {
    accent-color: var(--accent);
    cursor: pointer;
  }

  .proxy-radio input:disabled,
  .proxy-radio:has(input:disabled) {
    cursor: not-allowed;
  }

  .proxy-input {
    box-sizing: border-box;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    font: 13px var(--font-sans, inherit);
  }

  .proxy-input-sm {
    max-width: 120px;
  }

  .proxy-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .proxy-input:disabled {
    cursor: not-allowed;
  }

  .proxy-password {
    position: relative;
    display: block;
  }

  .proxy-password .proxy-input {
    padding-right: 36px;
  }

  .proxy-eye {
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-3);
    cursor: pointer;
  }

  .proxy-eye:hover {
    color: var(--text);
  }


  .support-tab {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 24px;
    max-width: 460px;
  }

  .support-head {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .support-head h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
  }

  .support-head p {
    margin: 0;
    max-width: 360px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-3);
  }

  .support-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .support-link-card {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 64px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--elevated);
    color: var(--text);
    text-align: left;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s, color 0.12s;
  }

  .support-link-card:hover {
    border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, var(--elevated));
  }

  .support-link-icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 13%, transparent);
    color: var(--accent-hover, var(--accent));
    flex-shrink: 0;
  }

  .support-link-copy {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }

  .support-link-title {
    font-size: 13px;
    font-weight: 650;
    color: var(--text);
  }

  .support-link-meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--text-3);
  }

  .support-link-arrow {
    color: var(--text-3);
    flex-shrink: 0;
  }


  .about-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 36px;
    gap: 0;
  }

  .about-logo {
    --relay-brand-a: #8ea2ff;
    --relay-brand-b: #5865f2;
    --relay-brand-c: #1d4ed8;
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background:
      linear-gradient(160deg, rgba(255,255,255,0.18) 0%, transparent 55%),
      linear-gradient(135deg, var(--relay-brand-a) 0%, var(--relay-brand-b) 48%, var(--relay-brand-c) 100%);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.32),
      inset 0 -1px 0 rgba(0,0,0,0.12),
      0 2px 8px rgba(88,101,242,0.28),
      0 8px 24px rgba(88,101,242,0.18);
    margin-bottom: 16px;
    color: white;
  }

  .about-logo svg {
    width: 26px;
    height: 26px;
  }

  .about-name {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 28px;
  }

  .about-info {
    width: 100%;
    max-width: 280px;
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 18px;
  }

  .about-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 11px 16px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .about-row:last-child {
    border-bottom: none;
  }

  .about-label {
    font-size: 13px;
    color: var(--text-3);
    font-weight: 500;
  }

  .about-value {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .about-loading {
    display: flex;
    justify-content: center;
    padding: 20px;
  }

  .about-update-card {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    width: 100%;
    max-width: 360px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--elevated);
  }

  .about-whats-new {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    width: 100%;
    max-width: 360px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--elevated);
    color: var(--text-3);
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }

  .about-whats-new:hover {
    border-color: var(--accent);
    background: var(--hover);
    color: var(--accent);
  }

  .about-whats-new-copy {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .about-whats-new-copy strong {
    color: var(--text);
    font-size: 12.5px;
  }

  .about-whats-new-copy span {
    color: var(--text-3);
    font-size: 11px;
    line-height: 1.4;
  }

  .about-update-copy {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
  }

  .about-update-label {
    margin: 0 0 2px;
    font-size: 10px;
    font-weight: 750;
    text-transform: uppercase;
    letter-spacing: 0;
    color: var(--text-3);
  }

  .about-update-copy strong {
    font-size: 13px;
    font-weight: 650;
    color: var(--text);
  }

  .about-update-copy span {
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-3);
  }

  .about-update-card .switch-control {
    flex-shrink: 0;
  }

  .about-update-note {
    max-width: 360px;
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.45;
    text-align: center;
    color: var(--text-3);
  }

  .settings-nav-about {
    margin-top: auto;
  }


  .general-tab {
    padding-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .general-save-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .save-mode-option {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 58px;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--elevated);
    color: var(--text-2);
    text-align: left;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s, color 0.12s;
  }

  .save-mode-option:hover {
    border-color: var(--accent);
    background: var(--hover);
    color: var(--text);
  }

  .save-mode-option.active {
    border-color: var(--accent);
    background: var(--accent-dim);
    color: var(--text);
  }

  .save-mode-icon {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent-hover, var(--accent));
    flex-shrink: 0;
  }

  .save-mode-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .save-mode-copy strong {
    font-size: 13px;
    font-weight: 600;
    color: inherit;
  }

  .save-mode-copy small {
    font-size: 11.5px;
    color: var(--text-3);
  }

  .save-mode-check {
    font-size: 14px;
    color: var(--accent);
    font-weight: 700;
    flex-shrink: 0;
  }

  .general-save-hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-3);
    line-height: 1.5;
    padding: 10px 12px;
    background: var(--hover);
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
  }

  .general-save-hint kbd {
    display: inline-block;
    padding: 1px 5px;
    background: var(--elevated);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 11px;
    font-family: var(--font-mono, monospace);
  }

  .default-location-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .default-location-field label {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
  }

  .default-location-field p {
    margin: 0;
    color: var(--text-3);
    font-size: 12px;
    line-height: 1.45;
  }

  .default-location-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .default-location-row input {
    box-sizing: border-box;
    flex: 1;
    min-width: 0;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    font: 12px var(--font-mono, monospace);
  }

  .default-location-row input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .settings-link-button {
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .settings-link-button:hover {
    color: var(--accent-hover, var(--accent));
  }

  .settings-inline-status {
    color: var(--text-3);
  }

  .settings-inline-error {
    color: var(--diagnostic-error);
  }

  .general-data-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .data-action-button {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--elevated);
    color: var(--text-2);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s, color 0.12s;
  }

  .data-action-button:hover {
    border-color: var(--accent);
    background: var(--hover);
    color: var(--text);
  }

  .data-action-icon {
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    color: var(--accent-hover, var(--accent));
    flex-shrink: 0;
  }

  .general-data-status {
    margin: -2px 0 0;
    color: var(--text-3);
    font-size: 12px;
  }
</style>
