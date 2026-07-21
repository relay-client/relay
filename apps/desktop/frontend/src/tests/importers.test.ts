import { describe, expect, it } from 'vitest';
import { buildInsomniaExport, insomniaRequestsFromResources } from '../lib/insomnia';
import { buildOpenApiDocument, buildSwaggerDocument, openApiRequestsFromSpec, parseOpenApiDocument } from '../lib/openapi';
import { buildPostmanCollection, buildPostmanEnvironment, postmanRequestsFromItems } from '../lib/postman';
import { harRequestsFromLog } from '../lib/har';
import { buildOpenCollectionFiles, openCollectionBundleFromFiles } from '../lib/opencollection';
import { emptyCollectionDefaults } from '../lib/collectionDefaults';
import { DEFAULT_REQUEST_SETTINGS, mkRow } from '../lib/constants';
import type { Environment, SavedRequest } from '../lib/types/models';
import { emptyAuthState } from '../lib/utils';

function testRow(key: string, value: string, description = '') {
  return { ...mkRow(), key, value, description };
}

function testRequest(overrides: Partial<SavedRequest>): SavedRequest {
  return {
    id: 'req-1',
    name: 'Test request',
    collectionId: 'collection-1',
    collection: 'Test API',
    folderPath: [],
    method: 'GET',
    url: 'https://api.example.test/ping',
    requestTab: 'params',
    params: [],
    headers: [],
    auth: emptyAuthState(),
    bodyType: 'none',
    rawBodyType: 'json',
    bodyContent: '',
    bodyFilePath: '',
    bodyFileName: '',
    formRows: [],
    preRequestScript: '',
    testScript: '',
    requestNotes: '',
    settings: { ...DEFAULT_REQUEST_SETTINGS },
    ...overrides,
  };
}

const strip = (source: string) => source;

type ExportHttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';
type ExportParameter = { name?: string; [key: string]: unknown };
type ExportOperation = {
  tags?: string[];
  security?: Array<Record<string, string[]>>;
  parameters?: ExportParameter[];
  requestBody?: { content: Record<string, { schema?: unknown; example?: unknown }> };
  consumes?: string[];
  [key: string]: unknown;
};
type ExportPathItem = Partial<Record<ExportHttpMethod, ExportOperation>>;
type ExportDocument = Record<string, unknown> & { paths: Record<string, ExportPathItem> };
type PostmanRequestExport = {
  method?: string;
  auth?: { bearer?: Array<Record<string, unknown>> };
  header?: Array<Record<string, unknown>>;
  url?: { raw?: string; query?: Array<Record<string, unknown>> };
  body?: { urlencoded?: Array<Record<string, unknown>>; graphql?: Record<string, unknown>; mode?: string };
};
type PostmanCollectionExport = {
  item: Array<{ request: PostmanRequestExport }>;
};

function exportDocument(doc: Record<string, unknown>): ExportDocument {
  return doc as ExportDocument;
}

function operation(doc: Record<string, unknown>, path: string, method: ExportHttpMethod): ExportOperation {
  const op = exportDocument(doc).paths[path]?.[method];
  if (!op) throw new Error(`Missing ${method.toUpperCase()} ${path}`);
  return op;
}

function postmanExport(collection: ReturnType<typeof buildPostmanCollection>): PostmanCollectionExport {
  return collection as PostmanCollectionExport;
}

describe('postmanRequestsFromItems', () => {
  it('imports collection folders, params, headers, auth, and JSON body', () => {
    const items = [
      {
        name: 'Products',
        item: [
          {
            name: 'Create product',
            request: {
              method: 'POST',
              url: {
                raw: '{{baseUrl}}/products?dryRun=true',
                query: [{ key: 'dryRun', value: 'true' }],
              },
              header: [{ key: 'X-Trace-ID', value: '{{traceId}}' }],
              auth: {
                type: 'bearer',
                bearer: [{ key: 'token', value: '{{token}}' }],
              },
              body: {
                mode: 'raw',
                raw: '{"name":"Coffee"}',
                options: { raw: { language: 'json' } },
              },
            },
          },
        ],
      },
    ];

    const requests = postmanRequestsFromItems(items, 'collection-1', 'Postman API', undefined);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      name: 'Create product',
      collectionId: 'collection-1',
      collection: 'Postman API',
      folderPath: ['Products'],
      method: 'POST',
      url: '{{baseUrl}}/products',
      bodyType: 'json',
      rawBodyType: 'json',
      bodyContent: '{"name":"Coffee"}',
    });
    expect(requests[0].params[0]).toMatchObject({ key: 'dryRun', value: 'true', enabled: true });
    expect(requests[0].headers[0]).toMatchObject({ key: 'X-Trace-ID', value: '{{traceId}}', enabled: true });
    expect(requests[0].auth).toMatchObject({ type: 'bearer', bearerToken: '{{token}}' });
  });

  it('skips Postman request placeholders without URLs', () => {
    const requests = postmanRequestsFromItems([
      {
        name: 'Folder',
        item: [
          { name: 'Blank draft', request: { method: 'GET', header: [] } },
          { name: 'Ping', request: { method: 'GET', url: 'https://api.example.test/ping' } },
        ],
      },
    ], 'collection-1', 'Postman API', undefined);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      name: 'Ping',
      url: 'https://api.example.test/ping',
      folderPath: ['Folder'],
    });
  });

  it('imports Postman GraphQL bodies as GraphQL requests', () => {
    const requests = postmanRequestsFromItems([
      {
        name: 'Viewer',
        request: {
          method: 'POST',
          url: 'https://api.example.test/graphql',
          body: {
            mode: 'graphql',
            graphql: {
              query: 'query Viewer($id: ID!) { viewer(id: $id) { name } }',
              variables: '{"id":"123"}',
            },
          },
        },
      },
    ], 'collection-1', 'Graph API', undefined);

    expect(requests[0]).toMatchObject({
      requestType: 'graphql',
      method: 'POST',
      requestTab: 'query',
      bodyType: 'graphql',
    });
    expect(JSON.parse(requests[0].bodyContent)).toMatchObject({
      query: 'query Viewer($id: ID!) { viewer(id: $id) { name } }',
      variables: { id: '123' },
    });
  });

  it('imports Postman GraphQL variables objects and operation names', () => {
    const requests = postmanRequestsFromItems([
      {
        name: 'Viewer',
        request: {
          method: 'POST',
          url: 'https://api.example.test/graphql',
          body: {
            mode: 'graphql',
            graphql: {
              query: 'query Viewer($id: ID!) { viewer(id: $id) { name } }',
              variables: { id: '123' },
              operationName: 'Viewer',
            },
          },
        },
      },
    ], 'collection-1', 'Graph API', undefined);

    expect(requests[0]).toMatchObject({ requestType: 'graphql', method: 'POST', requestTab: 'query' });
    expect(JSON.parse(requests[0].bodyContent)).toEqual({
      query: 'query Viewer($id: ID!) { viewer(id: $id) { name } }',
      variables: { id: '123' },
      operationName: 'Viewer',
    });
  });

  it('imports Postman raw GraphQL bodies as GraphQL requests', () => {
    const requests = postmanRequestsFromItems([
      {
        name: 'Raw GraphQL',
        request: {
          method: 'POST',
          url: 'https://api.example.test/graphql',
          body: {
            mode: 'raw',
            raw: 'query Viewer { viewer { name } }',
            options: { raw: { language: 'graphql' } },
          },
        },
      },
    ], 'collection-1', 'Graph API', undefined);

    expect(requests[0]).toMatchObject({ requestType: 'graphql', bodyType: 'graphql', requestTab: 'query' });
    expect(JSON.parse(requests[0].bodyContent)).toMatchObject({
      query: 'query Viewer { viewer { name } }',
      variables: {},
    });
  });

  it('imports Postman raw JSON GraphQL bodies as GraphQL requests', () => {
    const requests = postmanRequestsFromItems([
      {
        name: 'Raw JSON GraphQL',
        request: {
          method: 'POST',
          url: 'https://api.example.test/graphql',
          body: {
            mode: 'raw',
            raw: '{"query":"query Viewer { viewer { name } }","variables":{"id":"123"}}',
            options: { raw: { language: 'json' } },
          },
        },
      },
    ], 'collection-1', 'Graph API', undefined);

    expect(requests[0]).toMatchObject({ requestType: 'graphql', bodyType: 'graphql', requestTab: 'query' });
    expect(JSON.parse(requests[0].bodyContent)).toMatchObject({
      query: 'query Viewer { viewer { name } }',
      variables: { id: '123' },
    });
  });

  it('imports Postman WebSocket URLs as realtime requests', () => {
    const requests = postmanRequestsFromItems([
      {
        name: 'Echo',
        request: {
          method: 'GET',
          url: 'wss://realtime.example.test/ws',
          body: {
            mode: 'raw',
            raw: 'hello',
            options: { raw: { language: 'text' } },
          },
        },
      },
    ], 'collection-1', 'Realtime API', undefined);

    expect(requests[0]).toMatchObject({
      requestType: 'ws',
      requestTab: 'body',
      url: 'wss://realtime.example.test/ws',
      bodyType: 'text',
      bodyContent: 'hello',
    });
  });

  it('imports Postman Socket.IO handshakes as Socket.IO requests', () => {
    const requests = postmanRequestsFromItems([
      {
        name: 'Socket.IO',
        request: {
          method: 'GET',
          url: {
            raw: 'wss://realtime.example.test/socket.io/?EIO=4&transport=websocket',
            query: [
              { key: 'EIO', value: '4' },
              { key: 'transport', value: 'websocket' },
            ],
          },
        },
      },
    ], 'collection-1', 'Realtime API', undefined);

    expect(requests[0]).toMatchObject({
      requestType: 'socketio',
      requestTab: 'events',
      url: 'https://realtime.example.test',
      params: [],
      settings: expect.objectContaining({ sioPath: '/socket.io', sioClientVersion: 'v3' }),
    });
  });

  it('preserves Postman Socket.IO EIO v3 handshakes when query params are split out', () => {
    const requests = postmanRequestsFromItems([
      {
        name: 'Socket.IO v2',
        request: {
          method: 'GET',
          url: {
            raw: 'wss://realtime.example.test/socket.io/?EIO=3&transport=websocket',
            query: [
              { key: 'EIO', value: '3' },
              { key: 'transport', value: 'websocket' },
            ],
          },
        },
      },
    ], 'collection-1', 'Realtime API', undefined);

    expect(requests[0]).toMatchObject({
      requestType: 'socketio',
      url: 'https://realtime.example.test',
      params: [],
      settings: expect.objectContaining({ sioClientVersion: 'v2' }),
    });
  });
});

