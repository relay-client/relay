<script lang="ts">
  import { tabListKeyboard, trapFocus } from '../a11y';
  import type { CookieJarEntry } from '../backend';
  import {
    buildCookieDomainGroups,
    cookieKey,
    normalizeCookieDomain,
    parseRawCookie,
    serializeCookie,
  } from '../cookieJar';

  type CookieDomainGroup = { domain: string; cookies: CookieJarEntry[] };

  let {
    cookies,
    loading,
    saving,
    error,
    defaultDomain,
    onRefresh,
    onSave,
    onDelete,
    onClear,
    onClose,
  }: {
    cookies: CookieJarEntry[];
    loading: boolean;
    saving: boolean;
    error: string;
    defaultDomain: string;
    onRefresh: () => void;
    onSave: (cookie: CookieJarEntry) => Promise<void>;
    onDelete: (cookie: CookieJarEntry) => Promise<void>;
    onClear: () => Promise<void>;
    onClose: () => void;
  } = $props();

  let domainInput = $state('');
  let manualDomains = $state<string[]>([]);
  let activeDomain = $state('');
  let selectedKey = $state('');
  let rawCookieText = $state('');
  let originalKey = $state('');
  let editingDomain = $state('');
  let localError = $state('');
  let defaultDomainSeeded = $state(false);
  let draftCookieCounters = $state<Record<string, number>>({});
  let domainPage = $state(0);
  let cookieVisibleByDomain = $state<Record<string, number>>({});

  const COOKIE_DOMAIN_PAGE_SIZE = 25;
  const COOKIE_CHIP_PAGE_SIZE = 50;
  let domainGroups = $derived(buildCookieDomainGroups(cookies, manualDomains, domainInput));
  let domainPageCount = $derived(pageCount(domainGroups.length, COOKIE_DOMAIN_PAGE_SIZE));
  let visibleDomainGroups = $derived(domainGroups.slice(domainPage * COOKIE_DOMAIN_PAGE_SIZE, (domainPage + 1) * COOKIE_DOMAIN_PAGE_SIZE));
  let selectedCookie = $derived(cookies.find(cookie => cookieKey(cookie) === selectedKey));
  let visibleError = $derived(localError || error);
  let editorDomain = $derived(editingDomain || activeDomain);
  let editorOpen = $derived(Boolean(editingDomain));
  let canSave = $derived(Boolean(editorDomain && rawCookieText.trim() && !saving));

  $effect(() => {
    domainGroups.length;
    if (domainPage >= domainPageCount) domainPage = Math.max(0, domainPageCount - 1);
  });

  $effect(() => {
    if (!defaultDomainSeeded && !activeDomain && defaultDomain) {
      manualDomains = [...new Set([...manualDomains, defaultDomain])];
      activeDomain = defaultDomain;
      defaultDomainSeeded = true;
    }
  });

  $effect(() => {
    if (selectedCookie && cookieKey(selectedCookie) === originalKey && rawCookieText === '') {
      rawCookieText = serializeCookie(selectedCookie);
    }
    if (selectedKey && !selectedCookie) {
      selectedKey = '';
      originalKey = '';
    }
  });

  function selectDomain(domain: string) {
    activeDomain = domain;
    const index = domainGroups.findIndex(group => group.domain === normalizeCookieDomain(domain));
    if (index >= 0) domainPage = Math.floor(index / COOKIE_DOMAIN_PAGE_SIZE);
  }

  function pageCount(total: number, size: number): number {
    return Math.max(1, Math.ceil(total / size));
  }

  function rangeLabel(page: number, size: number, total: number): string {
    if (!total) return '0 of 0';
    const start = page * size + 1;
    const end = Math.min(total, (page + 1) * size);
    return `${start}-${end} of ${total}`;
  }

  function cookieVisibleLimit(domain: string): number {
    return cookieVisibleByDomain[normalizeCookieDomain(domain)] ?? COOKIE_CHIP_PAGE_SIZE;
  }

  function visibleCookiesFor(group: CookieDomainGroup): CookieJarEntry[] {
    return group.cookies.slice(0, cookieVisibleLimit(group.domain));
  }

  function showMoreCookies(domain: string, total: number) {
    const normalized = normalizeCookieDomain(domain);
    const current = cookieVisibleLimit(normalized);
    cookieVisibleByDomain = { ...cookieVisibleByDomain, [normalized]: Math.min(total, current + COOKIE_CHIP_PAGE_SIZE) };
  }

  function addDomain() {
    const domain = normalizeCookieDomain(domainInput || defaultDomain);
    if (!domain) {
      localError = 'Enter a domain name first.';
      return;
    }
    manualDomains = [...new Set([...manualDomains, domain])];
    selectDomain(domain);
    addCookie(domain);
    domainInput = '';
  }

  function addCookie(domain: string) {
    const normalizedDomain = normalizeCookieDomain(domain);
    const usedNames = new Set(cookies.filter(cookie => normalizeCookieDomain(cookie.domain) === normalizedDomain).map(cookie => cookie.name));
    let count = Math.max(usedNames.size, draftCookieCounters[normalizedDomain] ?? 0) + 1;
    while (usedNames.has(`Cookie_${count}`)) count += 1;
    draftCookieCounters = { ...draftCookieCounters, [normalizedDomain]: count };
    selectDomain(domain);
    selectedKey = '';
    originalKey = '';
    editingDomain = normalizedDomain;
    rawCookieText = `Cookie_${count}=value; Path=/`;
    localError = '';
  }

  function selectCookie(cookie: CookieJarEntry) {
    selectDomain(cookie.domain);
    selectedKey = cookieKey(cookie);
    originalKey = cookieKey(cookie);
    editingDomain = normalizeCookieDomain(cookie.domain);
    rawCookieText = serializeCookie(cookie);
    localError = '';
  }

  function cancelEdit() {
    selectedKey = '';
    originalKey = '';
    editingDomain = '';
    rawCookieText = '';
    localError = '';
  }

  async function saveRawCookie() {
    if (!canSave) return;
    localError = '';
    try {
      const next = parseRawCookie(rawCookieText, editorDomain);
      if (selectedCookie && originalKey && originalKey !== cookieKey(next)) {
        await onDelete(selectedCookie);
      }
      await onSave(next);
      selectedKey = '';
      originalKey = '';
      editingDomain = '';
      rawCookieText = '';
      manualDomains = manualDomains.filter(domain => normalizeCookieDomain(domain) !== normalizeCookieDomain(next.domain));
      selectDomain(next.domain);
    } catch (err) {
      localError = err instanceof Error ? err.message : String(err);
    }
  }

  async function deleteCookie(cookie: CookieJarEntry) {
    await onDelete(cookie);
    if (selectedKey === cookieKey(cookie)) cancelEdit();
  }

  async function deleteDomain(domain: string) {
    const domainCookies = cookies.filter(cookie => normalizeCookieDomain(cookie.domain) === normalizeCookieDomain(domain));
    for (const cookie of domainCookies) await onDelete(cookie);
    manualDomains = manualDomains.filter(item => normalizeCookieDomain(item) !== normalizeCookieDomain(domain));
    if (activeDomain === domain) {
      activeDomain = '';
      selectedKey = '';
      originalKey = '';
      editingDomain = '';
      rawCookieText = '';
    }
  }

  async function clearAll() {
    await onClear();
    manualDomains = [];
    activeDomain = '';
    selectedKey = '';
    originalKey = '';
    editingDomain = '';
    rawCookieText = '';
    localError = '';
    draftCookieCounters = {};
    defaultDomainSeeded = true;
  }
