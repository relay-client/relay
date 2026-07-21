import { describe, expect, it } from 'vitest';
import { formatJsonDocument, stripJsonComments, validateJsonDocument } from '../lib/jsonEditing';

describe('jsonEditing', () => {
  it('formats JSON while preserving comments outside the active value', () => {
    const source = '{"b":2,"a":1}\n// disabled payload\n// {"x": true}';

    expect(formatJsonDocument(source)).toBe(`{
  "b": 2,
  "a": 1
}
// disabled payload
// {"x": true}`);
  });

  it('formats JSON while preserving comments inside the active value', () => {
    const source = '{\n  "a": 1,\n  // "b": 2,\n  "c": 3\n}';

    expect(formatJsonDocument(source)).toBe(`{
  "a": 1,
  // "b": 2,
  "c": 3
}`);
  });

  it('formats the request body shape with an inner disabled field and trailing disabled object', () => {
    const source = `{
  "email": "user@example.com",
        "login": "user@example.com",
  "userName": "example-user",
  "verifyTokenHash": "0123456789abcdef0123456789abcdef",
  "password": "old-secret",
  "newPassword": "new-secret",
  "deleteSession": true,
  // "firstName": "Ada",
  "lastName": "Lovelace"
}
// {
  // "dd": "ddd",
  // "ddd": "aaaa",
  // "ssss": "aaaa"
// } `;

    expect(formatJsonDocument(source)).toBe(`{
  "email": "user@example.com",
  "login": "user@example.com",
  "userName": "example-user",
  "verifyTokenHash": "0123456789abcdef0123456789abcdef",
  "password": "old-secret",
  "newPassword": "new-secret",
  "deleteSession": true,
  // "firstName": "Ada",
  "lastName": "Lovelace"
}
// {
  // "dd": "ddd",
  // "ddd": "aaaa",
  // "ssss": "aaaa"
// } `);
  });

  it('strips inline and block JSON comments without shifting positions', () => {
    const source = '{ "a": 1 // keep local note\n, "b": /* hidden */ 2 }';
    const stripped = stripJsonComments(source);

    expect(stripped).toHaveLength(source.length);
    expect(JSON.parse(stripped)).toEqual({ a: 1, b: 2 });
  });

  it('reports missing commas at the next property instead of at comments or EOF', () => {
    const source = '{\n  "a": 1\n  "b": 2\n}\n// trailing comment';
    const error = validateJsonDocument(source);

    expect(error?.position).toBe(source.indexOf('"b"'));
    expect(error?.message).toContain('Expected comma');
  });
});