describe('insomniaRequestsFromResources', () => {
  it('imports v4 request resources with folders, params, headers, and JSON body', () => {
    const payload = {
      resources: [
        { _id: 'wrk_1', _type: 'workspace', name: 'Shop API' },
        { _id: 'fld_1', _type: 'request_group', parentId: 'wrk_1', name: 'Orders' },
        {
          _id: 'req_1',
          _type: 'request',
          parentId: 'fld_1',
          name: 'Create order',
          method: 'POST',
          url: '{{baseUrl}}/orders',
          parameters: [{ name: 'dryRun', value: 'true' }],
          headers: [{ name: 'Authorization', value: 'Bearer {{token}}' }],
          body: { mimeType: 'application/json', text: '{"id":1}' },
        },
      ],
    };

    const requests = insomniaRequestsFromResources(payload, 'collection-1', 'Shop API');

    expect(requests).toHaveLength(1);
    expect(requests[0].folderPath).toEqual(['Orders']);
    expect(requests[0].params[0]).toMatchObject({ key: 'dryRun', value: 'true' });
    expect(requests[0].headers[0]).toMatchObject({ key: 'Authorization', value: 'Bearer {{token}}' });
    expect(requests[0].bodyType).toBe('json');
    expect(requests[0].bodyContent).toBe('{"id":1}');
  });

  it('imports Insomnia GraphQL requests as GraphQL requests', () => {
    const requests = insomniaRequestsFromResources({
      resources: [
        { _id: 'wrk_1', _type: 'workspace', name: 'Workspace' },
        {
          _id: 'req_gql',
          _type: 'request',
          parentId: 'wrk_1',
          name: 'GraphQL viewer',
          method: 'POST',
          url: 'https://api.example.test/graphql',
          body: {
            mimeType: 'application/graphql',
            text: 'query Viewer { viewer { id } }',
          },
        },
      ],
    }, 'collection-1', 'Insomnia API');

    expect(requests[0]).toMatchObject({
      requestType: 'graphql',
      method: 'POST',
      requestTab: 'query',
      bodyType: 'graphql',
    });
    expect(JSON.parse(requests[0].bodyContent)).toMatchObject({
      query: 'query Viewer { viewer { id } }',
      variables: {},
    });
  });

  it('imports Insomnia JSON GraphQL bodies as GraphQL requests', () => {
    const requests = insomniaRequestsFromResources({
      resources: [
        {
          _id: 'req_gql_json',
          _type: 'request',
          name: 'GraphQL JSON',
          method: 'POST',
          url: 'https://api.example.test/graphql',
          body: {
            mimeType: 'application/json',
            text: '{"query":"query Viewer { viewer { id } }","variables":{"id":"123"}}',
          },
        },
      ],
    }, 'collection-1', 'Insomnia API');

    expect(requests[0].requestType).toBe('graphql');
    expect(JSON.parse(requests[0].bodyContent)).toMatchObject({
      query: 'query Viewer { viewer { id } }',
      variables: { id: '123' },
    });
  });

  it('keeps regular Insomnia JSON bodies with query fields as HTTP requests', () => {
    const requests = insomniaRequestsFromResources({
      resources: [
        {
          _id: 'req_search',
          _type: 'request',
          name: 'Search',
          method: 'POST',
          url: 'https://api.example.test/search',
          body: {
            mimeType: 'application/json',
            text: '{"query":"coffee","limit":10}',
          },
        },
      ],
    }, 'collection-1', 'Insomnia API');

    expect(requests[0]).toMatchObject({
      requestType: 'http',
      bodyType: 'json',
      bodyContent: '{"query":"coffee","limit":10}',
    });
  });

  it('imports Insomnia WebSocket and Socket.IO resources', () => {
    const requests = insomniaRequestsFromResources({
      resources: [
        { _id: 'req_ws', _type: 'websocket_request', name: 'WS', url: 'wss://api.example.test/ws' },
        { _id: 'req_sio', _type: 'socketio_request', name: 'SIO', url: 'https://api.example.test/realtime/socket.io/?EIO=3&transport=polling' },
      ],
    }, 'collection-1', 'Insomnia API');

    expect(requests[0]).toMatchObject({ requestType: 'ws', requestTab: 'body', url: 'wss://api.example.test/ws' });
    expect(requests[1]).toMatchObject({
      requestType: 'socketio',
      requestTab: 'events',
      url: 'https://api.example.test/realtime',
      settings: expect.objectContaining({ sioPath: '/socket.io', sioClientVersion: 'v2' }),
    });
  });

  it('round-trips all Relay request types through Insomnia export metadata', () => {
    const exported = buildInsomniaExport('Mixed API', '', [
      testRequest({ id: 'req-http', name: 'HTTP', requestType: 'http', url: 'https://api.example.test/ping' }),
      testRequest({
        id: 'req-gql',
        name: 'GraphQL',
        requestType: 'graphql',
        requestTab: 'query',
        bodyType: 'graphql',
        bodyContent: JSON.stringify({ query: '{ viewer { id } }', variables: {} }),
      }),
      testRequest({
        id: 'req-ws',
        name: 'WS',
        requestType: 'ws',
        requestTab: 'body',
        url: 'wss://api.example.test/ws',
        bodyType: 'text',
        rawBodyType: 'text',
        bodyContent: 'hello',
      }),
      testRequest({
        id: 'req-sio',
        name: 'Socket.IO',
        requestType: 'socketio',
        requestTab: 'events',
        url: 'https://api.example.test/realtime',
        settings: { ...DEFAULT_REQUEST_SETTINGS, sioClientVersion: 'v2', sioPath: '/socket.io' },
        sioEvents: [testRow('server:event', '')],
        sioArgs: [{ id: 'arg-1', content: '{"ok":true}', bodyType: 'json', encoding: 'base64' }],
      }),
      testRequest({
        id: 'req-grpc',
        name: 'gRPC',
        requestType: 'grpc',
        requestTab: 'body',
        url: 'grpc.example.test:443',
        bodyType: 'json',
        bodyContent: '{"id":"1"}',
        grpcMethod: 'shop.Inventory/GetItem',
        grpcMetadata: [testRow('authorization', 'Bearer {{token}}')],
      }),
    ], strip, true);

    const imported = insomniaRequestsFromResources(exported, 'collection-2', 'Mixed API');

    expect(imported.map(request => request.requestType)).toEqual(['http', 'graphql', 'ws', 'socketio', 'grpc']);
    expect(imported.find(request => request.requestType === 'socketio')).toMatchObject({
      sioArgs: [expect.objectContaining({ content: '{"ok":true}', bodyType: 'json' })],
      settings: expect.objectContaining({ sioClientVersion: 'v2', sioPath: '/socket.io' }),
    });
    expect(imported.find(request => request.requestType === 'grpc')).toMatchObject({
      grpcMethod: 'shop.Inventory/GetItem',
      grpcMetadata: [expect.objectContaining({ key: 'authorization', value: 'Bearer {{token}}' })],
      bodyContent: '{"id":"1"}',
    });
  });
});

