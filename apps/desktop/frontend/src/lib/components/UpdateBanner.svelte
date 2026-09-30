<script lang="ts">
  import type { UpdateInfo } from '../backend';

  let {
    info,
    ready = false,
    installing = false,
    onDismiss,
    onOpen,
    onRestart,
  }: {
    info: UpdateInfo;
    ready?: boolean;
    installing?: boolean;
    onDismiss: () => void;
    onOpen: () => void;
    onRestart: () => void;
  } = $props();

  let actionLabel = $derived(installing ? 'Installing…' : (ready ? 'Restart' : 'View'));
  let handleAction = $derived(ready ? onRestart : onOpen);
  let statusLabel = $derived(installing ? 'is installing' : (ready ? 'is ready — restart to apply' : 'is available'));
</script>

<div class="update-notif" role="status" aria-live="polite">
  <svg class="update-notif-icon" class:ready width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    {#if ready}
      <circle cx="7" cy="7" r="5.8" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4.6 7.1l1.7 1.7 3.2-3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
    {:else}
      <path d="M7 2v7M4.2 6.4 7 9.2l2.8-2.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2.5 11.8h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    {/if}
  </svg>
  <span class="update-notif-text">
    Relay <strong>{info.version}</strong> {statusLabel}
  </span>
  <button class="update-notif-btn" type="button" onclick={handleAction} disabled={installing}>{actionLabel}</button>
  <button class="update-notif-close" type="button" onclick={onDismiss} aria-label="Dismiss">
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>
  </button>
</div>

<style>
  .update-notif {
    position: fixed;
    bottom: 36px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 6px 6px 12px;
    background: var(--elevated);
    border: 1px solid var(--border);
    border-radius: 9px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2), 0 10px 30px rgba(0, 0, 0, 0.35);
    z-index: 300;
    animation: notif-in 0.18s ease;
  }

  @keyframes notif-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .update-notif {
      animation: none;
    }
  }

  .update-notif-icon {
    flex-shrink: 0;
    color: var(--text-3);
  }

  .update-notif-icon.ready {
    color: var(--s2xx);
  }

  .update-notif-text {
    font-size: 12.5px;
    color: var(--text-2);
    white-space: nowrap;
  }

  .update-notif-text strong {
    color: var(--text);
    font-weight: 600;
  }

  .update-notif-btn {
    height: 26px;
    margin-left: 3px;
    padding: 0 10px;
    border: none;
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s;
  }

  .update-notif-btn:hover {
    background: var(--accent-hover);
  }

  .update-notif-btn:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .update-notif-close {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--text-3);
    cursor: pointer;
    transition: color 0.12s, background 0.12s;
  }

  .update-notif-close:hover {
    background: var(--hover);
    color: var(--text);
  }
</style>
