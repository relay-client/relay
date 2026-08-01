<script lang="ts">
  import { tabListKeyboard } from '../a11y';
  import { vm } from '../stores/app.svelte';
  import { scriptLineCount } from '../utils';
  import { appendSnippet, preRequestSnippets, testSnippets } from '../scriptSnippets';
  import CodeEditor from '../CodeEditor.svelte';

  const isJs = $derived(vm.scriptEngine === 'js');
  const engineLabel = $derived(isJs ? 'JavaScript' : 'Tengo');

  const preSnippets = $derived(preRequestSnippets(vm.scriptEngine));
  const testSnippetList = $derived(testSnippets(vm.scriptEngine));

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
      <span class="script-hint">Runs before the request is sent · Modify URL, headers, params, body</span>
    </div>
    <div class="script-ref">
      <span class="ref-title">Snippets</span>
      {#each preSnippets as snippet (snippet.label)}
        <button
          class="script-snippet"
          type="button"
          title={snippet.code}
          aria-label="Insert snippet: {snippet.label}"
          data-testid="script-snippet"
          onclick={() => (vm.activePreRequestScript = appendSnippet(vm.activePreRequestScript, snippet.code))}
        >
          {snippet.label}
        </button>
      {/each}
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
      <span class="ref-title">Snippets</span>
      {#each testSnippetList as snippet (snippet.label)}
        <button
          class="script-snippet"
          type="button"
          title={snippet.code}
          aria-label="Insert snippet: {snippet.label}"
          data-testid="script-snippet"
          onclick={() => (vm.activeTestScript = appendSnippet(vm.activeTestScript, snippet.code))}
        >
          {snippet.label}
        </button>
      {/each}
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
