import { describe, expect, it } from 'vitest';
import {
  firstHeaderValidationIssue,
  headerValidationIssueLabel,
  validateHeaderName,
  validateHeaderRow,
  validateHeaderValue,
} from '../lib/headers';

describe('header validation', () => {
  it('accepts token header names and ISO-8859-1 values', () => {
    expect(validateHeaderName('X-Trace_ID')).toBe('');
    expect(validateHeaderValue('plain ascii')).toBe('');
    expect(validateHeaderValue('cafe\u00e9')).toBe('');
  });

  it('rejects invalid header names', () => {
    expect(validateHeaderName('X Trace')).toBe('Header name contains invalid characters.');
    expect(validateHeaderName(' X-Trace')).toBe('Header name contains whitespace.');
    expect(validateHeaderName('X:Trace')).toBe('Header name contains invalid characters.');
  });

  it('rejects non-ISO-8859-1 and control characters in values', () => {
    expect(validateHeaderValue('lang=ru; token=\u0431\u0430')).toBe('Value contains non-ISO-8859-1 characters.');
    expect(validateHeaderValue('emoji=\u{1f44b}')).toBe('Value contains non-ISO-8859-1 characters.');
    expect(validateHeaderValue('a\nb')).toBe('Value contains newline characters.');
    expect(validateHeaderValue('a\u0000b')).toBe('Value contains invalid control characters.');
  });

  it('validates only enabled rows with content', () => {
    expect(validateHeaderRow({ enabled: false, key: 'X Bad', value: '\u0431\u0430' })).toBeNull();
    expect(validateHeaderRow({ enabled: true, key: '', value: '' })).toBeNull();
    expect(validateHeaderRow({ enabled: true, key: '', value: 'token' })).toMatchObject({
      field: 'key',
      message: 'Header name is required.',
    });
  });

  it('returns and labels the first header issue', () => {
    const issue = firstHeaderValidationIssue([
      { enabled: false, key: 'Bad Header', value: '' },
      { enabled: true, key: 'Cookie', value: '\u0431\u0430' },
    ]);

    expect(issue).toMatchObject({ field: 'value', rowIndex: 1, key: 'Cookie' });
    expect(issue ? headerValidationIssueLabel(issue) : '').toBe('Header "Cookie": Value contains non-ISO-8859-1 characters.');
  });
});
