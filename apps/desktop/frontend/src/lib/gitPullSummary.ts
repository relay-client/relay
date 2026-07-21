import type { GitOperationResult, GitPullSummary, GitWorkspaceStatus } from './backend';

function count(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? value : 0;
}

function fileLabel(value: number) {
  return value === 1 ? 'file' : 'files';
}

function relayFileLabel(value: number) {
  return value === 1 ? 'Relay file' : 'Relay files';
}

function commitLabel(value: number) {
  return value === 1 ? 'commit' : 'commits';
}

function changeParts(summary: GitPullSummary | null | undefined) {
  const added = count(summary?.added);
  const updated = count(summary?.updated);
  const deleted = count(summary?.deleted);
  const renamed = count(summary?.renamed);
  const changed = count(summary?.changed) || added + updated + deleted + renamed;
  const parts = [];
  if (added) parts.push(`${added} new ${fileLabel(added)}`);
  if (updated) parts.push(`${updated} ${fileLabel(updated)} updated`);
  if (deleted) parts.push(`${deleted} ${fileLabel(deleted)} deleted`);
  if (renamed) parts.push(`${renamed} ${fileLabel(renamed)} renamed`);
  if (!parts.length && changed) parts.push(`${changed} ${fileLabel(changed)} changed`);
  return parts;
}

export function formatGitPullToast(summary: GitPullSummary | null | undefined) {
  const parts = changeParts(summary);
  if (!parts.length) return 'Pull complete: no file changes';
  return `Pull complete: ${parts.join(', ')}`;
}

export function formatGitCommitToast(result: GitOperationResult | null | undefined) {
  const files = Array.isArray(result?.files) ? result.files.length : 0;
  const head = (result?.git?.head || '').trim();
  const detail = files ? `${files} ${relayFileLabel(files)} committed` : 'Relay workspace committed';
  return `Commit complete: ${detail}${head ? ` · ${head}` : ''}`;
}

export function formatGitPushToast(result: GitOperationResult | null | undefined) {
  const commits = count(result?.commitCount);
  const parts = changeParts(result?.pullSummary);
  const upstream = (result?.git?.upstream || '').trim();
  if (!commits && !parts.length) {
    return upstream ? `Push complete: ${upstream} is up to date` : 'Push complete: nothing to push';
  }
  const details = [];
  if (commits) details.push(`${commits} ${commitLabel(commits)} pushed`);
  details.push(...parts);
  if (upstream) details.push(`tracking ${upstream}`);
  return `Push complete: ${details.join(', ')}`;
}

export function formatGitFetchToast(status: GitWorkspaceStatus | null | undefined) {
  const upstream = (status?.upstream || '').trim();
  if (status?.upstreamGone && upstream) return `Fetch complete: ${upstream} is gone on remote`;
  const behind = count(status?.behind);
  if (behind) return `Fetch complete: ${behind} remote ${commitLabel(behind)} ready to pull`;
  return 'Fetch complete: remote is up to date';
}
