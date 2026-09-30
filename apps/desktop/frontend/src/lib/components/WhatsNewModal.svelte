<script lang="ts">
  import { trapFocus } from '../a11y';
  import type { ChangelogSection } from '../whatsNew';
  import ReleaseNotes from './ReleaseNotes.svelte';

  let {
    section,
    onDismiss,
  }: {
    section: ChangelogSection;
    onDismiss: () => void;
  } = $props();

  function formatDate(value: string) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }
</script>

<div class="dialog-backdrop" role="presentation" onmousedown={(event) => event.target === event.currentTarget && onDismiss()}>
  <div class="whats-new-modal" role="dialog" aria-modal="true" aria-labelledby="whats-new-title" tabindex="-1" use:trapFocus>
    <div class="dialog-head whats-new-head">
      <div class="whats-new-title-group">
        <h2 id="whats-new-title">What's new in Relay {section.version}</h2>
        {#if section.date}
          <span class="whats-new-date">{formatDate(section.date)}</span>
        {/if}
      </div>
      <button type="button" class="dialog-close" onclick={onDismiss} aria-label="Close dialog">×</button>
    </div>

    <div class="whats-new-body">
      {#if section.body.trim()}
        <ReleaseNotes body={section.body} />
      {:else}
        <p class="whats-new-empty">This release has no recorded notes.</p>
      {/if}
    </div>

    <div class="dialog-actions whats-new-actions">
      <a
        class="whats-new-full-link"
        href="https://github.com/relay-client/relay/releases/tag/v{section.version}"
        target="_blank"
        rel="noreferrer noopener"
      >
        Full release notes
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M3 7l4-4M4 3h3v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
      <button class="btn-primary" type="button" onclick={onDismiss} data-autofocus>Got it</button>
    </div>
  </div>
</div>
