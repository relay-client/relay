import { clearHistoryResponses, loadHistoryResponse, pruneHistoryResponses, saveHistoryResponse } from '../../backend';
import type { HttpResponse } from '../../backend';
import { makeCollection } from '../../normalizers';
import { historyDayLabel, localDateKey, newEntityId, newRequestId, requestTabLabel } from '../../utils';
import type { Collection, HistoryDayGroup, PersistRequestStore, RequestExample, RequestHistoryEntry, ResponseTab, SavedRequest, Workspace } from '../../types/models';
import { exampleFromResponse } from '../../examples';

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
  setActiveResponse: (response: HttpResponse | null, requestId?: string) => void;
  setActiveResponseTab: (tab: ResponseTab, requestId?: string) => void;
  pruneStoredResponses: () => Promise<void>;
  showHistoryResponse: (historyId: string) => Promise<void>;
  loadStoredHistoryResponse: (historyId: string) => Promise<HttpResponse | null>;
  saveHistoryEntryAsExample: (historyId: string) => Promise<void>;
  addCapturedExample: (example: RequestExample) => void;
  activeSecretEnvironmentValues: () => string[];
  requestError: string;
  collectionImportToast: string;
};

const HISTORY_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 1000;

function historyResponseSnapshot(response: HttpResponse): HttpResponse {
  return {
    ...response,
    timeline: [],
    sentRequests: [],
    body: response.bodyIsBinary ? '' : response.body,
    previewImageBase64: '',
  };
}

export function historyContentType(response: HttpResponse): string {
  return (response.headers ?? []).find(header => header.key.toLowerCase() === 'content-type')?.value ?? '';
}

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
      responseSize: httpResponse.size,
      responseContentType: historyContentType(httpResponse),
    };

    try {
      const result = await saveHistoryResponse(entry.id, JSON.stringify(historyResponseSnapshot(httpResponse)));
      entry.responseStored = result.stored;
      entry.responseTruncated = result.truncated;
    } catch {
      entry.responseStored = false;
    }

    this.requestHistory = this.pruneHistory([entry, ...this.requestHistory]);
    await this.persistRequestStore(this.requests, this.activeRequestId, this.openRequestIds, this.workspaces, this.collections, this.activeWorkspaceId, this.requestHistory);
    void this.pruneStoredResponses();
  },

  async pruneStoredResponses(this: HistoryHost) {
    try {
      await pruneHistoryResponses(this.requestHistory.map(entry => entry.id));
    } catch {
    }
  },

  async loadStoredHistoryResponse(this: HistoryHost, historyId: string): Promise<HttpResponse | null> {
    const entry = this.requestHistory.find(candidate => candidate.id === historyId);
    if (!entry) return null;

    let result;
    try {
      result = await loadHistoryResponse(historyId);
    } catch (error) {
      this.requestError = error instanceof Error ? error.message : String(error);
      return null;
    }
    if (result.error) {
      this.requestError = `Could not read the stored response: ${result.error}`;
      return null;
    }
    if (!result.stored || !result.payload) {
      this.collectionImportToast = 'No response stored for this entry';
      setTimeout(() => (this.collectionImportToast = ''), 2200);
      return null;
    }

    let response: HttpResponse;
    try {
      response = JSON.parse(result.payload) as HttpResponse;
    } catch {
      this.requestError = 'The stored response could not be read.';
      return null;
    }
    if (entry.responseTruncated) {
      response = { ...response, warnings: [...(response.warnings ?? []), 'This stored response was truncated when it was recorded.'] };
    }
    this.requestError = '';
    return response;
  },

  async showHistoryResponse(this: HistoryHost, historyId: string) {
    this.openHistoryMenuId = '';
    const response = await this.loadStoredHistoryResponse(historyId);
    if (!response) return;
    this.setActiveResponse(response);
    this.setActiveResponseTab('body');
  },
  async saveHistoryEntryAsExample(this: HistoryHost, historyId: string) {
    if (!this.guardWorkspaceWritable('Saving an example')) return;
    const entry = this.requestHistory.find(candidate => candidate.id === historyId);
    if (!entry || !this.activeRequestId) return;
    this.openHistoryMenuId = '';

    const response = await this.loadStoredHistoryResponse(historyId);
    if (!response) return;
    this.addCapturedExample(exampleFromResponse(entry.request, response, {
      secretValues: this.activeSecretEnvironmentValues(),
      name: `${response.statusCode} ${requestTabLabel(entry.request)}`.trim(),
    }));
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
    const entry = this.requestHistory.find(candidate => candidate.id === historyId);
    await this.saveHistoryEntryToCollection(historyId, collectionId);
    if (entry?.responseStored) await this.showHistoryResponse(historyId);
  },
  async deleteHistoryEntry(this: HistoryHost, historyId: string) {
    if (!this.guardWorkspaceWritable('Deleting history')) return;
    this.requestHistory = this.requestHistory.filter(entry => entry.id !== historyId);
    this.openHistoryMenuId = '';
    await this.persistRequestStore();
    void this.pruneStoredResponses();
  },
  async clearRequestHistory(this: HistoryHost) {
    if (!this.guardWorkspaceWritable('Clearing history')) return;
    const confirmed = await this.openConfirmDialog('Clear history', 'Clear all request history stored for the last 14 days?', 'Clear history');
    if (!confirmed) return;
    this.requestHistory = [];
    this.historyHeaderMenuOpen = false;
    await this.persistRequestStore();
    try { await clearHistoryResponses(); } catch {  }
  },
};
