import { mockServerLog, mockServerStatus, startMockServer, stopMockServer } from '../../backend';
import type { MockRequestLog, MockServerStatus } from '../../backend';
import { EMPTY_MOCK_SERVER_STATUS } from '../../wire';
import { DEFAULT_MOCK_PORT, mockRoutesForCollection, mockRoutesSignature } from '../../mockRoutes';
import type { Collection, SavedRequest } from '../../types/models';

const MOCK_MAX_LOG_ENTRIES = 200;

type MockServerHost = {
  collections: Collection[];
  requests: SavedRequest[];
  activeWorkspaceId: string;
  mockServer: MockServerStatus;
  mockServerCollectionId: string;
  mockServerPort: number;
  mockServerSimulateLatency: boolean;
  mockServerBusy: boolean;
  mockServerLog: MockRequestLog[];
  mockServerError: string;
  mockServerRunningSignature: string;
  topView: string;
  activeRequestId: string;
  mockServerTabOpen: boolean;
  closeFloatingMenus: () => void;
  switchRequest: (id: string) => Promise<void>;
  selectExample: (id: string) => void;
  requestTab: string;
  guardWorkspaceWritable: (action?: string) => boolean;
  openAlertDialog: (title: string, message: string) => Promise<void>;
  mockServerRoutes: () => ReturnType<typeof mockRoutesForCollection>;
  mockServerTargetCollectionId: () => string;
  mockServerRoutesChanged: () => boolean;
  startMockServerForCollection: (options?: { keepLog?: boolean }) => Promise<void>;
  refreshMockServerStatus: () => Promise<void>;
  stopMockServerNow: () => Promise<void>;
};

export const mockServerFeature = {
  openMockServerTab(this: MockServerHost) {
    this.closeFloatingMenus();
    this.mockServerTabOpen = true;
    this.topView = 'mock';
    void this.refreshMockServerStatus();
  },

  closeMockServerTab(this: MockServerHost) {
    this.mockServerTabOpen = false;
    if (this.topView === 'mock') {
      this.topView = this.activeRequestId ? 'request' : 'overview';
    }
  },

  mockServerTargetCollectionId(this: MockServerHost) {
    if (this.mockServerCollectionId) return this.mockServerCollectionId;
    const withExamples = this.collections.find(collection =>
      this.requests.some(request => request.collectionId === collection.id && request.examples?.length));
    return withExamples?.id ?? this.collections[0]?.id ?? '';
  },

  mockServerRoutes(this: MockServerHost) {
    return mockRoutesForCollection(this.requests, this.mockServerTargetCollectionId());
  },

  mockServerRouteCount(this: MockServerHost) {
    return this.mockServerRoutes().length;
  },

  mockServerCollectionOptions(this: MockServerHost) {
    return this.collections.map(collection => ({
      id: collection.id,
      name: collection.name,
      exampleCount: this.requests
        .filter(request => request.collectionId === collection.id)
        .reduce((total, request) => total + (request.examples?.length ?? 0), 0),
    }));
  },

  async refreshMockServerStatus(this: MockServerHost) {
    try {
      this.mockServer = await mockServerStatus();
      if (this.mockServer.running) {
        this.mockServerLog = (await mockServerLog()).slice(-MOCK_MAX_LOG_ENTRIES);
        if (this.mockServer.collectionId) this.mockServerCollectionId = this.mockServer.collectionId;
        if (this.mockServer.port) this.mockServerPort = this.mockServer.port;
      }
    } catch {
      this.mockServer = EMPTY_MOCK_SERVER_STATUS;
    }
  },

  async startMockServerForCollection(this: MockServerHost, options: { keepLog?: boolean } = {}) {
    if (this.mockServerBusy) return;
    if (!this.guardWorkspaceWritable('The mock server')) return;
    const collectionId = this.mockServerTargetCollectionId();
    if (!collectionId) {
      this.mockServerError = 'Create a collection and capture an example first.';
      return;
    }
    const routes = mockRoutesForCollection(this.requests, collectionId);
    const collection = this.collections.find(candidate => candidate.id === collectionId);
    this.mockServerBusy = true;
    this.mockServerError = '';
    try {
      const status = await startMockServer({
        port: this.mockServerPort || DEFAULT_MOCK_PORT,
        collectionId,
        collectionName: collection?.name ?? '',
        routes,
        simulateLatency: this.mockServerSimulateLatency,
      });
      this.mockServer = status;
      this.mockServerError = status.error ?? '';
      if (status.running) {
        if (!options.keepLog) this.mockServerLog = [];
        this.mockServerCollectionId = collectionId;
        this.mockServerPort = status.port;
        this.mockServerRunningSignature = mockRoutesSignature(routes);
      }
    } catch (error) {
      this.mockServer = EMPTY_MOCK_SERVER_STATUS;
      this.mockServerError = error instanceof Error ? error.message : String(error);
    } finally {
      this.mockServerBusy = false;
    }
  },

  async stopMockServerNow(this: MockServerHost) {
    if (this.mockServerBusy) return;
    this.mockServerBusy = true;
    try {
      this.mockServer = await stopMockServer();
      this.mockServerError = '';
      this.mockServerRunningSignature = '';
    } catch (error) {
      this.mockServerError = error instanceof Error ? error.message : String(error);
    } finally {
      this.mockServerBusy = false;
    }
  },

  async toggleMockServer(this: MockServerHost) {
    if (this.mockServer.running) {
      await this.stopMockServerNow();
      return;
    }
    await this.startMockServerForCollection();
  },

  mockServerRoutesChanged(this: MockServerHost) {
    if (!this.mockServer.running) return false;
    if (this.mockServer.collectionId !== this.mockServerTargetCollectionId()) return false;
    return mockRoutesSignature(this.mockServerRoutes()) !== this.mockServerRunningSignature;
  },

  async reloadMockServerRoutes(this: MockServerHost) {
    if (!this.mockServer.running || this.mockServerBusy) return;
    if (!this.mockServerRoutesChanged()) return;
    await this.startMockServerForCollection({ keepLog: true });
  },

  async restartMockServerWithCurrentExamples(this: MockServerHost) {
    if (!this.mockServer.running) return;
    await this.startMockServerForCollection({ keepLog: true });
  },

  recordMockRequest(this: MockServerHost, entry: MockRequestLog) {
    const next = [...this.mockServerLog, entry];
    this.mockServerLog = next.length > MOCK_MAX_LOG_ENTRIES
      ? next.slice(next.length - MOCK_MAX_LOG_ENTRIES)
      : next;
  },

  async openMockRouteExample(this: MockServerHost, exampleId: string) {
    if (!exampleId) return;
    const owner = this.requests.find(request => request.examples?.some(example => example.id === exampleId));
    if (!owner) return;
    await this.switchRequest(owner.id);
    this.requestTab = 'examples';
    this.selectExample(exampleId);
  },

  clearMockServerLog(this: MockServerHost) {
    this.mockServerLog = [];
  },

  selectMockServerCollection(this: MockServerHost, collectionId: string) {
    this.mockServerCollectionId = collectionId;
  },

  setMockServerPort(this: MockServerHost, port: number) {
    this.mockServerPort = Number.isFinite(port) && port > 0 ? Math.floor(port) : DEFAULT_MOCK_PORT;
  },
};
