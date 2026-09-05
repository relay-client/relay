import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/backend', () => ({
  saveHistoryResponse: vi.fn(),
  loadHistoryResponse: vi.fn(),
  pruneHistoryResponses: vi.fn(),
  clearHistoryResponses: vi.fn(),
}));

import { clearHistoryResponses, loadHistoryResponse, pruneHistoryResponses, saveHistoryResponse } from '../lib/backend';
import { historyFeature } from '../lib/stores/features/history';
import { emptyHttpResponse } from '../lib/wire';

const mockSave = vi.mocked(saveHistoryResponse);
const mockLoad = vi.mocked(loadHistoryResponse);
const mockPrune = vi.mocked(pruneHistoryResponses);
const mockClear = vi.mocked(clearHistoryResponses);

function makeHost(over: Record<string, unknown> = {}) {
  return {
    requestHistory: [],
    requests: [],
    workspaces: [],
    collections: [],
    openRequestIds: [],
    activeRequestId: 'req-1',
    activeWorkspaceId: 'ws-1',
    openHistoryMenuId: '',
    historyHeaderMenuOpen: false,
    requestError: '',
    collectionImportToast: '',
    guardWorkspaceWritable: () => true,
    normalizeSavedRequestCtx: (input: Record<string, unknown>) => input,
    snapshotActiveRequest: () => ({ name: 'Req', method: 'GET', url: 'https://example.test' }),
    currentRequestName: () => 'Req',
    persistRequestStore: vi.fn(async () => true),
    openConfirmDialog: vi.fn(async () => true),
    setActiveResponse: vi.fn(),
    setActiveResponseTab: vi.fn(),
    pruneHistory: historyFeature.pruneHistory,
    pruneStoredResponses: historyFeature.pruneStoredResponses,
    recordRequestHistory: historyFeature.recordRequestHistory,
    showHistoryResponse: historyFeature.showHistoryResponse,
    loadStoredHistoryResponse: historyFeature.loadStoredHistoryResponse,
    deleteHistoryEntry: historyFeature.deleteHistoryEntry,
    clearRequestHistory: historyFeature.clearRequestHistory,
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const response = (over: Record<string, unknown> = {}) => ({
  ...emptyHttpResponse(),
  statusCode: 200,
  status: '200 OK',
  duration: 12,
  size: 34,
  body: '{"ok":true}',
  headers: [{ key: 'Content-Type', value: 'application/json', enabled: true, isFile: false, fileName: '' }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSave.mockResolvedValue({ stored: true, truncated: false });
  mockLoad.mockResolvedValue({ stored: false, truncated: false });
  mockPrune.mockResolvedValue('');
  mockClear.mockResolvedValue('');
});

describe('recording a response', () => {
  it('stores the response and records what it was', async () => {
    const host = makeHost();
    await host.recordRequestHistory(response());

    expect(mockSave).toHaveBeenCalledTimes(1);
    const [id, payload] = mockSave.mock.calls[0];
    expect(id).toBe(host.requestHistory[0].id);
    expect(JSON.parse(payload).body).toBe('{"ok":true}');

    expect(host.requestHistory[0]).toMatchObject({
      statusCode: 200,
      responseStored: true,
      responseSize: 34,
      responseContentType: 'application/json',
    });
  });

  it('leaves the timeline and wire trace out of what it stores', async () => {
    const host = makeHost();
    await host.recordRequestHistory(response({
      timeline: [{ label: 'dns', atMs: 1 }],
      sentRequests: [{ method: 'GET', url: 'https://example.test', proto: 'HTTP/1.1', headers: [] }],
    }));

    const stored = JSON.parse(mockSave.mock.calls[0][1]);
    expect(stored.timeline).toEqual([]);
    expect(stored.sentRequests).toEqual([]);
  });

  it('does not store the body of a binary response', async () => {
    const host = makeHost();
    await host.recordRequestHistory(response({ bodyIsBinary: true, body: '���' }));

    expect(JSON.parse(mockSave.mock.calls[0][1]).body).toBe('');
    expect(host.requestHistory[0].responseStored).toBe(true);
  });

  it('still records the entry when the response cannot be stored', async () => {
    mockSave.mockRejectedValue(new Error('disk full'));
    const host = makeHost();
    await host.recordRequestHistory(response());

    expect(host.requestHistory).toHaveLength(1);
    expect(host.requestHistory[0].responseStored).toBe(false);
  });
});

describe('reopening a stored response', () => {
  it('puts the stored response in the viewer', async () => {
    mockLoad.mockResolvedValue({ stored: true, truncated: false, payload: JSON.stringify(response({ body: 'stored body' })) });
    const host = makeHost({ requestHistory: [{ id: 'history-1', responseStored: true }] });

    await host.showHistoryResponse('history-1');

    expect(host.setActiveResponse).toHaveBeenCalledTimes(1);
    expect(host.setActiveResponse.mock.calls[0][0].body).toBe('stored body');
    expect(host.setActiveResponseTab).toHaveBeenCalledWith('body');
  });

  it('says so when a truncated response is reopened', async () => {
    mockLoad.mockResolvedValue({ stored: true, truncated: false, payload: JSON.stringify(response()) });
    const host = makeHost({ requestHistory: [{ id: 'history-1', responseStored: true, responseTruncated: true }] });

    await host.showHistoryResponse('history-1');

    expect(host.setActiveResponse.mock.calls[0][0].warnings.join(' ')).toContain('truncated');
  });

  it('reports an entry with nothing stored instead of failing', async () => {
    const host = makeHost({ requestHistory: [{ id: 'history-1' }] });

    await host.showHistoryResponse('history-1');

    expect(host.setActiveResponse).not.toHaveBeenCalled();
    expect(host.collectionImportToast).toContain('No response stored');
    expect(host.requestError).toBe('');
  });

  it('surfaces a read failure rather than showing nothing', async () => {
    mockLoad.mockResolvedValue({ stored: false, truncated: false, error: 'key mismatch' });
    const host = makeHost({ requestHistory: [{ id: 'history-1', responseStored: true }] });

    await host.showHistoryResponse('history-1');

    expect(host.requestError).toContain('key mismatch');
  });
});

describe('cleaning up stored responses', () => {
  it('keeps only the entries history still holds', async () => {
    const host = makeHost({ requestHistory: [{ id: 'keep-1' }, { id: 'keep-2' }] });
    await host.pruneStoredResponses();
    expect(mockPrune).toHaveBeenCalledWith(['keep-1', 'keep-2']);
  });

  it('prunes after an entry is deleted', async () => {
    const host = makeHost({ requestHistory: [{ id: 'history-1' }, { id: 'history-2' }] });
    await host.deleteHistoryEntry('history-1');
    expect(host.requestHistory.map((entry: { id: string }) => entry.id)).toEqual(['history-2']);
    expect(mockPrune).toHaveBeenCalledWith(['history-2']);
  });

  it('clears stored responses when history is cleared', async () => {
    const host = makeHost({ requestHistory: [{ id: 'history-1' }] });
    await host.clearRequestHistory();
    expect(host.requestHistory).toEqual([]);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });
});

describe('opening an entry', () => {
  it('restores the response alongside the request', async () => {
    mockLoad.mockResolvedValue({ stored: true, truncated: false, payload: JSON.stringify(response({ body: 'from history' })) });
    const host = makeHost({
      requestHistory: [{ id: 'history-1', responseStored: true }],
      activeCollectionId: () => 'col-1',
      saveHistoryEntryToCollection: vi.fn(async () => undefined),
      openHistoryEntry: historyFeature.openHistoryEntry,
      showHistoryResponse: historyFeature.showHistoryResponse,
    });

    await host.openHistoryEntry('history-1');

    expect(host.saveHistoryEntryToCollection).toHaveBeenCalledWith('history-1', 'col-1');
    expect(host.setActiveResponse.mock.calls[0][0].body).toBe('from history');
  });

  it('opens an entry with no stored response without complaining', async () => {
    const host = makeHost({
      requestHistory: [{ id: 'history-1' }],
      activeCollectionId: () => 'col-1',
      saveHistoryEntryToCollection: vi.fn(async () => undefined),
      openHistoryEntry: historyFeature.openHistoryEntry,
      showHistoryResponse: historyFeature.showHistoryResponse,
    });

    await host.openHistoryEntry('history-1');

    expect(host.setActiveResponse).not.toHaveBeenCalled();
    expect(host.requestError).toBe('');
  });
});
