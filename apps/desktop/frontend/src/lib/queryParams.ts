import { mkRow } from './constants';
import type { KVRow } from './types/models';

export type QueryPair = { key: string; value: string };

type QueryRow = Pick<KVRow, 'key' | 'value' | 'enabled'>;

export function splitUrl(url: string): { head: string; query: string; hash: string } {
  let head = url;
  let hash = '';
  const h = head.indexOf('#');
  if (h >= 0) {
    hash = head.slice(h);
    head = head.slice(0, h);
  }
  let query = '';
  const q = head.indexOf('?');
  if (q >= 0) {
    query = head.slice(q + 1);
    head = head.slice(0, q);
  }
  return { head, query, hash };
}

export function parseQuery(query: string): QueryPair[] {
  if (!query) return [];
  return query
    .split('&')
    .filter(seg => seg !== '')
    .map(seg => {
      const eq = seg.indexOf('=');
      return eq < 0 ? { key: seg, value: '' } : { key: seg.slice(0, eq), value: seg.slice(eq + 1) };
    });
}

export function buildQuery(rows: QueryRow[]): string {
  return rows
    .filter(r => r.enabled && r.key !== '')
    .map(r => `${r.key}=${r.value}`)
    .join('&');
}

export function urlWithParams(url: string, rows: QueryRow[]): string {
  const { head, hash } = splitUrl(url);
  const q = buildQuery(rows);
  return `${head}${q ? `?${q}` : ''}${hash}`;
}

export function paramsFromUrl(url: string, existing: KVRow[]): KVRow[] {
  const pairs = parseQuery(splitUrl(url).query);
  const pool = existing.filter(r => r.key !== '' || r.value !== '');
  const used = new Set<number>();
  const rows: KVRow[] = pairs.map(p => {
    const idx = pool.findIndex((r, i) => !used.has(i) && r.key === p.key);
    if (idx >= 0) {
      used.add(idx);
      return { ...pool[idx], value: p.value, enabled: true };
    }
    return { ...mkRow(), key: p.key, value: p.value, enabled: true };
  });
  pool.forEach((r, i) => {
    if (!used.has(i) && !r.enabled) rows.push(r);
  });
  return [...rows, mkRow()];
}

export function flattenUrlParams(url: string, params: KVRow[]): { url: string; params: KVRow[] } {
  const { head, query, hash } = splitUrl(url);
  if (!query) return { url, params };
  const urlRows = parseQuery(query).map(p => ({ ...mkRow(), key: p.key, value: p.value, enabled: true }));
  const mirrored = new Set(urlRows.map(r => `${r.key}${r.value}`));
  const extra = params.filter(r => {
    if (r.key === '' && r.value === '') return false;
    return !mirrored.delete(`${r.key}${r.value}`);
  });
  return { url: `${head}${hash}`, params: [...urlRows, ...extra] };
}
