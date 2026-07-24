import { describe, expect, it } from 'vitest';
import { httpFileCollectionName, parseHttpFile } from '../lib/httpFile';

function parse(text: string) {
  return parseHttpFile(text, 'collection-1', 'API');
}

describe('httpFileCollectionName', () => {
  it('drops the extension', () => {
    expect(httpFileCollectionName('orders.http')).toBe('orders');
    expect(httpFileCollectionName('smoke.REST')).toBe('smoke');
    expect(httpFileCollectionName('')).toBe('HTTP File');
  });
});

describe('parseHttpFile', () => {
  it('parses a JetBrains-style file with variables, names, headers and bodies', () => {
    const { requests, variables } = parse(`
@baseUrl = https://api.example.com
@token = secret-token

### List users
GET {{baseUrl}}/users?page=1 HTTP/1.1
Accept: application/json
Authorization: Bearer {{token}}

### Create user
# @name createUser
POST {{baseUrl}}/users
Content-Type: application/json

{
  "name": "Ada"
}
`);

    expect(variables).toEqual([
      { key: 'baseUrl', value: 'https://api.example.com' },
      { key: 'token', value: 'secret-token' },
    ]);
    expect(requests).toHaveLength(2);

    // The {{baseUrl}} reference is kept as-is: it resolves against the
    // collection variables the importer creates from the file's `@` lines.
    expect(requests[0]).toMatchObject({
      name: 'List users',
      method: 'GET',
      url: '{{baseUrl}}/users?page=1',
      requestType: 'http',
      bodyType: 'none',
      requestTab: 'headers',
      collectionId: 'collection-1',
    });
    expect(requests[0].headers.map(header => [header.key, header.value])).toEqual([
      ['Accept', 'application/json'],
      ['Authorization', 'Bearer {{token}}'],
    ]);

    // The `# @name` directive wins over the text on the ### line.
    expect(requests[1]).toMatchObject({
      name: 'createUser',
      method: 'POST',
      bodyType: 'json',
      rawBodyType: 'json',
      requestTab: 'body',
    });
    expect(JSON.parse(requests[1].bodyContent)).toEqual({ name: 'Ada' });
  });

  it('accepts a bare URL line as GET', () => {
    const { requests } = parse('https://api.example.com/health');
    expect(requests[0]).toMatchObject({ method: 'GET', url: 'https://api.example.com/health' });
  });

  it('names a request from its path when the file gives no name', () => {
    const { requests } = parse('DELETE https://api.example.com/v1/sessions');
    expect(requests[0].name).toBe('DELETE /sessions');
  });

  it('joins a query string wrapped across indented lines', () => {
    const { requests } = parse(`GET https://api.example.com/search
    ?q=relay
    &limit=10
Accept: application/json
`);
    expect(requests[0].url).toBe('https://api.example.com/search?q=relay&limit=10');
  });

  it('keeps the last value when a variable is redefined', () => {
    const { variables } = parse(`
@host = https://staging.example.com
@host = https://prod.example.com

GET {{host}}/ping
`);
    expect(variables).toEqual([{ key: 'host', value: 'https://prod.example.com' }]);
  });

  it('records file-backed bodies and response redirects as notes instead of dropping them', () => {
    const { requests } = parse(`POST https://api.example.com/upload
Content-Type: application/json

< ./payload.json
>> ./response.json
`);
    expect(requests[0].bodyContent).toBe('');
    expect(requests[0].requestNotes).toContain('./payload.json');
    expect(requests[0].requestNotes).toContain('./response.json');
  });

  it('does not invent a script from a JetBrains response handler', () => {
    const { requests } = parse(`GET https://api.example.com/token

> {%
  client.global.set("token", response.body.token);
%}
`);
    expect(requests[0].testScript).toBe('');
    expect(requests[0].requestNotes).toContain('response handler');
  });

  it('detects GraphQL and WebSocket requests', () => {
    const graphql = parse(`POST https://api.example.com/graphql
X-REQUEST-TYPE: GraphQL

query { viewer { id } }
`).requests[0];
    expect(graphql).toMatchObject({ requestType: 'graphql', method: 'POST', requestTab: 'query' });
    expect(graphql.bodyContent).toContain('viewer');

    const socket = parse('WEBSOCKET wss://api.example.com/stream').requests[0];
    expect(socket).toMatchObject({ requestType: 'ws', requestTab: 'body' });
  });

  it('ignores comments and blank separator blocks', () => {
    const { requests } = parse(`
# a comment
// another comment

###

### Ping
GET https://api.example.com/ping

###
`);
    expect(requests).toHaveLength(1);
    expect(requests[0].name).toBe('Ping');
  });

  it('rejects a file with no request line', () => {
    expect(() => parse('# just a comment\n@only = variable')).toThrow(/No requests found/);
  });
});
