import type { KVRow, SavedRequest, CollectionDefaults, Environment, AuthType, BodyType, OAuth2ClientAuth, OAuth2GrantType, RawBodyType, Method, RequestSettings, RequestTab, RequestType, SIOArg } from './types/models';
import { DEFAULT_REQUEST_SETTINGS } from './constants';
import { isRecord, asArray, asText, newRequestId } from './utils';
import { mkRow } from './constants';
import { emptyAuthState, inheritAuthState } from './utils';
import { safeExportRow, safeExportUrl, safeExportValue, sanitizeExportExample } from './secretExport';
import { parseGraphQLPayload, parseGraphQLVariables, serializeGraphQLPayload } from './graphql';
import { filterSocketIOTransportParams, graphQLBodyContentFromJsonText, isWebSocketUrl, socketIOImportDetails } from './importDetection';
import { filesystemNameFromName } from './normalizers';
import { emptyCollectionDefaults } from './collectionDefaults';
import { DEFAULT_GRPC_MESSAGE } from './requestBodyDefaults';

const RELAY_EXTENSION_KEY = 'x-relay';
const RELAY_REQUEST_TYPES = new Set<RequestType>(['http', 'graphql', 'ws', 'socketio', 'grpc']);
const RELAY_REQUEST_TABS = new Set<RequestTab>(['docs', 'params', 'query', 'auth', 'headers', 'metadata', 'body', 'schema', 'service', 'events', 'scripts', 'settings']);

function postmanDescription(value: unknown) {
  if (typeof value === 'string') return value;
  if (isRecord(value)) return asText(value.content || value.description);
  return '';
}

function importedRow(key: string, value: string, enabled = true, description = '', isFile = false): KVRow {
  const fileName = isFile ? value.split('/').pop() ?? value : '';
  return { ...mkRow(), key, value, enabled, description, isFile, fileName };
}

function postmanKvRows(list: unknown): KVRow[] {
  return asArray(list)
    .map(item => {
      if (!isRecord(item)) return null;
      const key = asText(item.key || item.name);
      if (!key) return null;
      return importedRow(key, asText(item.value), item.disabled !== true, postmanDescription(item.description));
    })
    .filter((row): row is KVRow => Boolean(row));
}

export type PostmanScripts = { preRequestScript: string; testScript: string };

const NO_SCRIPTS: PostmanScripts = { preRequestScript: '', testScript: '' };

// Postman stores a script as `exec`, an array of source lines (older exports
// and some generators use a single string instead). `script.src` points at an
// external file we cannot resolve, so those events are dropped.
function postmanScriptSource(event: Record<string, unknown>): string {
  const script = isRecord(event.script) ? event.script : {};
  const exec = script.exec ?? event.exec;
  if (Array.isArray(exec)) return exec.map(asText).join('\n');
  return asText(exec);
}

function joinScripts(first: string, second: string): string {
  if (!first.trim()) return second;
  if (!second.trim()) return first;
  return `${first.replace(/\s+$/, '')}\n\n${second}`;
}

function mergeScripts(outer: PostmanScripts, inner: PostmanScripts): PostmanScripts {
  return {
    preRequestScript: joinScripts(outer.preRequestScript, inner.preRequestScript),
    testScript: joinScripts(outer.testScript, inner.testScript),
  };
}

function hasScripts(scripts: PostmanScripts) {
  return Boolean(scripts.preRequestScript.trim() || scripts.testScript.trim());
}

// `event` belongs on the item in the v2.1 schema, but Relay used to write it
// under `request` — read both so our own older exports still round-trip.
export function postmanScriptsFromEvents(...sources: unknown[]): PostmanScripts {
  const result = { preRequestScript: '', testScript: '' };
  for (const source of sources) {
    for (const event of asArray(source)) {
      if (!isRecord(event) || event.disabled === true) continue;
      const code = postmanScriptSource(event);
      if (!code.trim()) continue;
      const listen = asText(event.listen).toLowerCase();
      if (listen === 'prerequest') result.preRequestScript = joinScripts(result.preRequestScript, code);
      else if (listen === 'test') result.testScript = joinScripts(result.testScript, code);
    }
  }
  return result;
}

// A Postman folder runs its scripts before/after every request it contains.
// Relay has no folder layer, so the folder's code is flattened into each
// request, labelled with where it came from.
function labelledFolderScripts(scripts: PostmanScripts, folderName: string): PostmanScripts {
  const label = `// --- from Postman folder "${folderName}" ---`;
  return {
    preRequestScript: scripts.preRequestScript.trim() ? `${label}\n${scripts.preRequestScript}` : '',
    testScript: scripts.testScript.trim() ? `${label}\n${scripts.testScript}` : '',
  };
}

