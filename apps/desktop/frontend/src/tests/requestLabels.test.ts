import { describe, expect, it } from 'vitest';
import { methodColor, requestTransportLabel } from '../lib/utils';

describe('request labels', () => {
  it('shows Socket.IO transport instead of the saved HTTP method', () => {
    expect(requestTransportLabel({ requestType: 'socketio', method: 'GET', url: 'localhost:3001' })).toBe('Socket.IO');
  });

  it('colors mixed-case realtime transport labels', () => {
    expect(methodColor('Socket.IO')).toBe('method-sio');
    expect(methodColor('GraphQL')).toBe('method-graphql');
    expect(methodColor('gRPC')).toBe('method-grpc');
  });

  it('shows gRPC transport instead of the saved HTTP method', () => {
    expect(requestTransportLabel({ requestType: 'grpc', method: 'POST', url: 'localhost:50051' })).toBe('gRPC');
  });
});
