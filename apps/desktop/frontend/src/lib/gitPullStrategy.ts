export type GitPullStrategyStatus = {
  ahead: number;
  behind: number;
};

export function normalizeGitPullStrategy(strategy = 'ff') {
  return strategy.trim().toLowerCase() || 'ff';
}

export function shouldPromptForDivergedPull(strategy: string, status: GitPullStrategyStatus) {
  return normalizeGitPullStrategy(strategy) === 'ff' && status.ahead > 0 && status.behind > 0;
}

export function fastForwardPullDivergedMessage(error: string) {
  if (!/fast-forward/i.test(error)) return error;
  return `${error}\n\nYour local and remote branches have diverged. Use Pull (merge) to produce a conflict file, or Pull (rebase) to replay your local commit.`;
}
