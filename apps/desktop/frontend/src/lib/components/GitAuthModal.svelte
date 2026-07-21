<script lang="ts">
  import { vm } from '../stores/app.svelte';
  import { openFileDialog } from '../backend';


  let method = $state<'token' | 'ssh'>('token');
  let username = $state('');
  let token = $state('');
  let sshKeyPath = $state('');
  let lastReqKey = $state('');

  $effect(() => {
    const req = vm.gitAuthRequest;
    if (!req) return;
    const key = `${req.host}|${req.scheme}|${req.tokenRejected}`;
    if (key === lastReqKey) return;
    lastReqKey = key;
    method = req.scheme === 'ssh' ? 'ssh' : 'token';
    username = req.defaultUsername || '';
    token = '';
    sshKeyPath = '';
  });

  async function pickKey() {
    const p = await openFileDialog('Select SSH private key');
    if (p) sshKeyPath = p;
  }

  const canSave = $derived(
    method === 'token' ? token.trim().length > 0 : sshKeyPath.trim().length > 0,
  );

  function save() {
    if (!canSave) return;
    if (method === 'token') {
      vm.resolveGitAuth({ kind: 'token', username: username.trim(), token: token.trim() });
    } else {
      vm.resolveGitAuth({ kind: 'ssh', sshKeyPath: sshKeyPath.trim() });
    }
  }
</script>

{#if vm.gitAuthRequest}
  {@const req = vm.gitAuthRequest}
  <div class="gitauth-backdrop" role="presentation" onmousedown={(e) => e.target === e.currentTarget && vm.resolveGitAuth(null)}>
    <div class="gitauth-modal" role="dialog" aria-modal="true" aria-labelledby="gitauth-title">
      <div class="gitauth-head">
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <rect x="3" y="7" width="10" height="6.5" rx="1.4" stroke="currentColor" stroke-width="1.4"/>
        </svg>
        <h2 id="gitauth-title">{req.tokenRejected ? 'Token expired — re-authenticate' : 'Private repository — sign in'}</h2>
        <button class="gitauth-x" type="button" aria-label="Cancel" onclick={() => vm.resolveGitAuth(null)}>×</button>
      </div>

      <p class="gitauth-host">
        {req.host || 'remote'} couldn’t be accessed without credentials.
      </p>

      {#if req.tokenRejected}
        <div class="gitauth-warn">Your previous token was rejected — it likely expired or was revoked.</div>
      {/if}

      <div class="gitauth-tabs" role="tablist">
        <button class="gitauth-tab" class:active={method === 'token'} type="button" role="tab" aria-selected={method === 'token'} onclick={() => (method = 'token')}>Access token</button>
        <button class="gitauth-tab" class:active={method === 'ssh'} type="button" role="tab" aria-selected={method === 'ssh'} onclick={() => (method = 'ssh')}>SSH key</button>
      </div>

      {#if method === 'token'}
        <label class="gitauth-field">
          <span>Username</span>
          <input type="text" bind:value={username} spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="(provider default)" />
        </label>
        <label class="gitauth-field">
          <span>Personal access token</span>
          <input type="password" bind:value={token} spellcheck="false" autocomplete="off" placeholder="ghp_… / glpat-…" />
        </label>
        <p class="gitauth-hint">Stored encrypted in your OS keychain. Never written to the repo, <code>.git/config</code>, or process arguments.</p>
      {:else}
        <div class="gitauth-field">
          <span>SSH private key</span>
          <button class="gitauth-pick" type="button" onclick={pickKey}>
            {sshKeyPath || 'Choose private key file…'}
          </button>
        </div>
        <p class="gitauth-hint">e.g. <code>~/.ssh/id_ed25519</code>. Used only for this workspace. Tip: a key already loaded into <code>ssh-agent</code> works without choosing a file — just retry.</p>
      {/if}

      <div class="gitauth-actions">
        <button class="btn-secondary btn-sm" type="button" onclick={() => vm.resolveGitAuth(null)}>Cancel</button>
        <button class="btn-primary btn-sm" type="button" onclick={save} disabled={!canSave}>Save & retry</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .gitauth-backdrop {
    position: fixed; inset: 0; z-index: 210;
    display: grid; place-items: center; padding: 24px;
    background: rgba(0,0,0,0.55);
  }
  .gitauth-modal {
    width: 420px; max-width: calc(100vw - 48px);
    border: 1px solid var(--modal-border, var(--border));
    border-radius: 12px;
    background: var(--modal-bg, var(--elevated));
    box-shadow: 0 28px 80px rgba(0,0,0,0.45);
    padding: 16px 18px 16px;
    color: var(--text);
  }
  .gitauth-head {
    display: flex; align-items: center; gap: 9px; margin-bottom: 4px;
  }
  .gitauth-head svg { color: var(--accent); flex-shrink: 0; }
  .gitauth-head h2 { font-size: 14px; font-weight: 700; margin-right: auto; }
  .gitauth-x {
    border: none; background: transparent; color: var(--text-3);
    font-size: 18px; line-height: 1; width: 26px; height: 26px; border-radius: 6px;
  }
  .gitauth-x:hover { background: var(--hover); color: var(--text); }
  .gitauth-host { color: var(--text-2); font-size: 12px; line-height: 1.5; margin: 2px 0 10px; }
  .gitauth-warn {
    font-size: 11.5px; color: var(--delete);
    background: color-mix(in srgb, var(--delete) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--delete) 35%, transparent);
    border-radius: 7px; padding: 7px 10px; margin-bottom: 10px;
  }
  .gitauth-tabs { display: inline-flex; gap: 3px; padding: 3px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); margin-bottom: 12px; }
  .gitauth-tab {
    border: none; background: transparent; color: var(--text-2);
    font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 6px;
  }
  .gitauth-tab:hover { color: var(--text); background: var(--hover); }
  .gitauth-tab.active {
    color: var(--accent-hover);
    background: color-mix(in srgb, var(--accent) 16%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 42%, transparent);
  }
  .gitauth-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; }
  .gitauth-field > span { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-3); }
  .gitauth-field input {
    height: 34px; padding: 0 11px; border: 1px solid var(--border); border-radius: 8px;
    background: var(--surface); color: var(--text); outline: none; font-size: 13px;
  }
  .gitauth-field input:focus { border-color: var(--accent-hover); box-shadow: 0 0 0 2px var(--accent-dim); }
  .gitauth-pick {
    height: 34px; padding: 0 11px; border: 1px dashed var(--border); border-radius: 8px;
    background: var(--surface); color: var(--text-2); text-align: left; font-size: 13px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .gitauth-pick:hover { border-color: var(--accent-hover); color: var(--text); }
  .gitauth-hint { font-size: 11px; color: var(--text-3); line-height: 1.55; margin: -2px 0 12px; }
  .gitauth-hint code { font-family: var(--font-mono, monospace); font-size: 10.5px; }
  .gitauth-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .gitauth-actions .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