function relayExtensionFromPostman(item: Record<string, unknown>, req: Record<string, unknown>): Record<string, unknown> {
  const fromItem = item[RELAY_EXTENSION_KEY] ?? item.relay;
  const fromRequest = req[RELAY_EXTENSION_KEY] ?? req.relay;
  return isRecord(fromItem) ? fromItem : isRecord(fromRequest) ? fromRequest : {};
}

function relayRequestType(value: unknown): RequestType | '' {
  const type = asText(value).toLowerCase();
  return RELAY_REQUEST_TYPES.has(type as RequestType) ? type as RequestType : '';
}

function relayRequestTab(value: unknown): RequestTab | '' {
  const tab = asText(value).toLowerCase();
  return RELAY_REQUEST_TABS.has(tab as RequestTab) ? tab as RequestTab : '';
}

function relaySettings(value: unknown): Partial<RequestSettings> {
  return isRecord(value) ? value as Partial<RequestSettings> : {};
}

function relayRows(value: unknown): KVRow[] {
  return postmanKvRows(value);
}

function relaySIOArgs(value: unknown): SIOArg[] {
  return asArray(value).map(item => {
    if (!isRecord(item)) return null;
    return {
      id: asText(item.id) || newRequestId(),
      content: asText(item.content),
      bodyType: (['text', 'json', 'html', 'xml', 'binary'].includes(asText(item.bodyType)) ? asText(item.bodyType) : 'text') as SIOArg['bodyType'],
      encoding: asText(item.encoding) === 'hex' ? 'hex' : 'base64',
    };
  }).filter((item): item is SIOArg => Boolean(item));
}

function postmanAuthParam(auth: Record<string, unknown>, bucket: string, key: string) {
  const entry = asArray(auth[bucket]).find(item => isRecord(item) && item.key === key);
  return isRecord(entry) ? asText(entry.value) : '';
}

// Postman's grant names, including the PKCE variant which is the same
// authorization-code flow with a different challenge.
function postmanGrantType(value: string): { grant: OAuth2GrantType; pkce: boolean } | null {
  switch (value.toLowerCase()) {
    case 'authorization_code': return { grant: 'authorization_code', pkce: false };
    case 'authorization_code_with_pkce': return { grant: 'authorization_code', pkce: true };
    case 'client_credentials': return { grant: 'client_credentials', pkce: false };
    case 'password_credentials':
    case 'password': return { grant: 'password', pkce: false };
    default: return null;
  }
}

function postmanAuthConfig(authValue: unknown, inheritedAuth?: unknown): SavedRequest['auth'] {
  const auth = isRecord(authValue) ? authValue : isRecord(inheritedAuth) ? inheritedAuth : null;
  const config: SavedRequest['auth'] = emptyAuthState();
  if (!auth) return config;
  const type = asText(auth.type).toLowerCase();
  if (!type || type === 'noauth') return config;
  if (type === 'bearer') {
    config.type = 'bearer';
    config.bearerToken = postmanAuthParam(auth, 'bearer', 'token') || postmanAuthParam(auth, 'bearer', 'bearerToken');
  } else if (type === 'basic' || type === 'digest') {
    config.type = type as AuthType;
    config.basicUser = postmanAuthParam(auth, type, 'username');
    config.basicPass = postmanAuthParam(auth, type, 'password');
  } else if (type === 'apikey') {
    config.type = 'apikey';
    config.apiKeyName = postmanAuthParam(auth, 'apikey', 'key') || 'X-API-Key';
    config.apiKeyValue = postmanAuthParam(auth, 'apikey', 'value');
    config.apiKeyIn = postmanAuthParam(auth, 'apikey', 'in') === 'query' ? 'query' : 'header';
  } else if (type === 'oauth2') {
    config.type = 'oauth2';
    // A stored access token expires; without the rest of the flow the request
    // starts failing with a 401 some time after the import, so carry over
    // everything Relay can use to fetch a fresh one.
    config.oauth2Token = postmanAuthParam(auth, 'oauth2', 'accessToken') || postmanAuthParam(auth, 'oauth2', 'token');
    config.bearerToken = config.oauth2Token;
    config.oauth2TokenURL = postmanAuthParam(auth, 'oauth2', 'accessTokenUrl');
    config.oauth2AuthURL = postmanAuthParam(auth, 'oauth2', 'authUrl');
    config.oauth2ClientID = postmanAuthParam(auth, 'oauth2', 'clientId');
    config.oauth2Secret = postmanAuthParam(auth, 'oauth2', 'clientSecret');
    config.oauth2Scope = postmanAuthParam(auth, 'oauth2', 'scope');
    config.oauth2Audience = postmanAuthParam(auth, 'oauth2', 'audience');
    config.oauth2RefreshToken = postmanAuthParam(auth, 'oauth2', 'refreshToken');
    config.oauth2Username = postmanAuthParam(auth, 'oauth2', 'username');
    config.oauth2Password = postmanAuthParam(auth, 'oauth2', 'password');
    const clientAuth = postmanAuthParam(auth, 'oauth2', 'client_authentication').toLowerCase();
    if (clientAuth === 'body') config.oauth2ClientAuth = 'body' as OAuth2ClientAuth;
    const grant = postmanGrantType(postmanAuthParam(auth, 'oauth2', 'grant_type'));
    if (grant) {
      config.oauth2GrantType = grant.grant;
      config.oauth2UsePKCE = grant.pkce;
    }
  } else if (type === 'awsv4') {
    config.type = 'aws';
    config.awsAccessKey = postmanAuthParam(auth, 'awsv4', 'accessKey');
    config.awsSecretKey = postmanAuthParam(auth, 'awsv4', 'secretKey');
    config.awsSessionToken = postmanAuthParam(auth, 'awsv4', 'sessionToken');
    config.awsRegion = postmanAuthParam(auth, 'awsv4', 'region') || config.awsRegion;
    config.awsService = postmanAuthParam(auth, 'awsv4', 'service') || config.awsService;
  }
  return config;
}

