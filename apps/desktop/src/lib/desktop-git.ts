import type {
  HermesGitBaseBranch,
  HermesGitBranch,
  HermesGitWorktree,
  HermesRepoPullRequests,
  HermesRepoStatus,
  HermesReviewList,
  HermesReviewShipInfo
} from '@/global'

import { desktopFsProfile, isDesktopFsRemoteMode } from './desktop-fs'

// Remote-aware git facade. Locally the desktop runs git through Electron
// (window.hermesDesktop.git); on a remote gateway that's the wrong filesystem,
// so we mirror the same surface over the dashboard REST API (/api/git/*) — the
// coding rail, worktree lanes, review pane, and branch ops then act on the
// BACKEND repo where sessions actually run. Mirrors desktop-fs.ts.

type GitBridge = NonNullable<NonNullable<Window['hermesDesktop']>['git']>

export interface DesktopGitTarget {
  connectionId: string
  profile: string
}

function isExplicitLocalTarget(target?: DesktopGitTarget): boolean {
  if (!target) {
    return false
  }

  const connectionId = target.connectionId.trim()

  return connectionId === '' || connectionId === 'local'
}

function desktopApi<T>(path: string, body?: Record<string, unknown>, target?: DesktopGitTarget): Promise<T> {
  const desktop = window.hermesDesktop

  if (!desktop) {
    throw new Error('Hermes Desktop bridge is unavailable')
  }

  const route = target
    ? { connectionId: target.connectionId, profile: target.profile }
    : { profile: desktopFsProfile() }

  return desktop.api<T>(body ? { body, method: 'POST', path, ...route } : { path, ...route })
}

function gitGet<T>(
  route: string,
  params: Record<string, boolean | null | string | undefined>,
  target?: DesktopGitTarget
): Promise<T> {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      query.set(key, String(value))
    }
  }

  return desktopApi<T>(`/api/git/${route}?${query.toString()}`, undefined, target)
}

function gitPost<T>(route: string, body: Record<string, unknown>, target?: DesktopGitTarget): Promise<T> {
  return desktopApi<T>(`/api/git/${route}`, body, target)
}

function remoteGit(target?: DesktopGitTarget): GitBridge {
  return {
    worktreeList: async repoPath =>
      (await gitGet<{ worktrees: HermesGitWorktree[] }>('worktrees', { path: repoPath }, target)).worktrees,

    worktreeAdd: (repoPath, options) => gitPost('worktree/add', { path: repoPath, ...options }, target),

    worktreeRemove: (repoPath, worktreePath, options) =>
      gitPost('worktree/remove', { force: options?.force ?? false, path: repoPath, worktreePath }, target),

    branchSwitch: (repoPath, branch) => gitPost('branch/switch', { branch, path: repoPath }, target),

    branchList: async repoPath =>
      (await gitGet<{ branches: HermesGitBranch[] }>('branches', { path: repoPath }, target)).branches,

    baseBranchList: async repoPath =>
      (await gitGet<{ branches: HermesGitBaseBranch[] }>('base-branches', { path: repoPath }, target)).branches,

    repoStatus: repoPath => gitGet<HermesRepoStatus | null>('status', { path: repoPath }, target),

    fileDiff: async (repoPath, filePath) =>
      (await gitGet<{ diff: string }>('file-diff', { file: filePath, path: repoPath }, target)).diff,

    review: {
      list: (repoPath, scope, baseRef) =>
        gitGet<HermesReviewList>('review/list', { base: baseRef, path: repoPath, scope }, target),

      diff: async (repoPath, filePath, scope, baseRef, staged) =>
        (
          await gitGet<{ diff: string }>(
            'review/diff',
            { base: baseRef, file: filePath, path: repoPath, scope, staged },
            target
          )
        ).diff,

      stage: (repoPath, filePath) => gitPost('review/stage', { file: filePath ?? null, path: repoPath }, target),

      unstage: (repoPath, filePath) => gitPost('review/unstage', { file: filePath ?? null, path: repoPath }, target),

      revert: (repoPath, filePath) => gitPost('review/revert', { file: filePath ?? null, path: repoPath }, target),

      revParse: async (repoPath, ref) =>
        (await gitGet<{ sha: null | string }>('review/rev-parse', { path: repoPath, ref }, target)).sha,

      commit: (repoPath, message, push) => gitPost('review/commit', { message, path: repoPath, push }, target),

      commitContext: repoPath => gitGet('review/commit-context', { path: repoPath }, target),

      push: repoPath => gitPost('review/push', { path: repoPath }, target),

      shipInfo: repoPath => gitGet<HermesReviewShipInfo>('review/ship-info', { path: repoPath }, target),

      prList: (repoPath, branches, numbers) =>
        gitPost<HermesRepoPullRequests>('review/pr-list', { branches, numbers: numbers ?? [], path: repoPath }, target),

      // Remote gateways have no PR-comment route yet; resolve to null so the
      // paste degrades to a plain URL instead of throwing mid-paste.
      fetchPrComment: async () => null,

      createPr: repoPath => gitPost('review/create-pr', { path: repoPath }, target)
    },

    // Repo discovery is a local-disk crawl; on a remote gateway the backend
    // already merges session-derived repos, so this is a no-op.
    scanRepos: async () => []
  }
}

export function desktopGit(target?: DesktopGitTarget): GitBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  if (target) {
    return isExplicitLocalTarget(target) ? window.hermesDesktop?.git : remoteGit(target)
  }

  return isDesktopFsRemoteMode() ? remoteGit() : window.hermesDesktop?.git
}
