import { beforeEach, describe, expect, it, vi } from 'vitest';

// Every Git call the feature can reach, stubbed to succeed. The subject here
// is what the feature does to the editor's pending write before the call, not
// what Git returns.
vi.mock('../lib/backend', () => {
  const ok = { ok: true, git: null, error: '', output: '' };
  const handles = [
    'gitStatus', 'gitDiff', 'gitOutgoingChanges', 'gitCommitLogPage', 'gitCommitDiff', 'gitConflictFile',
    'gitResolveConflictFile', 'gitContinueOperation', 'gitAbortOperation', 'gitStashWorkspace', 'gitStashPopWorkspace',
    'gitFetchWorkspace', 'gitPullWorkspace', 'gitPullBranch', 'gitCloneWorkspace', 'gitInitWorkspace', 'gitAddRemote',
    'gitTestRemote', 'gitListBranches', 'gitCheckoutBranch', 'gitCreateBranch', 'gitCreateTrackingBranch',
    'gitDeleteBranch', 'gitRenameBranch', 'gitStageWorkspaceFiles', 'gitCommitWorkspace', 'gitCommitWorkspaceFiles',
    'gitPushWorkspace', 'gitForcePushWorkspace', 'gitDiscardWorkspaceFile', 'gitDiscardWorkspaceFiles',
    'gitDiscardWorkspaceChanges', 'gitStoreToken', 'gitSetSshKey', 'gitCloneWorkspaceWithAuth', 'gitSshUrlFor',
    'gitRemoteUrl', 'gitSetRemoteUrl', 'openWorkspaceRoot', 'openDirectoryDialog',
  ];
  return Object.fromEntries(handles.map(name => [name, vi.fn().mockResolvedValue(ok)]));
});

import { gitFeature, EMPTY_GIT_STATUS } from '../lib/stores/features/git';

type Host = ReturnType<typeof makeHost>;

function makeHost(overrides: Record<string, unknown> = {}) {
  return {
    // The real AppVM mixes the whole feature onto one prototype, so an
    // operation calling a sibling (beginGitMutation here) gets the real one.
    ...gitFeature,
    gitStatus: {
      ...EMPTY_GIT_STATUS,
      isRepo: true,
      clean: true,
      branch: 'main',
      upstream: 'origin/main',
      remotes: ['origin'],
      stashes: [{ ref: 'stash@{0}', message: 'work' }],
    },
    gitBranches: { git: EMPTY_GIT_STATUS, current: 'main', localBranches: [], remoteBranches: [], error: '', output: '' },
    gitConflict: {},
    gitConflictContent: '',
    gitSelectedPath: 'collections/api.yml',
    gitLoading: false,
    gitAction: '',
    gitError: '',
    gitMessage: '',
    gitOutput: '',
    // The two things under test.
    persistActiveRequestNow: vi.fn().mockResolvedValue(undefined),
    cancelPendingPersistTimers: vi.fn(),
    guardGitWorkspaceMutable: vi.fn(() => true),
    refreshGitStatus: vi.fn().mockResolvedValue(undefined),
    refreshGitBranches: vi.fn().mockResolvedValue(undefined),
    closeFloatingMenus: vi.fn(),
    applyWorkspaceOpenResult: vi.fn().mockResolvedValue(true),
    applyGitOperationResult: vi.fn().mockResolvedValue(true),
    showGitToast: vi.fn(),
    showGitPullToast: vi.fn(),
    openPromptDialog: vi.fn().mockResolvedValue('a message'),
    openConfirmDialog: vi.fn().mockResolvedValue(true),
    openAlertDialog: vi.fn().mockResolvedValue(undefined),
    openSelectDialog: vi.fn().mockResolvedValue('feature'),
    ...overrides,
  };
}

function call(name: keyof typeof gitFeature, host: Host, ...args: unknown[]) {
  return (gitFeature[name] as (...a: unknown[]) => Promise<unknown>).apply(host, args);
}