function postmanUrlToRelay(urlValue: unknown) {
  if (typeof urlValue === 'string') return { url: stripUrlQueryAndFragment(urlValue), params: queryParamsFromUrl(urlValue) };
  if (!isRecord(urlValue)) return { url: '', params: [] as KVRow[] };
  const declaredParams = postmanKvRows(urlValue.query);
  const raw = asText(urlValue.raw);
  if (raw) {
    // Always lift the query string into params (even when Postman's
    // `query` array is empty) and strip the fragment — otherwise the UI
    // can't display/edit the params and the fragment leaks into the
    // request URL.
    const params = declaredParams.length ? declaredParams : queryParamsFromUrl(raw);
    return { url: stripUrlQueryAndFragment(raw), params };
  }
  const protocol = asText(urlValue.protocol);
  const host = Array.isArray(urlValue.host) ? urlValue.host.map(asText).join('.') : asText(urlValue.host);
  const port = asText(urlValue.port);
  const path = Array.isArray(urlValue.path) ? urlValue.path.map(asText).join('/') : asText(urlValue.path);
  const prefix = protocol ? `${protocol}://` : '';
  const hostWithPort = port ? `${host}:${port}` : host;
  return { url: `${prefix}${hostWithPort}${path ? `/${path}` : ''}`, params: declaredParams };
}

function stripUrlQueryAndFragment(raw: string): string {
  // Hash before query so we don't accidentally keep a fragment in the path.
  return raw.split('#')[0]?.split('?')[0] ?? '';
}

function queryParamsFromUrl(raw: string): KVRow[] {
  const qIdx = raw.indexOf('?');
  if (qIdx < 0) return [];
  const query = raw.slice(qIdx + 1).split('#')[0] ?? '';
  if (!query) return [];
  return query.split('&').filter(Boolean).map(pair => {
    const eq = pair.indexOf('=');
    const key = eq >= 0 ? pair.slice(0, eq) : pair;
    const value = eq >= 0 ? pair.slice(eq + 1) : '';
    return importedRow(safeDecodeURIComponent(key), safeDecodeURIComponent(value), true, '', false);
  });
}

function safeDecodeURIComponent(value: string): string {
  try { return decodeURIComponent(value.replace(/\+/g, ' ')); } catch { return value; }
}

function postmanRawUrlForDetection(urlValue: unknown): string {
  if (typeof urlValue === 'string') return urlValue;
  if (isRecord(urlValue)) return asText(urlValue.raw);
  return '';
}

function rawTypeFromPostman(language: string): RawBodyType {
  const normalized = language.toLowerCase();
  if (normalized.includes('json')) return 'json';
  if (normalized.includes('xml')) return 'xml';
  if (normalized.includes('html')) return 'html';
  if (normalized.includes('javascript') || normalized.includes('js')) return 'text';
  return 'text';
}

function postmanGraphQLVariables(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value, null, 2);
}

