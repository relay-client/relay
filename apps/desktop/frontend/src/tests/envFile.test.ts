import { describe, expect, it } from 'vitest';
import { parseEnvFile } from '../lib/utils';

describe('parseEnvFile', () => {
  it('keeps an escaped backslash in front of n and t as a backslash', () => {
    expect(parseEnvFile(String.raw`DIR="C:\\new\\tmp"`)).toEqual([{ key: 'DIR', value: String.raw`C:\new\tmp` }]);
  });

  it('turns escape sequences in double quotes into their characters', () => {
    expect(parseEnvFile(String.raw`MSG="line\nnext\ttab \"quoted\" \\ end"`)).toEqual([
      { key: 'MSG', value: 'line\nnext\ttab "quoted" \\ end' },
    ]);
  });

  it('leaves single-quoted and unknown escapes as written', () => {
    expect(parseEnvFile(String.raw`A='C:\new'` + '\n' + String.raw`B="a\qb"`)).toEqual([
      { key: 'A', value: String.raw`C:\new` },
      { key: 'B', value: String.raw`a\qb` },
    ]);
  });
});
