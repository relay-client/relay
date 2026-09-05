import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/backend', async () => {
  const wire = await import('../lib/wire');
  return {
    ...wire,
    startMockServer: vi.fn(),
    stopMockServer: vi.fn(),
    mockServerStatus: vi.fn(),
    mockServerLog: vi.fn(async () => []),
  };
});

import * as backend from '../lib/backend';
import { EMPTY_MOCK_SERVER_STATUS } from '../lib/wire';
import { collectionsWithExamples, mockRouteConflicts, mockRoutesForCollection } from '../lib/mockRoutes';
import { mockServerFeature } from '../lib/stores/features/mockServer';
import { normalizeSavedRequest } from '../lib/normalizers';
import type { SavedRequest } from '../lib/types/models';

function requestWithExamples(overrides: Partial<SavedRequest>, examples: unknown[]): SavedRequest {
  return normalizeSavedRequest(
    { id: 'req-1', name: 'List pets', method: 'GET', url: 'https://api.test/pets', ...overrides, examples } as never,
    [],
    'workspace-main',
  );
}

const okExample = {
  id: 'ex-1',
  name: 'Two pets',
  response: {
    statusCode: 200,
    status: '200 OK',
    headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
    body: '[{"id":1}]',
    bodyMediaType: 'application/json',
    durationMs: 42,
  },
  snapshot: { method: 'GET', url: 'https://api.test/pets' },
  match: { pathTemplate: '/pets' },
};

describe('mockRoutesForCollection', () => {
  it('turns each example into a route carrying what the mock has to replay', () => {
    const routes = mockRoutesForCollection(
      [requestWithExamples({ collectionId: 'col-1' }, [okExample])],
      'col-1',
    );

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      method: 'GET',
      pathTemplate: '/pets',
      statusCode: 200,
      body: '[{"id":1}]',
      bodyMediaType: 'application/json',
      exampleName: 'Two pets',
      requestName: 'List pets',
      delayMs: 42,
    });
    expect(routes[0].headers.map(header => header.key)).toContain('Content-Type');
  });

  it('takes only the collection asked for', () => {
    const requests = [
      requestWithExamples({ id: 'a', collectionId: 'col-1' }, [okExample]),
      requestWithExamples({ id: 'b', collectionId: 'col-2' }, [{ ...okExample, id: 'ex-2' }]),
    ];
    expect(mockRoutesForCollection(requests, 'col-1')).toHaveLength(1);
    expect(mockRoutesForCollection(requests, 'col-2')).toHaveLength(1);
    expect(mockRoutesForCollection(requests, 'col-3')).toHaveLength(0);
  });

  it('carries a query constraint the example recorded', () => {
    const withQuery = { ...okExample, match: { pathTemplate: '/pets', query: { status: 'open' } } };
    const routes = mockRoutesForCollection([requestWithExamples({ collectionId: 'c' }, [withQuery])], 'c');
    expect(routes[0].query).toEqual([expect.objectContaining({ key: 'status', value: 'open' })]);
  });

  it('falls back to the Content-Type header when no media type was stored', () => {
    const noMediaType = {
      ...okExample,
      response: { ...okExample.response, bodyMediaType: '', headers: [{ key: 'Content-Type', value: 'text/csv; charset=utf-8', enabled: true }] },
    };
    const routes = mockRoutesForCollection([requestWithExamples({ collectionId: 'c' }, [noMediaType])], 'c');
    expect(routes[0].bodyMediaType).toBe('text/csv');
  });
});

describe('collectionsWithExamples', () => {
  it('names only the collections that have something to serve', () => {
    const requests = [
      requestWithExamples({ id: 'a', collectionId: 'col-1' }, [okExample]),
      normalizeSavedRequest({ id: 'b', name: 'Bare', collectionId: 'col-2' } as never, [], 'workspace-main'),
    ];
    expect([...collectionsWithExamples(requests)]).toEqual(['col-1']);
  });
});

describe('mockRouteConflicts', () => {
  it('reports two examples that would answer the same request', () => {
    const routes = mockRoutesForCollection(
      [requestWithExamples({ collectionId: 'c' }, [okExample, { ...okExample, id: 'ex-2', name: 'Empty' }])],
      'c',
    );
    expect(mockRouteConflicts(routes).size).toBe(1);
  });

  it('says nothing when the routes are distinct', () => {
    const other = { ...okExample, id: 'ex-2', match: { pathTemplate: '/pets/:id' } };
    const routes = mockRoutesForCollection([requestWithExamples({ collectionId: 'c' }, [okExample, other])], 'c');
    expect(mockRouteConflicts(routes).size).toBe(0);
  });
});