function postmanBodyToRelay(bodyValue: unknown) {
  const result = { bodyType: 'none' as BodyType, rawBodyType: 'json' as RawBodyType, bodyContent: '', bodyFilePath: '', bodyFileName: '', formRows: [] as KVRow[] };
  if (!isRecord(bodyValue)) return result;
  const mode = asText(bodyValue.mode).toLowerCase();
  if (mode === 'raw') {
    const options = isRecord(bodyValue.options) ? bodyValue.options : {};
    const rawOptions = isRecord(options.raw) ? options.raw : {};
    const language = asText(rawOptions.language);
    if (language.toLowerCase().includes('graphql')) {
      result.bodyType = 'graphql'; result.rawBodyType = 'json';
      result.bodyContent = serializeGraphQLPayload({ query: asText(bodyValue.raw), variables: '{}', operationName: '' });
      return result;
    }
    const graphqlJson = graphQLBodyContentFromJsonText(asText(bodyValue.raw));
    if (graphqlJson) {
      result.bodyType = 'graphql';
      result.rawBodyType = 'json';
      result.bodyContent = graphqlJson;
      return result;
    }
    const rawType = rawTypeFromPostman(asText(rawOptions.language));
    result.rawBodyType = rawType; result.bodyType = rawType; result.bodyContent = asText(bodyValue.raw);
  } else if (mode === 'urlencoded') {
    result.bodyType = 'urlencoded'; result.formRows = postmanKvRows(bodyValue.urlencoded);
  } else if (mode === 'formdata') {
    result.bodyType = 'form';
    result.formRows = asArray(bodyValue.formdata).map(item => {
      if (!isRecord(item)) return null;
      const key = asText(item.key);
      if (!key) return null;
      const isFile = asText(item.type) === 'file';
      const source = isFile && Array.isArray(item.src) ? asText(item.src[0]) : asText(item.src || item.value);
      return importedRow(key, source, item.disabled !== true, postmanDescription(item.description), isFile);
    }).filter((row): row is KVRow => Boolean(row));
  } else if (mode === 'file') {
    const file = isRecord(bodyValue.file) ? bodyValue.file : {};
    result.bodyType = 'binary'; result.bodyFilePath = asText(file.src);
    result.bodyFileName = result.bodyFilePath.split('/').pop() ?? '';
  } else if (mode === 'graphql') {
    const graphql = isRecord(bodyValue.graphql) ? bodyValue.graphql : {};
    result.bodyType = 'graphql'; result.rawBodyType = 'json';
    result.bodyContent = serializeGraphQLPayload({
      query: asText(graphql.query),
      variables: postmanGraphQLVariables(graphql.variables),
      operationName: asText(graphql.operationName),
    });
  }
  return result;
}