describe('openApiRequestsFromSpec', () => {
  it('imports OpenAPI YAML paths into tag folders with examples', () => {
    const spec = parseOpenApiDocument(`
openapi: 3.0.3
info:
  title: Petstore
servers:
  - url: https://api.example.test/v1
paths:
  /pets/{petId}:
    get:
      tags: [Pets]
      summary: Get pet
      parameters:
        - name: petId
          in: path
          required: true
          schema:
            type: string
        - name: verbose
          in: query
          schema:
            type: boolean
    post:
      tags:
        - Pets
      summary: Update pet
      requestBody:
        content:
          application/json:
            example:
              name: Fluffy
              age: 3
`);

    const requests = openApiRequestsFromSpec(spec, 'collection-1', 'Petstore');

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      method: 'GET',
      folderPath: ['Pets'],
      url: 'https://api.example.test/v1/pets/{{petId}}',
    });
    expect(requests[0].params[0]).toMatchObject({ key: 'verbose', value: 'true' });
    expect(requests[1]).toMatchObject({ method: 'POST', bodyType: 'json' });
    expect(JSON.parse(requests[1].bodyContent)).toEqual({ name: 'Fluffy', age: 3 });
  });

  it('imports Swagger 2 body schemas and base URLs', () => {
    const requests = openApiRequestsFromSpec({
      swagger: '2.0',
      info: { title: 'Legacy API' },
      host: 'legacy.example.test',
      basePath: '/api',
      schemes: ['https'],
      paths: {
        '/users': {
          post: {
            tags: ['Users'],
            parameters: [
              {
                name: 'body',
                in: 'body',
                schema: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', format: 'email' },
                  },
                },
              },
            ],
          },
        },
      },
    }, 'collection-1', 'Legacy API');

    expect(requests[0].url).toBe('https://legacy.example.test/api/users');
    expect(JSON.parse(requests[0].bodyContent)).toEqual({ email: 'user@example.com' });
  });
});

describe('buildOpenApiDocument', () => {
  it('exports Relay requests as OpenAPI paths, parameters, JSON bodies, and auth', () => {
    const doc = buildOpenApiDocument('Shop API', 'Generated spec', [
      testRequest({
        id: 'req-users-get',
        name: 'Get user',
        folderPath: ['Users'],
        method: 'GET',
        url: 'https://api.example.test/v1/users/{{userId}}?expand=orders',
        params: [testRow('verbose', 'true')],
        headers: [testRow('X-Trace-ID', '{{traceId}}')],
        auth: { ...emptyAuthState(), type: 'bearer', bearerToken: '{{token}}' },
      }),
      testRequest({
        id: 'req-users-post',
        name: 'Create user',
        folderPath: ['Users'],
        method: 'POST',
        url: 'https://api.example.test/v1/users',
        headers: [testRow('Content-Type', 'application/json')],
        bodyType: 'json',
        bodyContent: '{"email":"user@example.com","active":true}',
      }),
    ], strip);

    expect(doc.openapi).toBe('3.0.3');
    expect(doc.info).toMatchObject({ title: 'Shop API', description: 'Generated spec' });
    expect(doc.servers).toEqual([{ url: 'https://api.example.test' }]);

    const getUser = operation(doc, '/v1/users/{userId}', 'get');
    expect(getUser.tags).toEqual(['Users']);
    expect(getUser.security).toEqual([{ bearerAuth: [] }]);
    expect(getUser.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'userId', in: 'path', required: true }),
      expect.objectContaining({ name: 'verbose', in: 'query', example: 'true' }),
      expect.objectContaining({ name: 'expand', in: 'query', example: 'orders' }),
      expect.objectContaining({ name: 'X-Trace-ID', in: 'header', example: '{{traceId}}' }),
    ]));

    const createUser = operation(doc, '/v1/users', 'post');
    expect(createUser.requestBody?.content['application/json']?.schema).toMatchObject({
      type: 'object',
      properties: {
        email: { type: 'string' },
        active: { type: 'boolean' },
      },
    });
    expect(doc.components).toMatchObject({
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
    });
  });

  it('throws a clear error when two requests would overwrite the same operation', () => {
    const requests = [
      testRequest({ id: 'req-1', name: 'First', method: 'GET', url: 'https://api.example.test/users' }),
      testRequest({ id: 'req-2', name: 'Second', method: 'GET', url: 'https://api.example.test/users' }),
    ];

    expect(() => buildOpenApiDocument('API', '', requests, strip)).toThrow(/duplicate GET \/users/);
  });

  it('exports localhost URLs without schemes as OpenAPI servers', () => {
    const doc = buildOpenApiDocument('Local API', '', [
      testRequest({
        id: 'req-local',
        name: 'Local health',
        method: 'GET',
        url: 'localhost:3000/api/health?verbose=true',
      }),
    ], strip);

    expect(doc.servers).toEqual([{ url: 'http://localhost:3000' }]);
    expect(operation(doc, '/api/health', 'get').parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'verbose', in: 'query', example: 'true' }),
    ]));
  });

  it('skips WebSocket requests when building OpenAPI documents', () => {
    const doc = buildOpenApiDocument('Mixed API', '', [
      testRequest({
        id: 'req-http',
        name: 'HTTP health',
        method: 'GET',
        url: 'https://api.example.test/health',
      }),
      testRequest({
        id: 'req-ws',
        name: 'WS echo',
        requestType: 'ws',
        url: 'wss://api.example.test/ws',
      }),
    ], strip);

    const paths = exportDocument(doc).paths;
    expect(paths['/health']).toBeTruthy();
    expect(paths['/ws']).toBeUndefined();
  });

  it('skips GraphQL requests when building OpenAPI documents', () => {
    const doc = buildOpenApiDocument('Mixed API', '', [
      testRequest({
        id: 'req-http',
        name: 'HTTP health',
        method: 'GET',
        url: 'https://api.example.test/health',
      }),
      testRequest({
        id: 'req-gql',
        name: 'GraphQL viewer',
        requestType: 'graphql',
        method: 'POST',
        url: 'https://api.example.test/graphql',
        bodyType: 'graphql',
        bodyContent: '{"query":"query Viewer { viewer { id } }","variables":{}}',
      }),
    ], strip);

    const paths = exportDocument(doc).paths;
    expect(paths['/health']).toBeTruthy();
    expect(paths['/graphql']).toBeUndefined();
  });

  it('throws a clear OpenAPI export error for GraphQL-only collections', () => {
    expect(() => buildOpenApiDocument('Graph API', '', [
      testRequest({
        id: 'req-gql',
        name: 'GraphQL viewer',
        requestType: 'graphql',
        method: 'POST',
        url: 'https://api.example.test/graphql',
        bodyType: 'graphql',
        bodyContent: '{"query":"query Viewer { viewer { id } }","variables":{}}',
      }),
    ], strip)).toThrow(/GraphQL and realtime requests are skipped/);
  });

  it('throws a clear OpenAPI export error for WebSocket-only collections', () => {
    expect(() => buildOpenApiDocument('WS API', '', [
      testRequest({
        id: 'req-ws',
        name: 'WS echo',
        requestType: 'ws',
        url: 'wss://api.example.test/ws',
      }),
    ], strip)).toThrow(/GraphQL and realtime requests are skipped/);
  });

  it('omits secret-like OpenAPI examples by default and can include them explicitly', () => {
    const request = testRequest({
      id: 'req-secret-openapi',
      name: 'Secret example',
      method: 'POST',
      url: 'https://raw-user:raw-pass@api.example.test/login?token=raw-token',
      headers: [testRow('Authorization', 'Bearer raw-token')],
      bodyType: 'json',
      bodyContent: '{"username":"admin","password":"raw-password"}',
    });

    const safeDoc = buildOpenApiDocument('API', '', [request], strip);
    expect(safeDoc.servers).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: 'https://api.example.test' }),
    ]));
    expect(JSON.stringify(safeDoc)).not.toContain('raw-user');
    expect(JSON.stringify(safeDoc)).not.toContain('raw-pass');
    const safeOperation = operation(safeDoc, '/login', 'post');
    const safeTokenParam = safeOperation.parameters?.find(p => p.name === 'token');
    const safeAuthorizationParam = safeOperation.parameters?.find(p => p.name === 'Authorization');
    expect(safeTokenParam).toBeTruthy();
    expect(safeAuthorizationParam).toBeTruthy();
    expect(safeTokenParam).not.toHaveProperty('example');
    expect(safeAuthorizationParam).not.toHaveProperty('example');
    expect(safeOperation.requestBody?.content['application/json']?.example).toMatchObject({
      username: 'admin',
      password: '',
    });

    const fullDoc = buildOpenApiDocument('API', '', [request], strip, true);
    expect(fullDoc.servers).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: 'https://raw-user:raw-pass@api.example.test' }),
    ]));
    const fullOperation = operation(fullDoc, '/login', 'post');
    expect(fullOperation.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'token', example: 'raw-token' }),
      expect.objectContaining({ name: 'Authorization', example: 'Bearer raw-token' }),
    ]));
    expect(fullOperation.requestBody?.content['application/json']?.example).toMatchObject({ password: 'raw-password' });

    const safeSwagger = buildSwaggerDocument('API', '', [request], strip);
    expect(safeSwagger.host).toBe('api.example.test');
  });
});

