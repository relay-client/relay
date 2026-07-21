<script lang="ts">
  import { tabListKeyboard } from '../a11y';
  import { vm } from '../stores/app.svelte';
  import { scriptLineCount } from '../utils';
  import CodeEditor from '../CodeEditor.svelte';

  const isJs = $derived(vm.scriptEngine === 'js');
  const engineLabel = $derived(isJs ? 'JavaScript' : 'Tengo');

  const preRef = $derived(
    isJs
      ? [
          'pm.environment.set("baseUrl", "https://…")',
          'pm.variables.set("key", "val")',
          'pm.request.headers.set("X-Token", pm.environment.get("token"))',
          'pm.request.params.set("v", "2")',
          'pm.request.set_url("https://…")',
          'console.log("msg")',
        ]
      : [
          'pm.environment.set("baseUrl", "https://…")',
          'pm.variables.set("key", "val")',
          'pm.request.headers.set("X-Token", pm.environment.get("token"))',
          'pm.request.params.set("v", "2")',
          'pm.request.set_url("https://…")',
          'pm.log("msg")',
        ],
  );

  const testRef = $derived(
    isJs
      ? [
          'pm.test("Status 200", () => pm.expect(pm.response.code).to.eql(200))',
          'pm.test("Fast", () => pm.expect(pm.response.responseTime).to.be.below(500))',
          'const data = pm.response.json()',
          'pm.test("Has id", () => pm.expect(data.id).to.exist)',
          'pm.test("id==1", () => pm.expect(data.id).to.eql(1))',
          'pm.variables.set("id", String(data.id))',
        ]
      : [
          'pm.test("Status 200", pm.response.code == 200)',
          'pm.test("Fast", pm.response.time < 500)',
          'data := pm.response.json()',
          'pm.test("Has id", pm.expect(data["id"]).exists())',
          'pm.test("id==1", pm.expect(data["id"]).equal(1))',
          'pm.variables.set("id", string(data["id"]))',
        ],
  );

  const prePlaceholder = $derived(
    isJs
      ? '// Pre-request script (JavaScript) pm.environment.set("baseUrl", "https://api.example.com")'
      : '// Pre-request script (Tengo) pm.environment.set("baseUrl", "https://api.example.com")',
  );

  const testPlaceholder = $derived(
    isJs
      ? '// Test script (JavaScript) pm.test("Status is 200", () => pm.expect(pm.response.code).to.eql(200))'
      : '// Test script (Tengo) pm.test("Status is 200", pm.response.code == 200)',
  );
</script>

<div class="script-section">
  <div class="subtabs" role="tablist" use:tabListKeyboard>
    <button role="tab" class:active={vm.scriptTab === 'pre-request'} aria-selected={vm.scriptTab === 'pre-request'} tabindex={vm.scriptTab === 'pre-request' ? 0 : -1} type="button" onclick={() => (vm.scriptTab = 'pre-request')}>
      Pre-request{#if scriptLineCount(vm.activePreRequestScript) > 0}<span class="badge badge-script">{scriptLineCount(vm.activePreRequestScript)}L</span>{/if}
    </button>
    <button role="tab" class:active={vm.scriptTab === 'tests'} aria-selected={vm.scriptTab === 'tests'} tabindex={vm.scriptTab === 'tests' ? 0 : -1} type="button" onclick={() => (vm.scriptTab = 'tests')}>
      Tests{#if scriptLineCount(vm.activeTestScript) > 0}<span class="badge badge-script">{scriptLineCount(vm.activeTestScript)}L</span>{/if}
    </button>
  </div>
  {#if vm.scriptTab === 'pre-request'}
    <div class="script-toolbar">
      <span class="script-lang-badge">{engineLabel}</span>
      <span class="script-hint">Runs before the request is sent · Modify URL, headers, params</span>
    </div>
    <div class="script-ref">
      <span class="ref-title">Reference</span>
      {#each preRef as snippet}<code>{snippet}</code>{/each}
    </div>
    <CodeEditor
      bind:value={vm.activePreRequestScript}
      language="javascript"
      placeholder={prePlaceholder}
      minHeight="140px"
      maxHeight="240px"
      testId="pre-request-script-editor"
      ariaLabel="Pre-request script editor"
    />
  {:else}
    <div class="script-toolbar">
      <span class="script-lang-badge">{engineLabel}</span>
      <span class="script-hint">Runs after the response is received</span>
    </div>
    <div class="script-ref">
      <span class="ref-title">Reference</span>
      {#each testRef as snippet}<code>{snippet}</code>{/each}
    </div>
    <CodeEditor
      bind:value={vm.activeTestScript}
      language="javascript"
      placeholder={testPlaceholder}
      minHeight="140px"
      maxHeight="240px"
      testId="test-script-editor"
      ariaLabel="Test script editor"
    />
  {/if}
</div>
