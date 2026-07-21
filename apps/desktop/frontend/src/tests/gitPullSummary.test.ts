import { describe, expect, it } from 'vitest';
import { formatGitCommitToast, formatGitFetchToast, formatGitPullToast, formatGitPushToast } from '../lib/gitPullSummary';

describe('git pull summary toast', () => {
  it('formats added and updated files', () => {
    expect(formatGitPullToast({ changed: 3, added: 1, updated: 2, deleted: 0, renamed: 0 }))
      .toBe('Pull complete: 1 new file, 2 files updated');
  });

  it('includes removed and renamed files', () => {
    expect(formatGitPullToast({ changed: 4, added: 1, updated: 1, deleted: 1, renamed: 1 }))
      .toBe('Pull complete: 1 new file, 1 file updated, 1 file deleted, 1 file renamed');
  });

  it('handles up-to-date pulls', () => {
    expect(formatGitPullToast({ changed: 0, added: 0, updated: 0, deleted: 0, renamed: 0 }))
      .toBe('Pull complete: no file changes');
  });

  it('falls back to a generic changed count', () => {
    expect(formatGitPullToast({ changed: 2, added: 0, updated: 0, deleted: 0, renamed: 0 }))
      .toBe('Pull complete: 2 files changed');
  });

  it('formats commit counts and the new head', () => {
    expect(formatGitCommitToast({
      ok: true,
      git: { head: 'abc1234' } as any,
      error: '',
      output: '',
      files: ['relay.yml', 'workspaces/Main/collections/API.yml'],
    }))
      .toBe('Commit complete: 2 Relay files committed · abc1234');
  });

  it('formats pushed commits and changed files', () => {
    expect(formatGitPushToast({
      ok: true,
      git: { upstream: 'origin/feature' } as any,
      error: '',
      output: '',
      files: [],
      commitCount: 1,
      pullSummary: { changed: 2, added: 1, updated: 1, deleted: 0, renamed: 0 },
    }))
      .toBe('Push complete: 1 commit pushed, 1 new file, 1 file updated, tracking origin/feature');
  });

  it('formats fetch status', () => {
    expect(formatGitFetchToast({ behind: 2 } as any)).toBe('Fetch complete: 2 remote commits ready to pull');
    expect(formatGitFetchToast({ upstream: 'origin/main', upstreamGone: true } as any)).toBe('Fetch complete: origin/main is gone on remote');
  });
});