export function postmanRequestsFromItems(
  items: unknown, collectionId: string, collectionName: string,
  inheritedAuth: unknown, path: string[] = [], inheritedScripts: PostmanScripts = NO_SCRIPTS
): SavedRequest[] {
  return asArray(items).flatMap(item => {
    if (!isRecord(item)) return [];
    const name = asText(item.name) || 'Imported Request';
    const childAuth = item.auth ?? inheritedAuth;
    if (Array.isArray(item.item)) {
      const folderScripts = postmanScriptsFromEvents(item.event);
      const nextScripts = hasScripts(folderScripts)
        ? mergeScripts(inheritedScripts, labelledFolderScripts(folderScripts, name))
        : inheritedScripts;
      return postmanRequestsFromItems(item.item, collectionId, collectionName, childAuth, [...path, name], nextScripts);
    }
    const requestValue = item.request;
    if (!requestValue) return [];
    const req = isRecord(requestValue) ? requestValue : { url: requestValue };
    const urlData = postmanUrlToRelay(req.url);
    if (!urlData.url.trim()) return [];
    const body = postmanBodyToRelay(req.body);
    const socketIO = socketIOImportDetails(postmanRawUrlForDetection(req.url) || urlData.url);
    const relay = relayExtensionFromPostman(item, req);
    const requestType = relayRequestType(relay.requestType) || (body.bodyType === 'graphql' ? 'graphql' : socketIO ? 'socketio' : isWebSocketUrl(urlData.url) ? 'ws' : 'http');
    const params = requestType === 'socketio' ? filterSocketIOTransportParams(urlData.params) : urlData.params;
    const sioArgs = requestType === 'socketio' && relaySIOArgs(relay.sioArgs).length
      ? relaySIOArgs(relay.sioArgs)
      : requestType === 'socketio' && body.bodyContent.trim()
      ? [{ id: newRequestId(), content: body.bodyContent, bodyType: body.rawBodyType, encoding: 'base64' as const }]
      : undefined;
    const grpcMethod = asText(relay.grpcMethod ?? relay.fullMethod);
    const grpcMetadata = relayRows(relay.grpcMetadata ?? relay.metadata);
    const relayTab = relayRequestTab(relay.requestTab);
    const scripts = mergeScripts(inheritedScripts, postmanScriptsFromEvents(item.event, req.event));
    const id = newRequestId();
    return [{
      id, name, filesystemName: filesystemNameFromName(name, id), collectionId, collection: collectionName, folderPath: path,
      requestType,
      method: (requestType === 'graphql' || requestType === 'grpc' ? 'POST' : asText(req.method).toUpperCase() || 'GET') as Method,
      url: asText(relay.url) || socketIO?.url || urlData.url,
      requestTab: relayTab || (requestType === 'grpc' ? 'body' : requestType === 'socketio' ? 'events' : requestType === 'ws' ? 'body' : requestType === 'graphql' ? 'query' : 'params'),
      params, headers: postmanKvRows(req.header),
      // Nothing declared anywhere up the tree means Postman would fall back to
      // the collection's auth, which lands in Relay's collection defaults —
      // so the request inherits rather than carrying a copy.
      auth: req.auth === undefined && childAuth === undefined ? inheritAuthState() : postmanAuthConfig(req.auth, childAuth),
      bodyType: requestType === 'grpc' && body.bodyType === 'none' ? 'json' : body.bodyType,
      rawBodyType: body.rawBodyType,
      bodyContent: requestType === 'grpc' ? asText(relay.message) || body.bodyContent : body.bodyContent || asText(relay.message),
      bodyFilePath: body.bodyFilePath, bodyFileName: body.bodyFileName, formRows: body.formRows,
      ...(sioArgs ? { sioArgs } : {}),
      ...(Array.isArray(relay.sioEvents) ? { sioEvents: relayRows(relay.sioEvents) } : {}),
      ...(typeof relay.sioAck === 'boolean' ? { sioAck: relay.sioAck } : {}),
      ...(requestType === 'grpc' ? {
        grpcMethod,
        grpcMetadata,
        grpcUseReflection: typeof relay.grpcUseReflection === 'boolean' ? relay.grpcUseReflection : undefined,
        grpcProtoFilePath: asText(relay.grpcProtoFilePath),
        grpcProtoFileName: asText(relay.grpcProtoFileName),
        grpcProtoImportPaths: asArray(relay.grpcProtoImportPaths).map(asText).filter(Boolean),
      } : {}),
      preRequestScript: scripts.preRequestScript,
      testScript: scripts.testScript,
      requestNotes: postmanDescription(req.description) || postmanDescription(item.description),
      settings: { ...DEFAULT_REQUEST_SETTINGS, ...(socketIO?.settings ?? {}), ...relaySettings(relay.settings) },
    }];
  });
}

function postmanVariableRows(list: unknown): KVRow[] {
  return asArray(list)
    .map(item => {
      if (!isRecord(item)) return null;
      const key = asText(item.key || item.name);
      if (!key) return null;
      // Collection variables carry `disabled`, environment values carry
      // `enabled` — a file uses one or the other.
      const enabled = item.enabled === false ? false : item.disabled !== true;
      const row = importedRow(key, asText(item.value), enabled, postmanDescription(item.description));
      return asText(item.type).toLowerCase() === 'secret' ? { ...row, secret: true } : row;
    })
    .filter((row): row is KVRow => Boolean(row));
}

// Folders are kept even when they hold no requests, so an imported collection
// keeps its shape instead of collapsing to the requests that happen to exist.
function postmanFolderPaths(items: unknown, path: string[] = []): string[][] {
  const paths: string[][] = [];
  for (const item of asArray(items)) {
    if (!isRecord(item) || !Array.isArray(item.item)) continue;
    const next = [...path, asText(item.name) || 'Folder'];
    paths.push(next);
    paths.push(...postmanFolderPaths(item.item, next));
  }
  return paths;
}

export type PostmanCollectionBundle = {
  name: string;
  description: string;
  defaults: CollectionDefaults;
  folderPaths: string[][];
  requests: SavedRequest[];
};

