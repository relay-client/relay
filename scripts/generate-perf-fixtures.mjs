#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const defaults = {
  out: join(root, 'perf', 'fixtures'),
  requests: 5000,
  folders: 500,
  history: 10000,
  responseMb: 50,
  collections: 5,
};

function readArgs(argv) {
  const out = { ...defaults };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--out' && next) { out.out = next; i += 1; }
    else if (arg === '--requests' && next) { out.requests = positiveInt(next, 'requests'); i += 1; }
    else if (arg === '--folders' && next) { out.folders = positiveInt(next, 'folders'); i += 1; }
    else if (arg === '--history' && next) { out.history = positiveInt(next, 'history'); i += 1; }
    else if (arg === '--response-mb' && next) { out.responseMb = positiveInt(next, 'response-mb'); i += 1; }
    else if (arg === '--collections' && next) { out.collections = positiveInt(next, 'collections'); i += 1; }
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function positiveInt(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`--${name} must be a positive integer`);
  return parsed;
}

function printHelp() {
  console.log(`Generate Relay performance fixtures.

Options:
  --out <dir>             Output directory. Default: perf/fixtures
  --requests <count>      Saved requests. Default: ${defaults.requests}
  --folders <count>       Folder paths. Default: ${defaults.folders}
  --history <count>       History entries. Default: ${defaults.history}
  --response-mb <count>   Huge response size in MiB. Default: ${defaults.responseMb}
  --collections <count>   Collections. Default: ${defaults.collections}
`);
}

function safeSegment(value, fallback = 'item') {
  const next = String(value || fallback)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);
  return next || fallback;
}

function row(id, key, value, extra = {}) {
  return { id, enabled: true, key, value, description: '', ...extra };
}

function defaultAuth() {
  return {
    type: 'none',
    bearerToken: '',
    basicUser: '',
    basicPass: '',
    apiKeyName: '',
    apiKeyValue: '',
    apiKeyIn: 'header',
    oauth2TokenURL: '',
    oauth2ClientID: '',
    oauth2Secret: '',
    oauth2Scope: '',
    oauth2Token: '',
    awsAccessKey: '',
    awsSecretKey: '',
    awsRegion: '',
    awsService: '',
  };
}

function defaultSettings() {
  return {
    httpVersion: 'auto',
    enableSSLVerification: true,
    followRedirects: true,
    followOriginalMethod: false,
    followAuthorizationHeader: false,
    removeRefererHeader: false,
    encodeUrlAutomatically: true,
    disableCookieJar: false,
    maxRedirects: 10,
    timeoutMs: 30000,
    proxyUrl: '',
    browserEmulation: false,
    browserOrigin: '',
    browserWithCredentials: false,
    browserEnforceCORS: false,
    browserEnforceCSP: false,
    browserCSP: '',
    wsHandshakeTimeoutMs: 10000,
    wsReconnectAttempts: 0,
    wsReconnectIntervalMs: 1000,
    wsMaxMessageSizeMb: 16,
    sioClientVersion: 'v3',
    sioPath: '/socket.io',
    sioNamespace: '/',
    grpcUseTls: false,
    grpcUseReflection: true,
    grpcServerName: '',
    grpcIncludeDefaultValues: true,
    grpcMaxResponseMessageSizeMb: 10,
  };
}

function folderPath(index) {
  const area = Math.floor(index / 100);
  const group = Math.floor((index % 100) / 10);
  const flow = index % 10;
  return [`Area ${String(area).padStart(3, '0')}`, `Group ${group}`, `Flow ${flow}`];
}

function requestTypeFor(index) {
  const types = ['http', 'http', 'http', 'graphql', 'grpc', 'ws', 'socketio'];
  return types[index % types.length];
}

function methodFor(type, index) {
  if (type === 'graphql' || type === 'grpc') return 'POST';
  if (type === 'ws' || type === 'socketio') return 'GET';
  if (index % 19 === 0) return 'SSE';
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'][index % 5];
}

