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

// What is worth keeping to make a past response readable again. The timeline and
// the trace of what went on the wire are left out: they describe a connection
// that no longer exists, and they are the bulky part.
function historyResponseSnapshot(response: HttpResponse): HttpResponse {
  return {
    ...response,
    timeline: [],
    sentRequests: [],
    // The bytes of a binary response do not survive the trip to the interface,
    // so there is nothing faithful to store. The row still records what it was.
    body: response.bodyIsBinary ? '' : response.body,
    previewImageBase64: '',
  };
}

function responseContentType(response: HttpResponse): string {
  return response.headers.find(header => header.key.toLowerCase() === 'content-type')?.value ?? '';
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
      responseContentType: responseContentType(httpResponse),
    };

    // Store the response before the entry is announced, so a row never claims a
    // response that is not on disk. A failure here costs the body, not the entry.
    try {
      const result = await saveHistoryResponse(entry.id, JSON.stringify(historyResponseSnapshot(httpResponse)));
      entry.responseStored = result.stored;
      entry.responseTruncated = result.truncated;
    } catch {
      entry.responseStored = false;
    }

    this.requestHistory = this.pruneHistory([entry, ...this.requestHistory]);
    await this.persistRequestStore(this.requests, this.activeRequestId, this.openRequestIds, this.workspaces, this.collections, this.activeWorkspaceId, this.requestHistory);
    // Entries that just fell out of the window leave their bodies behind
    // otherwise; the files would outlive every entry that referred to them.
    void this.pruneStoredResponses();
  },

  // Deletes stored responses for entries history no longer holds. Best-effort:
  // a failure here leaves files on disk, which is not worth interrupting a send.
  async pruneStoredResponses(this: HistoryHost) {
    try {
      await pruneHistoryResponses(this.requestHistory.map(entry => entry.id));
    } catch {
      // keep going; the next prune will pick them up
    }
  },

  // Reads a stored response off disk, reporting the ways it can fail in one
  // place. Both viewing a past response and keeping one as an example need it,
  // and they must fail identically.
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

  // Reopens a past response in the viewer. The request itself is not touched:
  // this answers "what did it come back with", not "send it again".
  async showHistoryResponse(this: HistoryHost, historyId: string) {
    this.openHistoryMenuId = '';
    const response = await this.loadStoredHistoryResponse(historyId);
    if (!response) return;
    this.setActiveResponse(response);
    this.setActiveResponseTab('body');
  },
  /**
   * Keep a past response as an example on the request currently being edited.
   * A history entry's request is a snapshot with an id of its own, so there is
   * no original request to attach to — the open one is the only sensible target,
   * and the toast names what it went to.
   */
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
  // Opening an entry restores both halves of it: the request as a new draft, and
  // the response it came back with. Looking at what an endpoint returned an hour
  // ago is the usual reason to come here, and re-sending to find out would defeat
  // the point — the server may well answer differently now.
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
    // Clearing history has to clear the stored responses too, or the bodies
    // outlive the entries the user just asked to be rid of.
    try { await clearHistoryResponses(); } catch { /* the next prune sweeps them */ }
  },
};