describe('buildPostmanEnvironment', () => {
  it('omits secret values by default and can include them explicitly', () => {
    const env = {
      id: 'env-1',
      workspaceId: 'workspace-1',
      name: 'Local',
      values: [
        { ...mkRow(), key: 'token', value: 'super-secret', secret: true },
        { ...mkRow(), key: 'baseUrl', value: 'http://localhost:3000' },
      ],
    };

    expect(buildPostmanEnvironment(env).values).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'token', value: '', type: 'secret' }),
      expect.objectContaining({ key: 'baseUrl', value: 'http://localhost:3000', type: 'default' }),
    ]));
    expect(buildPostmanEnvironment(env, true).values).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'token', value: 'super-secret', type: 'secret' }),
    ]));
  });
});

describe('buildPostmanCollection', () => {
  it('omits raw secret-like values by default and can include them explicitly', () => {
    const request = testRequest({
      id: 'req-secret',
      method: 'POST',
      url: 'https://api.example.test/login',
      params: [testRow('api_key', 'raw-key')],
      headers: [testRow('Authorization', 'Bearer raw-token')],
      auth: { ...emptyAuthState(), type: 'bearer', bearerToken: 'raw-token' },
      bodyType: 'urlencoded',
      formRows: [testRow('username', 'admin'), testRow('password', 'raw-password')],
    });

    const safe = postmanExport(buildPostmanCollection('API', '', [request], strip));
    const safeItem = safe.item[0].request;
    expect(safeItem.auth.bearer[0]).toMatchObject({ key: 'token', value: '' });
    expect(safeItem.header[0]).toMatchObject({ key: 'Authorization', value: '' });
    expect(safeItem.url.query[0]).toMatchObject({ key: 'api_key', value: '' });
    expect(safeItem.body.urlencoded).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'username', value: 'admin' }),
      expect.objectContaining({ key: 'password', value: '' }),
    ]));

    const withSecrets = postmanExport(buildPostmanCollection('API', '', [request], strip, true));
    const itemWithSecrets = withSecrets.item[0].request;
    expect(itemWithSecrets.auth.bearer[0]).toMatchObject({ key: 'token', value: 'raw-token' });
    expect(itemWithSecrets.body.urlencoded).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'password', value: 'raw-password' }),
    ]));
  });

  it('redacts raw URL query secrets and preserves duplicate raw query params', () => {
    const request = testRequest({
      id: 'req-url-secret',
      method: 'GET',
      url: 'https://api.example.test/search?tag=one&api_key=raw-key&tag=two#results',
      params: [testRow('tag', 'three')],
    });

    const safe = postmanExport(buildPostmanCollection('API', '', [request], strip));
    expect(safe.item[0].request.url?.raw).toBe('https://api.example.test/search?tag=one&api_key=&tag=two&tag=three#results');

    const withSecrets = postmanExport(buildPostmanCollection('API', '', [request], strip, true));
    expect(withSecrets.item[0].request.url?.raw).toContain('api_key=raw-key');
  });

  it('redacts raw URL userinfo and keeps templated URL userinfo', () => {
    const rawCreds = testRequest({
      id: 'req-url-userinfo-secret',
      method: 'GET',
      url: 'https://raw-user:raw-pass@api.example.test/me?view=full',
    });
    const templatedCreds = testRequest({
      id: 'req-url-userinfo-template',
      method: 'GET',
      url: 'https://{{apiCreds}}@api.example.test/me',
    });
    const protocolRelativeCreds = testRequest({
      id: 'req-url-userinfo-protocol-relative',
      method: 'GET',
      url: '//raw-user:raw-pass@api.example.test/protocol-relative',
    });

    const safe = postmanExport(buildPostmanCollection('API', '', [rawCreds, templatedCreds, protocolRelativeCreds], strip));
    expect(safe.item[0].request.url?.raw).toBe('https://api.example.test/me?view=full');
    expect(safe.item[1].request.url?.raw).toBe('https://{{apiCreds}}@api.example.test/me');
    expect(safe.item[2].request.url?.raw).toBe('//api.example.test/protocol-relative');

    const withSecrets = postmanExport(buildPostmanCollection('API', '', [rawCreds], strip, true));
    expect(withSecrets.item[0].request.url?.raw).toContain('raw-user:raw-pass@');
  });

  it('keeps variable references in secret-like fields', () => {
    const request = testRequest({
      id: 'req-vars',
      method: 'GET',
      url: 'https://api.example.test/me',
      headers: [testRow('Authorization', 'Bearer {{token}}')],
      auth: { ...emptyAuthState(), type: 'bearer', bearerToken: '{{token}}' },
    });

    const safe = postmanExport(buildPostmanCollection('API', '', [request], strip));
    const safeItem = safe.item[0].request;
    expect(safeItem.auth.bearer[0]).toMatchObject({ key: 'token', value: '{{token}}' });
    expect(safeItem.header[0]).toMatchObject({ key: 'Authorization', value: 'Bearer {{token}}' });
  });

  it('exports GraphQL requests in Postman GraphQL body mode', () => {
    const request = testRequest({
      id: 'req-gql',
      requestType: 'graphql',
      method: 'GET',
      url: 'https://api.example.test/graphql',
      requestTab: 'query',
      bodyType: 'graphql',
      bodyContent: JSON.stringify({
        query: 'query Viewer($id: ID!) { viewer(id: $id) { name } }',
        variables: { id: '{{viewerId}}' },
        operationName: 'Viewer',
      }),
    });

    const exported = postmanExport(buildPostmanCollection('Graph API', '', [request], strip));
    const item = exported.item[0].request;
    expect(item.method).toBe('POST');
    expect(item.body?.mode).toBe('graphql');
    expect(item.body?.graphql).toMatchObject({
      query: 'query Viewer($id: ID!) { viewer(id: $id) { name } }',
      operationName: 'Viewer',
    });
    expect(JSON.parse(String(item.body?.graphql?.variables))).toEqual({ id: '{{viewerId}}' });
  });

  it('round-trips all Relay request types through Postman export metadata', () => {
    const requests = [
      testRequest({ id: 'req-http', name: 'HTTP', requestType: 'http', url: 'https://api.example.test/ping' }),
      testRequest({
        id: 'req-gql',
        name: 'GraphQL',
        requestType: 'graphql',
        requestTab: 'query',
        bodyType: 'graphql',
        bodyContent: JSON.stringify({ query: '{ viewer { id } }', variables: {} }),
      }),
      testRequest({
        id: 'req-ws',
        name: 'WS',
        requestType: 'ws',
        requestTab: 'body',
        url: 'wss://api.example.test/ws',
        bodyType: 'text',
        rawBodyType: 'text',
        bodyContent: 'hello',
      }),
      testRequest({
        id: 'req-sio',
        name: 'Socket.IO',
        requestType: 'socketio',
        requestTab: 'events',
        url: 'https://api.example.test/realtime',
        settings: { ...DEFAULT_REQUEST_SETTINGS, sioClientVersion: 'v2', sioPath: '/socket.io' },
        sioEvents: [testRow('server:event', '')],
        sioArgs: [{ id: 'arg-1', content: '{"ok":true}', bodyType: 'json', encoding: 'base64' }],
        sioAck: true,
      }),
      testRequest({
        id: 'req-grpc',
        name: 'gRPC',
        requestType: 'grpc',
        requestTab: 'body',
        url: 'grpc.example.test:443',
        bodyType: 'json',
        bodyContent: '{"id":"1"}',
        grpcMethod: 'shop.Inventory/GetItem',
        grpcMetadata: [testRow('authorization', 'Bearer {{token}}')],
      }),
    ];

    const exported = buildPostmanCollection('Mixed API', '', requests, strip, true);
    const imported = postmanRequestsFromItems(exported.item, 'collection-2', 'Mixed API', undefined);

    expect(imported.map(request => request.requestType)).toEqual(['http', 'graphql', 'ws', 'socketio', 'grpc']);
    expect(imported.find(request => request.requestType === 'socketio')).toMatchObject({
      sioAck: true,
      sioArgs: [expect.objectContaining({ content: '{"ok":true}', bodyType: 'json' })],
    });
    expect(imported.find(request => request.requestType === 'grpc')).toMatchObject({
      grpcMethod: 'shop.Inventory/GetItem',
      grpcMetadata: [expect.objectContaining({ key: 'authorization', value: 'Bearer {{token}}' })],
      bodyContent: '{"id":"1"}',
    });
  });

  it('redacts raw URL query secrets in Insomnia export URLs', () => {
    const request = testRequest({
      id: 'req-insomnia-url-secret',
      method: 'GET',
      url: 'https://api.example.test/me?access_token=raw-token&view=full',
    });

    const safe = buildInsomniaExport('API', '', [request], strip);
    const safeRequest = safe.resources.find(resource => resource._type === 'request');
    expect(safeRequest?.url).toBe('https://api.example.test/me?access_token=&view=full');

    const withSecrets = buildInsomniaExport('API', '', [request], strip, true);
    const requestWithSecrets = withSecrets.resources.find(resource => resource._type === 'request');
    expect(requestWithSecrets?.url).toBe('https://api.example.test/me?access_token=raw-token&view=full');
  });
});

