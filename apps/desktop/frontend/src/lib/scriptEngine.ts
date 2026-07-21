import type { SavedRequest, ScriptEngine } from './types/models';

type RequestScripts = Pick<SavedRequest, 'preRequestScript' | 'testScript' | 'preRequestScriptJs' | 'testScriptJs'>;

export function activeScript(engine: ScriptEngine, tengoValue: string, jsValue: string): string {
  return engine === 'js' ? jsValue : tengoValue;
}

export function scriptFieldsForSend(
  engine: ScriptEngine,
  req: RequestScripts,
): { preRequestScript: string; testScript: string; scriptEngine: ScriptEngine } {
  return engine === 'js'
    ? { preRequestScript: req.preRequestScriptJs ?? '', testScript: req.testScriptJs ?? '', scriptEngine: 'js' }
    : { preRequestScript: req.preRequestScript ?? '', testScript: req.testScript ?? '', scriptEngine: 'tengo' };
}

// Imported collections (Postman, Insomnia, Bruno/OpenCollection, …) carry their
// scripts in the base preRequestScript/testScript fields. Those scripts are
// JavaScript, so when the active engine is JS we move them into the JS-specific
// fields; otherwise they already live in the right (Tengo) fields.
export function routeImportedScripts<T extends RequestScripts>(item: T, engine: ScriptEngine): T {
  if (engine !== 'js') return item;
  const pre = item.preRequestScriptJs || item.preRequestScript || '';
  const test = item.testScriptJs || item.testScript || '';
  if (!pre && !test) return item;
  return { ...item, preRequestScript: '', testScript: '', preRequestScriptJs: pre, testScriptJs: test };
}

// For export: copy the active engine's scripts into the base preRequestScript/
// testScript fields, since exporters (Postman, OpenCollection) read those.
export function withActiveScripts<T extends RequestScripts>(item: T, engine: ScriptEngine): T {
  const f = scriptFieldsForSend(engine, item);
  return { ...item, preRequestScript: f.preRequestScript, testScript: f.testScript };
}
