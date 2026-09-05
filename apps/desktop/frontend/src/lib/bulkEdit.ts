import { mkRow } from './constants';
import type { KVRow } from './types/models';
import { rowHasContent } from './utils';


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
      ...(source?.isFile ? { isFile: true, fileName: source.fileName } : {}),
    });
  }

  rows.push(mkRow());
  return rows;
}
