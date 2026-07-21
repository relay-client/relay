import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/backend', () => ({
  openFileDialog: vi.fn(),
  readTextFile: vi.fn(),
  saveFileDialog: vi.fn(),
}));

import { openFileDialog, readTextFile } from '../lib/backend';
import { responseFeature } from '../lib/stores/features/response';
import type { HttpResponse } from '../lib/backend';

const mockOpen = vi.mocked(openFileDialog);
const mockRead = vi.mocked(readTextFile);

type Host = {
  response: HttpResponse | null;
  responses: Map<string, HttpResponse>;
  responseTab: string;
  responseTabs: Map<string, string>;
  requestError: string;
  responseSearchOpen: boolean;
  responseSearch: string;
  responseSearchIndex: number;
  responseBodyPage: number;
  activeRequestId: string;
  setActiveResponse: typeof responseFeature.setActiveResponse;
  setActiveResponseTab: typeof responseFeature.setActiveResponseTab;
  loadResponseFromFile: typeof responseFeature.loadResponseFromFile;
};

function makeHost(): Host {
  return {
    response: null,
    responses: new Map(),
    responseTab: 'headers',
    responseTabs: new Map(),
    requestError: 'previous error',
    responseSearchOpen: true,
    responseSearch: 'stale',
    responseSearchIndex: 4,
    responseBodyPage: 3,
    activeRequestId: 'req-1',
    setActiveResponse: responseFeature.setActiveResponse,
    setActiveResponseTab: responseFeature.setActiveResponseTab,
    loadResponseFromFile: responseFeature.loadResponseFromFile,
  } as Host;
}

function contentType(host: Host) {
  return host.response?.headers.find(h => h.key === 'Content-Type')?.value;
}

describe('loadResponseFromFile', () => {
  beforeEach(() => {
    mockOpen.mockReset();
    mockRead.mockReset();
  });

  it('loads a JSON file into the response viewer and resets viewer state', async () => {
    const body = '[\n  { "id": 0 }\n]';
    mockOpen.mockResolvedValue('/tmp/huge-response.json');
    mockRead.mockResolvedValue(body);

    const host = makeHost();
    await host.loadResponseFromFile();

    expect(host.response?.body).toBe(body);
    expect(host.response?.statusCode).toBe(200);
    expect(host.response?.size).toBe(new TextEncoder().encode(body).length);
    expect(contentType(host)).toBe('application/json');
    // active response is persisted for the active request
    expect(host.responses.get('req-1')?.body).toBe(body);
    // a stale request error must not shadow the loaded body
    expect(host.requestError).toBe('');
    // viewer state is reset so search/paging start clean
    expect(host.responseSearchOpen).toBe(false);
    expect(host.responseSearch).toBe('');
    expect(host.responseSearchIndex).toBe(0);
    expect(host.responseBodyPage).toBe(0);
    expect(host.responseTab).toBe('body');
  });

  it('infers content type from contents when the extension is unknown', async () => {
    mockOpen.mockResolvedValue('/tmp/payload.dat');
    mockRead.mockResolvedValue('   { "ok": true }');
    const host = makeHost();
    await host.loadResponseFromFile();
    expect(contentType(host)).toBe('application/json');
  });

  it('falls back to text/plain for non-JSON, non-HTML files', async () => {
    mockOpen.mockResolvedValue('/tmp/notes.log');
    mockRead.mockResolvedValue('just some plain text');
    const host = makeHost();
    await host.loadResponseFromFile();
    expect(contentType(host)).toBe('text/plain');
  });

  it('detects HTML by extension', async () => {
    mockOpen.mockResolvedValue('/tmp/page.html');
    mockRead.mockResolvedValue('<!doctype html><html></html>');
    const host = makeHost();
    await host.loadResponseFromFile();
    expect(contentType(host)).toBe('text/html');
  });

  it('does nothing when the file dialog is cancelled', async () => {
    mockOpen.mockResolvedValue('');
    const host = makeHost();
    await host.loadResponseFromFile();
    expect(mockRead).not.toHaveBeenCalled();
    expect(host.response).toBeNull();
    expect(host.requestError).toBe('previous error');
  });
});
