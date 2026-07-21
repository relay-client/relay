import { describe, expect, it } from 'vitest';
import { bodyPlaceholder, type BodyEditorContext, type BodyEditorLang } from '../lib/bodyTemplates';

describe('body placeholders', () => {
  it('keeps editor placeholders on a single line', () => {
    const languages: BodyEditorLang[] = ['json', 'text', 'xml', 'html', 'javascript', 'graphql'];
    const contexts: BodyEditorContext[] = ['body', 'message', 'variables', 'binary'];

    for (const language of languages) {
      for (const context of contexts) {
        expect(bodyPlaceholder(language, context)).not.toMatch(/\r|\n/);
      }
    }
  });
});
