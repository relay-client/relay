import type { Collection, SavedRequest } from '../../types/models';

type CollectionRunnerDerivedHost = {
  activeWorkspaceId: string;
  collectionRunnerCollectionId: string;
  collectionRunnerDataRows: unknown[];
  collectionRunnerIterations: number;
  collectionRunnerSelectedRequestIds: Set<string>;
  collections: Collection[];
  dirtyRequestIdList: string[];
  activeCollectionId: () => string;
  buildCollectionRunnerSummary: () => {
    total: number;
    completed: number;
    passed: number;
    failed: number;
    skipped: number;
    testsPassed: number;
    testsTotal: number;
    duration: number;
    allPassed: boolean;
  };
  collectionRunnerRequestMatchesFilters: (request: SavedRequest) => boolean;
  requestsForDisplay: () => SavedRequest[];
  savedRequestIsRunnerSkipped: (req: Pick<SavedRequest, 'requestType' | 'url' | 'method'>) => boolean;
};

export const collectionRunnerDerivedFeature = {
  get collectionRunnerCollections(): Collection[] {
    const host = this as unknown as CollectionRunnerDerivedHost;
    return host.collections.filter(collection => collection.workspaceId === host.activeWorkspaceId && !collection.isInvalid);
  },

  get collectionRunnerEffectiveCollectionId(): string {
    const host = this as unknown as CollectionRunnerDerivedHost & { collectionRunnerCollections: Collection[] };
    if (host.collectionRunnerCollections.some(collection => collection.id === host.collectionRunnerCollectionId)) return host.collectionRunnerCollectionId;
    return host.activeCollectionId() || host.collectionRunnerCollections[0]?.id || '';
  },

  get collectionRunnerRequests(): SavedRequest[] {
    const host = this as unknown as CollectionRunnerDerivedHost & { collectionRunnerEffectiveCollectionId: string };
    const collectionId = host.collectionRunnerEffectiveCollectionId;
    if (!collectionId) return [];
    host.dirtyRequestIdList;
    return host.requestsForDisplay().filter(request => !request.isDraft && request.collectionId === collectionId);
  },

  get collectionRunnerFilteredRequests(): SavedRequest[] {
    const host = this as unknown as CollectionRunnerDerivedHost & { collectionRunnerRequests: SavedRequest[] };
    return host.collectionRunnerRequests.filter(request => host.collectionRunnerRequestMatchesFilters(request));
  },

  get collectionRunnerSelectableRequests(): SavedRequest[] {
    const host = this as unknown as CollectionRunnerDerivedHost & { collectionRunnerFilteredRequests: SavedRequest[] };
    return host.collectionRunnerFilteredRequests.filter(request => !host.savedRequestIsRunnerSkipped(request));
  },

  get collectionRunnerSelectedRequests(): SavedRequest[] {
    const host = this as unknown as CollectionRunnerDerivedHost & { collectionRunnerSelectableRequests: SavedRequest[] };
    const selected = host.collectionRunnerSelectedRequestIds;
    return host.collectionRunnerSelectableRequests.filter(request => selected.has(request.id));
  },

  get collectionRunnerSelectedCount(): number {
    const host = this as unknown as { collectionRunnerSelectedRequests: SavedRequest[] };
    return host.collectionRunnerSelectedRequests.length;
  },

  get collectionRunnerRunIterations(): number {
    const host = this as unknown as CollectionRunnerDerivedHost;
    return host.collectionRunnerDataRows.length || host.collectionRunnerIterations;
  },

  get collectionRunnerSummary(): ReturnType<CollectionRunnerDerivedHost['buildCollectionRunnerSummary']> {
    const host = this as unknown as CollectionRunnerDerivedHost;
    return host.buildCollectionRunnerSummary();
  },
};