function makeRequest(index, collection) {
  const type = requestTypeFor(index);
  const method = methodFor(type, index);
  const id = `req-${String(index).padStart(5, '0')}`;
  const name = `${method} Fixture ${String(index).padStart(5, '0')}`;
  const isGraphQL = type === 'graphql';
  const isGrpc = type === 'grpc';
  const isRealtime = type === 'ws' || type === 'socketio';
  return {
    id,
    name,
    filesystemName: safeSegment(name, id),
    nameAuto: false,
    requestType: type,
    isDraft: false,
    isPinned: index % 37 === 0,
    collectionId: collection.id,
    collection: collection.name,
    folderPath: folderPath(index % Math.max(1, options.folders)),
    method,
    url: isGrpc
      ? 'grpc://localhost:50051'
      : isRealtime
        ? `wss://stream.example.test/socket/${index}`
        : `https://api.example.test/v1/resources/${index}?page={{page}}`,
    requestTab: isGraphQL ? 'query' : isGrpc || isRealtime ? 'body' : 'params',
    params: [row(1, 'page', String((index % 20) + 1)), row(2, 'fixture', `request-${index}`)],
    headers: [row(3, 'Accept', 'application/json'), row(4, 'X-Fixture-ID', id)],
    auth: index % 11 === 0 ? { ...defaultAuth(), type: 'bearer', bearerToken: '{{token}}' } : defaultAuth(),
    bodyType: isGraphQL ? 'graphql' : isGrpc ? 'json' : isRealtime ? 'text' : method === 'GET' || method === 'SSE' ? 'none' : 'json',
    rawBodyType: isRealtime ? 'text' : 'json',
    bodyContent: isGraphQL
      ? JSON.stringify({ query: 'query Fixture($id: ID!) { node(id: $id) { id } }', variables: { id }, operationName: 'Fixture' }, null, 2)
      : isGrpc
        ? JSON.stringify({ id, nested: { index } }, null, 2)
        : isRealtime
          ? JSON.stringify({ subscribe: id })
          : method === 'GET' || method === 'SSE'
            ? ''
            : JSON.stringify({ id, name, values: Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, value: `${id}-${i}` })) }, null, 2),
    bodyFilePath: '',
    bodyFileName: '',
    formRows: [],
    graphqlSchema: isGraphQL ? 'type Query { node(id: ID!): Node }\ntype Node { id: ID! }' : '',
    preRequestScript: '',
    testScript: '',
    preRequestScriptJs: 'pm.variables.set("fixtureRequestId", pm.request.url)',
    testScriptJs: 'pm.test("status under 500", () => pm.expect(pm.response.code).to.be.below(500))',
    requestNotes: `Generated performance fixture request ${index}.`,
    settings: defaultSettings(),
    settingsOverrides: {},
    sioEvents: type === 'socketio' ? [row(5, 'message', '', { description: 'fixture event' })] : [],
    sioEventName: type === 'socketio' ? 'message' : '',
    sioArgs: type === 'socketio' ? [{ id: '1', content: '{"ok":true}', bodyType: 'json', encoding: 'base64' }] : [{ id: '1', content: '', bodyType: 'text', encoding: 'base64' }],
    sioAck: false,
    grpcMethod: isGrpc ? 'fixture.FixtureService/GetFixture' : '',
    grpcMetadata: isGrpc ? [row(6, 'x-fixture-id', id)] : [],
    grpcUseReflection: true,
    grpcProtoFilePath: '',
    grpcProtoFileName: '',
    grpcProtoImportPaths: [],
    createdAt: baseTime + index,
    updatedAt: baseTime + index,
  };
}