describe('openCollectionBundleFromFiles', () => {
  it('imports OpenCollection YAML requests, folders, scripts, auth, body, and environments', () => {
    const bundle = openCollectionBundleFromFiles([
      {
        path: 'opencollection.yml',
        content: `info:\n  name: Bruno API\ndocs: |-\n  Collection docs.\nvariables:\n  - name: workspace\n    value: core\nheaders:\n  - name: X-Collection\n    value: relay\nauth:\n  type: bearer\n  token: "{{collectionToken}}"\nruntime:\n  scripts:\n    - type: before-request\n      code: |-\n        bru.setVar("collection", "yes");\nsettings:\n  timeout: 9000\n  sslVerification: false\n  proxyUrl: http://localhost:8080\n`,
      },
      {
        path: 'users/folder.yml',
        content: `info:\n  name: Users\n  type: folder\n  seq: 1\n`,
      },
      {
        path: 'users/create-user.yml',
        content: `info:\n  name: Create User\n  type: http\n  seq: 1\nhttp:\n  method: POST\n  url: "{{baseUrl}}/users"\n  params:\n    - name: dryRun\n      value: "true"\n      type: query\n  headers:\n    - name: X-Trace\n      value: "{{traceId}}"\n  body:\n    type: json\n    data: |-\n      {"name":"Ada"}\n  auth:\n    type: bearer\n    token: "{{token}}"\nruntime:\n  scripts:\n    - type: before-request\n      code: |-\n        bru.setVar("stamp", Date.now());\n    - type: tests\n      code: |-\n        test("created", () => expect(res.status).to.equal(201));\nsettings:\n  timeout: 12000\n  followRedirects: false\ndocs: |-\n  Creates a user.\n`,
      },
      {
        path: 'environments/local.yml',
        content: `info:\n  name: Local\nvariables:\n  - name: baseUrl\n    value: https://api.example.test\n  - name: token\n    value: "{{relaySecret:token}}"\n    secret: true\n`,
      },
    ], 'collection-1', 'Fallback', 'workspace-1');

    expect(bundle.name).toBe('Bruno API');
    expect(bundle.description).toBe('Collection docs.');
    expect(bundle.defaults.variables[0]).toMatchObject({ key: 'workspace', value: 'core' });
    expect(bundle.defaults.headers[0]).toMatchObject({ key: 'X-Collection', value: 'relay' });
    expect(bundle.defaults.auth).toMatchObject({ type: 'bearer', bearerToken: '{{collectionToken}}' });
    expect(bundle.defaults.preRequestScript).toContain('collection');
    expect(bundle.defaults.settings.timeoutMs).toBe(9000);
    expect(bundle.defaults.settings.enableSSLVerification).toBe(false);
    expect(bundle.defaults.settings.proxyUrl).toBe('http://localhost:8080');
    expect(bundle.folderPaths).toEqual([['Users']]);
    expect(bundle.requests).toHaveLength(1);
    expect(bundle.requests[0]).toMatchObject({
      name: 'Create User',
      collectionId: 'collection-1',
      collection: 'Bruno API',
      folderPath: ['Users'],
      method: 'POST',
      url: '{{baseUrl}}/users',
      bodyType: 'json',
      bodyContent: '{"name":"Ada"}',
      preRequestScript: 'bru.setVar("stamp", Date.now());',
      testScript: 'test("created", () => expect(res.status).to.equal(201));',
      requestNotes: 'Creates a user.',
    });
    expect(bundle.requests[0].params[0]).toMatchObject({ key: 'dryRun', value: 'true' });
    expect(bundle.requests[0].headers[0]).toMatchObject({ key: 'X-Trace', value: '{{traceId}}' });
    expect(bundle.requests[0].auth).toMatchObject({ type: 'bearer', bearerToken: '{{token}}' });
    expect(bundle.requests[0].settings.timeoutMs).toBe(12000);
    expect(bundle.requests[0].settings.followRedirects).toBe(false);
    expect(bundle.requests[0].settingsOverrides).toMatchObject({ timeoutMs: true, followRedirects: true });
    expect(bundle.environments[0]).toMatchObject({ workspaceId: 'workspace-1', name: 'Local' });
    expect(bundle.environments[0].values).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'baseUrl', value: 'https://api.example.test' }),
      expect.objectContaining({ key: 'token', secret: true }),
    ]));
  });

  it('imports legacy Bruno .bru request files', () => {
    const bundle = openCollectionBundleFromFiles([
      { path: 'bruno.json', content: JSON.stringify({ name: 'Legacy Bruno' }) },
      {
        path: 'collection.bru',
        content: `auth {\n  mode: apikey\n}\n\nauth:apikey {\n  key: X-Collection-Key\n  value: {{collectionKey}}\n  placement: header\n}\n\nheaders {\n  X-Collection: yes\n}\n\nvars {\n  collectionHost: https://collection.example.test\n  collectionSecret: {{secret}}\n}\n\nvars:secret {\n  collectionSecret\n}\n\nsettings {\n  timeout: 7000\n  followRedirects: false\n}\n\nscript:pre-request {\n  bru.setVar("legacy", "yes");\n}\n\ndocs {\n  Legacy docs.\n}\n`,
      },
      {
        path: 'auth/login.bru',
        content: `meta {\n  name: Login\n  type: http\n  seq: 1\n}\n\npost {\n  url: {{baseUrl}}/login\n  body: json\n  auth: basic\n}\n\nheaders {\n  Content-Type: application/json\n}\n\nauth:basic {\n  username: admin\n  password: {{password}}\n}\n\nbody:json {\n  {\n    "username": "admin"\n  }\n}\n\ntests {\n  test("ok", () => expect(res.status).to.equal(200));\n}\n`,
      },
    ], 'collection-1', 'Fallback', 'workspace-1');

    expect(bundle.name).toBe('Legacy Bruno');
    expect(bundle.description).toBe('Legacy docs.');
    expect(bundle.defaults.headers[0]).toMatchObject({ key: 'X-Collection', value: 'yes' });
    expect(bundle.defaults.variables).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'collectionHost', value: 'https://collection.example.test' }),
      expect.objectContaining({ key: 'collectionSecret', secret: true }),
    ]));
    expect(bundle.defaults.auth).toMatchObject({ type: 'apikey', apiKeyName: 'X-Collection-Key', apiKeyValue: '{{collectionKey}}' });
    expect(bundle.defaults.preRequestScript).toContain('legacy');
    expect(bundle.defaults.settings.timeoutMs).toBe(7000);
    expect(bundle.defaults.settings.followRedirects).toBe(false);
    expect(bundle.requests).toHaveLength(1);
    expect(bundle.requests[0]).toMatchObject({
      name: 'Login',
      folderPath: ['auth'],
      method: 'POST',
      url: '{{baseUrl}}/login',
      bodyType: 'json',
      auth: expect.objectContaining({ type: 'basic', basicUser: 'admin', basicPass: '{{password}}' }),
    });
    expect(bundle.requests[0].headers[0]).toMatchObject({ key: 'Content-Type', value: 'application/json' });
    expect(bundle.requests[0].testScript).toContain('expect(res.status)');
  });

  it('imports non-HTTP legacy Bruno .bru request files when type metadata is present', () => {
    const bundle = openCollectionBundleFromFiles([
      { path: 'bruno.json', content: JSON.stringify({ name: 'Legacy Realtime Bruno' }) },
      {
        path: 'graphql/viewer.bru',
        content: `meta {\n  name: Viewer\n  type: graphql\n  seq: 1\n}\n\npost {\n  url: {{baseUrl}}/graphql\n  body: graphql\n}\n\nbody:graphql {\n  query Viewer {\n    viewer {\n      id\n    }\n  }\n}\n\nbody:graphql:vars {\n  {\n    "id": "1"\n  }\n}\n`,
      },
      {
        path: 'realtime/ws.bru',
        content: `meta {\n  name: Events WS\n  type: websocket\n  seq: 2\n}\n\nwebsocket {\n  url: wss://api.example.test/events\n}\n\nheaders {\n  X-Trace: {{traceId}}\n}\n\nbody:text {\n  ping\n}\n`,
      },
      {
        path: 'realtime/sio.bru',
        content: `meta {\n  name: Events SIO\n  type: socketio\n  seq: 3\n}\n\nsocketio {\n  url: https://api.example.test/socket.io\n  ack: true\n}\n\nevents {\n  message: enabled\n}\n\nbody:json {\n  {\n    "ok": true\n  }\n}\n`,
      },
      {
        path: 'grpc/get-item.bru',
        content: `meta {\n  name: Get Item\n  type: grpc\n  seq: 4\n}\n\ngrpc {\n  url: grpc.example.test:443\n  method: shop.Inventory/GetItem\n  useReflection: false\n}\n\nmetadata {\n  authorization: Bearer {{token}}\n}\n\nbody:json {\n  {\n    "id": "1"\n  }\n}\n`,
      },
    ], 'collection-1', 'Fallback', 'workspace-1');

    expect(bundle.requests.map(request => request.requestType).sort()).toEqual(['graphql', 'grpc', 'socketio', 'ws']);
    expect(bundle.requests.find(request => request.requestType === 'graphql')).toMatchObject({
      bodyType: 'graphql',
      requestTab: 'query',
    });
    expect(bundle.requests.find(request => request.requestType === 'ws')).toMatchObject({
      url: 'wss://api.example.test/events',
      bodyType: 'text',
      headers: [expect.objectContaining({ key: 'X-Trace', value: '{{traceId}}' })],
    });
    expect(bundle.requests.find(request => request.requestType === 'socketio')).toMatchObject({
      url: 'https://api.example.test/socket.io',
      requestTab: 'events',
      sioAck: true,
      sioEvents: [expect.objectContaining({ key: 'message' })],
      sioArgs: [expect.objectContaining({ bodyType: 'json' })],
    });
    expect(bundle.requests.find(request => request.requestType === 'grpc')).toMatchObject({
      url: 'grpc.example.test:443',
      grpcMethod: 'shop.Inventory/GetItem',
      grpcUseReflection: false,
      grpcMetadata: [expect.objectContaining({ key: 'authorization', value: 'Bearer {{token}}' })],
      bodyContent: expect.stringContaining('"id": "1"'),
    });
  });

  it('preserves Bruno auth inheritance explicitly', () => {
    const bundle = openCollectionBundleFromFiles([
      { path: 'opencollection.yml', content: `info:\n  name: Bruno API\n` },
      {
        path: 'ping.yml',
        content: `info:\n  name: Ping\n  type: http\nhttp:\n  method: GET\n  url: https://api.example.test/ping\n  auth: inherit\n`,
      },
    ], 'collection-1', 'Fallback', 'workspace-1');

    expect(bundle.requests[0].auth.type).toBe('inherit');
  });

  it('imports empty OpenCollection folder paths without requiring a request inside them', () => {
    const bundle = openCollectionBundleFromFiles([
      { path: 'opencollection.yml', content: `info:\n  name: Bruno API\n` },
      { path: 'parent/folder.yml', content: `info:\n  name: Parent\n  type: folder\n` },
      { path: 'parent/empty-child/folder.yml', content: `info:\n  name: Empty Child\n  type: folder\n` },
      {
        path: 'parent/with-request/folder.yml',
        content: `info:\n  name: With Request\n  type: folder\n`,
      },
      {
        path: 'parent/with-request/ping.yml',
        content: `info:\n  name: Ping\n  type: http\nhttp:\n  method: GET\n  url: https://api.example.test/ping\n`,
      },
    ], 'collection-1', 'Fallback', 'workspace-1');

    expect(bundle.folderPaths).toEqual([
      ['Parent'],
      ['Parent', 'Empty Child'],
      ['Parent', 'With Request'],
    ]);
    expect(bundle.requests[0].folderPath).toEqual(['Parent', 'With Request']);
  });

  it('imports a folder-only OpenCollection as an empty collection tree', () => {
    const bundle = openCollectionBundleFromFiles([
      { path: 'opencollection.yml', content: `info:\n  name: Empty API\n` },
      { path: 'empty/folder.yml', content: `info:\n  name: Empty\n  type: folder\n` },
      { path: 'empty/nested/folder.yml', content: `info:\n  name: Nested\n  type: folder\n` },
    ], 'collection-1', 'Fallback', 'workspace-1');

    expect(bundle.name).toBe('Empty API');
    expect(bundle.folderPaths).toEqual([['Empty'], ['Empty', 'Nested']]);
    expect(bundle.requests).toEqual([]);
  });
});

