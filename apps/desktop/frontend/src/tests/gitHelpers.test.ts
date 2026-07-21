import { describe, expect, it } from 'vitest';
import {
  cloneDirectoryNameFromUrl,
  remoteNameFromUpstream,
  isPushBehindError,
  isUnmergedBranchDeleteError,
  normalizeGitStatus,
  normalizeGitBranches,
  normalizeGitLog,
  EMPTY_GIT_STATUS,
} from '../lib/stores/features/git';

describe('cloneDirectoryNameFromUrl', () => {
  it('derives the folder name from common Git URLs', () => {
    expect(cloneDirectoryNameFromUrl('git@github.com:org/repo.git')).toBe('repo');
    expect(cloneDirectoryNameFromUrl('https://github.com/org/repo.git')).toBe('repo');
    expect(cloneDirectoryNameFromUrl('https://gitlab.com/group/sub/repo')).toBe('repo');
    expect(cloneDirectoryNameFromUrl('https://github.com/org/repo/')).toBe('repo');
    expect(cloneDirectoryNameFromUrl('git@github.com:repo.git')).toBe('repo');
  });
  it('sanitizes unusual names and falls back', () => {
    expect(cloneDirectoryNameFromUrl('')).toBe('relay-workspace');
    expect(cloneDirectoryNameFromUrl('https://host/My Repo!!')).toBe('My-Repo');
  });
});

describe('remoteNameFromUpstream', () => {
  it('extracts the remote portion before the first slash', () => {
    expect(remoteNameFromUpstream('origin/main')).toBe('origin');
    expect(remoteNameFromUpstream('upstream/feature/x')).toBe('upstream');
    expect(remoteNameFromUpstream('main')).toBe('origin');
    expect(remoteNameFromUpstream('')).toBe('origin');
  });
});

describe('git error matchers', () => {
  it('detects push-behind errors', () => {
    expect(isPushBehindError('Remote has 3 new commits')).toBe(true);
    expect(isPushBehindError('remote has 1 new commit on main')).toBe(true);
    expect(isPushBehindError('Push failed for another reason')).toBe(false);
  });
  it('detects unmerged-branch delete errors', () => {
    expect(isUnmergedBranchDeleteError('The branch foo is not fully merged')).toBe(true);
    expect(isUnmergedBranchDeleteError('branch not merged')).toBe(true);
    expect(isUnmergedBranchDeleteError('some other git error')).toBe(false);
  });
});

describe('git result normalizers', () => {
  it('normalizes a null status to the empty shape', () => {
    const status = normalizeGitStatus(null);
    expect(status.isRepo).toBe(false);
    expect(status.files).toEqual([]);
    expect(status.remotes).toEqual([]);
    expect(status.stashes).toEqual([]);
    expect(status).toMatchObject(EMPTY_GIT_STATUS);
  });
  it('defends against non-array fields', () => {
    const status = normalizeGitStatus({ isRepo: true } as never);
    expect(status.isRepo).toBe(true);
    expect(Array.isArray(status.files)).toBe(true);
    expect(Array.isArray(status.remotes)).toBe(true);
  });
  it('normalizes branches and log with a nested git status', () => {
    const branches = normalizeGitBranches(null);
    expect(branches.ok).toBe(false);
    expect(branches.localBranches).toEqual([]);
    expect(branches.remoteBranches).toEqual([]);
    expect(branches.git.isRepo).toBe(false);

    const log = normalizeGitLog(null);
    expect(log.commits).toEqual([]);
    expect(log.hasMore).toBe(false);
    expect(log.git.isRepo).toBe(false);
  });
});