// Everything Postman hangs off the collection itself — variables, auth, and
// the pre-request/test scripts that run for every request — maps onto Relay's
// collection defaults. Reading only `item` (as the importer used to) silently
// dropped all of it.
export function postmanCollectionBundle(payload: unknown, collectionId: string, fallbackName: string): PostmanCollectionBundle {
  if (!isRecord(payload) || !Array.isArray(payload.item)) throw new Error('Expected a Postman collection JSON file');
  const info = isRecord(payload.info) ? payload.info : {};
  const name = asText(info.name) || fallbackName;
  const scripts = postmanScriptsFromEvents(payload.event);
  return {
    name,
    description: postmanDescription(info.description),
    defaults: {
      ...emptyCollectionDefaults(),
      variables: postmanVariableRows(payload.variable),
      auth: postmanAuthConfig(payload.auth),
      preRequestScript: scripts.preRequestScript,
      testScript: scripts.testScript,
    },
    folderPaths: postmanFolderPaths(payload.item),
    requests: postmanRequestsFromItems(payload.item, collectionId, name, undefined),
  };
}

export type PostmanVariableBundle = {
  scope: 'environment' | 'globals';
  name: string;
  values: KVRow[];
};

// Postman exports environments and globals as their own files, so an import
// path that only understands collections leaves every {{variable}} unresolved.
export function postmanVariableBundle(payload: unknown, fallbackName: string): PostmanVariableBundle | null {
  if (!isRecord(payload) || !Array.isArray(payload.values) || Array.isArray(payload.item)) return null;
  const scope = asText(payload._postman_variable_scope).toLowerCase() === 'globals' ? 'globals' : 'environment';
  return {
    scope,
    name: asText(payload.name) || fallbackName,
    values: postmanVariableRows(payload.values),
  };
}

function postmanKv(row: KVRow, includeSecrets = false) {
  const safeRow = safeExportRow(row, includeSecrets);
  return { key: safeRow.key, value: safeRow.value, ...(safeRow.description ? { description: safeRow.description } : {}), ...(!safeRow.enabled ? { disabled: true } : {}) };
}

function appendQueryString(url: string, queryString: string) {
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  return `${beforeHash}${beforeHash.includes('?') ? '&' : '?'}${queryString}${hash}`;
}

function requestUrlWithParams(req: SavedRequest, includeSecrets = false) {
  const activeParams = req.params.filter(r => r.enabled && r.key);
  const cleanUrl = safeExportUrl(req.url.trim() || 'https://example.com', includeSecrets);
  // We deliberately do NOT round-trip through `new URL(...)` here: that
  // would percent-encode template placeholders like {{userId}} into
  // %7B%7BuserId%7D%7D and break variable substitution in Postman /
  // Insomnia after import. Build the query string manually so authored
  // values pass through verbatim.
  if (!activeParams.length) return cleanUrl;
  const qs = activeParams
    .map(r => `${encodeURIComponent(r.key)}=${encodeURIComponent(safeExportValue(r.key, r.value, includeSecrets, r.secret === true))}`)
    .join('&');
  return appendQueryString(cleanUrl, qs);
}

function postmanUrlFromRelay(req: SavedRequest, includeSecrets = false) {
  const raw = requestUrlWithParams(req, includeSecrets);
  const query = req.params.filter(r => r.enabled && r.key).map(row => postmanKv(row, includeSecrets));
  try {
    const parsed = new URL(raw);
    return {
      raw, protocol: parsed.protocol.replace(':', ''),
      host: parsed.hostname.split('.').filter(Boolean),
      ...(parsed.port ? { port: parsed.port } : {}),
      path: parsed.pathname.split('/').filter(Boolean),
      ...(query.length ? { query } : {}),
    };
  } catch { return { raw, ...(query.length ? { query } : {}) }; }
}

function postmanAuthPair(key: string, value: string, type = 'string', includeSecrets = false, redactionKey = key) {
  return { key, value: safeExportValue(redactionKey, value, includeSecrets), type };
}

function postmanAuthFromRelay(auth: SavedRequest['auth'], includeSecrets = false) {
  if (auth.type === 'bearer') return { type: 'bearer', bearer: [postmanAuthPair('token', auth.bearerToken, 'string', includeSecrets)] };
  if (auth.type === 'basic' || auth.type === 'digest') {
    return { type: auth.type, [auth.type]: [postmanAuthPair('username', auth.basicUser, 'string', includeSecrets), postmanAuthPair('password', auth.basicPass, 'string', includeSecrets)] };
  }
  if (auth.type === 'apikey') {
    return { type: 'apikey', apikey: [postmanAuthPair('key', auth.apiKeyName, 'string', includeSecrets), postmanAuthPair('value', auth.apiKeyValue, 'string', includeSecrets, 'apiKey'), postmanAuthPair('in', auth.apiKeyIn, 'string', true)] };
  }
  if (auth.type === 'oauth2') {
    return { type: 'oauth2', oauth2: [postmanAuthPair('accessToken', auth.oauth2Token || auth.bearerToken, 'string', includeSecrets), postmanAuthPair('clientId', auth.oauth2ClientID, 'string', includeSecrets), postmanAuthPair('clientSecret', auth.oauth2Secret, 'string', includeSecrets), postmanAuthPair('scope', auth.oauth2Scope, 'string', true), postmanAuthPair('tokenUrl', auth.oauth2TokenURL, 'string', true)].filter(i => i.value) };
  }
  if (auth.type === 'aws') {
    return { type: 'awsv4', awsv4: [postmanAuthPair('accessKey', auth.awsAccessKey, 'string', includeSecrets), postmanAuthPair('secretKey', auth.awsSecretKey, 'string', includeSecrets), postmanAuthPair('region', auth.awsRegion, 'string', true), postmanAuthPair('service', auth.awsService, 'string', true)] };
  }
  return undefined;
}