</script>

<div class="cookie-backdrop" role="presentation" onmousedown={(event) => event.target === event.currentTarget && onClose()}>
  <div class="cookie-modal postman-cookie-modal" role="dialog" aria-modal="true" aria-labelledby="cookie-jar-title" tabindex="-1" use:trapFocus>
    <div class="cookie-head postman-cookie-head">
      <h2 id="cookie-jar-title">Cookies</h2>
      <button class="dialog-close" type="button" onclick={onClose} aria-label="Close cookie jar">×</button>
    </div>

    <div class="cookie-tabs" role="tablist" aria-label="Cookie jar sections" use:tabListKeyboard>
      <button class="cookie-tab active" type="button" role="tab" aria-selected="true" aria-controls="cookie-manage-panel" tabindex="0">Manage Cookies</button>
      <button class="cookie-tab" type="button" role="tab" aria-selected="false" disabled aria-disabled="true">Sync Cookies</button>
    </div>

    <div class="cookie-toolbar postman-cookie-toolbar">
      <input bind:value={domainInput} placeholder="Type a domain name" spellcheck="false" onkeydown={(event) => event.key === 'Enter' && addDomain()} data-autofocus />
      <button class="btn-primary" type="button" onclick={addDomain}>Add domain</button>
    </div>

    {#if visibleError}
      <div class="cookie-error">{visibleError}</div>
    {/if}

    <div class="cookie-body postman-cookie-body" id="cookie-manage-panel" role="tabpanel">
      {#if loading}
        <div class="cookie-empty">Loading cookies...</div>
      {:else if domainGroups.length}
        {#if domainGroups.length > COOKIE_DOMAIN_PAGE_SIZE}
          <div class="cookie-pagination" aria-label="Cookie domain pages">
            <span>Domains {rangeLabel(domainPage, COOKIE_DOMAIN_PAGE_SIZE, domainGroups.length)}</span>
            <div class="cookie-page-buttons">
              <button type="button" onclick={() => (domainPage = Math.max(0, domainPage - 1))} disabled={domainPage === 0}>Prev</button>
              <span>{domainPage + 1}/{domainPageCount}</span>
              <button type="button" onclick={() => (domainPage = Math.min(domainPageCount - 1, domainPage + 1))} disabled={domainPage + 1 >= domainPageCount}>Next</button>
            </div>
          </div>
        {/if}
        <div class="cookie-domain-list">
          {#each visibleDomainGroups as group (group.domain)}
            {@const visibleCookies = visibleCookiesFor(group)}
            <section class="cookie-domain-card" class:active={activeDomain === group.domain}>
              <div class="cookie-domain-head">
                <button class="cookie-domain-title" type="button" onclick={() => selectDomain(group.domain)}>
                  <strong>{group.domain}</strong>
                  <span>{group.cookies.length} cookie{group.cookies.length === 1 ? '' : 's'}</span>
                </button>
                <button class="cookie-domain-delete" type="button" onclick={() => deleteDomain(group.domain)} aria-label="Delete domain cookies">×</button>
              </div>

              <div class="cookie-chip-row">
                {#each visibleCookies as cookie (cookieKey(cookie))}
                  <span class="cookie-chip" class:active={cookieKey(cookie) === selectedKey}>
                    <button class="cookie-chip-select" type="button" onclick={() => selectCookie(cookie)}>{cookie.name}</button>
                    <button class="cookie-chip-delete" type="button" aria-label="Delete cookie" onclick={() => deleteCookie(cookie)}>×</button>
                  </span>
                {/each}
                {#if group.cookies.length > visibleCookies.length}
                  <button class="cookie-add-chip cookie-more-chip" type="button" onclick={() => showMoreCookies(group.domain, group.cookies.length)}>
                    Show {Math.min(COOKIE_CHIP_PAGE_SIZE, group.cookies.length - visibleCookies.length)} more
                  </button>
                {/if}
                <button class="cookie-add-chip" type="button" onclick={() => addCookie(group.domain)}>
                  <span>＋</span> Add cookie
                </button>
              </div>

              {#if editingDomain === group.domain && editorOpen}
                <div class="cookie-raw-editor">
                  <textarea bind:value={rawCookieText} spellcheck="false" aria-label="Raw cookie"></textarea>
                  <div class="cookie-raw-actions">
                    <button class="btn-secondary" type="button" onclick={cancelEdit} disabled={saving}>Cancel</button>
                    <button class="btn-primary" type="button" onclick={saveRawCookie} disabled={!canSave}>{saving ? 'Saving...' : 'Save'}</button>
                  </div>
                </div>
              {/if}
            </section>
          {/each}
        </div>
      {:else}
        <div class="cookie-empty cookie-empty-state" role="status">
          <svg width="40" height="40" viewBox="0 0 32 32" fill="none" aria-hidden="true" opacity="0.4">
            <circle cx="16" cy="16" r="12" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="11.5" cy="13" r="1.4" fill="currentColor"/>
            <circle cx="20" cy="13.5" r="1.4" fill="currentColor"/>
            <circle cx="15" cy="20" r="1.4" fill="currentColor"/>
          </svg>
          <p class="cookie-empty-title">No cookies yet</p>
          <p class="cookie-empty-hint">Cookies appear here automatically after you send a request that sets one — or add a domain above to enter one manually.</p>
        </div>
      {/if}
    </div>

    <div class="cookie-footer-actions">
      <button class="btn-secondary danger" type="button" onclick={clearAll} disabled={(!cookies.length && !manualDomains.length && !rawCookieText) || loading || saving}>
        Clear all cookies
      </button>
      <button class="btn-secondary" type="button" onclick={() => onRefresh()} disabled={loading}>Refresh</button>
    </div>
  </div>
</div>
