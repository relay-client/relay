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
  let statusLabel = $derived(installing ? 'installing' : (ready ? 'installed' : 'available'));
</script>

<div class="update-notif" role="status" aria-live="polite">
  <svg class="update-notif-icon" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
    <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.3"/>
    <path d="M6.5 3.5v3.5M6.5 9v.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  </svg>
  <span class="update-notif-text">
    Update <strong>v{info.version}</strong> {statusLabel}
  </span>
  <button class="update-notif-btn" type="button" onclick={handleAction} disabled={installing}>{actionLabel}</button>
  <button class="update-notif-close" type="button" onclick={onDismiss} aria-label="Dismiss">✕</button>
</div>

<style>
  .update-notif {
    position: fixed;
    bottom: 28px;
    right: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px 7px 12px;
    background: var(--elevated, #1e1e2e);
    border: 1px solid var(--accent, #7c6af7);
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
    z-index: 300;
    animation: notif-in 0.18s ease;
  }

  @keyframes notif-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .update-notif-icon {
    flex-shrink: 0;
    color: var(--accent, #7c6af7);
  }

  .update-notif-text {
    font-size: 12px;
    color: var(--text-2, #c0c0d8);
    white-space: nowrap;
  }

  .update-notif-text strong {
    color: var(--text, #e0e0f0);
    font-weight: 600;
  }

  .update-notif-btn {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 5px;
    border: 1px solid var(--accent, #7c6af7);
    background: var(--accent, #7c6af7);
    color: #fff;
    cursor: pointer;
    white-space: nowrap;
    transition: filter 0.12s;
  }

  .update-notif-btn:hover {
    filter: brightness(1.15);
  }

  .update-notif-btn:disabled {
    cursor: default;
    opacity: 0.72;
    filter: none;
  }

  .update-notif-close {
    font-size: 11px;
    padding: 2px 4px;
    border: none;
    background: none;
    color: var(--text-3, #666);
    cursor: pointer;
    line-height: 1;
    border-radius: 4px;
    transition: color 0.12s;
  }

  .update-notif-close:hover {
    color: var(--text, #e0e0f0);
  }
</style>
