import { mkRow } from './constants';
import type { KVRow } from './types/models';

export type QueryPair = { key: string; value: string };

type QueryRow = Pick<KVRow, 'key' | 'value' | 'enabled'>;

// Split a raw URL into the part before '?', its query string, and the '#...' fragment.
// Works on unresolved URLs too — a bare "{{var}}" has no '?', so it is left untouched.
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

// Parse a raw query string into pairs, preserving literal text (including {{variables}}).
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

// Serialize enabled, keyed rows back into a raw query string (literal — the backend encodes on send).
export function buildQuery(rows: QueryRow[]): string {
  return rows
    .filter(r => r.enabled && r.key !== '')
    .map(r => `${r.key}=${r.value}`)
    .join('&');
}

// Recompose a URL: keep everything before '?' and the '#...' fragment, replacing the query with rows.
export function urlWithParams(url: string, rows: QueryRow[]): string {
  const { head, hash } = splitUrl(url);
  const q = buildQuery(rows);
  return `${head}${q ? `?${q}` : ''}${hash}`;
}

// Rebuild the params table from a URL's query string. Existing rows are reused by key so their
// descriptions/ids survive, and user-disabled rows whose key is gone from the URL are kept.
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

// Fold the URL's inline query into the params list and strip it from the URL, so downstream
// consumers (backend, cURL, snippets) — which all append params onto the URL — apply each query
// param exactly once regardless of whether the user typed it in the URL or the Params tab.
//
// The rows that get folded away are the ones the two-way sync put in both places: same key *and*
// same value. Deduplicating by key alone silently dropped a deliberate second value — `?tag=a` in
// the URL with `tag=b` in the table sent only `tag=a` — and repeated keys are the case the sender
// goes out of its way to preserve, since that is what the APIs signing a query string verbatim
// depend on.
export function flattenUrlParams(url: string, params: KVRow[]): { url: string; params: KVRow[] } {
  const { head, query, hash } = splitUrl(url);
  if (!query) return { url, params };
  const urlRows = parseQuery(query).map(p => ({ ...mkRow(), key: p.key, value: p.value, enabled: true }));
  const mirrored = new Set(urlRows.map(r => `${r.key}${r.value}`));
  const extra = params.filter(r => {
    if (r.key === '' && r.value === '') return false;
    // A disabled row is not going out either way, but it is the user's own bookkeeping — keep it
    // unless the URL already carries the identical pair.
    return !mirrored.delete(`${r.key}${r.value}`);
  });
  return { url: `${head}${hash}`, params: [...urlRows, ...extra] };
}
