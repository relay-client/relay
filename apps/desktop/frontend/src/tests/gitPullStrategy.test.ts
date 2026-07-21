import { describe, expect, it } from 'vitest';
import { fastForwardPullDivergedMessage, normalizeGitPullStrategy, shouldPromptForDivergedPull } from '../lib/gitPullStrategy';

describe('git pull strategy helpers', () => {
  it('normalizes blank and mixed-case strategies', () => {
    expect(normalizeGitPullStrategy('')).toBe('ff');
    expect(normalizeGitPullStrategy('  ReBase  ')).toBe('rebase');
  });

  it('prompts before ff-only pull when local and remote branches diverged', () => {
    expect(shouldPromptForDivergedPull('ff', { ahead: 1, behind: 1 })).toBe(true);
    expect(shouldPromptForDivergedPull('merge', { ahead: 1, behind: 1 })).toBe(false);
    expect(shouldPromptForDivergedPull('ff', { ahead: 0, behind: 1 })).toBe(false);
    expect(shouldPromptForDivergedPull('ff', { ahead: 1, behind: 0 })).toBe(false);
  });

  it('adds a recovery hint to fast-forward failures', () => {
    const message = fastForwardPullDivergedMessage('fatal: Not possible to fast-forward, aborting.');
    expect(message).toContain('Pull (merge)');
    expect(message).toContain('Pull (rebase)');
  });
});
