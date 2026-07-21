import { describe, expect, it } from 'vitest';
import { friendlyUpdateError } from '../lib/updateErrors';

describe('friendlyUpdateError', () => {
  it('turns raw GitHub timeout errors into a readable message', () => {
    const message = friendlyUpdateError(
      'Get "https://github.com/relay-client/relay/releases/latest/download/latest.json": net/http: TLS handshake timeout',
      'check for updates',
    );

    expect(message).toBe('Could not check for updates. The request timed out. Check your internet connection and try again.');
    expect(message).not.toContain('github.com');
    expect(message).not.toContain('net/http');
  });

  it('does not leak raw service URLs for unknown failures', () => {
    const message = friendlyUpdateError(
      'Get "https://github.com/relay-client/relay/releases/latest/download/latest.json": unexpected EOF',
      'check for updates',
    );

    expect(message).toBe('Could not check for updates. Please try again in a moment.');
    expect(message).not.toContain('github.com');
  });

  it('handles object-shaped Wails errors', () => {
    const message = friendlyUpdateError({ message: 'dial tcp: connection refused' }, 'install the update');

    expect(message).toBe('Could not install the update. Relay could not reach the update service. Check your internet connection and try again.');
  });

  it('explains checksum verification failures', () => {
    const message = friendlyUpdateError('update checksum mismatch', 'install the update');

    expect(message).toBe('Could not install the update. The downloaded update could not be verified. Please try again later.');
  });

  it('preserves already friendly backend errors', () => {
    const backendMessage = 'Could not install the update. The downloaded update could not be verified. Please try again later.';

    expect(friendlyUpdateError(backendMessage, 'install the update')).toBe(backendMessage);
  });
});
