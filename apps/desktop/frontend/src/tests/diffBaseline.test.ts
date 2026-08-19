import { describe, expect, it } from 'vitest';
import { responseFeature } from '../lib/stores/features/response';
import { normalizeRequestExample, responseFromExample } from '../lib/examples';
import { emptyHttpResponse } from '../lib/wire';
import { mkRow } from '../lib/constants';
import type { HttpResponse } from '../lib/backend';
import type { RequestExample } from '../lib/types/models';

function example(overrides: Partial<RequestExample> = {}): RequestExample {
  return normalizeRequestExample({
    id: 'ex-1',
    name: 'Created',
    response: {
      statusCode: 201,
      status: '201 Created',
      headers: [{ ...mkRow(), key: 'Content-Type', value: 'application/json' }],
      body: '{\n  "id": 1\n}',
      bodyMediaType: 'application/json',
    },
    ...overrides,
  } as Partial<RequestExample>, 'req-1');
}

function response(body: string): HttpResponse {
  return { ...emptyHttpResponse(), statusCode: 200, status: '200 OK', body };
}

function hostFor(options: {
  examples?: RequestExample[];
  previous?: HttpResponse | null;
  current?: HttpResponse | null;
  selected?: string;
} = {}) {
  const host = {
    ...responseFeature,
    activeRequestId: 'req-1',
    responseTab: 'diff' as string,
    responseTabs: new Map<string, string>(),
    response: options.current ?? response('{\n  "id": 2\n}'),
    requestExamples: options.examples ?? [],
    previousResponses: new Map(options.previous ? [['req-1', options.previous]] : []),
    diffBaselineExampleIds: new Map(options.selected ? [['req-1', options.selected]] : []),
    responseFullBody: (resp?: HttpResponse | null) => resp?.body ?? '',
  };
  return host as unknown as typeof responseFeature & {
    responseTab: string;
    requestExamples: RequestExample[];
    diffBaselineExampleIds: Map<string, string>;
    previousResponses: Map<string, HttpResponse>;
  };
}

describe('responseFromExample', () => {
  it('presents an example the way the diff reads a response', () => {
    const converted = responseFromExample(example());
    expect(converted.statusCode).toBe(201);
    expect(converted.status).toBe('201 Created');
    expect(converted.body).toContain('"id": 1');
    expect(converted.headers[0]).toMatchObject({ key: 'Content-Type', value: 'application/json' });
    expect(converted.size).toBe(converted.body.length);
  });
});

describe('diff baseline', () => {
  it('defaults to the previous response', () => {
    const host = hostFor({ previous: response('{\n  "id": 1\n}') });
    expect(host.diffBaselineExampleId()).toBe('');
    expect(host.diffBaselineLabel()).toBe('previous');
    expect(host.diffBaselineResponse()?.body).toContain('"id": 1');
    expect(host.responseDiff()?.identical).toBe(false);
  });

  it('compares against a chosen example instead', () => {
    const host = hostFor({ examples: [example()], selected: 'ex-1' });
    expect(host.diffBaselineLabel()).toBe('Created');
    expect(host.diffBaselineResponse()?.statusCode).toBe(201);

    const diff = host.responseDiff();
    expect(diff).toBeTruthy();
    expect(diff?.identical).toBe(false);
    expect(diff?.added).toBe(1);
    expect(diff?.removed).toBe(1);
  });

  it('reports a response that still matches its example as unchanged', () => {
    const host = hostFor({
      examples: [example()],
      selected: 'ex-1',
      current: response('{\n  "id": 1\n}'),
    });
    expect(host.responseDiff()?.identical).toBe(true);
  });

  it('offers the previous response and every example as baselines', () => {
    const host = hostFor({
      previous: response('old'),
      examples: [example(), example({ id: 'ex-2', name: 'Rejected' })],
    });
    expect(host.diffBaselineOptions()).toEqual([
      { id: '', label: 'Previous response' },
      { id: 'ex-1', label: 'Created' },
      { id: 'ex-2', label: 'Rejected' },
    ]);
  });

  it('omits the previous response when there is none', () => {
    const host = hostFor({ examples: [example()] });
    expect(host.diffBaselineOptions()).toEqual([{ id: 'ex-1', label: 'Created' }]);
  });

  it('falls back when the chosen example is deleted underneath it', () => {
    const host = hostFor({ examples: [], selected: 'ex-gone', previous: response('old') });
    expect(host.diffBaselineExampleId()).toBe('');
    expect(host.diffBaselineResponse()?.body).toBe('old');
  });

  it('clearing an example baseline goes back to the previous response', () => {
    const host = hostFor({ examples: [example()], selected: 'ex-1', previous: response('old') });
    host.clearResponseDiffBaseline();

    expect(host.diffBaselineExampleId()).toBe('');
    expect(host.diffBaselineResponse()?.body).toBe('old');
    // Still something to compare against, so the tab stays where it is.
    expect(host.responseTab).toBe('diff');
  });

  it('clearing the last baseline closes the tab', () => {
    const host = hostFor({ previous: response('old') });
    host.clearResponseDiffBaseline();

    expect(host.diffBaselineResponse()).toBeNull();
    expect(host.responseTab).toBe('body');
  });

  it('selecting and unselecting an example is per request', () => {
    const host = hostFor({ examples: [example()] });
    host.setDiffBaselineExample('ex-1');
    expect(host.diffBaselineExampleIds.get('req-1')).toBe('ex-1');

    host.setDiffBaselineExample('');
    expect(host.diffBaselineExampleIds.has('req-1')).toBe(false);
  });
});
