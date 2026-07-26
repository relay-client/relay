import { getGlobalVariables, setGlobalVariables } from '../../backend';
import type { KVRow } from '../../types/models';
import { rowHasContent } from '../../utils';

type GlobalsHost = {
  globalVariables: KVRow[];
  globalsSaveState: 'idle' | 'dirty' | 'saving' | 'saved';
  globalsPersistTimer: ReturnType<typeof setTimeout> | null;
  globalsSavedTimer: ReturnType<typeof setTimeout> | null;
  autosave: boolean;
  persistRequestStore: () => Promise<boolean>;
  guardWorkspaceWritable: (action?: string) => boolean;
  globalVariableRows: () => KVRow[];
  globalVariableValues: () => Record<string, string>;
  scheduleGlobalsPersist: (delay?: number) => void;
};

// Globals are workspace-independent on purpose: they are the scope a script
// reaches for when a value has to outlive the environment it was produced in.
const GLOBALS_ROW_LIMIT = 5000;

function nextRowId(rows: KVRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
}

function blankRow(rows: KVRow[]): KVRow {
  return { id: nextRowId(rows), enabled: true, key: '', value: '', description: '' };
}

// Keep exactly one empty row at the end so there is always somewhere to type,
// matching how the environment editor behaves.
export function withTrailingRow(rows: KVRow[]): KVRow[] {
  const trimmed = [...rows];
  while (trimmed.length > 1 && !rowHasContent(trimmed[trimmed.length - 1]) && !rowHasContent(trimmed[trimmed.length - 2])) {
    trimmed.pop();
  }
  if (!trimmed.length || rowHasContent(trimmed[trimmed.length - 1])) {
    trimmed.push(blankRow(trimmed));
  }
  return trimmed.slice(0, GLOBALS_ROW_LIMIT);
}

// mergeGlobalRowsWithValues folds backend values (what scripts wrote during a
// send) back into the editable rows, preserving each row's id, enabled state and
// description, and appending anything a script introduced.
export function mergeGlobalRowsWithValues(rows: KVRow[], values: Record<string, string>): KVRow[] {
  const seen = new Set<string>();
  const merged = rows.map(row => {
    const key = row.key.trim();
    if (!key || !(key in values)) return row;
    seen.add(key);
    return row.value === values[key] ? row : { ...row, value: values[key] };
  });
  for (const [key, value] of Object.entries(values)) {
    if (!key || seen.has(key)) continue;
    if (merged.some(row => row.key.trim() === key)) continue;
    merged.push({ id: nextRowId(merged), enabled: true, key, value, description: '' });
  }
  return withTrailingRow(merged);
}

export const globalsFeature = {
  openGlobals(this: GlobalsHost & { topView: string; closeFloatingMenus: () => void }) {
    this.closeFloatingMenus();
    this.topView = 'globals';
  },

  globalVariableRows(this: GlobalsHost): KVRow[] {
    return this.globalVariables.filter(row => row.enabled && row.key.trim() !== '');
  },

  globalVariableValues(this: GlobalsHost): Record<string, string> {
    const values: Record<string, string> = {};
    for (const row of this.globalVariableRows()) values[row.key.trim()] = row.value;
    return values;
  },

  globalVariableCount(this: GlobalsHost): number {
    return this.globalVariableRows().length;
  },

  updateGlobalVariableRow(this: GlobalsHost, index: number, patch: Partial<KVRow>) {
    if (!this.guardWorkspaceWritable('Global variables')) return;
    const rows = this.globalVariables.map((row, i) => (i === index ? { ...row, ...patch } : row));
    this.globalVariables = withTrailingRow(rows);
    this.scheduleGlobalsPersist();
  },

  removeGlobalVariableRow(this: GlobalsHost, index: number) {
    if (!this.guardWorkspaceWritable('Global variables')) return;
    const rows = this.globalVariables.filter((_, i) => i !== index);
    this.globalVariables = withTrailingRow(rows);
    this.scheduleGlobalsPersist();
  },

  clearGlobalVariables(this: GlobalsHost) {
    if (!this.guardWorkspaceWritable('Global variables')) return;
    this.globalVariables = withTrailingRow([]);
    this.scheduleGlobalsPersist();
  },

  scheduleGlobalsPersist(this: GlobalsHost, delay = 360) {
    if (!this.guardWorkspaceWritable('Global variables')) return;
    const clearTimers = () => {
      if (this.globalsPersistTimer) {
        clearTimeout(this.globalsPersistTimer);
        this.globalsPersistTimer = null;
      }
      if (this.globalsSavedTimer) {
        clearTimeout(this.globalsSavedTimer);
        this.globalsSavedTimer = null;
      }
    };
    if (!this.autosave) {
      clearTimers();
      this.globalsSaveState = 'dirty';
      return;
    }
    this.globalsSaveState = 'saving';
    clearTimers();
    this.globalsPersistTimer = setTimeout(async () => {
      this.globalsPersistTimer = null;
      const ok = await this.persistRequestStore();
      this.globalsSaveState = ok ? 'saved' : 'dirty';
      if (ok) this.globalsSavedTimer = setTimeout(() => (this.globalsSaveState = 'idle'), 1800);
    }, delay);
  },

  async saveGlobals(this: GlobalsHost) {
    if (!this.guardWorkspaceWritable('Global variables')) return false;
    if (this.globalsPersistTimer) {
      clearTimeout(this.globalsPersistTimer);
      this.globalsPersistTimer = null;
    }
    this.globalsSaveState = 'saving';
    const ok = await this.persistRequestStore();
    this.globalsSaveState = ok ? 'saved' : 'dirty';
    if (ok) this.globalsSavedTimer = setTimeout(() => (this.globalsSaveState = 'idle'), 1800);
    return ok;
  },

  async syncBackendGlobals(this: GlobalsHost) {
    await setGlobalVariables(this.globalVariableValues());
  },

  // Called after a send: a script may have written globals, and those values
  // only live in the backend until they are folded back into the rows here.
  async syncGlobalsFromBackend(this: GlobalsHost) {
    const values = await getGlobalVariables();
    const next = mergeGlobalRowsWithValues(this.globalVariables, values);
    if (JSON.stringify(next) === JSON.stringify(this.globalVariables)) return false;
    this.globalVariables = next;
    await this.persistRequestStore();
    return true;
  },
};
