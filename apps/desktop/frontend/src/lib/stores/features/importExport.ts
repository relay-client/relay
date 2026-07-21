import { openDirectoryDialog, readCollectionTextFiles, writeCollectionTextFiles } from '../../backend';
import type { BodyType, Collection, Environment, RequestHistoryEntry, SavedRequest, ScriptEngine, Workspace } from '../../types/models';
import type { TopView } from '../ui';
import { filesystemNameFromName, makeCollection, normalizeCollection, normalizeEnvironment, normalizeSavedRequest } from '../../normalizers';
import { normalizeCollectionDefaults } from '../../collectionDefaults';
import { routeImportedScripts, withActiveScripts } from '../../scriptEngine';
import { downloadTextFile, safeFileName } from '../../utils';
import type { OpenApiExportFormat } from '../../openapi';

type ImportSource = 'bruno' | 'postman' | 'insomnia' | 'openapi' | 'har';

type DialogOptionInput = { value: string; label: string; icon?: string; description?: string };

function fileSegmentForExport(name: string) {
  return safeFileName(name).replace(/\s+/g, '-') || 'collection';
}

type ImportExportHost = {
  collectionImportSource: ImportSource;
  collectionImportToast: string;
  collections: Collection[];
  requests: SavedRequest[];
  environments: Environment[];
  workspaces: Workspace[];
  activeWorkspaceId: string;
  activeEnvironmentId: string;
  openRequestIds: string[];
  requestHistory: RequestHistoryEntry[];
  topView: TopView;
  scriptEngine: ScriptEngine;
  _postmanImportInput: HTMLInputElement | undefined;
  // shared / cross-feature members that remain on AppVM
  guardWorkspaceWritable: (action?: string) => boolean;
  closeFloatingMenus: () => void;
  openSelectDialog: (title: string, message: string, options: DialogOptionInput[], confirmLabel?: string, cancelLabel?: string) => Promise<string>;
  openAlertDialog: (title: string, message: string) => Promise<void>;
  openPromptDialog: (title: string, initialValue?: string, message?: string) => Promise<string>;
  persistActiveRequestNow: (forceDisk?: boolean) => Promise<void>;
  persistRequestStore: (nextRequests?: SavedRequest[], activeId?: string, nextOpenIds?: string[], nextWorkspaces?: Workspace[], nextCollections?: Collection[], workspaceId?: string, nextHistory?: RequestHistoryEntry[], nextEnvironments?: Environment[], nextActiveEnvId?: string) => Promise<boolean>;
  applySavedRequest: (req: SavedRequest) => void;
  savedRequestIsRealtime: (req: SavedRequest) => boolean;
  savedRequestIsGraphQL: (req: SavedRequest) => boolean;
  stripBodyComments: (source: string, type: BodyType) => string;
  defaultWorkspaceParentForDialogs: () => Promise<string>;
  saveTextFile: (name: string, content: string) => Promise<boolean>;
  isRecord: (value: unknown) => value is Record<string, unknown>;
  // intra-feature members (mixed into the same prototype)
  importBrunoOpenCollectionFolder: () => Promise<void>;
  importCollectionPayload: (text: string, fileName: string, source: ImportSource) => Promise<number>;
  importOpenCollectionFiles: (files: Array<{ path: string; content: string }>, fallbackName: string) => Promise<number>;
  importHarPayload: (payload: unknown, fileName: string) => Promise<number>;
  importRequestsPayload: (collectionName: string, buildRequests: (collectionId: string, collectionName: string) => SavedRequest[]) => Promise<number>;
  importPostmanPayload: (payload: unknown, fileName: string) => Promise<number>;
  importInsomniaPayload: (payload: unknown, fileName: string) => Promise<number>;
  importOpenApiPayload: (payload: unknown, fileName: string) => Promise<number>;
  exportCollectionToOpenCollection: (collectionId: string) => Promise<void>;
  exportCollectionToPostman: (collectionId: string) => Promise<void>;
  exportCollectionToInsomnia: (collectionId: string) => Promise<void>;
  exportCollectionToOpenApi: (collectionId: string, format: OpenApiExportFormat) => Promise<void>;
  chooseCollectionSecretExportMode: (reqs: SavedRequest[], title: string) => Promise<boolean | null>;
};

