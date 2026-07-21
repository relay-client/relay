<script lang="ts">
  import { vm } from '../stores/app.svelte';
  import { AUTH_OPTIONS } from '../constants';
  import { decodeJwt, formatJwtClaimValue, formatJwtNumericDate, jwtClaimRows, jwtHeaderRows, jwtTokenState } from '../jwt';

  let jwtInspectorOpen = $state(false);
  let bearerTokenVisible = $state(false);
  let bearerTokenForJwt = $derived(vm.resolveTemplate(vm.bearerToken, vm.activeEnvironmentValues()));
  let jwtDecoded = $derived(decodeJwt(bearerTokenForJwt));
  let jwtState = $derived(jwtDecoded.ok ? jwtTokenState(jwtDecoded.payload) : null);
  const GRPC_AUTH_OPTIONS = [
    { value: 'apikey', label: 'API Key' },
    { value: 'basic', label: 'Basic Auth' },
    { value: 'bearer', label: 'Bearer Token' },
    { value: 'oauth2', label: 'OAuth 2.0' },
    { value: 'none', label: 'No Auth' },
  ] as const;
  let authOptions = $derived(vm.requestType === 'grpc' ? GRPC_AUTH_OPTIONS : AUTH_OPTIONS);

  let oauth2ExpiryLabel = $derived.by(() => {
    if (!vm.oauth2TokenExpiry) return '';
    const ms = vm.oauth2TokenExpiry - Date.now();
    if (ms <= 0) return 'Token expired — it will refresh on the next send';
    const minutes = Math.round(ms / 60000);
    if (minutes >= 60) return `Expires in ~${Math.round(minutes / 60)}h`;
    if (minutes >= 1) return `Expires in ~${minutes}m`;
    return 'Expires in <1m';
  });

  function selectInputText(event: MouseEvent) {
    const target = event.currentTarget;
    if (target instanceof HTMLInputElement) target.select();
  }
</script>

