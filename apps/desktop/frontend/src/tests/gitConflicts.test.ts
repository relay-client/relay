import { describe, expect, it } from 'vitest';
import { gitConflictHunks, replaceAllGitConflictHunks, replaceGitConflictHunk } from '../lib/gitConflicts';

const sample = [
  'version: 1',
  'workspace:',
  '    name: Workspace',
  '<<<<<<< HEAD',
  '    description: dddd',
  '=======',
  '    description: "123321"',
  '>>>>>>> remote',
  '    filesystemName: coll',
].join('\n');

describe('git conflict helpers', () => {
  it('finds conflict hunks with line numbers and sides', () => {
    const hunks = gitConflictHunks(sample);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({
      index: 0,
      startLine: 4,
      endLine: 8,
      marker: 'HEAD',
      ours: ['    description: dddd'],
      theirs: ['    description: "123321"'],
    });
  });

  it('replaces one hunk with the selected side', () => {
    expect(replaceGitConflictHunk(sample, 0, 'ours')).toContain('description: dddd');
    expect(replaceGitConflictHunk(sample, 0, 'ours')).not.toContain('<<<<<<<');
    expect(replaceGitConflictHunk(sample, 0, 'theirs')).toContain('description: "123321"');
  });

  it('resolves every hunk in a file', () => {
    const resolved = replaceAllGitConflictHunks(`${sample}\n${sample}`, 'theirs');
    expect(resolved).not.toContain('=======');
    expect(resolved.match(/description: "123321"/g)).toHaveLength(2);
  });
});
