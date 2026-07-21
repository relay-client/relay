import type { HttpResponse } from '../../backend';
import { makeCollection } from '../../normalizers';
import { historyDayLabel, localDateKey, newEntityId, newRequestId, requestTabLabel } from '../../utils';
import type { Collection, HistoryDayGroup, PersistRequestStore, RequestHistoryEntry, SavedRequest, Workspace } from '../../types/models';

type HistoryHost = {
  requestHistory: RequestHistoryEntry[];
  historyDayCollapseState: Record<string, boolean>;
  historyHeaderMenuOpen: boolean;
  openHistoryMenuId: string;
  requests: SavedRequest[];
  activeRequestId: string;
  openRequestIds: string[];
  workspaces: Workspace[];
  collections: Collection[];
  activeWorkspaceId: string;
  topView: string;
  pruneHistory: (entries?: RequestHistoryEntry[]) => RequestHistoryEntry[];
  scheduleRequestStorePersist: () => void;
  normalizeSavedRequestCtx: (input: Partial<SavedRequest>) => SavedRequest;
  snapshotActiveRequest: () => SavedRequest;
  currentRequestName: () => string;
  persistRequestStore: PersistRequestStore;
  persistActiveRequestNow: () => Promise<void>;
  collectionNameById: (id: string) => string;
  workspaceIdForCollection: (collectionId: string) => string;
  applySavedRequest: (request: SavedRequest) => void;
  openPromptDialog: (title: string, initialValue?: string, message?: string) => Promise<string | null>;
  openConfirmDialog: (title: string, message: string, confirmLabel?: string) => Promise<boolean>;
  guardWorkspaceWritable: (action?: string) => boolean;
  activeCollectionId: () => string;
  defaultCollectionForWorkspace: (workspaceId?: string) => Collection | undefined;
  activeWorkspaceCollections: () => Collection[];
  saveHistoryEntryToCollection: (historyId: string, collectionId: string) => Promise<void>;
  saveHistoryEntryToNewCollection: (historyId: string) => Promise<void>;
};

const HISTORY_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 1000;

export const historyFeature = {
  pruneHistory(this: HistoryHost, entries = this.requestHistory): RequestHistoryEntry[] {
    const cutoff = Date.now() - HISTORY_RETENTION_MS;
    return entries
      .filter(entry => entry.createdAt >= cutoff)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, HISTORY_LIMIT);
  },
  buildHistoryGroups(this: HistoryHost): HistoryDayGroup[] {
    const groups = new Map<string, RequestHistoryEntry[]>();
    for (const entry of this.pruneHistory()) {
      const key = localDateKey(entry.createdAt);
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return Array.from(groups.entries()).map(([key, entries]) => ({
      key,
      label: historyDayLabel(key),
      entries,
      collapsed: this.historyDayCollapseState[key] ?? false,
    }));
  },
  async toggleHistoryDay(this: HistoryHost, key: string) {
    this.historyDayCollapseState = { ...this.historyDayCollapseState, [key]: !(this.historyDayCollapseState[key] ?? false) };
    this.scheduleRequestStorePersist();
  },
  historyTitle(this: HistoryHost, entry: RequestHistoryEntry) {
    return entry.request.url || requestTabLabel(entry.request);
  },
  async recordRequestHistory(this: HistoryHost, httpResponse: HttpResponse, requestSnapshot?: SavedRequest) {
    if (!this.guardWorkspaceWritable('Request history')) return;
    const now = Date.now();
    const baseRequest = requestSnapshot ?? this.snapshotActiveRequest();
    const snapshot = this.normalizeSavedRequestCtx({
      ...baseRequest,
      id: newRequestId(),
      filesystemName: undefined,
      isDraft: false,
      isPinned: false,
      name: requestSnapshot
        ? (baseRequest.name && baseRequest.name !== 'New Request' ? baseRequest.name : requestTabLabel(baseRequest))
        : this.currentRequestName(),
    });
    const entry: RequestHistoryEntry = {
      id: newEntityId('history'),
      request: snapshot,
      statusCode: httpResponse.statusCode,
      status: httpResponse.status,
      duration: httpResponse.duration,
      createdAt: now,
    };
    this.requestHistory = this.pruneHistory([entry, ...this.requestHistory]);
    await this.persistRequestStore(this.requests, this.activeRequestId, this.openRequestIds, this.workspaces, this.collections, this.activeWorkspaceId, this.requestHistory);
  },
  async saveHistoryEntryToCollection(this: HistoryHost, historyId: string, collectionId: string) {
    if (!this.guardWorkspaceWritable('Saving history')) return;
    const entry = this.requestHistory.find(candidate => candidate.id === historyId);
    if (!entry) return;
    if (!collectionId) {
      await this.saveHistoryEntryToNewCollection(historyId);
      return;
    }
    await this.persistActiveRequestNow();
    const request = this.normalizeSavedRequestCtx({
      ...entry.request,
      id: newRequestId(),
      filesystemName: undefined,
      name: requestTabLabel(entry.request),
      collectionId,
      collection: this.collectionNameById(collectionId),
    });
    this.requests = [...this.requests, request];
    this.openRequestIds = [...new Set([...this.openRequestIds, request.id])];
    this.activeWorkspaceId = this.workspaceIdForCollection(collectionId);
    this.openHistoryMenuId = '';
    this.applySavedRequest(request);
    this.topView = 'request';
    await this.persistRequestStore(this.requests, request.id, this.openRequestIds);
  },
  async saveHistoryEntryToNewCollection(this: HistoryHost, historyId: string) {
    if (!this.guardWorkspaceWritable('Saving history')) return;
    const entry = this.requestHistory.find(candidate => candidate.id === historyId);
    if (!entry) return;
    const name = await this.openPromptDialog('New collection', 'History', 'Create a collection for this history request.');
    if (!name) return;
    const workspaceId = this.activeWorkspaceId || this.workspaces[0]?.id;
    if (!workspaceId) return;
    const collection = makeCollection(workspaceId, name);
    this.collections = [...this.collections, collection];
    await this.saveHistoryEntryToCollection(historyId, collection.id);
  },
  async openHistoryEntry(this: HistoryHost, historyId: string) {
    const collectionId = this.activeCollectionId() || this.defaultCollectionForWorkspace(this.activeWorkspaceId)?.id || this.activeWorkspaceCollections()[0]?.id || '';
    await this.saveHistoryEntryToCollection(historyId, collectionId);
  },
  async deleteHistoryEntry(this: HistoryHost, historyId: string) {
    if (!this.guardWorkspaceWritable('Deleting history')) return;
    this.requestHistory = this.requestHistory.filter(entry => entry.id !== historyId);
    this.openHistoryMenuId = '';
    await this.persistRequestStore();
  },
  async clearRequestHistory(this: HistoryHost) {
    if (!this.guardWorkspaceWritable('Clearing history')) return;
    const confirmed = await this.openConfirmDialog('Clear history', 'Clear all request history stored for the last 14 days?', 'Clear history');
    if (!confirmed) return;
    this.requestHistory = [];
    this.historyHeaderMenuOpen = false;
    await this.persistRequestStore();
  },
};