export const importExportFeature = {
  async openPostmanImport(this: ImportExportHost) {
    if (!this.guardWorkspaceWritable('Importing')) return;
    this.closeFloatingMenus();
    const source = await this.openSelectDialog('Import collection', 'Choose the source format to import:', [
      { value: 'bruno', label: 'Bruno / OpenCollection', icon: 'bruno', description: 'Import a Bruno collection folder with opencollection.yml or legacy .bru files.' },
      { value: 'postman', label: 'Postman Collection', icon: 'postman', description: 'Import a Postman v2.1 collection JSON file.' },
      { value: 'insomnia', label: 'Insomnia Export', icon: 'insomnia', description: 'Import an Insomnia workspace or collection export JSON file.' },
      { value: 'openapi', label: 'OpenAPI / Swagger', icon: 'openapi', description: 'Import OpenAPI 3.x or Swagger 2.0 JSON/YAML specs.' },
      { value: 'har', label: 'HAR from DevTools', icon: 'har', description: 'Turn captured browser traffic into requests.' },
    ], 'Import');
    if (!source) return;
    this.collectionImportSource = source as ImportSource;
    if (this.collectionImportSource === 'bruno') {
      await this.importBrunoOpenCollectionFolder();
      return;
    }
    this._postmanImportInput?.click();
  },
  async onPostmanImportFile(this: ImportExportHost, e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0]; input.value = ''; if (!file) return;
    try {
      const text = await file.text();
      const count = await this.importCollectionPayload(text, file.name, this.collectionImportSource);
      this.collectionImportToast = count ? `Imported ${count} request${count === 1 ? '' : 's'}` : 'Imported empty collection';
    } catch (err) {
      this.collectionImportToast = `Import failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally { setTimeout(() => (this.collectionImportToast = ''), 3200); }
  },
  async importCollectionPayload(this: ImportExportHost, text: string, fileName: string, source: ImportSource) {
    if (!this.guardWorkspaceWritable('Importing')) return 0;
    if (source === 'bruno') {
      return this.importOpenCollectionFiles([{ path: fileName, content: text }], fileName.replace(/\.(bru|ya?ml)$/i, '') || 'Bruno Collection');
    }
    if (source === 'postman') return this.importPostmanPayload(JSON.parse(text) as unknown, fileName);
    if (source === 'insomnia') return this.importInsomniaPayload(JSON.parse(text) as unknown, fileName);
    if (source === 'har') return this.importHarPayload(JSON.parse(text) as unknown, fileName);
    const { parseOpenApiDocument } = await import('../../openapi');
    const spec = parseOpenApiDocument(text);
    return this.importOpenApiPayload(spec, fileName);
  },
  async importBrunoOpenCollectionFolder(this: ImportExportHost) {
    if (!this.guardWorkspaceWritable('Importing')) return;
    const root = await openDirectoryDialog('Import Bruno / OpenCollection folder');
    if (!root) return;
    try {
      const result = await readCollectionTextFiles(root);
      if (result.error) throw new Error(result.error);
      const count = await this.importOpenCollectionFiles(result.files, result.name || root.split(/[\\/]/).pop() || 'Bruno Collection');
      this.collectionImportToast = count ? `Imported ${count} Bruno request${count === 1 ? '' : 's'}` : 'Imported empty Bruno collection';
    } catch (err) {
      this.collectionImportToast = `Import failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      setTimeout(() => (this.collectionImportToast = ''), 3600);
    }
  },
  async importOpenCollectionFiles(this: ImportExportHost, files: Array<{ path: string; content: string }>, fallbackName: string) {
    if (!this.guardWorkspaceWritable('Importing')) return 0;
    const wsId = this.activeWorkspaceId || this.workspaces[0]?.id; if (!wsId) throw new Error('No workspace available');
    await this.persistActiveRequestNow();
    const collection = makeCollection(wsId, fallbackName || 'Bruno Collection');
    const { openCollectionBundleFromFiles } = await import('../../opencollection');
    const bundle = openCollectionBundleFromFiles(files, collection.id, fallbackName, wsId);
    const importedCollection = normalizeCollection({ ...collection, name: bundle.name, description: bundle.description, filesystemName: filesystemNameFromName(bundle.name, collection.id), folderPaths: bundle.folderPaths, defaults: routeImportedScripts(normalizeCollectionDefaults(bundle.defaults), this.scriptEngine) }, wsId);
    const importCollections = [...this.collections, importedCollection];
    const importedReqs = bundle.requests.map(req => routeImportedScripts(normalizeSavedRequest({ ...req, collectionId: importedCollection.id, collection: importedCollection.name }, importCollections, wsId), this.scriptEngine));
    const importedEnvs = bundle.environments.map(env => normalizeEnvironment(env, wsId));
    const nextCols = [...this.collections, importedCollection];
    const nextReqs = [...this.requests, ...importedReqs];
    const nextEnvs = [...this.environments, ...importedEnvs];
    const first = importedReqs[0];
    const nextOpenIds = first ? [...new Set([...this.openRequestIds, first.id])] : this.openRequestIds;
    this.activeWorkspaceId = wsId; this.collections = nextCols; this.requests = nextReqs; this.environments = nextEnvs; this.openRequestIds = nextOpenIds;
    if (first) {
      this.applySavedRequest(first);
      this.topView = 'request';
    }
    await this.persistRequestStore(nextReqs, first?.id, nextOpenIds, this.workspaces, nextCols, wsId, this.requestHistory, nextEnvs, this.activeEnvironmentId);
    return importedReqs.length;
  },
  async importHarPayload(this: ImportExportHost, payload: unknown, fileName: string) {
    const { harCollectionName, harRequestsFromLog } = await import('../../har');
    const collectionName = harCollectionName(payload, fileName);
    return this.importRequestsPayload(collectionName, (collectionId, name) => harRequestsFromLog(payload, collectionId, name));
  },
  async importRequestsPayload(this: ImportExportHost, collectionName: string, buildRequests: (collectionId: string, collectionName: string) => SavedRequest[]) {
    if (!this.guardWorkspaceWritable('Importing')) return 0;
    const wsId = this.activeWorkspaceId || this.workspaces[0]?.id; if (!wsId) throw new Error('No workspace available');
    await this.persistActiveRequestNow();
    const collection = makeCollection(wsId, collectionName);
    const importCollections = [...this.collections, collection];
    const importedReqs = buildRequests(collection.id, collectionName)
      .map(req => routeImportedScripts(normalizeSavedRequest(req, importCollections, wsId), this.scriptEngine));
    if (!importedReqs.length) throw new Error('No requests found in import file');
    const nextCols = [...this.collections, collection]; const nextReqs = [...this.requests, ...importedReqs];
    const first = importedReqs[0]; const nextOpenIds = [...new Set([...this.openRequestIds, first.id])];
    this.activeWorkspaceId = wsId; this.collections = nextCols; this.requests = nextReqs; this.openRequestIds = nextOpenIds;
    this.applySavedRequest(first); this.topView = 'request';
    await this.persistRequestStore(nextReqs, first.id, nextOpenIds, this.workspaces, nextCols, wsId);
    return importedReqs.length;
  },
  async importPostmanPayload(this: ImportExportHost, payload: unknown, fileName: string) {
    if (!this.isRecord(payload) || !Array.isArray(payload.item)) throw new Error('Expected a Postman collection JSON file');
    const info = this.isRecord(payload.info) ? payload.info : {};
    const collectionName = String(info.name || fileName.replace(/\.json$/i, '') || 'Postman Collection');
    const { postmanRequestsFromItems } = await import('../../postman');
    return this.importRequestsPayload(collectionName, (collectionId, name) => postmanRequestsFromItems(payload.item, collectionId, name, payload.auth));
  },
  async importInsomniaPayload(this: ImportExportHost, payload: unknown, fileName: string) {
    const { insomniaCollectionName, insomniaRequestsFromResources } = await import('../../insomnia');
    const collectionName = insomniaCollectionName(payload, fileName);
    return this.importRequestsPayload(collectionName, (collectionId, name) => insomniaRequestsFromResources(payload, collectionId, name));
  },
  async importOpenApiPayload(this: ImportExportHost, payload: unknown, fileName: string) {
    const { openApiCollectionName, openApiRequestsFromSpec } = await import('../../openapi');
    const collectionName = openApiCollectionName(payload, fileName);
    return this.importRequestsPayload(collectionName, (collectionId, name) => openApiRequestsFromSpec(payload, collectionId, name));
  },
  async exportCollection(this: ImportExportHost, collectionId: string) {
    this.closeFloatingMenus();
    const format = await this.openSelectDialog('Export collection', 'Choose the export format:', [
      { value: 'opencollection', label: 'OpenCollection YAML folder', icon: 'bruno', description: 'Export a Bruno v3-compatible folder with opencollection.yml and request .yml files.' },
      { value: 'postman', label: 'Postman Collection v2.1', icon: 'postman', description: 'Export a single Postman collection JSON file.' },
      { value: 'insomnia', label: 'Insomnia Export v4', icon: 'insomnia', description: 'Export an Insomnia workspace JSON file with Relay request metadata.' },
      { value: 'openapi3', label: 'OpenAPI 3.0 JSON', icon: 'openapi', description: 'Export HTTP requests as an OpenAPI document.' },
      { value: 'swagger2', label: 'Swagger 2.0 JSON', icon: 'openapi', description: 'Export HTTP requests as a Swagger 2.0 document.' },
    ], 'Export');
    if (!format) return;
    if (format === 'opencollection') return this.exportCollectionToOpenCollection(collectionId);
    if (format === 'postman') return this.exportCollectionToPostman(collectionId);
    if (format === 'insomnia') return this.exportCollectionToInsomnia(collectionId);
    return this.exportCollectionToOpenApi(collectionId, format as OpenApiExportFormat);
  },
  async exportCollectionToOpenCollection(this: ImportExportHost, collectionId: string) {
    const col = this.collections.find(c => c.id === collectionId); if (!col) return;
    const reqs = this.requests.filter(r => r.collectionId === collectionId && !r.isDraft);
    const folderPaths = col.folderPaths ?? [];
    if (!reqs.length && !folderPaths.length) {
      await this.openAlertDialog('OpenCollection export skipped', 'This collection has no requests or folders to export.');
      return;
    }
    const includeSecrets = await this.chooseCollectionSecretExportMode(reqs, 'OpenCollection export');
    if (includeSecrets === null) return;
    const folderName = await this.openPromptDialog('OpenCollection folder', fileSegmentForExport(col.name), 'Relay will create this folder inside the parent directory you choose next.');
    if (!folderName) return;
    const parentDir = await openDirectoryDialog(`Choose parent folder for ${folderName}`, await this.defaultWorkspaceParentForDialogs());
    if (!parentDir) return;
    const targetRoot = `${parentDir.replace(/[\\/]$/, '')}/${safeFileName(folderName)}`;
    const envs = this.environments.filter(env => env.workspaceId === col.workspaceId);
    const exportDefaults = withActiveScripts(col.defaults, this.scriptEngine);
    const exportReqs = reqs.map(r => withActiveScripts(r, this.scriptEngine));
    const { buildOpenCollectionFiles } = await import('../../opencollection');
    const files = buildOpenCollectionFiles(col.name, col.description ?? '', exportDefaults, exportReqs, envs, (s, t) => this.stripBodyComments(s, t as BodyType), includeSecrets, folderPaths);
    const error = await writeCollectionTextFiles(targetRoot, files);
    if (error) {
      this.collectionImportToast = 'OpenCollection export failed';
      setTimeout(() => (this.collectionImportToast = ''), 4200);
      await this.openAlertDialog('OpenCollection export failed', `${error}\n\nNo collection folder was written completely.`);
      return;
    }
    this.collectionImportToast = `Exported ${col.name} as OpenCollection`;
    setTimeout(() => (this.collectionImportToast = ''), 3000);
  },
  async exportCollectionToPostman(this: ImportExportHost, collectionId: string) {
    const col = this.collections.find(c => c.id === collectionId); if (!col) return;
    const reqs = this.requests.filter(r => r.collectionId === collectionId && !r.isDraft);
    if (!reqs.length) {
      await this.openAlertDialog('Postman export skipped', 'This collection has no requests to export.');
      return;
    }
    const includeSecrets = await this.chooseCollectionSecretExportMode(reqs, 'Postman collection export');
    if (includeSecrets === null) return;
    const exportReqs = reqs.map(r => withActiveScripts(r, this.scriptEngine));
    const { buildPostmanCollection } = await import('../../postman');
    const payload = buildPostmanCollection(col.name, col.description ?? '', exportReqs, (s, t) => this.stripBodyComments(s, t as BodyType), includeSecrets);
    this.closeFloatingMenus();
    const name = `${safeFileName(col.name)}.postman_collection.json`;
    const content = JSON.stringify(payload, null, 2);
    const successToast = `Exported ${col.name}`;
    try {
      if (!(await this.saveTextFile(name, content))) return;
      this.collectionImportToast = successToast;
    } catch { downloadTextFile(name, content); this.collectionImportToast = successToast; }
    finally { setTimeout(() => (this.collectionImportToast = ''), 2600); }
  },
  async exportCollectionToInsomnia(this: ImportExportHost, collectionId: string) {
    const col = this.collections.find(c => c.id === collectionId); if (!col) return;
    const reqs = this.requests.filter(r => r.collectionId === collectionId && !r.isDraft);
    if (!reqs.length) {
      await this.openAlertDialog('Insomnia export skipped', 'This collection has no requests to export.');
      return;
    }
    const includeSecrets = await this.chooseCollectionSecretExportMode(reqs, 'Insomnia export');
    if (includeSecrets === null) return;
    const exportReqs = reqs.map(r => withActiveScripts(r, this.scriptEngine));
    const { buildInsomniaExport } = await import('../../insomnia');
    const payload = buildInsomniaExport(col.name, col.description ?? '', exportReqs, (s, t) => this.stripBodyComments(s, t as BodyType), includeSecrets);
    this.closeFloatingMenus();
    const name = `${safeFileName(col.name)}.insomnia.json`;
    const content = JSON.stringify(payload, null, 2);
    try {
      if (!(await this.saveTextFile(name, content))) return;
      this.collectionImportToast = `Exported ${col.name}`;
    } catch { downloadTextFile(name, content); this.collectionImportToast = `Exported ${col.name}`; }
    finally { setTimeout(() => (this.collectionImportToast = ''), 2600); }
  },
  async exportCollectionToOpenApi(this: ImportExportHost, collectionId: string, format: OpenApiExportFormat) {
    const col = this.collections.find(c => c.id === collectionId); if (!col) return;
    const reqs = this.requests.filter(r => r.collectionId === collectionId && !r.isDraft);
    this.closeFloatingMenus();
    const label = format === 'swagger2' ? 'Swagger 2.0' : 'OpenAPI 3.0';
    const exportableReqs = reqs.filter(req => !this.savedRequestIsRealtime(req) && !this.savedRequestIsGraphQL(req));
    const skippedUnsupported = reqs.length - exportableReqs.length;
    if (!exportableReqs.length) {
      await this.openAlertDialog(`${label} export skipped`, `${label} export only supports HTTP and SSE requests. GraphQL and realtime requests are not written to the spec.`);
      return;
    }
    const includeSecrets = await this.chooseCollectionSecretExportMode(exportableReqs, `${label} export`);
    if (includeSecrets === null) return;
    const name = `${safeFileName(col.name)}.${format === 'swagger2' ? 'swagger' : 'openapi'}.json`;
    let content = '';
    try {
      const { buildOpenApiExport } = await import('../../openapi');
      const payload = buildOpenApiExport(format, col.name, col.description ?? '', exportableReqs, (s, t) => this.stripBodyComments(s, t as BodyType), includeSecrets);
      content = JSON.stringify(payload, null, 2);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.collectionImportToast = `${label} export failed`;
      setTimeout(() => (this.collectionImportToast = ''), 4200);
      await this.openAlertDialog(`${label} export failed`, `${detail}\n\nNo file was written.`);
      return;
    }
    try {
      if (!(await this.saveTextFile(name, content))) return;
      this.collectionImportToast = skippedUnsupported
        ? `Exported ${col.name} as ${label}. Skipped ${skippedUnsupported} unsupported request${skippedUnsupported === 1 ? '' : 's'}`
        : `Exported ${col.name} as ${label}`;
    } catch {
      downloadTextFile(name, content);
      this.collectionImportToast = skippedUnsupported
        ? `Exported ${col.name} as ${label}. Skipped ${skippedUnsupported} unsupported request${skippedUnsupported === 1 ? '' : 's'}`
        : `Exported ${col.name} as ${label}`;
    }
    finally { setTimeout(() => (this.collectionImportToast = ''), 2600); }
  },
  async chooseCollectionSecretExportMode(this: ImportExportHost, reqs: SavedRequest[], title: string): Promise<boolean | null> {
    const { requestsHaveExportSecrets } = await import('../../secretExport');
    if (!requestsHaveExportSecrets(reqs)) return false;
    const selected = await this.openSelectDialog(title, 'This collection contains values that look like secrets. Choose how to export it:', [
      { value: 'safe', label: 'Export without secret values' },
      { value: 'include', label: 'Include secret values' },
    ], 'Export', 'Cancel');
    if (!selected) return null;
    return selected === 'include';
  },
  async exportEnvironmentToPostman(this: ImportExportHost, environmentId: string) {
    const env = this.environments.find(e => e.id === environmentId); if (!env) return;
    const hasSecretValues = env.values.some(row => row.secret && row.value);
    let includeSecrets = false;
    if (hasSecretValues) {
      const selected = await this.openSelectDialog('Export environment', 'This environment contains secret values. Choose how to export it:', [
        { value: 'safe', label: 'Export without secret values' },
        { value: 'include', label: 'Include secret values' },
      ], 'Export', 'Cancel');
      if (!selected) return;
      includeSecrets = selected === 'include';
    }
    const { buildPostmanEnvironment } = await import('../../postman');
    const payload = buildPostmanEnvironment(env, includeSecrets);
    this.closeFloatingMenus();
    const name = `${safeFileName(env.name)}.postman_environment.json`;
    const content = JSON.stringify(payload, null, 2);
    try {
      if (!(await this.saveTextFile(name, content))) return;
      this.collectionImportToast = `Exported ${env.name}`;
    } catch { downloadTextFile(name, content); this.collectionImportToast = `Exported ${env.name}`; }
    finally { setTimeout(() => (this.collectionImportToast = ''), 2600); }
  },
};
