import { describe, expect, it } from 'vitest';
import { parseRunnerDataFile } from '../lib/runnerData';

describe('parseRunnerDataFile', () => {
  it('parses CSV rows with quoted commas and escaped quotes', () => {
    const rows = parseRunnerDataFile(
      'name,token,note\nAlice,abc,"hello, world"\nBob,def,"said ""hi"""',
      'runner.csv',
    );

    expect(rows).toEqual([
      { name: 'Alice', token: 'abc', note: 'hello, world' },
      { name: 'Bob', token: 'def', note: 'said "hi"' },
    ]);
  });

  it('parses JSON rows and normalizes cell values to strings', () => {
    const rows = parseRunnerDataFile(
      '[{"user":"alice","count":2,"enabled":true,"meta":{"role":"admin"}}]',
      'runner.json',
    );

    expect(rows).toEqual([
      { user: 'alice', count: '2', enabled: 'true', meta: '{"role":"admin"}' },
    ]);
  });

  it('accepts JSON data and rows wrappers', () => {
    expect(parseRunnerDataFile('{"data":[{"id":1}]}', 'data.json')).toEqual([{ id: '1' }]);
    expect(parseRunnerDataFile('{"rows":[{"id":2}]}', 'rows.json')).toEqual([{ id: '2' }]);
  });

  it('rejects duplicate CSV headers', () => {
    expect(() => parseRunnerDataFile('token,token\none,two', 'runner.csv')).toThrow('CSV header "token" is duplicated.');
  });
});
