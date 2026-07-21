import { describe, expect, it } from 'vitest';
import { cleanReleaseNotes } from '../lib/releaseNotes';

describe('cleanReleaseNotes', () => {
  it('turns plus-separated make release notes into updater bullets', () => {
    expect(cleanReleaseNotes('Socket.IO support + WebSocket fixes + SSE improvements')).toBe([
      '- Socket.IO support',
      '- WebSocket fixes',
      '- SSE improvements',
    ].join('\n'));
  });

  it('removes legacy generated headings because the UI already has one', () => {
    expect(cleanReleaseNotes("What's new in v0.1.16\n\n- Socket.IO support")).toBe('- Socket.IO support');
  });

  it('removes GitHub changelog footer from generated release notes', () => {
    expect(cleanReleaseNotes('- Fix one\n**Full Changelog**: https://example.test')).toBe('- Fix one');
  });
});
