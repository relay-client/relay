import { mkRow } from './constants';
import type { KVRow } from './types/models';
import { rowHasContent } from './utils';

// Bulk edit is the text form of a key/value table: one `key:value` per line,
// with `//` marking a disabled row. It matches Postman's format so a block of
// headers can be pasted straight across, and it is the fastest way to add or
// reorder twenty rows without twenty rounds of clicking.
//
// Descriptions and file rows have no text representation. They are carried
// through by matching keys instead of being silently dropped.

export function rowsToBulkText(rows: KVRow[]): string {
  return rows
    .filter(rowHasContent)
    .map(row => `${row.enabled ? '' : '//'}${row.key}:${row.value}`)
    .join('\n');
}

export function bulkTextToRows(text: string, previous: KVRow[] = []): KVRow[] {
  const carried = new Map<string, KVRow>();
  for (const row of previous) {
    const key = row.key.trim();
    if (key && !carried.has(key)) carried.set(key, row);
  }

  const rows: KVRow[] = [];
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const disabled = line.startsWith('//');
    const body = disabled ? line.slice(2).trimStart() : line;
    const separator = body.indexOf(':');
    const key = (separator >= 0 ? body.slice(0, separator) : body).trim();
    const value = separator >= 0 ? body.slice(separator + 1).trim() : '';
    if (!key && !value) continue;
    const source = carried.get(key);
    rows.push({
      ...mkRow(),
      key,
      value,
      enabled: !disabled,
      description: source?.description ?? '',
      ...(source?.secret ? { secret: true } : {}),
      // A file row's value is a path the user picked through a dialog; keep
      // the attachment as long as its key is still in the text.
      ...(source?.isFile ? { isFile: true, fileName: source.fileName } : {}),
    });
  }

  // The table always ends in a blank row so there is somewhere to type.
  rows.push(mkRow());
  return rows;
}
