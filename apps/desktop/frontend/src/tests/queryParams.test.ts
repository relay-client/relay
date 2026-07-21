import { describe, expect, it } from 'vitest';
import { mkRow } from '../lib/constants';
import type { KVRow } from '../lib/types/models';
import {
  buildQuery,
  flattenUrlParams,
  paramsFromUrl,
  parseQuery,
  splitUrl,
  urlWithParams,
} from '../lib/queryParams';
import { requestBodyFeature } from '../lib/stores/features/requestBody';

const row = (key: string, value: string, enabled = true, description = ''): KVRow => ({
  ...mkRow(),
  key,
  value,
  enabled,
  description,
});

const kv = (rows: KVRow[]) => rows.map(r => ({ key: r.key, value: r.value, enabled: r.enabled }));

describe('splitUrl', () => {
  it('separates head, query and hash', () => {
    expect(splitUrl('https://x.com/p?a=1&b=2#frag')).toEqual({ head: 'https://x.com/p', query: 'a=1&b=2', hash: '#frag' });
    expect(splitUrl('https://x.com/p')).toEqual({ head: 'https://x.com/p', query: '', hash: '' });
    expect(splitUrl('https://x.com/p#frag')).toEqual({ head: 'https://x.com/p', query: '', hash: '#frag' });
  });

  it('leaves a bare variable untouched (no "?" to split on)', () => {
    expect(splitUrl('{{baseUrl}}')).toEqual({ head: '{{baseUrl}}', query: '', hash: '' });
  });
});

describe('parseQuery', () => {
  it('splits pairs and tolerates empty / value-less segments', () => {
    expect(parseQuery('a=1&b=2')).toEqual([{ key: 'a', value: '1' }, { key: 'b', value: '2' }]);
    expect(parseQuery('a=1&&b=')).toEqual([{ key: 'a', value: '1' }, { key: 'b', value: '' }]);
    expect(parseQuery('flag')).toEqual([{ key: 'flag', value: '' }]);
    expect(parseQuery('')).toEqual([]);
  });

  it('keeps template values literal', () => {
    expect(parseQuery('token={{secret}}')).toEqual([{ key: 'token', value: '{{secret}}' }]);
  });
});

describe('buildQuery', () => {
  it('joins enabled, keyed rows with &', () => {
    expect(buildQuery([row('a', '1'), row('b', '2')])).toBe('a=1&b=2');
  });

  it('skips disabled rows and rows without a key', () => {
    expect(buildQuery([row('a', '1'), row('b', '2', false), row('', 'orphan')])).toBe('a=1');
  });
});

describe('urlWithParams', () => {
  it('appends the query and preserves the fragment', () => {
    expect(urlWithParams('https://x.com/p#frag', [row('a', '1'), row('b', '2')])).toBe('https://x.com/p?a=1&b=2#frag');
  });

  it('replaces an existing query', () => {
    expect(urlWithParams('https://x.com/p?old=9', [row('a', '1')])).toBe('https://x.com/p?a=1');
  });

  it('drops the "?" when there are no active params', () => {
    expect(urlWithParams('https://x.com/p?old=9', [row('a', '1', false), row('', '')])).toBe('https://x.com/p');
  });
});

describe('paramsFromUrl', () => {
  it('builds rows from the query with a trailing blank row', () => {
    const rows = paramsFromUrl('https://x.com?a=1&b=2', [mkRow()]);
    expect(kv(rows)).toEqual([
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: true },
      { key: '', value: '', enabled: true },
    ]);
  });

  it('inherits the description of a matching existing key', () => {
    const existing = [row('a', 'old', true, 'my note'), mkRow()];
    const rows = paramsFromUrl('https://x.com?a=99', existing);
    expect(rows[0].value).toBe('99');
    expect(rows[0].description).toBe('my note');
  });

  it('keeps user-disabled params that are not in the URL', () => {
    const existing = [row('keep', 'me', false), mkRow()];
    const rows = paramsFromUrl('https://x.com?a=1', existing);
    expect(kv(rows)).toEqual([
      { key: 'a', value: '1', enabled: true },
      { key: 'keep', value: 'me', enabled: false },
      { key: '', value: '', enabled: true },
    ]);
  });
});

describe('flattenUrlParams', () => {
  it('strips a synced URL query and dedupes against params (no doubling)', () => {
    const { url, params } = flattenUrlParams('https://x.com/p?a=1&b=2', [row('a', '1'), row('b', '2'), mkRow()]);
    expect(url).toBe('https://x.com/p');
    expect(kv(params)).toEqual([
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: true },
    ]);
  });

  it('leaves a query-less URL and its params untouched (legacy: query only in the table)', () => {
    const params = [row('a', '1'), mkRow()];
    const out = flattenUrlParams('https://x.com/p', params);
    expect(out.url).toBe('https://x.com/p');
    expect(out.params).toBe(params);
  });

  it('moves a URL-only query into params (legacy: query only in the URL)', () => {
    const { url, params } = flattenUrlParams('https://x.com/p?a=1', [mkRow()]);
    expect(url).toBe('https://x.com/p');
    expect(kv(params)).toEqual([{ key: 'a', value: '1', enabled: true }]);
  });

  it('keeps param-only keys and preserves the fragment', () => {
    const { url, params } = flattenUrlParams('https://x.com/p?a=1#frag', [row('a', '1'), row('b', '2'), mkRow()]);
    expect(url).toBe('https://x.com/p#frag');
    expect(kv(params)).toEqual([
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: true },
    ]);
  });

  it('preserves duplicate keys present in the URL', () => {
    const { params } = flattenUrlParams('https://x.com/p?a=1&a=2', [mkRow()]);
    expect(kv(params)).toEqual([
      { key: 'a', value: '1', enabled: true },
      { key: 'a', value: '2', enabled: true },
    ]);
  });
});

describe('requestBody query sync methods', () => {
  const host = (over: Partial<{ url: string; params: KVRow[]; requestType: string }>) =>
    ({ url: '', params: [mkRow()], requestType: 'http', ...over }) as { url: string; params: KVRow[]; requestType: string };

  it('syncUrlFromParams writes enabled params into the URL', () => {
    const h = host({ url: 'https://x.com', params: [row('a', '1'), row('b', '2'), mkRow()] });
    requestBodyFeature.syncUrlFromParams.call(h as never);
    expect(h.url).toBe('https://x.com?a=1&b=2');
  });

  it('syncUrlFromParams leaves gRPC targets untouched', () => {
    const h = host({ url: 'localhost:50051', params: [row('a', '1'), mkRow()], requestType: 'grpc' });
    requestBodyFeature.syncUrlFromParams.call(h as never);
    expect(h.url).toBe('localhost:50051');
  });

  it('syncParamsFromUrl rebuilds the table from the URL', () => {
    const h = host({ url: 'https://x.com?a=1&b=2', params: [mkRow()] });
    requestBodyFeature.syncParamsFromUrl.call(h as never);
    expect(kv(h.params)).toEqual([
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: true },
      { key: '', value: '', enabled: true },
    ]);
  });
});
