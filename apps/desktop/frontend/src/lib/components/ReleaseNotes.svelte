<script lang="ts">
  import { formatSectionBlocks, releaseNoteKind, sectionIntro, stripInlineMarkdown } from '../whatsNew';

  let { body }: { body: string } = $props();

  let blocks = $derived(formatSectionBlocks(body));
  let intro = $derived(blocks.length ? stripInlineMarkdown(sectionIntro(body)) : '');
  let plain = $derived(blocks.length ? [] : String(body || '').split('\n').map(line => stripInlineMarkdown(line.replace(/^#+\s*/, '').trim())).filter(Boolean));
</script>

{#if blocks.length}
  <div class="release-notes">
    {#if intro}
      <p class="release-notes-intro">{intro}</p>
    {/if}
    {#each blocks as block, blockIndex (blockIndex)}
      <section class="release-notes-block">
        {#if block.heading}
          <h3 class="release-notes-heading">
            <span class="release-notes-dot {releaseNoteKind(block.heading)}" aria-hidden="true"></span>
            {block.heading}
          </h3>
        {/if}
        <ul>
          {#each block.items as item, itemIndex (itemIndex)}
            <li>
              {stripInlineMarkdown(item.text)}
              {#if item.children.length}
                <ul class="release-notes-subitems">
                  {#each item.children as child, childIndex (childIndex)}
                    <li>{stripInlineMarkdown(child)}</li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{:else if plain.length}
  <div class="release-notes">
    {#each plain as line, lineIndex (lineIndex)}
      <p class="release-notes-plain">{line}</p>
    {/each}
  </div>
{/if}

<style>
  .release-notes {
    display: grid;
    gap: 16px;
    align-content: start;
    user-select: text;
  }

  .release-notes-heading {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 0 7px;
    color: var(--text);
    font-size: 12.5px;
    font-weight: 600;
  }

  .release-notes-dot {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--text-3);
  }

  .release-notes-dot.added {
    background: var(--s2xx);
  }

  .release-notes-dot.fixed {
    background: var(--s3xx);
  }

  .release-notes-dot.changed {
    background: var(--s4xx);
  }

  .release-notes-dot.removed {
    background: var(--s5xx);
  }

  ul {
    margin: 0;
    padding: 0 0 0 17px;
    display: grid;
    gap: 6px;
  }

  li {
    color: var(--text-2);
    font-size: 12.5px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  li::marker {
    color: var(--text-3);
  }

  .release-notes-subitems {
    margin: 5px 0 0;
    padding-left: 15px;
    gap: 4px;
  }

  .release-notes-subitems li {
    color: var(--text-3);
    font-size: 12px;
  }

  .release-notes-intro {
    margin: 0;
    color: var(--text);
    font-size: 13px;
    line-height: 1.55;
  }

  .release-notes-plain {
    margin: 0;
    color: var(--text-2);
    font-size: 12.5px;
    line-height: 1.55;
  }
</style>