describe('buildOpenCollectionFiles', () => {
  it('exports a Bruno-compatible OpenCollection folder and redacts secrets by default', () => {
    const request = testRequest({
      id: 'req-oc',
      name: 'Create User',
      folderPath: ['Users'],
      method: 'POST',
      url: '{{baseUrl}}/users',
      params: [testRow('dryRun', 'true')],
      headers: [testRow('Authorization', 'Bearer raw-token')],
      auth: { ...emptyAuthState(), type: 'bearer', bearerToken: 'raw-token' },
      bodyType: 'json',
      bodyContent: '{"name":"Ada"}',
      preRequestScript: 'bru.setVar("stamp", Date.now());',
      testScript: 'test("created", () => expect(res.status).to.equal(201));',
      requestNotes: 'Creates a user.',
      settings: { ...DEFAULT_REQUEST_SETTINGS, timeoutMs: 12000, followRedirects: true },
      settingsOverrides: { timeoutMs: true, followRedirects: true },
    });
    const env: Environment = {
      id: 'env-1',
      workspaceId: 'workspace-1',
      name: 'Local',
      filesystemName: 'Local',
      values: [testRow('baseUrl', 'https://api.example.test'), { ...testRow('token', 'raw-token'), secret: true }],
    };
    const defaults = emptyCollectionDefaults();
    defaults.headers = [testRow('X-Collection', 'collection-secret')];
    defaults.variables = [{ ...testRow('tenant', 'acme'), secret: true }];
    defaults.auth = { ...emptyAuthState(), type: 'apikey', apiKeyName: 'X-Collection-Key', apiKeyValue: 'collection-secret', apiKeyIn: 'header' };
    defaults.preRequestScript = 'bru.setVar("collection", "yes");';
    defaults.settings = { ...DEFAULT_REQUEST_SETTINGS, timeoutMs: 9000, followRedirects: false, proxyUrl: 'http://localhost:8080' };

    const files = buildOpenCollectionFiles('Bruno API', 'Docs', defaults, [request], [env], strip);
    expect(files.map(file => file.path)).toEqual(expect.arrayContaining([
      'opencollection.yml',
      'Users/folder.yml',
      'Users/Create-User.yml',
      'environments/Local.yml',
    ]));
    const rootFile = files.find(file => file.path === 'opencollection.yml')?.content ?? '';
    expect(rootFile).toContain('docs: Docs');
    expect(rootFile).toContain('name: X-Collection');
    expect(rootFile).toContain('value: collection-secret');
    expect(rootFile).toContain('name: tenant');
    expect(rootFile).toContain('value: ""');
    expect(rootFile).toContain('type: apikey');
    expect(rootFile).toContain('key: X-Collection-Key');
    expect(rootFile).toContain('before-request');
    expect(rootFile).toContain('timeout: 9000');
    expect(rootFile).toContain('followRedirects: false');
    expect(rootFile).toContain('proxyUrl: http://localhost:8080');
    const requestFile = files.find(file => file.path === 'Users/Create-User.yml')?.content ?? '';
    expect(requestFile).toContain('info:');
    expect(requestFile).toContain('method: POST');
    expect(requestFile).toContain('type: bearer');
    expect(requestFile).toContain('token: ""');
    expect(requestFile).toContain('before-request');
    expect(requestFile).toContain('tests');
    expect(requestFile).toContain('docs: |-');
    expect(requestFile).toContain('timeout: 12000');
    expect(requestFile).toContain('followRedirects: true');
    expect(requestFile).not.toContain('timeout: 9000');
    expect(requestFile).not.toContain('X-Collection-Key');
    expect(requestFile).not.toContain('tenant');
    const envFile = files.find(file => file.path === 'environments/Local.yml')?.content ?? '';
    expect(envFile).toContain('name: baseUrl');
    expect(envFile).toContain('name: token');
    expect(envFile).toContain('secret: true');
    expect(envFile).toContain('value: ""');
  });

  it('redacts raw URL query secrets in OpenCollection HTTP and gRPC targets', () => {
    const files = buildOpenCollectionFiles('API', '', emptyCollectionDefaults(), [
      testRequest({
        id: 'req-http-secret-url',
        name: 'HTTP Secret URL',
        requestType: 'http',
        url: 'https://api.example.test/search?token=raw-token&visible=yes',
      }),
      testRequest({
        id: 'req-grpc-secret-target',
        name: 'gRPC Secret Target',
        requestType: 'grpc',
        url: 'grpc.example.test:443?api_key=raw-key',
        grpcMethod: 'shop.Inventory/GetItem',
      }),
    ], [], strip);

    const combined = files.map(file => file.content).join('\n');
    expect(combined).toContain('token=&visible=yes');
    expect(combined).toContain('api_key=');
    expect(combined).not.toContain('raw-token');
    expect(combined).not.toContain('raw-key');
  });

  it('exports explicit empty collection folders as folder.yml files', () => {
    const files = buildOpenCollectionFiles(
      'Bruno API',
      '',
      emptyCollectionDefaults(),
      [],
      [],
      strip,
      false,
      [['Parent'], ['Parent', 'Empty Child']],
    );

    expect(files.map(file => file.path)).toEqual(expect.arrayContaining([
      'Parent/folder.yml',
      'Parent/Empty-Child/folder.yml',
    ]));
    expect(files.find(file => file.path === 'Parent/Empty-Child/folder.yml')?.content).toContain('name: Empty Child');
  });

  it('round-trips all Relay request types through OpenCollection files', () => {
    const files = buildOpenCollectionFiles('Mixed API', '', emptyCollectionDefaults(), [
      testRequest({ id: 'req-http', name: 'HTTP', requestType: 'http', url: 'https://api.example.test/ping' }),
      testRequest({
        id: 'req-gql',
        name: 'GraphQL',
        requestType: 'graphql',
        requestTab: 'query',
        bodyType: 'graphql',
        bodyContent: JSON.stringify({ query: '{ viewer { id } }', variables: {} }),
      }),
      testRequest({
        id: 'req-ws',
        name: 'WS',
        requestType: 'ws',
        requestTab: 'body',
        url: 'wss://api.example.test/ws',
        bodyType: 'text',
        rawBodyType: 'text',
        bodyContent: 'hello',
      }),
      testRequest({
        id: 'req-sio',
        name: 'Socket.IO',
        requestType: 'socketio',
        requestTab: 'events',
        url: 'https://api.example.test/realtime',
        settings: { ...DEFAULT_REQUEST_SETTINGS, sioClientVersion: 'v2', sioPath: '/socket.io' },
        sioEvents: [testRow('server:event', '')],
        sioArgs: [{ id: 'arg-1', content: '{"ok":true}', bodyType: 'json', encoding: 'base64' }],
      }),
      testRequest({
        id: 'req-grpc',
        name: 'gRPC',
        requestType: 'grpc',
        requestTab: 'body',
        url: 'grpc.example.test:443',
        bodyType: 'json',
        bodyContent: '{"id":"1"}',
        grpcMethod: 'shop.Inventory/GetItem',
        grpcMetadata: [testRow('authorization', 'Bearer {{token}}')],
      }),
    ], [], strip, true);

    const bundle = openCollectionBundleFromFiles(files, 'collection-2', 'Mixed API', 'workspace-1');

    expect(bundle.requests.map(request => request.requestType)).toEqual(['graphql', 'grpc', 'http', 'socketio', 'ws']);
    expect(bundle.requests.find(request => request.requestType === 'socketio')).toMatchObject({
      sioArgs: [expect.objectContaining({ content: '{"ok":true}', bodyType: 'json' })],
      settings: expect.objectContaining({ sioClientVersion: 'v2', sioPath: '/socket.io' }),
    });
    expect(bundle.requests.find(request => request.requestType === 'grpc')).toMatchObject({
      grpcMethod: 'shop.Inventory/GetItem',
      grpcMetadata: [expect.objectContaining({ key: 'authorization', value: 'Bearer {{token}}' })],
      bodyContent: '{"id":"1"}',
    });
  });
});