function yamlScalar(value, indent = 0) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = String(value ?? '');
  if (text.includes('\n')) {
    const pad = ' '.repeat(indent + 2);
    return `|-\n${text.split('\n').map(line => `${pad}${line}`).join('\n')}`;
  }
  if (!text) return '""';
  if (/^[A-Za-z0-9_./:@{}$ -]+$/.test(text) && !/^(true|false|null|~)$/i.test(text) && !/^\d/.test(text) && !text.includes(': ')) return text;
  return JSON.stringify(text);
}

function yamlValue(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value.map(item => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return `${pad}- ${yamlMap(item, indent + 2).trimStart()}`;
      }
      return `${pad}- ${yamlScalar(item, indent)}`;
    }).join('\n');
  }
  if (value && typeof value === 'object') return `\n${yamlMap(value, indent + 2)}`;
  return yamlScalar(value, indent);
}

function yamlMap(value, indent = 0) {
  const pad = ' '.repeat(indent);
  const lines = [];
  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw)) lines.push(raw.length ? `${pad}${key}:\n${yamlValue(raw, indent + 2)}` : `${pad}${key}: []`);
    else if (raw && typeof raw === 'object') lines.push(`${pad}${key}:\n${yamlMap(raw, indent + 2)}`);
    else lines.push(`${pad}${key}: ${yamlScalar(raw, indent)}`);
  }
  return `${lines.join('\n')}\n`;
}

function writeJSON(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeYAML(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, yamlMap(value));
}

function makeHugeResponse(targetBytes) {
  const item = index => ({
    id: `item-${index}`,
    status: index % 11 === 0 ? 'warning' : 'ok',
    url: `https://api.example.test/v1/resources/${index}`,
    metadata: {
      owner: `team-${index % 17}`,
      tags: [`tag-${index % 9}`, `area-${index % 23}`],
      note: 'payload intentionally repeats predictable text for search and rendering benchmarks',
    },
    values: Array.from({ length: 8 }, (_, i) => ({ key: `metric_${i}`, value: index * (i + 1) })),
  });
  const rows = [];
  let bytes = 2;
  for (let i = 0; bytes < targetBytes; i += 1) {
    const rendered = JSON.stringify(item(i), null, 2);
    rows.push(rendered);
    bytes += rendered.length + 2;
  }
  return `[\n${rows.join(',\n')}\n]\n`;
}

const options = readArgs(process.argv.slice(2));
const baseTime = Date.UTC(2026, 0, 1, 0, 0, 0);

rmSync(options.out, { recursive: true, force: true });
mkdirSync(options.out, { recursive: true });

const workspace = {
  id: 'workspace-perf',
  name: 'Performance Workspace',
  filesystemName: 'Performance-Workspace',
  description: 'Generated Relay performance workspace.',
};
const collections = Array.from({ length: options.collections }, (_, index) => ({
  id: `collection-${index + 1}`,
  workspaceId: workspace.id,
  name: `Performance Collection ${index + 1}`,
  filesystemName: `Performance-Collection-${index + 1}`,
  description: `Generated collection ${index + 1}.`,
  collapsed: true,
  folderPaths: Array.from({ length: options.folders }, (_, folderIndex) => folderPath(folderIndex)),
  defaults: {
    headers: [row(1, 'X-Collection', `perf-${index + 1}`)],
    variables: [row(2, 'baseUrl', 'https://api.example.test'), row(3, 'token', `perf-token-${index + 1}`, { secret: true })],
    auth: defaultAuth(),
    preRequestScript: '',
    testScript: '',
    preRequestScriptJs: '',
    testScriptJs: '',
    settings: defaultSettings(),
  },
  createdAt: baseTime + index,
  updatedAt: baseTime + index,
}));