<div class="auth-section">
  <div class="auth-type-column">
    <span class="field-label">Auth Type</span>
    <div class="auth-select">
      <button class="auth-select-trigger" type="button" onclick={vm.toggleAuthMenu} aria-label="Auth Type" aria-expanded={vm.authMenuOpen}>
        <span>{vm.authLabel()}</span>
        <svg width="10" height="7" viewBox="0 0 10 7" fill="none" aria-hidden="true">
          <path d="M1.5 2L5 5.5L8.5 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      {#if vm.authMenuOpen}
        <div class="auth-select-menu" class:grpc-auth-menu={vm.requestType === 'grpc'}>
          {#each authOptions as option}
            <button class:active={vm.authType === option.value} class:auth-option-separated={vm.requestType === 'grpc' && option.value === 'none'} type="button" onclick={() => vm.selectAuthType(option.value)}>
              {#if vm.authType === option.value}<span class="auth-check">✓</span>{:else}<span class="auth-check"></span>{/if}
              <span>{option.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
  <div class="auth-fields">
    {#if vm.authType === 'bearer'}
      <label class="field-label" for="bearer-token">Token</label>
      <div class="bearer-token-row">
        <div class="bearer-token-input-wrap">
          <input id="bearer-token" class="field-input field-mono" type={bearerTokenVisible ? 'text' : 'password'} bind:value={vm.bearerToken} placeholder="Enter bearer token" spellcheck="false" />
          <button
            class="token-visibility-btn"
            type="button"
            aria-label={bearerTokenVisible ? 'Hide token' : 'Show token'}
            aria-pressed={bearerTokenVisible}
            title={bearerTokenVisible ? 'Hide token' : 'Show token'}
            onclick={() => (bearerTokenVisible = !bearerTokenVisible)}
          >
            {#if bearerTokenVisible}
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 2l12 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                <path d="M6.2 6.4a2.1 2.1 0 002.9 2.9M9.4 5.1A2.1 2.1 0 0111 7.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                <path d="M6.9 3.4A7.5 7.5 0 018 3.3c3.4 0 5.7 2.5 6.5 3.7a1.2 1.2 0 010 1.3 10.6 10.6 0 01-1.6 1.8M4.6 4.3A10.8 10.8 0 001.5 7a1.2 1.2 0 000 1.3c.8 1.2 3.1 3.7 6.5 3.7a7.4 7.4 0 003-.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            {:else}
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M1.5 7.2C2.3 6 4.6 3.5 8 3.5s5.7 2.5 6.5 3.7a1.2 1.2 0 010 1.3c-.8 1.2-3.1 3.7-6.5 3.7S2.3 9.7 1.5 8.5a1.2 1.2 0 010-1.3z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                <path d="M8 9.8a2.1 2.1 0 100-4.2 2.1 2.1 0 000 4.2z" stroke="currentColor" stroke-width="1.4"/>
              </svg>
            {/if}
          </button>
        </div>
        <button class="btn-secondary btn-sm" type="button" onclick={() => (jwtInspectorOpen = !jwtInspectorOpen)}>
          {jwtInspectorOpen ? 'Hide' : 'Decode'}
        </button>
      </div>
      {#if jwtInspectorOpen}
        <div class="jwt-inspector" class:jwt-inspector-error={!jwtDecoded.ok}>
          {#if jwtDecoded.ok}
            <div class="jwt-inspector-top">
              <span class="jwt-badge">JWT</span>
              {#if jwtState}
                <span class="jwt-state" class:expired={jwtState.state === 'expired'} class:not-yet-valid={jwtState.state === 'not-yet-valid'}>{jwtState.label}</span>
              {/if}
              <span class="jwt-note">Signature not verified</span>
            </div>
            <div class="jwt-sections">
              <section class="jwt-section">
                <h3>Header</h3>
                <div class="jwt-claims">
                  {#each jwtHeaderRows(jwtDecoded.header) as [key, value]}
                    <div class="jwt-claim-row">
                      <span class="jwt-claim-key">{key}</span>
                      <span class="jwt-claim-value">{formatJwtClaimValue(value)}</span>
                    </div>
                  {/each}
                </div>
              </section>
              <section class="jwt-section">
                <h3>Claims</h3>
                <div class="jwt-claims">
                  {#each jwtClaimRows(jwtDecoded.payload) as [key, value]}
                    <div class="jwt-claim-row">
                      <span class="jwt-claim-key">{key}</span>
                      <span class="jwt-claim-value">
                        {formatJwtClaimValue(value)}
                        {#if formatJwtNumericDate(key, value)}
                          <small>{formatJwtNumericDate(key, value)}</small>
                        {/if}
                      </span>
                    </div>
                  {/each}
                </div>
              </section>
            </div>
          {:else}
            <div class="jwt-error-message">{jwtDecoded.error}</div>
          {/if}
        </div>
      {/if}

    {:else if vm.authType === 'basic' || vm.authType === 'digest'}
      <label class="field-label" for="auth-user">Username</label>
      <input id="auth-user" class="field-input" bind:value={vm.basicUser} placeholder="Enter username" spellcheck="false" />
      <label class="field-label" for="auth-pass">Password</label>
      <input id="auth-pass" class="field-input" bind:value={vm.basicPass} type="password" placeholder="Enter password" />

    {:else if vm.authType === 'apikey'}
      <label class="field-label" for="apikey-name">Key name</label>
      <input id="apikey-name" class="field-input" bind:value={vm.apiKeyName} placeholder="e.g. X-API-Key" spellcheck="false" />
      <label class="field-label" for="apikey-val">Key value</label>
      <input id="apikey-val" class="field-input field-mono" type="password" bind:value={vm.apiKeyValue} placeholder="Enter value" spellcheck="false" />
      <span class="field-label">Add to</span>
      <div class="radio-group">
        {#if vm.requestType === 'grpc'}
          <label class="radio-label"><input type="radio" bind:group={vm.apiKeyIn} value="header" /> Metadata</label>
        {:else}
          <label class="radio-label"><input type="radio" bind:group={vm.apiKeyIn} value="header" /> Header</label>
          <label class="radio-label"><input type="radio" bind:group={vm.apiKeyIn} value="query" /> Query string</label>
        {/if}
      </div>

    {:else if vm.authType === 'oauth2'}
      <span class="field-label">Grant type</span>
      <div class="radio-group">
        <label class="radio-label"><input type="radio" bind:group={vm.oauth2GrantType} value="client_credentials" /> Client Credentials</label>
        <label class="radio-label"><input type="radio" bind:group={vm.oauth2GrantType} value="authorization_code" /> Authorization Code</label>
      </div>
      {#if vm.oauth2GrantType === 'authorization_code'}
        <label class="field-label" for="oauth2-auth-url">Authorization URL</label>
        <input id="oauth2-auth-url" class="field-input" bind:value={vm.oauth2AuthURL} placeholder="https://auth.example.com/oauth/authorize" spellcheck="false" />
      {/if}
      <label class="field-label" for="oauth2-url">Token URL</label>
      <input id="oauth2-url" class="field-input" bind:value={vm.oauth2TokenURL} placeholder="https://auth.example.com/oauth/token" spellcheck="false" />
      <label class="field-label" for="oauth2-id">Client ID</label>
      <input id="oauth2-id" class="field-input" bind:value={vm.oauth2ClientID} spellcheck="false" />
      <label class="field-label" for="oauth2-secret">Client Secret{#if vm.oauth2GrantType === 'authorization_code'} <span class="field-label-hint">(optional with PKCE)</span>{/if}</label>
      <input id="oauth2-secret" class="field-input" bind:value={vm.oauth2Secret} type="password" />
      <label class="field-label" for="oauth2-scope">Scope</label>
      <input id="oauth2-scope" class="field-input" bind:value={vm.oauth2Scope} placeholder="e.g. read write" spellcheck="false" />
      {#if vm.oauth2GrantType === 'authorization_code'}
        <label class="radio-label oauth2-pkce-row"><input type="checkbox" bind:checked={vm.oauth2UsePKCE} /> Use PKCE (recommended)</label>
      {/if}
      <div class="oauth2-token-row">
        <button class="btn-primary btn-sm" type="button" disabled={vm.oauth2Loading} onclick={vm.fetchOAuth2Token}>
          {#if vm.oauth2Loading}<span class="spinner-sm"></span>{/if}
          {vm.oauth2GrantType === 'authorization_code' ? 'Authorize in browser' : 'Get Access Token'}
        </button>
        {#if vm.oauth2RefreshToken}
          <button class="btn-secondary btn-sm" type="button" disabled={vm.oauth2Loading} onclick={vm.refreshOAuth2Token}>Refresh token</button>
        {/if}
        {#if vm.oauth2Token}<span class="oauth2-token-badge">Token acquired ✓</span>{/if}
      </div>
      {#if vm.oauth2Token}
        <span class="field-label">Current token</span>
        <input class="field-input field-mono" type="password" readonly value={vm.oauth2Token} onclick={selectInputText} />
        {#if oauth2ExpiryLabel}<span class="oauth2-expiry-hint">{oauth2ExpiryLabel}</span>{/if}
      {/if}

    {:else if vm.authType === 'aws'}
      <div class="auth-grid-2">
        <div>
          <label class="field-label" for="aws-key">Access Key ID</label>
          <input id="aws-key" class="field-input field-mono" bind:value={vm.awsAccessKey} spellcheck="false" />
        </div>
        <div>
          <label class="field-label" for="aws-secret">Secret Access Key</label>
          <input id="aws-secret" class="field-input field-mono" bind:value={vm.awsSecretKey} type="password" />
        </div>
        <div>
          <label class="field-label" for="aws-region">Region</label>
          <input id="aws-region" class="field-input" bind:value={vm.awsRegion} placeholder="us-east-1" spellcheck="false" />
        </div>
        <div>
          <label class="field-label" for="aws-service">Service</label>
          <input id="aws-service" class="field-input" bind:value={vm.awsService} placeholder="execute-api" spellcheck="false" />
        </div>
      </div>

    {:else}
      <p class="auth-none-hint">No authentication will be added to this request.</p>
    {/if}
  </div>
</div>
