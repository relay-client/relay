import { Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { selectedLineNumbersForComment } from '../lib/editorSelection';

describe('selectedLineNumbersForComment', () => {
  const doc = Text.of([
    '{',
    '  "email": "user@example.com",',
    '  "login": "user@example.com"',
    '}',
  ]);

  it('skips a previous line when selection starts at its line end', () => {
    const line1 = doc.line(1);
    const line3 = doc.line(3);

    expect(selectedLineNumbersForComment(doc, line1.to, line3.to)).toEqual([2, 3]);
  });

  it('does not include the next line when selection ends at its line start', () => {
    const line2 = doc.line(2);
    const line4 = doc.line(4);

    expect(selectedLineNumbersForComment(doc, line2.from, line4.from)).toEqual([2, 3]);
  });

  it('keeps an explicitly selected boundary line', () => {
    const line1 = doc.line(1);
    const line2 = doc.line(2);

    expect(selectedLineNumbersForComment(doc, line1.from, line2.from)).toEqual([1]);
  });
});
