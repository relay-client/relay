import { describe, expect, it } from 'vitest';
import { decodeJwt, extractJwtToken, formatJwtClaimValue, jwtClaimRows, jwtTokenState } from '../lib/jwt';

function jwtPart(value: unknown) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function token(header: unknown, payload: unknown, signature = 'sig') {
  return `${jwtPart(header)}.${jwtPart(payload)}.${signature}`;
}

describe('JWT helpers', () => {
  it('decodes a bearer JWT header and claims locally', () => {
    const source = token(
      { typ: 'JWT', alg: 'HS256' },
      { sub: 'user-1', name: 'Алиса', admin: true, exp: 1893456000 },
    );

    const decoded = decodeJwt(`Bearer ${source}`);

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.header.alg).toBe('HS256');
    expect(decoded.payload).toMatchObject({ sub: 'user-1', name: 'Алиса', admin: true });
    expect(decoded.signature).toBe('sig');
  });

  it('reports malformed tokens without throwing', () => {
    expect(decodeJwt('abc.def')).toEqual({ ok: false, error: 'JWT must contain header, payload, and signature' });
    const invalid = decodeJwt('abc.def.ghi');
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toContain('Invalid header');
  });

  it('orders registered claims first and formats values', () => {
    const rows = jwtClaimRows({ custom: { ok: true }, sub: 'user-1', exp: 1893456000 });

    expect(rows.map(([key]) => key)).toEqual(['sub', 'exp', 'custom']);
    expect(formatJwtClaimValue({ ok: true })).toBe('{\n  "ok": true\n}');
  });

  it('classifies token time window', () => {
    expect(jwtTokenState({ exp: 10 }, 11)).toMatchObject({ state: 'expired' });
    expect(jwtTokenState({ nbf: 20 }, 11)).toMatchObject({ state: 'not-yet-valid' });
    expect(jwtTokenState({ exp: 20, nbf: 10 }, 11)).toMatchObject({ state: 'valid' });
  });

  it('strips bearer prefixes case-insensitively', () => {
    expect(extractJwtToken('bearer abc.def.ghi')).toBe('abc.def.ghi');
  });
});
