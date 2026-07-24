import { describe, expect, it } from 'vitest';
import { collapseUnchanged, diffResponseBodies } from '../lib/responseDiff';

function render(previous: string, current: string) {
  return diffResponseBodies(previous, current).lines.map(line => {
    const sign = line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' ';
    return `${sign}${line.text}`;
  });
}

describe('diffResponseBodies', () => {
  it('reports identical bodies as unchanged', () => {
    const diff = diffResponseBodies('{\n  "a": 1\n}', '{\n  "a": 1\n}');
    expect(diff.identical).toBe(true);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
    expect(diff.lines.every(line => line.kind === 'equal')).toBe(true);
  });

  it('marks a changed line as one removal and one addition', () => {
    expect(render('{\n  "id": 1\n}', '{\n  "id": 2\n}')).toEqual([
      ' {',
      '-  "id": 1',
      '+  "id": 2',
      ' }',
    ]);
  });

  it('tracks pure insertions without rewriting the surrounding lines', () => {
    const diff = diffResponseBodies('a\nb\nc', 'a\nb\nnew\nc');
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(0);
    expect(render('a\nb\nc', 'a\nb\nnew\nc')).toEqual([' a', ' b', '+new', ' c']);
  });

  it('tracks pure deletions', () => {
    const diff = diffResponseBodies('a\nb\nc', 'a\nc');
    expect(diff.removed).toBe(1);
    expect(diff.added).toBe(0);
  });

  it('keeps correct line numbers on both sides', () => {
    const diff = diffResponseBodies('a\nb\nc', 'a\nx\nb\nc');
    const added = diff.lines.find(line => line.kind === 'added');
    expect(added).toMatchObject({ text: 'x', beforeLine: null, afterLine: 2 });
    const last = diff.lines.at(-1);
    expect(last).toMatchObject({ text: 'c', beforeLine: 3, afterLine: 4 });
  });

  it('handles an empty side', () => {
    expect(diffResponseBodies('', 'a\nb')).toMatchObject({ added: 2, removed: 0, identical: false });
    expect(diffResponseBodies('a\nb', '')).toMatchObject({ added: 0, removed: 2, identical: false });
    expect(diffResponseBodies('', '')).toMatchObject({ identical: true });
  });

  it('normalises CRLF so a line-ending change is not a whole-file diff', () => {
    expect(diffResponseBodies('a\r\nb', 'a\nb').identical).toBe(true);
  });

  // Trimming the shared head and tail is what keeps a one-field change in a
  // large payload from building a huge table.
  it('stays exact and cheap when one field changes in a large body', () => {
    const lines = Array.from({ length: 20_000 }, (_, index) => `  "field${index}": ${index},`);
    const previous = `{\n${lines.join('\n')}\n}`;
    const changed = [...lines];
    changed[10_000] = '  "field10000": 999,';
    const current = `{\n${changed.join('\n')}\n}`;

    const started = Date.now();
    const diff = diffResponseBodies(previous, current);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(diff.approximate).toBe(false);
    expect(diff).toMatchObject({ added: 1, removed: 1 });
  });

  it('falls back to a positional comparison when the differing region is huge', () => {
    const previous = Array.from({ length: 3000 }, (_, index) => `left-${index}`).join('\n');
    const current = Array.from({ length: 3000 }, (_, index) => `right-${index}`).join('\n');
    const diff = diffResponseBodies(previous, current);
    expect(diff.approximate).toBe(true);
    expect(diff.added).toBe(3000);
    expect(diff.removed).toBe(3000);
  });
});

describe('collapseUnchanged', () => {
  it('hides long unchanged runs and keeps context around changes', () => {
    const previous = Array.from({ length: 30 }, (_, index) => `line ${index}`).join('\n');
    const current = previous.replace('line 15', 'line fifteen');
    const chunks = collapseUnchanged(diffResponseBodies(previous, current).lines, 2);

    expect(chunks[0]).toMatchObject({ kind: 'gap' });
    const shown = chunks.filter(chunk => chunk.kind === 'lines').flatMap(chunk => chunk.kind === 'lines' ? chunk.lines : []);
    expect(shown.some(line => line.text === 'line fifteen')).toBe(true);
    expect(shown.some(line => line.text === 'line 13')).toBe(true);
    expect(shown.some(line => line.text === 'line 0')).toBe(false);
  });

  it('returns a single gap when nothing changed', () => {
    const body = 'a\nb\nc';
    const chunks = collapseUnchanged(diffResponseBodies(body, body).lines, 2);
    expect(chunks).toEqual([{ kind: 'gap', count: 3 }]);
  });
});
