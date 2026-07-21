import type { HttpResponse } from '../../backend';
import type { AppDialogState } from '../../types/dialog';
import type { RequestType, SavedRequest, ShortcutId } from '../../types/models';
import {
  clamp,
  requestBadgeLabel,
  requestKindFor,
  requestTabLabel,
  requestTransportLabel,
} from '../../utils';
import type { SettingsTab, TopView } from '../ui';

const SIDEBAR_MIN_WIDTH = 260;
const SIDEBAR_MAX_WIDTH = 460;
const CODE_PANEL_MIN_WIDTH = 280;
const CODE_PANEL_MAX_WIDTH = 760;
const CODE_PANEL_MIN_WORKSPACE_WIDTH = 560;
const SHELL_DIVIDER_WIDTH = 5;

export function codePanelMaxWidth(viewportWidth: number, sidebarWidth: number): number {
  const availableWidth = Math.max(0, viewportWidth - sidebarWidth - SHELL_DIVIDER_WIDTH);
  const balancedWidth = Math.floor(availableWidth / 2);
  const workspaceReservedWidth = availableWidth - CODE_PANEL_MIN_WORKSPACE_WIDTH;
  return Math.max(
    CODE_PANEL_MIN_WIDTH,
    Math.min(CODE_PANEL_MAX_WIDTH, balancedWidth, workspaceReservedWidth),
  );
}

type ColumnResizeTarget = 'key' | 'val' | 'type' | 'desc';

type UiShellHost = {
  _sidebarSearchInput: HTMLInputElement | undefined;
  _urlInputRef: HTMLInputElement | HTMLTextAreaElement | undefined;
  activeRequestId: string;
  appDialog: AppDialogState | null;
  autosave: boolean;
  codePanelAvailable: boolean;
  codePanelOpen: boolean;
  codePanelResizeStartW: number;
  codePanelResizeStartX: number;
  codePanelResizing: boolean;
  codePanelWidth: number;
  colResizeMaxW: number;
  colResizeStartW: number;
  colResizeStartX: number;
  colResizing: ColumnResizeTarget | null;
  globalSearchOpen: boolean;
  globalSearchQuery: string;
  kvDescW: number;
  kvKeyW: number;
  kvTypeW: number;
  kvValW: number;
  panelResizeStartH: number;
  panelResizeStartY: number;
  panelResizing: boolean;
  rawTypeMenuOpen: boolean;
  requestError: string;
  requestPanelHeight: number;
  requestType: RequestType;
  requests: SavedRequest[];
  response: HttpResponse | null;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  shortcutCaptureMessage: string;
  shortcutEditingId: ShortcutId | '';
  sidebarHidden: boolean;
  sidebarResizeStartW: number;
  sidebarResizeStartX: number;
  sidebarResizing: boolean;
  sidebarWidth: number;
  topView: TopView;
  workspaceBlocked: boolean;
  closeActiveTab: (force?: boolean) => Promise<unknown>;
  closeFloatingMenus: () => void;
  closeGlobalSearch: () => void;
  closeSettings: () => void;
  collapseActiveCollection: () => Promise<unknown>;
  collapseAllCollections: () => Promise<unknown>;
  collectionNameById: (collectionId: string) => string;
  copyActiveRequestItem: () => void;
  copyVisibleResponseOrError: () => Promise<unknown>;
  createNewRequest: () => Promise<unknown>;
  deleteRequest: (id: string) => Promise<unknown>;
  dismissDialog: () => void;
  duplicateRequest: (id: string) => Promise<unknown>;
  eventToCombo: (event: KeyboardEvent) => string;
  expandActiveCollection: () => Promise<unknown>;
  expandAllCollections: () => Promise<unknown>;
  focusRequestUrl: () => void;
  focusSidebarSearch: () => void;
  isEditableTarget: (target: EventTarget | null) => boolean;
  isShortcutAllowedInEditable: (id: ShortcutId) => boolean;
  openGlobalSearch: () => void;
  openSettings: (tab?: SettingsTab) => void;
  pasteCopiedRequestItem: () => Promise<unknown>;
  renameRequest: (id: string) => Promise<unknown>;
  reopenLastClosedTab: () => Promise<unknown>;
  runActiveRequest: () => Promise<unknown>;
  runShortcut: (id: ShortcutId) => Promise<unknown>;
  saveActiveRequest: () => Promise<unknown>;
  saveEnvironment: () => Promise<unknown>;
  setShortcut: (id: ShortcutId, combo: string) => void;
  shortcutForEvent: (event: KeyboardEvent) => ShortcutId | null;
  shortcutKeycaps: (combo: string) => string[];
  showWorkspaceBlockedToast: (action?: string, workspaceId?: string) => void;
  guardWorkspaceWritable: (action?: string) => boolean;
  buildGlobalSearchResults: () => SavedRequest[];
  switchLastOpenTab: () => Promise<unknown>;
  switchOpenTabAt: (index: number) => Promise<unknown>;
  switchOpenTabByOffset: (offset: number) => Promise<unknown>;
  switchSidebarItem: (offset: number) => Promise<unknown>;
};

