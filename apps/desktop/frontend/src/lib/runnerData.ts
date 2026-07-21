export type RunnerDataRow = Record<string, string>;

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function normalizeObjectRow(value: unknown, index: number): RunnerDataRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Runner data row ${index + 1} must be an object.`);
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key.trim())
      .map(([key, cell]) => [key.trim(), normalizeCell(cell)]),
  );
}

function parseJsonRows(text: string): RunnerDataRow[] {
  const payload = JSON.parse(text) as unknown;
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : payload && typeof payload === 'object' && Array.isArray((payload as { rows?: unknown }).rows)
        ? (payload as { rows: unknown[] }).rows
        : payload && typeof payload === 'object'
          ? [payload]
          : [];
  return rows.map((row, index) => normalizeObjectRow(row, index));
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      records.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  if (quoted) throw new Error('CSV file has an unterminated quoted value.');
  row.push(cell);
  if (row.some(value => value.trim())) records.push(row);
  return records.filter(record => record.some(value => value.trim()));
}

function parseCsvRows(text: string): RunnerDataRow[] {
  const records = parseCsvRecords(text);
  if (!records.length) return [];
  const headers = records[0].map(header => header.trim());
  if (!headers.some(Boolean)) throw new Error('CSV file must include a header row.');
  const used = new Set<string>();
  for (const header of headers) {
    if (!header) continue;
    if (used.has(header)) throw new Error(`CSV header "${header}" is duplicated.`);
    used.add(header);
  }
  return records.slice(1).map(record => {
    const row: RunnerDataRow = {};
    headers.forEach((header, index) => {
      if (header) row[header] = record[index] ?? '';
    });
    return row;
  });
}

export function parseRunnerDataFile(text: string, fileName: string): RunnerDataRow[] {
  const content = text.replace(/^\uFEFF/, '').trim();
  if (!content) return [];
  const looksJson = /\.json$/i.test(fileName) || content.startsWith('{') || content.startsWith('[');
  const rows = looksJson ? parseJsonRows(content) : parseCsvRows(content);
  return rows.filter(row => Object.keys(row).length > 0);
}
