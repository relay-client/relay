import { describe, expect, it } from 'vitest';
import { codePanelMaxWidth } from '../lib/stores/features/uiShell';

describe('code panel layout limits', () => {
  it('keeps at least half of the available workspace for the editor', () => {
    expect(codePanelMaxWidth(1440, 280)).toBe(577);
    expect(codePanelMaxWidth(1920, 280)).toBe(760);
  });

  it('falls back to the minimum panel width on a compact window', () => {
    expect(codePanelMaxWidth(1024, 280)).toBe(280);
  });

  it('uses the extra space when the sidebar is hidden', () => {
    expect(codePanelMaxWidth(1280, 0)).toBe(637);
  });
});