describe('buildSwaggerDocument', () => {
  it('exports urlencoded forms and API key auth as Swagger 2.0', () => {
    const doc = buildSwaggerDocument('Legacy API', '', [
      testRequest({
        id: 'req-login',
        name: 'Login',
        method: 'POST',
        url: '{{baseUrl}}/login',
        auth: { ...emptyAuthState(), type: 'apikey', apiKeyName: 'X-API-Key', apiKeyValue: '{{apiKey}}', apiKeyIn: 'header' },
        bodyType: 'urlencoded',
        formRows: [testRow('username', 'admin'), testRow('password', 'secret')],
      }),
    ], strip);

    expect(doc.swagger).toBe('2.0');
    expect(doc['x-relay-server']).toBe('{baseUrl}');
    const login = operation(doc, '/login', 'post');
    expect(login.consumes).toEqual(['application/x-www-form-urlencoded']);
    expect(login.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'username', in: 'formData', type: 'string', default: 'admin' }),
      expect.objectContaining({ name: 'password', in: 'formData', type: 'string' }),
    ]));
    const passwordParam = login.parameters?.find(p => p.name === 'password');
    expect(passwordParam).toBeTruthy();
    expect(passwordParam).not.toHaveProperty('default');
    expect(doc.securityDefinitions).toMatchObject({
      apiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
    });
  });

  it('skips WebSocket requests when building Swagger documents', () => {
    const doc = buildSwaggerDocument('Mixed API', '', [
      testRequest({
        id: 'req-http',
        name: 'HTTP health',
        method: 'GET',
        url: 'https://api.example.test/health',
      }),
      testRequest({
        id: 'req-ws',
        name: 'WS echo',
        requestType: 'ws',
        url: 'wss://api.example.test/ws',
      }),
    ], strip);

    const paths = exportDocument(doc).paths;
    expect(paths['/health']).toBeTruthy();
    expect(paths['/ws']).toBeUndefined();
  });
});

