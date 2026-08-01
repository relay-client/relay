import { describe, expect, it } from 'vitest';
import { bulkTextToRows, rowsToBulkText } from '../lib/bulkEdit';
import { appendSnippet, preRequestSnippets, testSnippets } from '../lib/scriptSnippets';
import { mkRow } from '../lib/constants';
import type { KVRow } from '../lib/types/models';

function row(overrides: Partial<KVRow>): KVRow {
  return { ...mkRow(), ...overrides };
}

describe('rowsToBulkText', () => {
  it('writes one key:value per line and marks disabled rows', () => {
    const text = rowsToBulkText([
      row({ key: 'Content-Type', value: 'application/json' }),
      row({ key: 'X-Debug', value: '1', enabled: false }),
      row({ key: '', value: '' }),
    ]);

    expect(text).toBe('Content-Type:application/json\n//X-Debug:1');
  });

  it('keeps values that contain a colon intact', () => {
    expect(rowsToBulkText([row({ key: 'Authorization', value: 'Bearer a:b:c' })]))
      .toBe('Authorization:Bearer a:b:c');
  });
});

describe('bulkTextToRows', () => {
  it('parses keys, values, and disabled lines', () => {
    const rows = bulkTextToRows('Content-Type:application/json\n//X-Debug:1\n\nAccept:*/*');

    expect(rows.slice(0, 3)).toMatchObject([
      { key: 'Content-Type', value: 'application/json', enabled: true },
      { key: 'X-Debug', value: '1', enabled: false },
      { key: 'Accept', value: '*/*', enabled: true },
    ]);
  });

  it('splits on the first colon only', () => {
    expect(bulkTextToRows('Authorization:Bearer a:b:c')[0]).toMatchObject({
      key: 'Authorization',
      value: 'Bearer a:b:c',
    });
  });

  it('always leaves a trailing blank row to type into', () => {
    const rows = bulkTextToRows('a:1');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ key: '', value: '' });
  });

  it('accepts a key with no value', () => {
    expect(bulkTextToRows('X-Trace')[0]).toMatchObject({ key: 'X-Trace', value: '' });
  });

  it('carries descriptions, secrets, and file attachments across by key', () => {
    const previous = [
      row({ key: 'token', value: 'abc', description: 'auth token', secret: true }),
      row({ key: 'avatar', value: '/tmp/a.png', isFile: true, fileName: 'a.png' }),
    ];

    const rows = bulkTextToRows('token:xyz\navatar:/tmp/a.png', previous);

    expect(rows[0]).toMatchObject({ key: 'token', value: 'xyz', description: 'auth token', secret: true });
    expect(rows[1]).toMatchObject({ key: 'avatar', isFile: true, fileName: 'a.png' });
  });

  it('round-trips a table unchanged', () => {
    const original = [
      row({ key: 'a', value: '1' }),
      row({ key: 'b', value: '2', enabled: false }),
      row({ key: '', value: '' }),
    ];

    expect(rowsToBulkText(bulkTextToRows(rowsToBulkText(original), original))).toBe(rowsToBulkText(original));
  });

  it('produces just the blank row for empty text', () => {
    expect(bulkTextToRows('   \n\n')).toHaveLength(1);
  });
});

describe('script snippets', () => {
  it('offers JavaScript and Tengo variants for both script kinds', () => {
    for (const engine of ['js', 'tengo'] as const) {
      expect(preRequestSnippets(engine).length).toBeGreaterThan(0);
      expect(testSnippets(engine).length).toBeGreaterThan(0);
      for (const snippet of [...preRequestSnippets(engine), ...testSnippets(engine)]) {
        expect(snippet.label.trim()).not.toBe('');
        expect(snippet.code.trim()).not.toBe('');
      }
    }
  });

  it('keeps Tengo snippets free of JavaScript arrow functions', () => {
    for (const snippet of [...preRequestSnippets('tengo'), ...testSnippets('tengo')]) {
      expect(snippet.code).not.toContain('=>');
    }
  });

  it('appends to an existing script instead of replacing it', () => {
    expect(appendSnippet('', 'a()')).toBe('a()\n');
    expect(appendSnippet('a()\n', 'b()')).toBe('a()\nb()\n');
    expect(appendSnippet('a()\n\n\n', 'b()')).toBe('a()\nb()\n');
  });
});
