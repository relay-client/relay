<script lang="ts">
  import type { ResponsePreview } from '../responsePreview';

  let { preview, formatSize }: {
    preview: ResponsePreview;
    formatSize: (bytes: number) => string;
  } = $props();

  let imageDimensions = $state('');
  let imageBytes = $derived(
    preview.kind === 'image' ? Math.floor((preview.src.length - preview.src.indexOf(',') - 1) * 3 / 4) : 0,
  );

  function onImageLoad(event: Event) {
    const img = event.currentTarget;
    if (img instanceof HTMLImageElement) imageDimensions = `${img.naturalWidth} × ${img.naturalHeight}`;
  }
</script>

<div class="response-preview" id="response-panel-preview" role="tabpanel">
  {#if preview.kind === 'image'}
    <div class="preview-meta">
      <span>{preview.mediaType}</span>
      {#if imageDimensions}<span>{imageDimensions}</span>{/if}
      <span>{formatSize(imageBytes)}</span>
    </div>
    <div class="preview-image-stage">
      <img src={preview.src} alt="Response body preview" onload={onImageLoad} />
    </div>
  {:else if preview.kind === 'html'}
    <div class="preview-meta">
      <span>text/html</span>
      <span class="preview-note">Scripts and network requests are blocked in this preview</span>
    </div>
    <iframe class="preview-frame" title="Response body preview" sandbox="" srcdoc={preview.html}></iframe>
  {:else}
    <p class="preview-empty">This response has nothing to preview.</p>
  {/if}
</div>

<style>
  .response-preview {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .preview-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 14px;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-3);
    font-size: 11px;
    font-family: var(--font-mono);
    flex-shrink: 0;
  }

  .preview-note {
    margin-left: auto;
    font-family: inherit;
  }

  .preview-image-stage {
    display: grid;
    place-items: center;
    flex: 1;
    min-height: 0;
    padding: 20px;
    overflow: auto;
    /* Checkerboard so transparent images read correctly in both themes. */
    background-image:
      linear-gradient(45deg, var(--hover) 25%, transparent 25%),
      linear-gradient(-45deg, var(--hover) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--hover) 75%),
      linear-gradient(-45deg, transparent 75%, var(--hover) 75%);
    background-size: 16px 16px;
    background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  }

  .preview-image-stage img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .preview-frame {
    flex: 1;
    min-height: 0;
    width: 100%;
    border: 0;
    background: #fff;
  }

  .preview-empty {
    margin: 0;
    padding: 24px 16px;
    color: var(--text-3);
    font-size: 12px;
  }
</style>
