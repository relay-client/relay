import { describe, expect, it, vi } from 'vitest';
import { cookieFeature } from '../lib/stores/features/cookies';
import { requestPersistenceFeature } from '../lib/stores/features/requestPersistence';
import { workspaceFeature } from '../lib/stores/features/workspace';
import type { CookieJarEntry, Workspace } from '../lib/types/models';

function workspace(id: string): Workspace {
  return { id, name: id, filesystemName: id, description: '' };
}

function cookie(name: string, value: string): CookieJarEntry {
  return {
    name,
    value,
    domain: 'example.test',
    path: '/',
    expiresAt: 0,
    session: true,
    secure: false,
    httpOnly: false,
    sameSite: '',
    hostOnly: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('workspace scoped cookies', () => {
  it('normalizes only workspace cookie buckets from the request store', () => {
    const host = {
      activeWorkspaceId: 'workspace-1',
      workspaceCookies: {},
      cookies: [],
      isRecord: (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
      normalizeCookieEntry: cookieFeature.normalizeCookieEntry,
    };

    const normalized = cookieFeature.normalizeWorkspaceCookieStore.call(host as any, {
      'workspace-2': [cookie('scoped', 'kept')],
      'workspace-3': [{ name: '', value: 'invalid' }],
    });

    expect(normalized['workspace-1']).toBeUndefined();
    expect(normalized['workspace-2']).toEqual([cookie('scoped', 'kept')]);
    expect(normalized['workspace-3']).toBeUndefined();
  });

  it('persists current cookies under the active workspace without dropping other workspace jars', () => {
    const host = {
      activeWorkspaceId: 'workspace-1',
      activeRequestId: '',
      activeEnvironmentId: '',
      cookies: [cookie('sid', 'active')],
      workspaceCookies: { 'workspace-2': [cookie('sid', 'other')] },
      folderCollapseState: {},
      workspaces: [workspace('workspace-1'), workspace('workspace-2')],
      collections: [],
      requests: [],
      environments: [],
      globalVariables: [],
      openRequestIds: [],
      requestHistory: [],
      pruneHistory: (history: unknown[]) => history,
    };

    const payload = requestPersistenceFeature.requestStorePayload.call(host as any);

    expect(payload.workspaceCookies).toEqual({
      'workspace-1': [cookie('sid', 'active')],
      'workspace-2': [cookie('sid', 'other')],
    });
  });

  it('captures the old jar and restores the selected workspace jar when switching workspaces', async () => {
    const calls: Array<[string, string | undefined]> = [];
    const persistRequestStore = vi.fn().mockResolvedValue(true);
    const host = {
      activeRequestId: '',
      activeWorkspaceId: 'workspace-1',
      activeEnvironmentId: '',
      collections: [],
      environments: [],
      openRequestIds: [],
      requestHistory: [],
      requests: [],
      topView: 'request',
      workspaceMenuOpen: true,
      workspaces: [workspace('workspace-1'), workspace('workspace-2')],
      workspaceCookies: { 'workspace-2': [cookie('sid', 'other')] },
      defaultCollectionForWorkspace: () => undefined,
      openPromptDialog: vi.fn(),
      openConfirmDialog: vi.fn(),
      openAlertDialog: vi.fn(),
      guardWorkspaceWritable: () => true,
      guardWorkspaceListWritable: () => true,
      workspaceIsBlocked: () => false,
      showWorkspaceBlockedToast: vi.fn(),
      persistActiveRequestNow: vi.fn().mockResolvedValue(undefined),
      persistRequestStore,
      captureActiveWorkspaceCookies: vi.fn(async (workspaceId?: string) => { calls.push(['capture', workspaceId]); }),
      restoreWorkspaceCookieJar: vi.fn(async (workspaceId?: string) => { calls.push(['restore', workspaceId]); }),
      scheduleActiveRequestPersist: vi.fn(),
      scheduleWorkspacePersist: vi.fn(),
      applySavedRequest: vi.fn(),
    };

    await workspaceFeature.switchWorkspace.call(host as any, 'workspace-2');

    expect(calls).toEqual([
      ['capture', 'workspace-1'],
      ['restore', 'workspace-2'],
    ]);
    expect(host.activeWorkspaceId).toBe('workspace-2');
    expect(host.topView).toBe('overview');
    expect(host.workspaceMenuOpen).toBe(false);
    expect(persistRequestStore).toHaveBeenCalledWith(
      host.requests,
      host.activeRequestId,
      host.openRequestIds,
      host.workspaces,
      host.collections,
      'workspace-2',
    );
  });

  it('force persistence captures and writes cookies even when the active request is unchanged', async () => {
    const request = { id: 'request-1', isDraft: false };
    const persistRequestStore = vi.fn().mockResolvedValue(true);
    const captureActiveWorkspaceCookies = vi.fn().mockResolvedValue(undefined);
    const removeDirtyRequest = vi.fn();
    const host = {
      workspaceBlocked: false,
      workspacePersistTimer: null,
      persistTimer: null,
      activeRequestId: request.id,
      requests: [request],
      autosave: false,
      draftRequestIds: new Set<string>(),
      captureActiveWorkspaceCookies,
      persistWorkspaceNow: vi.fn(),
      snapshotActiveRequest: () => request,
      requestDiffersFromStored: () => false,
      removeDirtyRequest,
      persistRequestStore,
    };

    await requestPersistenceFeature.persistActiveRequestNow.call(host as any, true);

    expect(captureActiveWorkspaceCookies).toHaveBeenCalledTimes(1);
    expect(removeDirtyRequest).toHaveBeenCalledWith(request.id);
    expect(persistRequestStore).toHaveBeenCalledWith(host.requests, request.id);
  });
});
