import { describe, expect, it } from 'vitest';
import { emptyCollectionDefaults } from '../lib/collectionDefaults';
import {
  addCollectionFolderPath,
  folderCollapsedByDefault,
  normalizeCollectionFolderPaths,
  removeCollectionFolderPathTree,
  renameCollectionFolderPath,
  reorderWorkspaceCollections,
} from '../lib/collections';
import { collectionFeature } from '../lib/stores/features/collections';
import { folderFeature } from '../lib/stores/features/folders';
import type { Collection } from '../lib/types/models';

function collection(id: string, workspaceId = 'workspace-1'): Collection {
  return {
    id,
    workspaceId,
    name: id,
    filesystemName: id,
    description: '',
    collapsed: false,
    defaults: emptyCollectionDefaults(),
  };
}

describe('reorderWorkspaceCollections', () => {
  it('moves a collection before another collection in the same workspace', () => {
    const reordered = reorderWorkspaceCollections(
      [collection('a'), collection('b'), collection('c')],
      'workspace-1',
      'c',
      'a',
      'before',
    );

    expect(reordered.map(c => c.id)).toEqual(['c', 'a', 'b']);
  });

  it('moves a collection after another collection without moving other workspaces', () => {
    const reordered = reorderWorkspaceCollections(
      [collection('a'), collection('x', 'workspace-2'), collection('b'), collection('c')],
      'workspace-1',
      'a',
      'c',
      'after',
    );

    expect(reordered.map(c => c.id)).toEqual(['b', 'x', 'c', 'a']);
    expect(reordered[1].workspaceId).toBe('workspace-2');
  });

  it('leaves the list unchanged when source or target is outside the workspace', () => {
    const collections = [collection('a'), collection('x', 'workspace-2')];

    expect(reorderWorkspaceCollections(collections, 'workspace-1', 'x', 'a', 'before')).toBe(collections);
    expect(reorderWorkspaceCollections(collections, 'workspace-1', 'a', 'x', 'before')).toBe(collections);
  });
});

describe('collection folder paths', () => {
  it('normalizes and deduplicates persisted empty folder paths', () => {
    expect(normalizeCollectionFolderPaths([
      ['Root', 'Child'],
      ['Root', 'Child'],
      ['Root', ''],
      [],
    ])).toEqual([
      ['Root', 'Child'],
      ['Root'],
    ]);
  });

  it('adds, renames, and removes folder path trees without touching other folders', () => {
    const base = addCollectionFolderPath(collection('api'), ['Users', 'Active']);
    const withSibling = addCollectionFolderPath(base, ['Orders']);
    const renamed = renameCollectionFolderPath(withSibling, ['Users'], ['Accounts']);
    const removed = removeCollectionFolderPathTree(renamed, ['Accounts']);

    expect(base.folderPaths).toEqual([['Users', 'Active']]);
    expect(renamed.folderPaths).toEqual([['Accounts', 'Active'], ['Orders']]);
    expect(removed.folderPaths).toEqual([['Orders']]);
  });

  it('collapses nested folders by default while keeping top-level folders open', () => {
    expect(folderCollapsedByDefault(['Users'])).toBe(false);
    expect(folderCollapsedByDefault(['Users', 'Active'])).toBe(true);

    const host = {
      activeWorkspaceId: 'workspace-1',
      collections: [{
        ...collection('api'),
        folderPaths: [['Users', 'Active'], ['Users', 'Archived'], ['Orders']],
      }],
      folderCollapseState: {},
      requests: [],
      sidebarSearch: '',
      workspaceDiagnostics: [],
      diagnosticsForCollection: () => [],
      diagnosticsForRequest: () => [],
      folderCollapseKey: folderFeature.folderCollapseKey,
      folderDisplayName: folderFeature.folderDisplayName,
      requestsForDisplay: () => [],
    };

    const groups = collectionFeature.buildCollectionGroups.call(host as any);
    const users = groups[0].folders.find(folder => folder.name === 'Users');

    expect(users?.collapsed).toBe(false);
    expect(users?.children.map(folder => [folder.name, folder.collapsed])).toEqual([
      ['Active', true],
      ['Archived', true],
    ]);
  });

  it('toggles folders against their default collapsed state', async () => {
    let persistCalls = 0;
    const host = {
      folderCollapseState: {},
      folderCollapseKey: folderFeature.folderCollapseKey,
      scheduleRequestStorePersist: () => { persistCalls += 1; },
    };

    const topLevelKey = folderFeature.folderCollapseKey.call(host as any, 'api', ['Users']);
    const nestedKey = folderFeature.folderCollapseKey.call(host as any, 'api', ['Users', 'Active']);

    await folderFeature.toggleFolderCollapsed.call(host as any, 'api', ['Users']);
    await folderFeature.toggleFolderCollapsed.call(host as any, 'api', ['Users', 'Active']);

    expect(host.folderCollapseState[topLevelKey]).toBe(true);
    expect(host.folderCollapseState[nestedKey]).toBe(false);
    expect(persistCalls).toBe(2);
  });
});