export const uiShellFeature = {
  get globalSearchResults(): SavedRequest[] {
    const host = this as unknown as UiShellHost;
    return host.buildGlobalSearchResults();
  },

  get codePanelAvailable(): boolean {
    const host = this as unknown as UiShellHost;
    if (host.topView === 'git' || host.topView === 'runner' || host.topView === 'collection') return false;
    return host.requestType !== 'graphql' && host.requestType !== 'ws' && host.requestType !== 'socketio' && host.requestType !== 'grpc';
  },

  buildGlobalSearchResults(this: UiShellHost): SavedRequest[] {
    const q = this.globalSearchQuery.trim().toLowerCase();
    const nonDrafts = this.requests.filter(r => !r.isDraft);
    if (!q) return nonDrafts.slice(0, 20);
    return nonDrafts.filter(r => {
      const label = requestTabLabel(r);
      const kind = requestKindFor(r);
      const aliases: Record<string, string> = {
        http: 'http rest request api',
        sse: 'sse server sent events event stream',
        ws: 'ws websocket web socket realtime',
        socketio: 'sio socketio socket.io socket io realtime',
        graphql: 'graphql gql graph ql',
        grpc: 'grpc protobuf proto reflection rpc service method',
      };
      const searchable = [
        label,
        r.name,
        r.url,
        r.grpcMethod ?? '',
        r.grpcProtoFileName ?? '',
        r.method,
        r.requestType ?? '',
        this.collectionNameById(r.collectionId),
        r.requestNotes,
        requestTransportLabel(r),
        requestBadgeLabel(r),
        aliases[kind] ?? kind,
        (r.folderPath ?? []).join('/'),
      ].join(' ').toLowerCase();
      return searchable.includes(q);
    }).slice(0, 60);
  },

  openGlobalSearch(this: UiShellHost) {
    if (!this.guardWorkspaceWritable('Search')) return;
    this.closeFloatingMenus();
    this.globalSearchOpen = true;
    this.globalSearchQuery = '';
  },

  closeGlobalSearch(this: UiShellHost) {
    this.globalSearchOpen = false;
    this.globalSearchQuery = '';
  },

  openSettings(this: UiShellHost, tab: SettingsTab = 'general') {
    this.closeFloatingMenus();
    this.settingsOpen = true;
    this.settingsTab = tab;
    this.shortcutEditingId = '';
    this.shortcutCaptureMessage = '';
  },

  closeSettings(this: UiShellHost) {
    this.settingsOpen = false;
    this.shortcutEditingId = '';
    this.shortcutCaptureMessage = '';
  },

  startSidebarResize(this: UiShellHost, e: MouseEvent) {
    this.sidebarResizing = true;
    this.sidebarResizeStartX = e.clientX;
    this.sidebarResizeStartW = this.sidebarWidth;
    e.preventDefault();
  },

  startPanelResize(this: UiShellHost, e: MouseEvent) {
    this.panelResizing = true;
    this.panelResizeStartY = e.clientY;
    this.panelResizeStartH = this.requestPanelHeight;
    e.preventDefault();
  },

  startCodePanelResize(this: UiShellHost, e: MouseEvent) {
    this.codePanelResizing = true;
    this.codePanelResizeStartX = e.clientX;
    this.codePanelResizeStartW = this.codePanelWidth;
    e.preventDefault();
    e.stopPropagation();
  },

  startColResize(this: UiShellHost, col: ColumnResizeTarget, e: MouseEvent) {
    const table = (e.currentTarget as HTMLElement | null)?.closest('.kv-table') as HTMLElement | null;
    const tableW = table?.clientWidth ?? Math.max(520, window.innerWidth - this.sidebarWidth - 80);
    const minKey = 110; const minVal = 140; const minType = 80; const minDesc = 160;
    const fixedW = 32 + 28;
    const keyW = Math.max(minKey, this.kvKeyW);
    const valW = Math.max(minVal, this.kvValW);
    const typeW = Math.max(minType, this.kvTypeW);
    this.colResizing = col;
    this.colResizeStartX = e.clientX;
    const startW = col === 'key' ? this.kvKeyW : col === 'val' ? this.kvValW : col === 'type' ? this.kvTypeW : this.kvDescW;
    this.colResizeStartW = startW;
    this.colResizeMaxW = Math.max(
      startW,
      col === 'key' ? minKey : col === 'val' ? minVal : col === 'type' ? minType : minDesc,
      col === 'key'
        ? tableW - fixedW - typeW - valW - minDesc
        : col === 'type'
          ? tableW - fixedW - keyW - valW - minDesc
          : col === 'val'
            ? tableW - fixedW - keyW - typeW - minDesc
            : tableW - fixedW - keyW - typeW - valW
    );
    e.preventDefault();
    e.stopPropagation();
  },

  onWindowMouseMove(this: UiShellHost, e: MouseEvent) {
    if (this.sidebarResizing) {
      this.sidebarWidth = clamp(this.sidebarResizeStartW + (e.clientX - this.sidebarResizeStartX), SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
      if (this.codePanelOpen) {
        const sidebarWidth = this.sidebarHidden ? 0 : this.sidebarWidth;
        this.codePanelWidth = Math.min(this.codePanelWidth, codePanelMaxWidth(window.innerWidth, sidebarWidth));
      }
    }
    if (this.panelResizing) this.requestPanelHeight = clamp(this.panelResizeStartH + (e.clientY - this.panelResizeStartY), 120, window.innerHeight - 220);
    if (this.codePanelResizing) {
      const sidebarWidth = this.sidebarHidden ? 0 : this.sidebarWidth;
      const maxW = codePanelMaxWidth(window.innerWidth, sidebarWidth);
      this.codePanelWidth = clamp(this.codePanelResizeStartW + (this.codePanelResizeStartX - e.clientX), CODE_PANEL_MIN_WIDTH, maxW);
    }
    if (this.colResizing) {
      const minW = this.colResizing === 'key' ? 110 : this.colResizing === 'val' ? 140 : this.colResizing === 'type' ? 80 : 160;
      const newW = clamp(this.colResizeStartW + (e.clientX - this.colResizeStartX), minW, this.colResizeMaxW);
      if (this.colResizing === 'key') this.kvKeyW = newW;
      else if (this.colResizing === 'val') this.kvValW = newW;
      else if (this.colResizing === 'type') this.kvTypeW = newW;
      else this.kvDescW = newW;
    }
  },

  onWindowMouseUp(this: UiShellHost) {
    this.sidebarResizing = false;
    this.panelResizing = false;
    this.codePanelResizing = false;
    this.colResizing = null;
  },

  onPanelDividerKeydown(this: UiShellHost, e: KeyboardEvent) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    this.requestPanelHeight = clamp(this.requestPanelHeight + (e.key === 'ArrowDown' ? 16 : -16), 120, window.innerHeight - 220);
  },

  onCodePanelDividerKeydown(this: UiShellHost, e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const sidebarWidth = this.sidebarHidden ? 0 : this.sidebarWidth;
    const maxW = codePanelMaxWidth(window.innerWidth, sidebarWidth);
    this.codePanelWidth = clamp(this.codePanelWidth + (e.key === 'ArrowLeft' ? 16 : -16), CODE_PANEL_MIN_WIDTH, maxW);
  },

  onSidebarDividerKeydown(this: UiShellHost, e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    this.sidebarWidth = clamp(this.sidebarWidth + (e.key === 'ArrowRight' ? 16 : -16), SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
  },

  focusSidebarSearch(this: UiShellHost) {
    if (this.workspaceBlocked) {
      this.showWorkspaceBlockedToast('Sidebar search');
      return;
    }
    this.sidebarHidden = false;
    setTimeout(() => {
      this._sidebarSearchInput?.focus();
      this._sidebarSearchInput?.select();
    }, 0);
  },

  focusRequestUrl(this: UiShellHost) {
    if (this.workspaceBlocked) {
      this.showWorkspaceBlockedToast('Request editing');
      return;
    }
    this.topView = 'request';
    setTimeout(() => {
      this._urlInputRef?.focus();
      this._urlInputRef?.select();
    }, 0);
  },

  isEditableTarget(this: UiShellHost, target: EventTarget | null) {
    const isEditable = (candidate: EventTarget | null) => (
      candidate instanceof Element
      && Boolean(candidate.closest('input, textarea, select, [contenteditable="true"], .cm-editor'))
    );
    return isEditable(target) || isEditable(document.activeElement);
  },

  isShortcutAllowedInEditable(this: UiShellHost, id: ShortcutId) {
    return ['close-tab', 'force-close-tab', 'send-request', 'save-request', 'request-url', 'search', 'settings', 'toggle-right-sidebar'].includes(id);
  },

  async runShortcut(this: UiShellHost, id: ShortcutId) {
    if (this.workspaceBlocked && !['close-tab', 'force-close-tab', 'settings', 'shortcut-help', 'toggle-left-sidebar', 'toggle-right-sidebar'].includes(id)) {
      this.showWorkspaceBlockedToast('Workspace shortcuts');
      return;
    }
    if (id === 'save-request') {
      if (!this.autosave && this.topView === 'environment') await this.saveEnvironment();
      else if (!this.autosave && this.activeRequestId) await this.saveActiveRequest();
      return;
    }
    if (id === 'close-tab' || id === 'force-close-tab') await this.closeActiveTab(id === 'force-close-tab');
    else if (id === 'next-tab') await this.switchOpenTabByOffset(1);
    else if (id === 'previous-tab') await this.switchOpenTabByOffset(-1);
    else if (id.startsWith('tab-')) await this.switchOpenTabAt(Number(id.replace('tab-', '')) - 1);
    else if (id === 'last-tab') await this.switchLastOpenTab();
    else if (id === 'reopen-tab') await this.reopenLastClosedTab();
    else if (id === 'new-request') await this.createNewRequest();
    else if (id === 'request-url') this.focusRequestUrl();
    else if (id === 'send-request') await this.runActiveRequest();
    else if (id === 'search-sidebar') this.focusSidebarSearch();
    else if (id === 'search') this.openGlobalSearch();
    else if (id === 'duplicate-item' && this.activeRequestId) await this.duplicateRequest(this.activeRequestId);
    else if (id === 'rename-item' && this.activeRequestId) await this.renameRequest(this.activeRequestId);
    else if (id === 'copy-item') this.copyActiveRequestItem();
    else if (id === 'paste-item') await this.pasteCopiedRequestItem();
    else if (id === 'delete-item' && this.activeRequestId) await this.deleteRequest(this.activeRequestId);
    else if (id === 'next-item') await this.switchSidebarItem(1);
    else if (id === 'previous-item') await this.switchSidebarItem(-1);
    else if (id === 'expand-item') await this.expandActiveCollection();
    else if (id === 'collapse-item') await this.collapseActiveCollection();
    else if (id === 'expand-all') await this.expandAllCollections();
    else if (id === 'collapse-all') await this.collapseAllCollections();
    else if (id === 'settings') this.openSettings('general');
    else if (id === 'shortcut-help') this.openSettings('shortcuts');
    else if (id === 'toggle-left-sidebar') this.sidebarHidden = !this.sidebarHidden;
    else if (id === 'toggle-right-sidebar' && this.codePanelAvailable) this.codePanelOpen = !this.codePanelOpen;
  },

  async onKeydown(this: UiShellHost, e: KeyboardEvent) {
    if (this.appDialog && e.key === 'Escape') {
      e.preventDefault();
      this.dismissDialog();
      return;
    }
    if (this.settingsOpen && this.settingsTab === 'shortcuts' && this.shortcutEditingId) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        this.shortcutEditingId = '';
        this.shortcutCaptureMessage = '';
        return;
      }
      const combo = this.eventToCombo(e);
      if (!combo) return;
      this.setShortcut(this.shortcutEditingId, combo);
      this.shortcutCaptureMessage = `${this.shortcutKeycaps(combo).join(' ')} assigned`;
      this.shortcutEditingId = '';
      setTimeout(() => (this.shortcutCaptureMessage = ''), 1500);
      return;
    }
    if (this.globalSearchOpen && e.key === 'Escape') {
      e.preventDefault();
      this.closeGlobalSearch();
      return;
    }
    if (this.settingsOpen && e.key === 'Escape') {
      e.preventDefault();
      this.closeSettings();
      return;
    }
    const shortcutId = this.shortcutForEvent(e);
    if (shortcutId) {
      if (this.isEditableTarget(e.target) && !this.isShortcutAllowedInEditable(shortcutId)) return;
      if (shortcutId === 'copy-item') {
        if (window.getSelection()?.toString()) return;
        const el = e.target as HTMLElement | null;
        if (el?.closest('.response-area') && (this.requestError || this.response)) {
          e.preventDefault();
          e.stopPropagation();
          await this.copyVisibleResponseOrError();
          return;
        }
      }
      e.preventDefault();
      e.stopPropagation();
      await this.runShortcut(shortcutId);
      return;
    }
    if (e.key === 'Escape' && this.rawTypeMenuOpen) this.rawTypeMenuOpen = false;
    if (e.key === 'Escape') this.closeFloatingMenus();
  },
};