function postmanBodyFromRelay(req: SavedRequest, stripFn: (s: string, t: string) => string, includeSecrets = false) {
  if (['json', 'text', 'xml', 'html'].includes(req.bodyType)) {
    const raw = stripFn(req.bodyContent, req.bodyType);
    if (req.bodyType === 'json') {
      try {
        return { mode: 'raw', raw: JSON.stringify(sanitizeExportExample(JSON.parse(raw), includeSecrets), null, 2), options: { raw: { language: req.rawBodyType } } };
      } catch {}
    }
    return { mode: 'raw', raw, options: { raw: { language: req.rawBodyType } } };
  }
  if (req.bodyType === 'graphql') {
    try {
      const parsed = parseGraphQLPayload(stripFn(req.bodyContent, req.bodyType));
      let parsedVariables: unknown;
      try {
        parsedVariables = parseGraphQLVariables(parsed.variables);
      } catch {
        parsedVariables = parsed.variables;
      }
      const variables = sanitizeExportExample(parsedVariables, includeSecrets);
      return {
        mode: 'graphql',
        graphql: {
          query: parsed.query,
          variables: typeof variables === 'string' ? variables : JSON.stringify(variables ?? {}, null, 2),
          ...(parsed.operationName ? { operationName: parsed.operationName } : {}),
        },
      };
    } catch {}
    return { mode: 'graphql', graphql: { query: stripFn(req.bodyContent, req.bodyType), variables: '' } };
  }
  if (req.bodyType === 'urlencoded') return { mode: 'urlencoded', urlencoded: req.formRows.filter(r => r.key).map(row => postmanKv(row, includeSecrets)) };
  if (req.bodyType === 'form') {
    return { mode: 'formdata', formdata: req.formRows.filter(r => r.key).map(r => ({ key: r.key, type: r.isFile ? 'file' : 'text', ...(r.isFile ? { src: r.value } : { value: safeExportValue(r.key, r.value, includeSecrets, r.secret === true) }), ...(r.description ? { description: r.description } : {}), ...(!r.enabled ? { disabled: true } : {}) })) };
  }
  if (req.bodyType === 'binary' && req.bodyFilePath) return { mode: 'file', file: { src: req.bodyFilePath } };
  return undefined;
}

function exportBodyLikeValue(source: string, bodyType: string, stripFn: (s: string, t: string) => string, includeSecrets = false) {
  const stripped = stripFn(source, bodyType);
  if (includeSecrets) return stripped;
  if (bodyType === 'json') {
    try {
      return JSON.stringify(sanitizeExportExample(JSON.parse(stripped), includeSecrets), null, 2);
    } catch {}
  }
  return safeExportValue('body', stripped, includeSecrets);
}

function relayExtensionFromRequest(req: SavedRequest, stripFn: (s: string, t: string) => string, includeSecrets = false) {
  const requestType = req.requestType ?? 'http';
  const extension: Record<string, unknown> = {
    requestType,
    requestTab: req.requestTab,
    settings: req.settings,
  };
  if (requestType === 'socketio') {
    extension.sioEvents = (req.sioEvents ?? []).filter(row => row.key || row.value).map(row => postmanKv(row, includeSecrets));
    extension.sioArgs = (req.sioArgs ?? []).map(arg => ({
      id: arg.id,
      content: exportBodyLikeValue(arg.content, arg.bodyType, stripFn, includeSecrets),
      bodyType: arg.bodyType,
      encoding: arg.encoding,
    }));
    extension.sioAck = req.sioAck ?? false;
  }
  if (requestType === 'grpc') {
    extension.grpcMethod = req.grpcMethod ?? '';
    extension.grpcMetadata = (req.grpcMetadata ?? []).filter(row => row.key || row.value).map(row => postmanKv(row, includeSecrets));
    extension.message = exportBodyLikeValue(req.bodyContent || DEFAULT_GRPC_MESSAGE, req.bodyType || 'json', stripFn, includeSecrets);
    extension.grpcUseReflection = req.settings.grpcUseReflection ?? req.grpcUseReflection ?? true;
    extension.grpcProtoFilePath = req.grpcProtoFilePath ?? '';
    extension.grpcProtoFileName = req.grpcProtoFileName ?? '';
    extension.grpcProtoImportPaths = req.grpcProtoImportPaths ?? [];
  }
  return extension;
}