const requests = Array.from({ length: options.requests }, (_, index) => makeRequest(index, collections[index % collections.length]));
const environments = [{
  id: 'environment-perf',
  workspaceId: workspace.id,
  name: 'Perf Local',
  filesystemName: 'Perf-Local',
  values: [
    row(1, 'baseUrl', 'https://api.example.test'),
    row(2, 'page', '1'),
    row(3, 'token', 'perf-local-secret', { secret: true }),
  ],
}];
const history = Array.from({ length: options.history }, (_, index) => {
  const request = requests[index % requests.length];
  return {
    id: `history-${String(index).padStart(5, '0')}`,
    request,
    statusCode: index % 23 === 0 ? 500 : index % 7 === 0 ? 204 : 200,
    status: index % 23 === 0 ? '500 Internal Server Error' : index % 7 === 0 ? '204 No Content' : '200 OK',
    duration: 20 + (index % 1800),
    createdAt: baseTime - index * 60000,
  };
});
const cookies = Array.from({ length: Math.min(1000, Math.max(20, Math.floor(options.requests / 10))) }, (_, index) => ({
  name: `perf_${index}`,
  value: `value-${index}`,
  domain: index % 2 === 0 ? 'api.example.test' : `tenant-${index % 25}.example.test`,
  path: index % 3 === 0 ? '/v1' : '/',
  expiresAt: 0,
  session: true,
  secure: index % 4 === 0,
  httpOnly: index % 5 === 0,
  sameSite: index % 3 === 0 ? 'lax' : '',
  hostOnly: index % 2 === 0,
  createdAt: baseTime + index,
  updatedAt: baseTime + index,
}));

writeJSON(join(options.out, 'request-store-large.json'), {
  version: 2,
  activeId: requests[0]?.id ?? '',
  activeWorkspaceId: workspace.id,
  activeEnvironmentId: environments[0].id,
  openIds: requests.slice(0, 12).map(request => request.id),
  folderCollapsed: {},
  workspaces: [workspace],
  collections,
  environments,
  requests,
  history,
  cookies,
});

writeFileSync(join(options.out, 'huge-response.json'), makeHugeResponse(options.responseMb * 1024 * 1024));

const yamlRoot = join(options.out, 'relay-yaml-large');
writeYAML(join(yamlRoot, 'relay.yml'), {
  version: 1,
  format: 'relay.workspace.yaml.v1',
  workspaceOrder: [workspace.id],
});
writeYAML(join(yamlRoot, 'workspaces', workspace.filesystemName, 'workspace.yml'), {
  version: 1,
  workspace,
  collectionOrder: collections.map(collection => collection.id),
});
for (const collection of collections) {
  const collectionDir = join(yamlRoot, 'workspaces', workspace.filesystemName, 'collections', collection.filesystemName);
  writeYAML(join(collectionDir, 'collection.yml'), {
    version: 1,
    collection,
    requestOrder: requests.filter(request => request.collectionId === collection.id).map(request => request.id),
  });
  for (const request of requests.filter(candidate => candidate.collectionId === collection.id)) {
    writeYAML(join(collectionDir, 'requests', `${request.filesystemName}.yml`), {
      version: 1,
      request,
    });
  }
}
for (const env of environments) {
  writeYAML(join(yamlRoot, 'workspaces', workspace.filesystemName, 'environments', `${env.filesystemName}.yml`), {
    version: 1,
    environment: env,
  });
}

writeJSON(join(options.out, 'manifest.json'), {
  generatedAt: new Date().toISOString(),
  options,
  files: {
    requestStore: 'request-store-large.json',
    hugeResponse: 'huge-response.json',
    yamlWorkspace: 'relay-yaml-large/',
  },
  counts: {
    workspaces: 1,
    collections: collections.length,
    folderPaths: options.folders,
    requests: requests.length,
    history: history.length,
    environments: environments.length,
    cookies: cookies.length,
  },
  checks: [
    'collections sidebar expand/collapse/search',
    'history date collapse/search',
    'response viewer huge JSON pagination/search',
    'Git/YAML workspace diagnostics',
    'manual-save dirty state with many open tabs',
  ],
});

console.log(`Generated Relay perf fixtures in ${options.out}`);