describe('Git operations and the editor’s pending write', () => {
  beforeEach(() => vi.clearAllMocks());

  // gitStatus.clean describes the files on disk. An edit made inside the
  // autosave debounce is not on disk yet, so an operation that rewrites the
  // worktree has to settle it first — otherwise the debounce fires afterwards
  // and writes the pre-operation editor state over what arrived.
  const flushing: Array<[string, (host: Host) => Promise<unknown>]> = [
    ['checkoutGitBranch', host => call('checkoutGitBranch', host, 'feature')],
    ['createGitBranch', host => call('createGitBranch', host)],
    ['popGitStash', host => call('popGitStash', host, 'stash@{0}')],
    ['pullGitWorkspace', host => call('pullGitWorkspace', host)],
    ['stashGitWorkspace', host => call('stashGitWorkspace', host)],
    ['stageGitWorkspaceFiles', host => call('stageGitWorkspaceFiles', host)],
    ['commitGitWorkspace', host => call('commitGitWorkspace', host)],
    ['pushGitWorkspace', host => call('pushGitWorkspace', host)],
    ['initGitWorkspace', host => call('initGitWorkspace', host)],
  ];

  it.each(flushing)('%s writes a pending edit to disk before it runs', async (_name, run) => {
    const host = makeHost();
    await run(host);
    expect(host.persistActiveRequestNow).toHaveBeenCalledWith(true);
  });

  // The counterpart: these replace the worktree with something authoritative,
  // so a write queued before them is stale and must be dropped, not saved.
  const cancelling: Array<[string, (host: Host) => Promise<unknown>]> = [
    ['abortGitOperation', host => call('abortGitOperation', host)],
    ['continueGitOperation', host => call('continueGitOperation', host)],
    ['resolveGitConflict', host => call('resolveGitConflict', host, 'ours')],
    ['discardGitWorkspaceChanges', host => call('discardGitWorkspaceChanges', host)],
    ['discardSelectedGitFile', host => call('discardSelectedGitFile', host)],
  ];

  it.each(cancelling)('%s drops a pending edit rather than saving it', async (_name, run) => {
    const host = makeHost({
      gitStatus: { ...EMPTY_GIT_STATUS, isRepo: true, clean: false, operation: 'merge', files: [{ path: 'a.yml', index: 'U', worktree: 'U', status: 'conflict' }] },
    });
    await run(host);
    expect(host.cancelPendingPersistTimers).toHaveBeenCalled();
    expect(host.persistActiveRequestNow).not.toHaveBeenCalled();
  });

  // The flush is what can turn a clean workspace dirty, so the checks that
  // gate on `clean` have to read the status again afterwards. Reading the
  // pre-flush status is how an unsaved edit slipped across a branch switch.
  it('re-reads Git status after flushing, before deciding a checkout is safe', async () => {
    const host = makeHost();
    const order: string[] = [];
    host.persistActiveRequestNow = vi.fn(async () => {
      order.push('flush');
      // The flush lands the edit on disk, which makes the workspace dirty.
      host.gitStatus = { ...host.gitStatus, clean: false, files: [{ path: 'collections/api.yml', index: ' ', worktree: 'M', status: 'modified' }] };
    });
    host.refreshGitStatus = vi.fn(async () => { order.push('refresh'); });

    await call('checkoutGitBranch', host, 'feature');

    expect(order).toEqual(['flush', 'refresh']);
    // With the edit now visible, the checkout is blocked instead of silently
    // carrying the change onto the other branch.
    expect(host.gitError).toContain('Commit or discard local Git changes');
    expect(host.applyWorkspaceOpenResult).not.toHaveBeenCalled();
  });

  it('still checks out when nothing was pending', async () => {
    const host = makeHost();
    await call('checkoutGitBranch', host, 'feature');
    expect(host.persistActiveRequestNow).toHaveBeenCalledWith(true);
    expect(host.applyWorkspaceOpenResult).toHaveBeenCalled();
    expect(host.gitError).toBe('');
  });

  // The blocked-workspace banner tells the user to pull a fixed commit, so
  // pull is the one worktree operation that must not be gated on the guard.
  it('still pulls when the workspace is blocked', async () => {
    const host = makeHost({ guardGitWorkspaceMutable: vi.fn(() => false) });
    await call('pullGitWorkspace', host);
    expect(host.persistActiveRequestNow).toHaveBeenCalledWith(true);
    expect(host.applyWorkspaceOpenResult).toHaveBeenCalled();
  });

  it('does not touch the workspace when the guard refuses', async () => {
    const host = makeHost({ guardGitWorkspaceMutable: vi.fn(() => false) });
    await call('checkoutGitBranch', host, 'feature');
    expect(host.persistActiveRequestNow).not.toHaveBeenCalled();
    expect(host.applyWorkspaceOpenResult).not.toHaveBeenCalled();
  });
});