function postmanItemFromRequest(req: SavedRequest, stripFn: (s: string, t: string) => string, includeSecrets = false) {
  const auth = postmanAuthFromRelay(req.auth, includeSecrets);
  const body = postmanBodyFromRelay(req, stripFn, includeSecrets);
  const name = req.name || req.url;
  const event = postmanEventsFromScripts(req.preRequestScript, req.testScript);
  return {
    name,
    [RELAY_EXTENSION_KEY]: relayExtensionFromRequest(req, stripFn, includeSecrets),
    // `event` belongs to the item in the v2.1 schema — Postman ignores it
    // when it sits under `request`, which is where Relay used to write it.
    ...(event ? { event } : {}),
    request: {
      method: req.requestType === 'graphql' || req.bodyType === 'graphql' || req.requestType === 'grpc' ? 'POST' : req.method, header: req.headers.filter(r => r.key).map(row => postmanKv(row, includeSecrets)),
      url: postmanUrlFromRelay(req, includeSecrets),
      ...(req.requestNotes ? { description: req.requestNotes } : {}),
      ...(auth ? { auth } : {}),
      ...(body ? { body } : {}),
    },
  };
}

function postmanEventsFromScripts(preRequestScript: string, testScript: string) {
  const events = [
    ...(preRequestScript ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: preRequestScript.split(/\r\n|\r|\n/) } }] : []),
    ...(testScript ? [{ listen: 'test', script: { type: 'text/javascript', exec: testScript.split(/\r\n|\r|\n/) } }] : []),
  ];
  return events.length ? events : undefined;
}

function addPostmanItemToTree(items: Record<string, unknown>[], path: string[], item: Record<string, unknown>) {
  if (!path.length) { items.push(item); return; }
  const [folderName, ...rest] = path;
  let folder = items.find(c => c.name === folderName && Array.isArray(c.item)) as Record<string, unknown> | undefined;
  if (!folder) { folder = { name: folderName, item: [] }; items.push(folder); }
  addPostmanItemToTree(folder.item as Record<string, unknown>[], rest, item);
}

export function buildPostmanCollection(
  collectionName: string,
  collectionDescription: string,
  requests: SavedRequest[],
  stripFn: (s: string, t: string) => string,
  includeSecrets = false,
  defaults?: CollectionDefaults,
) {
  const items: Record<string, unknown>[] = [];
  for (const req of requests) {
    addPostmanItemToTree(items, req.folderPath ?? [], postmanItemFromRequest(req, stripFn, includeSecrets));
  }
  const event = postmanEventsFromScripts(defaults?.preRequestScript ?? '', defaults?.testScript ?? '');
  const auth = defaults && defaults.auth.type !== 'none' && defaults.auth.type !== 'inherit'
    ? postmanAuthFromRelay(defaults.auth, includeSecrets)
    : undefined;
  const variable = (defaults?.variables ?? [])
    .filter(row => row.key)
    .map(row => ({ ...postmanKv(row, includeSecrets), ...(row.secret ? { type: 'secret' } : {}) }));
  return {
    info: {
      _postman_id: crypto.randomUUID?.() ?? `relay-${Date.now()}`,
      name: collectionName,
      ...(collectionDescription ? { description: collectionDescription } : {}),
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: items,
    ...(auth ? { auth } : {}),
    ...(event ? { event } : {}),
    ...(variable.length ? { variable } : {}),
  };
}

export function buildPostmanEnvironment(env: Environment, includeSecrets = false) {
  return {
    id: env.id,
    name: env.name,
    values: env.values
      .filter(v => v.key)
      .map(v => ({ key: v.key, value: v.secret && !includeSecrets ? '' : v.value, enabled: v.enabled, type: v.secret ? 'secret' : 'default' })),
    _postman_variable_scope: 'environment',
    _postman_exported_at: new Date().toISOString(),
    _postman_exported_using: 'Relay',
  };
}