function makeHost(overrides: Record<string, unknown> = {}) {
  const host = {
    collections: [{ id: 'col-1', name: 'Petstore' }],
    requests: [requestWithExamples({ collectionId: 'col-1' }, [okExample])],
    activeWorkspaceId: 'workspace-main',
    topView: 'overview',
    activeRequestId: '',
    mockServerTabOpen: false,
    mockServer: { ...EMPTY_MOCK_SERVER_STATUS },
    mockServerCollectionId: '',
    mockServerPort: 3100,
    mockServerSimulateLatency: false,
    mockServerBusy: false,
    mockServerLog: [],
    mockServerError: '',
    closeFloatingMenus: () => {},
    guardWorkspaceWritable: () => true,
    openAlertDialog: async () => {},
    ...overrides,
  };
  return Object.assign(host, Object.fromEntries(
    Object.entries(mockServerFeature).map(([key, value]) => [key, (value as () => unknown).bind(host)]),
  )) as typeof host & Record<string, (...args: never[]) => unknown>;
}

describe('mock server feature', () => {
  it('starts the selected collection and records what came back', async () => {
    vi.mocked(backend.startMockServer).mockResolvedValueOnce({
      running: true, port: 3100, url: 'http://127.0.0.1:3100',
      collectionId: 'col-1', collectionName: 'Petstore', routeCount: 1,
    });
    const host = makeHost();

    await host.startMockServerForCollection();

    expect(backend.startMockServer).toHaveBeenCalledWith(expect.objectContaining({
      port: 3100,
      collectionId: 'col-1',
      collectionName: 'Petstore',
      simulateLatency: false,
    }));
    expect(host.mockServer.running).toBe(true);
    expect(host.mockServerError).toBe('');
  });

  it('surfaces the reason a start was refused instead of looking started', async () => {
    vi.mocked(backend.startMockServer).mockResolvedValueOnce({
      ...EMPTY_MOCK_SERVER_STATUS,
      error: 'port 3100 is already in use — pick another one',
    });
    const host = makeHost();

    await host.startMockServerForCollection();

    expect(host.mockServer.running).toBe(false);
    expect(host.mockServerError).toMatch(/already in use/);
  });

  it('defaults to the first collection that actually has examples', () => {
    const host = makeHost({
      collections: [{ id: 'empty', name: 'Empty' }, { id: 'col-1', name: 'Petstore' }],
    });
    expect(host.mockServerTargetCollectionId()).toBe('col-1');
  });

  it('respects an explicit collection choice', () => {
    const host = makeHost({ mockServerCollectionId: 'empty' });
    expect(host.mockServerTargetCollectionId()).toBe('empty');
    expect(host.mockServerRoutes()).toHaveLength(0);
  });

  it('stops without leaving stale status behind', async () => {
    vi.mocked(backend.stopMockServer).mockResolvedValueOnce({ ...EMPTY_MOCK_SERVER_STATUS });
    const host = makeHost({
      mockServer: { running: true, port: 3100, url: 'http://127.0.0.1:3100', collectionId: 'col-1', collectionName: 'Petstore', routeCount: 1 },
    });

    await host.toggleMockServer();

    expect(backend.stopMockServer).toHaveBeenCalled();
    expect(host.mockServer.running).toBe(false);
  });

  it('caps the request log so a long-running mock cannot grow without bound', () => {
    const host = makeHost();
    for (let i = 0; i < 260; i += 1) {
      host.recordMockRequest({
        id: `mock-${i}`, method: 'GET', path: '/pets', query: '', matched: true,
        statusCode: 200, durationMs: 1, timestamp: i,
      } as never);
    }
    expect(host.mockServerLog).toHaveLength(200);
    expect(host.mockServerLog[199].id).toBe('mock-259');
  });

  it('closing the tab returns to a view that exists', () => {
    const host = makeHost({ topView: 'mock', mockServerTabOpen: true, activeRequestId: '' });
    host.closeMockServerTab();
    expect(host.mockServerTabOpen).toBe(false);
    expect(host.topView).toBe('overview');
  });
});
