<script lang="ts">
  import { tabListKeyboard } from '../a11y';
  import { COLLECTION_AUTH_OPTIONS } from '../constants';
  import { HEADER_PICKER_NAMES, getHeaderValues } from '../headers';
  import { collectionSettingsFingerprint, emptyCollectionDefaults, normalizeCollectionDefaults } from '../collectionDefaults';
  import { activeCount, cloneRowsForStore, guardTrailing, removeRow, restoreRows, scriptLineCount } from '../utils';
  import type { AuthState, Collection, CollectionDefaults, KVRow, RequestSettings, ScriptEngine } from '../types/models';
  import type { VariableSuggestion } from '../variables';
  import CodeEditor from '../CodeEditor.svelte';
  import Select from './Select.svelte';
  import VariableInput from './VariableInput.svelte';

  type CollectionSettingsTab = 'overview' | 'headers' | 'vars' | 'auth' | 'script' | 'tests' | 'proxy';
  type CollectionSettingsPatch = Pick<Collection, 'name' | 'description' | 'defaults'> & { baseFingerprint?: string };

  const HTTP_VERSION_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: '1.1', label: 'HTTP/1.1' },
    { value: '2', label: 'HTTP/2 preferred' },
  ];



  const AUTOSAVE_DEBOUNCE_MS = 1200;

  let {
    collection,
    requestCount = 0,
    collectionSettingsTab = $bindable<CollectionSettingsTab>('overview'),
    autosave = false,
    saveState = 'idle',
    workspaceBlocked = false,
    variableSuggestions = [],
    scriptEngine = 'js',
    onSave,
    onReset,
    onCreateRequest,
  }: {
    collection: Collection | undefined;
    requestCount?: number;
    collectionSettingsTab: CollectionSettingsTab;
    autosave?: boolean;
    saveState?: 'idle' | 'saving' | 'saved';
    workspaceBlocked?: boolean;
    variableSuggestions?: VariableSuggestion[];
    scriptEngine?: ScriptEngine;
    onSave: (collectionId: string, patch: CollectionSettingsPatch) => boolean | void | Promise<boolean | void>;
    onReset: (collectionId: string) => boolean | Promise<boolean>;
    onCreateRequest: (collectionId: string) => void | Promise<void>;
  } = $props();

  let loadedCollectionId = $state('');
  let loadedFingerprint = $state('');
  let externalUpdate = $state(false);
  let name = $state('');
  let description = $state('');
  let headers = $state<KVRow[]>([]);
  let variables = $state<KVRow[]>([]);
  let auth = $state<AuthState>(emptyCollectionDefaults().auth);
  let preRequestScript = $state('');
  let testScript = $state('');
  let preRequestScriptJs = $state('');
  let testScriptJs = $state('');
  let settings = $state<RequestSettings>(emptyCollectionDefaults().settings);

  const engineLabel = $derived(scriptEngine === 'js' ? 'JavaScript' : 'Tengo');
  const activePre = $derived(scriptEngine === 'js' ? preRequestScriptJs : preRequestScript);
  const activeTest = $derived(scriptEngine === 'js' ? testScriptJs : testScript);
  let authMenuOpen = $state(false);
  let savingInFlight = $state(false);
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  const saved = $derived(saveState === 'saved');

  $effect(() => {
    if (!collection) return;
    const incomingFingerprint = collectionSettingsFingerprint(collection);
    if (collection.id !== loadedCollectionId) {
      loadCollection(collection);
      return;
    }


    if (savingInFlight) return;
    if (incomingFingerprint !== loadedFingerprint) {
      if (draftFingerprint() === loadedFingerprint) {
        loadCollection(collection);
      } else {
        externalUpdate = true;
      }
    }
  });

  $effect(() => {
    if (!autosave || !collection || workspaceBlocked || externalUpdate || savingInFlight) return;

    if (draftFingerprint() === loadedFingerprint) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      void save();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
    };
  });

  function loadCollection(next: Collection) {
    const defaults = normalizeCollectionDefaults(next.defaults);
    loadedCollectionId = next.id;
    loadedFingerprint = collectionSettingsFingerprint(next);
    externalUpdate = false;
    name = next.name;
    description = next.description ?? '';
    headers = restoreRows(defaults.headers);
    variables = restoreRows(defaults.variables);
    auth = { ...defaults.auth };
    preRequestScript = defaults.preRequestScript;
    testScript = defaults.testScript;
    preRequestScriptJs = defaults.preRequestScriptJs;
    testScriptJs = defaults.testScriptJs;
    settings = { ...defaults.settings };
    authMenuOpen = false;
  }

  function inputValue(event: Event): string {
    const target = event.currentTarget;
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value : '';
  }

  function inputNumber(event: Event): number {
    const target = event.currentTarget;
    return target instanceof HTMLInputElement ? Number(target.value) : 0;
  }

  function draftDefaults(): CollectionDefaults {
    return normalizeCollectionDefaults({
      headers: cloneRowsForStore(headers),
      variables: cloneRowsForStore(variables),
      auth,
      preRequestScript,
      testScript,
      preRequestScriptJs,
      testScriptJs,
      settings,
    });
  }

  function draftFingerprint(): string {
    return collectionSettingsFingerprint({
      name,
      description,
      defaults: draftDefaults(),
    });
  }

  async function save() {
    if (!collection || savingInFlight) return;
    const baseFingerprint = loadedFingerprint;
    savingInFlight = true;
    try {
      const didSave = await onSave(collection.id, {
        name,
        description,
        defaults: draftDefaults(),
        baseFingerprint,
      });
      if (didSave === false) return;


      loadedFingerprint = collectionSettingsFingerprint(collection);
      externalUpdate = false;
    } finally {
      savingInFlight = false;
    }
  }

  async function reset() {
    if (!collection || savingInFlight) return;
    savingInFlight = true;
    try {
      const didReset = await onReset(collection.id);
      if (!didReset) return;
      const defaults = emptyCollectionDefaults();
      headers = restoreRows(defaults.headers);
      variables = restoreRows(defaults.variables);
      auth = { ...defaults.auth };
      preRequestScript = '';
      testScript = '';
      settings = { ...defaults.settings };
      loadedFingerprint = collectionSettingsFingerprint(collection);
      externalUpdate = false;
    } finally {
      savingInFlight = false;
    }
  }