describe('harRequestsFromLog', () => {
  const makeHar = (entries: unknown[]) => ({ log: { version: '1.2', entries } });

  it('imports basic GET with query params and headers', () => {
    const har = makeHar([{
      request: {
        method: 'GET',
        url: 'https://api.example.com/users?page=2&limit=10',
        queryString: [{ name: 'page', value: '2' }, { name: 'limit', value: '10' }],
        headers: [
          { name: 'Authorization', value: 'Bearer tok' },
          { name: ':authority', value: 'api.example.com' },
        ],
      },
    }]);

    const requests = harRequestsFromLog(har, 'col-1', 'My HAR');

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('https://api.example.com/users');
    expect(requests[0].params).toHaveLength(2);
    expect(requests[0].params[0]).toMatchObject({ key: 'page', value: '2' });
    expect(requests[0].params[1]).toMatchObject({ key: 'limit', value: '10' });
    expect(requests[0].headers).toHaveLength(1);
    expect(requests[0].headers[0]).toMatchObject({ key: 'Authorization', value: 'Bearer tok' });
  });

  it('imports POST with JSON body', () => {
    const har = makeHar([{
      request: {
        method: 'POST',
        url: 'https://api.example.com/orders',
        queryString: [],
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        postData: { mimeType: 'application/json', text: '{"item":"coffee"}' },
      },
    }]);

    const requests = harRequestsFromLog(har, 'col-1', 'My HAR');

    expect(requests[0].method).toBe('POST');
    expect(requests[0].bodyType).toBe('json');
    expect(requests[0].bodyContent).toBe('{"item":"coffee"}');
    expect(requests[0].requestTab).toBe('body');
  });

  it('imports GraphQL JSON bodies as GraphQL requests', () => {
    const har = makeHar([{
      request: {
        method: 'POST',
        url: 'https://api.example.com/graphql',
        queryString: [],
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        postData: {
          mimeType: 'application/json',
          text: '{"query":"query Viewer { viewer { id } }","variables":{"id":"123"}}',
        },
      },
    }]);

    const requests = harRequestsFromLog(har, 'col-1', 'My HAR');

    expect(requests[0]).toMatchObject({ requestType: 'graphql', method: 'POST', requestTab: 'query', bodyType: 'graphql' });
    expect(JSON.parse(requests[0].bodyContent)).toMatchObject({
      query: 'query Viewer { viewer { id } }',
      variables: { id: '123' },
    });
  });

  it('keeps regular HAR JSON bodies with query fields as HTTP requests', () => {
    const har = makeHar([{
      request: {
        method: 'POST',
        url: 'https://api.example.com/search',
        queryString: [],
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        postData: {
          mimeType: 'application/json',
          text: '{"query":"coffee","limit":10}',
        },
      },
    }]);

    const requests = harRequestsFromLog(har, 'col-1', 'My HAR');

    expect(requests[0]).toMatchObject({
      requestType: 'http',
      bodyType: 'json',
      bodyContent: '{"query":"coffee","limit":10}',
    });
  });

  it('imports POST with urlencoded body', () => {
    const har = makeHar([{
      request: {
        method: 'POST',
        url: 'https://api.example.com/login',
        queryString: [],
        headers: [],
        postData: {
          mimeType: 'application/x-www-form-urlencoded',
          params: [{ name: 'username', value: 'admin' }, { name: 'password', value: 'secret' }],
        },
      },
    }]);

    const requests = harRequestsFromLog(har, 'col-1', 'My HAR');

    expect(requests[0].bodyType).toBe('urlencoded');
    expect(requests[0].formRows).toHaveLength(2);
    expect(requests[0].formRows[0]).toMatchObject({ key: 'username', value: 'admin' });
  });

  it('imports WebSocket upgrade requests', () => {
    const har = makeHar([{
      request: {
        method: 'GET',
        url: 'https://api.example.com/ws?token=abc',
        queryString: [{ name: 'token', value: 'abc' }],
        headers: [{ name: 'Upgrade', value: 'websocket' }],
      },
    }]);

    const requests = harRequestsFromLog(har, 'col-1', 'My HAR');

    expect(requests[0]).toMatchObject({
      requestType: 'ws',
      requestTab: 'body',
      url: 'https://api.example.com/ws',
    });
    expect(requests[0].params[0]).toMatchObject({ key: 'token', value: 'abc' });
  });

  it('imports Socket.IO captures without Engine.IO transport params', () => {
    const har = makeHar([{
      request: {
        method: 'GET',
        url: 'wss://api.example.com/socket.io/?EIO=4&transport=websocket&sid=abc&token=user',
        queryString: [
          { name: 'EIO', value: '4' },
          { name: 'transport', value: 'websocket' },
          { name: 'sid', value: 'abc' },
          { name: 'token', value: 'user' },
        ],
        headers: [],
      },
    }]);

    const requests = harRequestsFromLog(har, 'col-1', 'My HAR');

    expect(requests[0]).toMatchObject({
      requestType: 'socketio',
      requestTab: 'events',
      url: 'https://api.example.com',
      settings: expect.objectContaining({ sioPath: '/socket.io', sioClientVersion: 'v3' }),
    });
    expect(requests[0].params).toEqual([expect.objectContaining({ key: 'token', value: 'user' })]);
  });

  it('skips entries with missing or empty url', () => {
    const har = makeHar([
      { request: { method: 'GET', url: '', queryString: [], headers: [] } },
      { request: { method: 'GET', url: 'https://api.example.com/ping', queryString: [], headers: [] } },
    ]);
    const requests = harRequestsFromLog(har, 'col-1', 'My HAR');
    expect(requests).toHaveLength(1);
  });

  it('throws when log is missing', () => {
    expect(() => harRequestsFromLog({ noLog: true }, 'col-1', 'Bad')).toThrow();
  });

  it('throws when entries array is empty', () => {
    expect(() => harRequestsFromLog({ log: { entries: [] } }, 'col-1', 'Empty')).toThrow();
  });
});
