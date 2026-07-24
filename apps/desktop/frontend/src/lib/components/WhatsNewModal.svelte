<script lang="ts">
  import { trapFocus } from '../a11y';
  import { formatSectionBlocks, stripInlineMarkdown, type ChangelogSection } from '../whatsNew';

  let {
    section,
    onDismiss,
  }: {
    section: ChangelogSection;
    onDismiss: () => void;
  } = $props();

  let blocks = $derived(formatSectionBlocks(section.body));

  function formatDate(value: string) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function blockClass(heading: string) {
    const key = heading.toLowerCase();
    if (key.startsWith('add')) return 'added';
    if (key.startsWith('fix')) return 'fixed';
    if (key.startsWith('chang')) return 'changed';
    if (key.startsWith('remov') || key.startsWith('deprecat')) return 'removed';
    return '';
  }
</script>

<div class="dialog-backdrop" role="presentation" onmousedown={(event) => event.target === event.currentTarget && onDismiss()}>
  <div class="whats-new-modal" role="dialog" aria-modal="true" aria-labelledby="whats-new-title" tabindex="-1" use:trapFocus>
    <div class="whats-new-head">
      <div class="whats-new-title-group">
        <span class="whats-new-eyebrow">What's new</span>
        <h2 id="whats-new-title">Relay {section.version}</h2>
        {#if section.date}
          <span class="whats-new-date">{formatDate(section.date)}</span>
        {/if}
      </div>
      <button type="button" class="dialog-close" onclick={onDismiss} aria-label="Close dialog">×</button>
    </div>

    <div class="whats-new-body">
      {#if blocks.length}
        {#each blocks as block}
          <section class="whats-new-block">
            {#if block.heading}
              <h3 class="whats-new-block-heading {blockClass(block.heading)}">{block.heading}</h3>
            {/if}
            <ul>
              {#each block.items as item}
                <li>
                  {stripInlineMarkdown(item.text)}
                  {#if item.children.length}
                    <ul class="whats-new-subitems">
                      {#each item.children as child}
                        <li>{stripInlineMarkdown(child)}</li>
                      {/each}
                    </ul>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {/each}
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
      >Full release notes</a>
      <button class="btn-primary" type="button" onclick={onDismiss} data-autofocus>Got it</button>
    </div>
  </div>
</div>