</script>

<section class="collection-workspace">
  {#if collection}
    <div class="collection-workspace-head">
      <div>
        <span class="overview-eyebrow">Collection</span>
        <h1>{collection.name}</h1>
        <p>{requestCount} request{requestCount === 1 ? '' : 's'} · defaults are applied when requests are sent</p>
      </div>
      <div class="overview-actions">
        {#if externalUpdate}
          <span class="env-save-indicator">Updated elsewhere</span>
          <button class="btn-secondary btn-sm" type="button" onclick={() => loadCollection(collection)} disabled={workspaceBlocked}>Reload</button>
        {:else if autosave && saveState !== 'idle'}
          <span class="env-save-indicator" class:saved={saveState === 'saved'}>{saveState === 'saving' ? 'Saving changes…' : 'Saved'}</span>
        {:else if !autosave && saved}
          <span class="env-save-indicator saved">Saved</span>
        {/if}
        <button class="btn-secondary btn-sm" type="button" onclick={() => onCreateRequest(collection.id)} disabled={workspaceBlocked}>New request</button>
        <button class="btn-secondary btn-sm" type="button" onclick={reset} disabled={workspaceBlocked}>Reset defaults</button>
        {#if !autosave}
          <button class="btn-primary btn-sm" class:feedback-ok={saved} type="button" onclick={save} disabled={workspaceBlocked}>{saved ? 'Saved' : 'Save'}</button>
        {/if}
      </div>
    </div>

    <div class="collection-settings-shell">
      <div class="tabs collection-tabs" role="tablist" use:tabListKeyboard>
        <button role="tab" class:active={collectionSettingsTab === 'overview'} aria-selected={collectionSettingsTab === 'overview'} tabindex={collectionSettingsTab === 'overview' ? 0 : -1} type="button" onclick={() => (collectionSettingsTab = 'overview')}>Overview</button>
        <button role="tab" class:active={collectionSettingsTab === 'headers'} aria-selected={collectionSettingsTab === 'headers'} tabindex={collectionSettingsTab === 'headers' ? 0 : -1} type="button" onclick={() => (collectionSettingsTab = 'headers')}>Headers{#if activeCount(headers) > 0}<span class="badge">{activeCount(headers)}</span>{/if}</button>
        <button role="tab" class:active={collectionSettingsTab === 'vars'} aria-selected={collectionSettingsTab === 'vars'} tabindex={collectionSettingsTab === 'vars' ? 0 : -1} type="button" onclick={() => (collectionSettingsTab = 'vars')}>Vars{#if activeCount(variables) > 0}<span class="badge">{activeCount(variables)}</span>{/if}</button>
        <button role="tab" class:active={collectionSettingsTab === 'auth'} aria-selected={collectionSettingsTab === 'auth'} tabindex={collectionSettingsTab === 'auth' ? 0 : -1} type="button" onclick={() => (collectionSettingsTab = 'auth')}>Auth{#if auth.type !== 'none'}<span class="badge badge-on">On</span>{/if}</button>
        <button role="tab" class:active={collectionSettingsTab === 'script'} aria-selected={collectionSettingsTab === 'script'} tabindex={collectionSettingsTab === 'script' ? 0 : -1} type="button" onclick={() => (collectionSettingsTab = 'script')}>Script{#if scriptLineCount(activePre) > 0}<span class="badge badge-script">{scriptLineCount(activePre)}L</span>{/if}</button>
        <button role="tab" class:active={collectionSettingsTab === 'tests'} aria-selected={collectionSettingsTab === 'tests'} tabindex={collectionSettingsTab === 'tests' ? 0 : -1} type="button" onclick={() => (collectionSettingsTab = 'tests')}>Tests{#if scriptLineCount(activeTest) > 0}<span class="badge badge-script">{scriptLineCount(activeTest)}L</span>{/if}</button>
        <button role="tab" class:active={collectionSettingsTab === 'proxy'} aria-selected={collectionSettingsTab === 'proxy'} tabindex={collectionSettingsTab === 'proxy' ? 0 : -1} type="button" onclick={() => (collectionSettingsTab = 'proxy')}>Proxy</button>
      </div>

      <div class="collection-settings-content">
        {#if collectionSettingsTab === 'overview'}
          <div class="collection-overview-grid">
            <label class="collection-field">
              <span>Name</span>
              <input class="field-input" value={name} oninput={(event) => (name = inputValue(event))} spellcheck="false" />
            </label>
            <label class="collection-field collection-field-wide">
              <span>Documentation</span>
              <textarea value={description} oninput={(event) => (description = inputValue(event))} placeholder="Collection notes, auth hints, links, or API conventions…" spellcheck="false"></textarea>
            </label>
            <div class="collection-summary-row">
              <div><strong>{activeCount(headers)}</strong><span>default headers</span></div>
              <div><strong>{activeCount(variables)}</strong><span>collection vars</span></div>
              <div><strong>{auth.type === 'none' ? 'No' : 'Yes'}</strong><span>default auth</span></div>
              <div><strong>{scriptLineCount(preRequestScript) + scriptLineCount(testScript)}</strong><span>script lines</span></div>
            </div>
          </div>
        {:else if collectionSettingsTab === 'headers'}
          <div class="request-section-bar">
            <span class="request-section-title">Default headers</span>
            <span class="request-section-meta">Request headers with the same key override these defaults</span>
          </div>
          <div class="kv-table collection-kv-table" style="--kw: 220px; --vw: 260px">
            <div class="kv-head">
              <span></span>
              <span class="kv-head-cell">Key</span>
              <span class="kv-head-cell">Value</span>
              <span class="kv-head-cell">Description</span>
              <span></span>
            </div>
            {#each headers as row, i (row.id)}
              <div class="kv-row" class:inactive-row={!row.enabled && (row.key || row.value || row.description)}>
                <input type="checkbox" class="kv-check" bind:checked={row.enabled} aria-label="Enable header" disabled={!row.key && !row.value} />
                <VariableInput className="kv-input" bind:value={row.key} suggestions={variableSuggestions} placeholder="Header" pickerOptions={HEADER_PICKER_NAMES} pickerLabel="Header names" oninput={() => guardTrailing(headers, i)} />
                <VariableInput className="kv-input" bind:value={row.value} suggestions={variableSuggestions} placeholder="Value" pickerOptions={getHeaderValues(row.key)} pickerLabel="Header values" oninput={() => guardTrailing(headers, i)} />
                <input class="kv-input kv-desc" bind:value={row.description} placeholder="Description" />
                <button class="kv-del" type="button" onclick={() => removeRow(headers, i)} aria-label="Remove header">✕</button>
              </div>
            {/each}
          </div>
        {:else if collectionSettingsTab === 'vars'}
          <div class="request-section-bar">
            <span class="request-section-title">Collection variables</span>
            <span class="request-section-meta">Use as {'{{variableName}}'}; active environment values take precedence</span>
          </div>
          <div class="environment-editor-card collection-vars-card">
            <div class="kv-head env-kv-head">
              <span></span>
              <span>Variable</span>
              <span>Type</span>
              <span>Value</span>
              <span>Description</span>
              <span></span>
            </div>
            {#each variables as row, i (row.id)}
              <div class="kv-row env-kv-row" class:inactive-row={!row.enabled && (row.key || row.value || row.description)}>
                <input type="checkbox" class="kv-check" bind:checked={row.enabled} aria-label="Enable variable" disabled={!row.key && !row.value} />
                <input class="kv-input" bind:value={row.key} placeholder="baseUrl" oninput={() => guardTrailing(variables, i)} spellcheck="false" />
                <button class="env-type-toggle" class:secret={row.secret} type="button" onclick={() => (row.secret = !row.secret)} disabled={!row.key && !row.value}>{row.secret ? 'Secret' : 'Default'}</button>
                <input class="kv-input" type={row.secret ? 'password' : 'text'} bind:value={row.value} placeholder="https://api.example.com" oninput={() => guardTrailing(variables, i)} spellcheck="false" autocomplete="off" />
                <input class="kv-input kv-desc" bind:value={row.description} placeholder="Description" />
                <button class="kv-del" type="button" onclick={() => removeRow(variables, i)} aria-label="Remove variable">✕</button>
              </div>
            {/each}
          </div>
        {:else if collectionSettingsTab === 'auth'}
          <div class="auth-section collection-auth-section">
            <div class="auth-type-column">
              <span class="field-label">Auth Type</span>
              <div class="auth-select">
                <button class="auth-select-trigger" type="button" onclick={() => (authMenuOpen = !authMenuOpen)} aria-label="Auth Type" aria-expanded={authMenuOpen}>
                  <span>{COLLECTION_AUTH_OPTIONS.find(option => option.value === auth.type)?.label ?? 'No Auth'}</span>
                  <svg width="10" height="7" viewBox="0 0 10 7" fill="none" aria-hidden="true"><path d="M1.5 2L5 5.5L8.5 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </button>
                {#if authMenuOpen}
                  <div class="auth-select-menu">
                    {#each COLLECTION_AUTH_OPTIONS as option}
                      <button class:active={auth.type === option.value} type="button" onclick={() => { auth.type = option.value; authMenuOpen = false; }}>
                        {#if auth.type === option.value}<span class="auth-check">✓</span>{:else}<span class="auth-check"></span>{/if}
                        <span>{option.label}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
            <div class="auth-fields">
              {#if auth.type === 'bearer'}
                <label class="field-label" for="collection-bearer-token">Token</label>
                <input id="collection-bearer-token" class="field-input field-mono" type="password" bind:value={auth.bearerToken} placeholder="Bearer token" spellcheck="false" />
              {:else if auth.type === 'basic' || auth.type === 'digest'}
                <label class="field-label" for="collection-auth-user">Username</label>
                <input id="collection-auth-user" class="field-input" bind:value={auth.basicUser} spellcheck="false" />
                <label class="field-label" for="collection-auth-pass">Password</label>
                <input id="collection-auth-pass" class="field-input" bind:value={auth.basicPass} type="password" />
              {:else if auth.type === 'apikey'}
                <label class="field-label" for="collection-apikey-name">Key name</label>
                <input id="collection-apikey-name" class="field-input" bind:value={auth.apiKeyName} spellcheck="false" />
                <label class="field-label" for="collection-apikey-value">Key value</label>
                <input id="collection-apikey-value" class="field-input field-mono" type="password" bind:value={auth.apiKeyValue} spellcheck="false" />
                <span class="field-label">Add to</span>
                <div class="radio-group">
                  <label class="radio-label"><input type="radio" bind:group={auth.apiKeyIn} value="header" /> Header</label>
                  <label class="radio-label"><input type="radio" bind:group={auth.apiKeyIn} value="query" /> Query string</label>
                </div>
              {:else if auth.type === 'oauth2'}
                <label class="field-label" for="collection-oauth-url">Token URL</label>
                <input id="collection-oauth-url" class="field-input" bind:value={auth.oauth2TokenURL} spellcheck="false" />
                <label class="field-label" for="collection-oauth-id">Client ID</label>
                <input id="collection-oauth-id" class="field-input" bind:value={auth.oauth2ClientID} spellcheck="false" />
                <label class="field-label" for="collection-oauth-secret">Client Secret</label>
                <input id="collection-oauth-secret" class="field-input" bind:value={auth.oauth2Secret} type="password" />
                <label class="field-label" for="collection-oauth-scope">Scope</label>
                <input id="collection-oauth-scope" class="field-input" bind:value={auth.oauth2Scope} spellcheck="false" />
              {:else if auth.type === 'aws'}
                <div class="auth-grid-2">
                  <div><label class="field-label" for="collection-aws-key">Access Key ID</label><input id="collection-aws-key" class="field-input field-mono" bind:value={auth.awsAccessKey} spellcheck="false" /></div>
                  <div><label class="field-label" for="collection-aws-secret">Secret Access Key</label><input id="collection-aws-secret" class="field-input field-mono" bind:value={auth.awsSecretKey} type="password" /></div>
                  <div><label class="field-label" for="collection-aws-region">Region</label><input id="collection-aws-region" class="field-input" bind:value={auth.awsRegion} spellcheck="false" /></div>
                  <div><label class="field-label" for="collection-aws-service">Service</label><input id="collection-aws-service" class="field-input" bind:value={auth.awsService} spellcheck="false" /></div>
                </div>
              {:else}
                <p class="auth-none-hint">Requests in this collection use their own auth unless a default is configured here.</p>
              {/if}
            </div>
          </div>
        {:else if collectionSettingsTab === 'script'}
          <div class="script-section collection-script-section">
            <div class="script-toolbar"><span class="script-lang-badge">{engineLabel}</span><span class="script-hint">Runs before each request's own pre-request script</span></div>
            {#if scriptEngine === 'js'}
              <CodeEditor bind:value={preRequestScriptJs} language="javascript" placeholder={'// Collection pre-request script (JavaScript) pm.variables.set("traceId", "relay-001")'} minHeight="280px" maxHeight="520px" />
            {:else}
              <CodeEditor bind:value={preRequestScript} language="javascript" placeholder={'// Collection pre-request script (Tengo) pm.variables.set("traceId", "relay-001")'} minHeight="280px" maxHeight="520px" />
            {/if}
          </div>
        {:else if collectionSettingsTab === 'tests'}
          <div class="script-section collection-script-section">
            <div class="script-toolbar"><span class="script-lang-badge">{engineLabel}</span><span class="script-hint">Runs before each request's own test script after the response arrives</span></div>
            {#if scriptEngine === 'js'}
              <CodeEditor bind:value={testScriptJs} language="javascript" placeholder={'// Collection test script (JavaScript) pm.test("No server error", () => pm.expect(pm.response.code).to.be.below(500))'} minHeight="280px" maxHeight="520px" />
            {:else}
              <CodeEditor bind:value={testScript} language="javascript" placeholder={'// Collection test script (Tengo) pm.test("No server error", pm.response.code < 500)'} minHeight="280px" maxHeight="520px" />
            {/if}
          </div>
        {:else if collectionSettingsTab === 'proxy'}
          <div class="settings-section collection-proxy-section">
            <div class="settings-list">
              <label class="postman-setting">
                <span class="setting-copy"><strong>HTTP version</strong><span>Used when a request keeps its default HTTP version.</span></span>
                <Select bind:value={settings.httpVersion} options={HTTP_VERSION_OPTIONS} className="setting-select" />
              </label>
              <label class="postman-setting">
                <span class="setting-copy"><strong>Enable SSL certificate verification</strong><span>Verify TLS certificates by default for this collection.</span></span>
                <span class="switch-control"><input type="checkbox" bind:checked={settings.enableSSLVerification} /><span class="switch-track"></span><span class="switch-state">{settings.enableSSLVerification ? 'ON' : 'OFF'}</span></span>
              </label>
              <label class="postman-setting">
                <span class="setting-copy"><strong>Automatically follow redirects</strong><span>Follow HTTP 3xx responses unless a request overrides it.</span></span>
                <span class="switch-control"><input type="checkbox" bind:checked={settings.followRedirects} /><span class="switch-track"></span><span class="switch-state">{settings.followRedirects ? 'ON' : 'OFF'}</span></span>
              </label>
              <label class="postman-setting">
                <span class="setting-copy"><strong>Maximum number of redirects</strong><span>Stop following redirects after this many hops.</span></span>
                <input class="setting-number" type="number" value={settings.maxRedirects} min="0" max="50" step="1" disabled={!settings.followRedirects} oninput={(event) => (settings.maxRedirects = inputNumber(event))} />
              </label>
              <label class="postman-setting">
                <span class="setting-copy"><strong>Request timeout</strong><span>Abort requests when they take longer than this value.</span></span>
                <span class="setting-inline-number"><input class="setting-number" type="number" value={settings.timeoutMs} min="100" max="300000" step="1000" oninput={(event) => (settings.timeoutMs = inputNumber(event))} /><span>ms</span></span>
              </label>
              <label class="postman-setting">
                <span class="setting-copy"><strong>HTTP proxy</strong><span>Route requests through a proxy. Leave empty to use system proxy settings.</span></span>
                <input class="kv-input setting-proxy" type="text" placeholder="http://localhost:8080" bind:value={settings.proxyUrl} spellcheck="false" autocomplete="off" />
              </label>
              <label class="postman-setting">
                <span class="setting-copy"><strong>Browser request emulation</strong><span>Send browser-like Origin, User-Agent, and Sec-Fetch headers by default.</span></span>
                <span class="switch-control"><input type="checkbox" bind:checked={settings.browserEmulation} /><span class="switch-track"></span><span class="switch-state">{settings.browserEmulation ? 'ON' : 'OFF'}</span></span>
              </label>
              <label class="postman-setting">
                <span class="setting-copy"><strong>Browser origin</strong><span>Default page origin for CORS and CSP checks.</span></span>
                <input class="kv-input setting-proxy" type="text" placeholder="http://localhost:5173" bind:value={settings.browserOrigin} spellcheck="false" autocomplete="off" />
              </label>
              <label class="postman-setting">
                <span class="setting-copy"><strong>Include browser credentials</strong><span>Require credentialed CORS rules by default.</span></span>
                <span class="switch-control"><input type="checkbox" bind:checked={settings.browserWithCredentials} /><span class="switch-track"></span><span class="switch-state">{settings.browserWithCredentials ? 'ON' : 'OFF'}</span></span>
              </label>
              <label class="postman-setting">
                <span class="setting-copy"><strong>Enforce CORS</strong><span>Run browser-style preflight and response checks by default.</span></span>
                <span class="switch-control"><input type="checkbox" bind:checked={settings.browserEnforceCORS} /><span class="switch-track"></span><span class="switch-state">{settings.browserEnforceCORS ? 'ON' : 'OFF'}</span></span>
              </label>
              <label class="postman-setting">
                <span class="setting-copy"><strong>Enforce CSP connect-src</strong><span>Block requests that the page policy would reject.</span></span>
                <span class="switch-control"><input type="checkbox" bind:checked={settings.browserEnforceCSP} /><span class="switch-track"></span><span class="switch-state">{settings.browserEnforceCSP ? 'ON' : 'OFF'}</span></span>
              </label>
              <label class="postman-setting postman-setting-tall">
                <span class="setting-copy"><strong>CSP policy</strong><span>Default page Content-Security-Policy for connect-src checks.</span></span>
                <textarea class="setting-textarea" bind:value={settings.browserCSP} spellcheck="false"></textarea>
              </label>
              <label class="postman-setting">
                <span class="setting-copy"><strong>Disable cookie jar</strong><span>Prevent cookies from being stored and reused by default.</span></span>
                <span class="switch-control"><input type="checkbox" bind:checked={settings.disableCookieJar} /><span class="switch-track"></span><span class="switch-state">{settings.disableCookieJar ? 'ON' : 'OFF'}</span></span>
              </label>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="environment-empty-main">
      <span>No collection selected</span>
      <small>Open a collection from the sidebar to edit its defaults.</small>
    </div>
  {/if}
</section>
