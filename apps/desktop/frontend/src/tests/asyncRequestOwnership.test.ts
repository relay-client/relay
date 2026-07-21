import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/backend', () => ({
  grpcDiscover: vi.fn(),
  openDirectoryDialog: vi.fn(),
  openFileDialog: vi.fn(),
  readTextFile: vi.fn(),
  sendGrpcRequest: vi.fn(),
  sendHttpRequest: vi.fn(),
}));

import { grpcDiscover } from '../lib/backend';
import { graphqlFeature } from '../lib/stores/features/graphql';
import { grpcFeature } from '../lib/stores/features/grpc';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('request-owned async operations', () => {
  it('does not apply a stale GraphQL schema import to a different request', async () => {
    const pending = deferred<{ body: string; status: string; statusCode: number }>();
    const host = {
      activeRequestId: 'request-a',
      graphqlSchemaOperationToken: 0,
      graphqlSchema: 'schema-a',
      graphqlSchemaError: '',
      graphqlSchemaLoading: false,
      graphqlSchemaStatus: '',
      syncBackendEnvironment: vi.fn().mockResolvedValue(undefined),
      fetchGraphQLSchemaUrl: vi.fn(() => pending.promise),
      importGraphQLSchemaText(source: string, label = '') {
        this.graphqlSchema = source;
        this.graphqlSchemaStatus = label;
        this.graphqlSchemaError = '';
      },
    };

    const importing = graphqlFeature.importGraphQLSchemaFromUrl.call(host as any, 'https://schema.test');
    await Promise.resolve();
    host.activeRequestId = 'request-b';
    host.graphqlSchemaOperationToken += 1;
    host.graphqlSchema = 'schema-b';
    host.graphqlSchemaStatus = 'status-b';
    host.graphqlSchemaError = 'error-b';
    host.graphqlSchemaLoading = true;

    pending.resolve({ body: '{"data":{"__schema":{}}}', status: 'Imported A', statusCode: 200 });
    await importing;

    expect(host.graphqlSchema).toBe('schema-b');
    expect(host.graphqlSchemaStatus).toBe('status-b');
    expect(host.graphqlSchemaError).toBe('error-b');
    expect(host.graphqlSchemaLoading).toBe(true);
  });

  it('does not apply stale gRPC discovery to a different request', async () => {
    const pending = deferred<{
      source: string;
      services: Array<{ name: string }>;
      methods: Array<{ fullName: string }>;
      error: string;
    }>();
    vi.mocked(grpcDiscover).mockReturnValueOnce(pending.promise as never);
    const definitionB = {
      source: 'request-b.proto',
      services: [{ name: 'request.B' }],
      methods: [{ fullName: 'request.B/Call' }],
    };
    const host = {
      activeRequestId: 'request-a',
      requestType: 'grpc',
      grpcServiceOperationToken: 0,
      grpcServiceLoading: false,
      grpcServiceError: '',
      grpcServiceStatus: '',
      grpcServiceDefinition: { source: '', services: [], methods: [] },
      grpcUseReflection: true,
      grpcProtoFilePath: '',
      url: 'localhost:50051',
      grpcMethod: '',
      snapshotActiveRequest: () => ({}),
      environmentValuesForRequest: () => ({}),
      activeSecretEnvironmentValues: () => [],
      activeSecretEnvironmentKeys: () => [],
      syncBackendEnvironment: vi.fn().mockResolvedValue(undefined),
      savedRequestToRunnableGrpcRequest: () => ({}),
      grpcSelectableMethods() {
        return this.grpcServiceDefinition.methods;
      },
      grpcMethodIsReflection: () => false,
      scheduleActiveRequestPersist: vi.fn(),
    };

    const discovering = grpcFeature.discoverGrpcServices.call(host as any);
    await Promise.resolve();
    host.activeRequestId = 'request-b';
    host.grpcServiceOperationToken += 1;
    host.grpcServiceDefinition = definitionB;
    host.grpcServiceStatus = 'status-b';
    host.grpcServiceError = 'error-b';
    host.grpcServiceLoading = true;

    pending.resolve({
      source: 'request-a.proto',
      services: [{ name: 'request.A' }],
      methods: [{ fullName: 'request.A/Call' }],
      error: '',
    });
    await discovering;

    expect(host.grpcServiceDefinition).toEqual(definitionB);
    expect(host.grpcServiceStatus).toBe('status-b');
    expect(host.grpcServiceError).toBe('error-b');
    expect(host.grpcServiceLoading).toBe(true);
  });
});
