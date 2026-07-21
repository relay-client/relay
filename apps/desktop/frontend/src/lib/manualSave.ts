import type { SavedRequest } from './types/models';

export type ManualRequestSnapshotState = {
  dirtyRequestIds: Set<string>;
  unsavedRequestSnapshots: Map<string, SavedRequest>;
};

function rowsWithoutUiIds(rows: SavedRequest['params'] | undefined) {
  return (rows ?? []).map(({ id, ...row }) => row);
}

function socketIoArgsWithoutUiIds(args: SavedRequest['sioArgs'] | undefined) {
  return (args ?? []).map(({ id, ...arg }) => arg);
}

export function requestDirtyFingerprint(req: SavedRequest) {
  const {
    requestTab,
    params,
    headers,
    formRows,
    sioEvents,
    sioArgs,
    ...stable
  } = req;
  return JSON.stringify({
    ...stable,
    params: rowsWithoutUiIds(params),
    headers: rowsWithoutUiIds(headers),
    formRows: rowsWithoutUiIds(formRows),
    sioEvents: rowsWithoutUiIds(sioEvents),
    sioArgs: socketIoArgsWithoutUiIds(sioArgs),
  });
}

export function cloneSavedRequestSnapshot(req: SavedRequest): SavedRequest {
  return JSON.parse(JSON.stringify(req)) as SavedRequest;
}

export function requestDiffersFromSavedSnapshot(req: SavedRequest, saved: SavedRequest | undefined) {
  if (!saved) return true;
  // Cheap pre-checks short-circuit the expensive JSON.stringify on every
  // keystroke. A request with a 1MB body would otherwise re-serialize on
  // each character typed — visible UI lag for the autosave dirty check.
  if (req === saved) return false;
  if (req.method !== saved.method) return true;
  if (req.url !== saved.url) return true;
  if (req.bodyType !== saved.bodyType) return true;
  if (req.bodyContent !== saved.bodyContent) return true;
  if (req.bodyFilePath !== saved.bodyFilePath) return true;
  if (req.name !== saved.name) return true;
  if ((req.params?.length ?? 0) !== (saved.params?.length ?? 0)) return true;
  if ((req.headers?.length ?? 0) !== (saved.headers?.length ?? 0)) return true;
  if ((req.formRows?.length ?? 0) !== (saved.formRows?.length ?? 0)) return true;
  return requestDirtyFingerprint(req) !== requestDirtyFingerprint(saved);
}

export function requestForEditingSnapshot(
  id: string,
  requests: SavedRequest[],
  unsavedRequestSnapshots: Map<string, SavedRequest>,
) {
  return unsavedRequestSnapshots.get(id) ?? requests.find(request => request.id === id);
}

export function updateManualRequestSnapshot(
  id: string,
  current: SavedRequest | undefined,
  savedRequestSnapshots: Map<string, SavedRequest>,
  dirtyRequestIds: Set<string>,
  unsavedRequestSnapshots: Map<string, SavedRequest>,
  clear = false,
): ManualRequestSnapshotState {
  const nextDirty = new Set(dirtyRequestIds);
  const nextUnsaved = new Map(unsavedRequestSnapshots);
  if (clear || !current || current.isDraft) {
    nextDirty.delete(id);
    nextUnsaved.delete(id);
    return { dirtyRequestIds: nextDirty, unsavedRequestSnapshots: nextUnsaved };
  }
  if (requestDiffersFromSavedSnapshot(current, savedRequestSnapshots.get(id))) {
    nextDirty.add(id);
    nextUnsaved.set(id, cloneSavedRequestSnapshot(current));
  } else {
    nextDirty.delete(id);
    nextUnsaved.delete(id);
  }
  return { dirtyRequestIds: nextDirty, unsavedRequestSnapshots: nextUnsaved };
}
