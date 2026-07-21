export type BodyEditorLang = 'json' | 'text' | 'xml' | 'html' | 'javascript' | 'graphql';
export type BodyEditorContext = 'body' | 'message' | 'variables' | 'binary';

const TEMPLATES: Record<Exclude<BodyEditorLang, 'text'>, string> = {
  json: '{ "key": "value" }',
  xml: '<request><key>value</key></request>',
  html: '<div><h1>Hello from Relay</h1></div>',
  javascript: 'function example() { return "Hello from Relay"; }',
  graphql: 'query Example { viewer { id name } }',
};

const PLAIN_TEXT: Record<BodyEditorContext, string> = {
  body: 'Enter request body',
  message: 'Enter a message to send',
  variables: 'Enter variables',
  binary: 'Provide binary data as Base64 or Hex',
};

export function bodyPlaceholder(lang: BodyEditorLang, context: BodyEditorContext = 'body'): string {
  if (context === 'binary') return PLAIN_TEXT.binary;
  if (context === 'variables' && lang === 'json') return '{}';
  if (lang === 'text') return PLAIN_TEXT[context] ?? PLAIN_TEXT.body;
  return TEMPLATES[lang];
}
