import { scriptFieldsForSend as resolveScriptFieldsForSend } from '../../scriptEngine';
import type { SavedRequest, ScriptEngine } from '../../types/models';

type ScriptsHost = {
  preRequestScript: string;
  preRequestScriptJs: string;
  scriptEngine: ScriptEngine;
  testScript: string;
  testScriptJs: string;
};

export const scriptsFeature = {
  get activePreRequestScript(): string {
    const host = this as unknown as ScriptsHost;
    return host.scriptEngine === 'js' ? host.preRequestScriptJs : host.preRequestScript;
  },

  set activePreRequestScript(value: string) {
    const host = this as unknown as ScriptsHost;
    if (host.scriptEngine === 'js') host.preRequestScriptJs = value;
    else host.preRequestScript = value;
  },

  get activeTestScript(): string {
    const host = this as unknown as ScriptsHost;
    return host.scriptEngine === 'js' ? host.testScriptJs : host.testScript;
  },

  set activeTestScript(value: string) {
    const host = this as unknown as ScriptsHost;
    if (host.scriptEngine === 'js') host.testScriptJs = value;
    else host.testScript = value;
  },

  scriptFieldsForSend(this: ScriptsHost, req: SavedRequest): { preRequestScript: string; testScript: string; scriptEngine: ScriptEngine } {
    return resolveScriptFieldsForSend(this.scriptEngine, req);
  },
};
