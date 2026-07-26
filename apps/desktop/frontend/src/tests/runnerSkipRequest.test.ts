import { describe, it, expect } from 'vitest';

import { collectionRunnerFeature } from '../lib/stores/features/collectionRunner';
import type { HttpResponse } from '../lib/backend';
import type { CollectionRunnerResult, SavedRequest } from '../lib/types/models';

function makeHost() {
  return {
    runnerResultShell: (
      req: SavedRequest,
      status: CollectionRunnerResult['status'] = 'queued',
      runId = '',
      iteration = 1,
    ): CollectionRunnerResult => ({
      runId,
      requestId: req.id,
      name: req.name,
      method: req.method,
      url: req.url,
      status,
      statusCode: 0,
      duration: 0,
      testsPassed: 0,
      testsTotal: 0,
      error: '',
      tests: [],
      iteration,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
    runnerResultFromResponse: collectionRunnerFeature.runnerResultFromResponse,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = { id: 'r1', name: 'Charge card', method: 'POST', url: 'https://api/charge' } as any;

function response(over: Partial<HttpResponse> = {}): HttpResponse {
  return {
    statusCode: 200,
    status: '200 OK',
    headers: [],
    body: '{}',
    duration: 5,
    size: 2,
    preRequestResult: { tests: [] },
    testResult: { tests: [] },
    ...over,
  };
}

describe('runnerResultFromResponse — pm.execution.skipRequest()', () => {
  it('reports a skipped response as skipped, not passed', () => {
    const host = makeHost();
    const result = host.runnerResultFromResponse(req, response({ skipped: true, statusCode: 0, status: '', skipReason: 'skipped by pm.execution.skipRequest()' }), 'run-1', 1);
    expect(result.status).toBe('skipped');
    expect(result.error).toBe('');
  });

  it('still reports a normal 200 as passed', () => {
    const host = makeHost();
    const result = host.runnerResultFromResponse(req, response(), 'run-1', 1);
    expect(result.status).toBe('passed');
  });

  it('still reports a failing assertion as failed', () => {
    const host = makeHost();
    const result = host.runnerResultFromResponse(
      req,
      response({ testResult: { tests: [{ name: 'status', passed: false, error: 'expected 200' }] } }),
      'run-1',
      1,
    );
    expect(result.status).toBe('failed');
    expect(result.testsTotal).toBe(1);
    expect(result.testsPassed).toBe(0);
  });

  it('still reports a transport error as failed', () => {
    const host = makeHost();
    const result = host.runnerResultFromResponse(req, response({ error: 'connection refused' }), 'run-1', 1);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('connection refused');
  });

  it('reports a pre-request script error as failed', () => {
    const host = makeHost();
    const result = host.runnerResultFromResponse(
      req,
      response({ preRequestResult: { tests: [], error: 'ReferenceError: foo is not defined' } }),
      'run-1',
      1,
    );
    expect(result.status).toBe('failed');
    expect(result.error).toContain('ReferenceError');
  });
});
