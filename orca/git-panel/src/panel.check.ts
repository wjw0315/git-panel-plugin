// `orca plugin check` 每个场景渲染一次面板，用来人眼验收关键状态。
import { defineCheck } from 'orca/testing'
import type { GitRepos, GitSnapshot } from './protocol'

const snapshot: GitSnapshot = {
  repoRoot: '/repo',
  branch: 'feat/git-panel',
  detached: false,
  ahead: 1,
  behind: 0,
  hasUpstream: true,
  upstream: 'origin/feat/git-panel',
  remote: {
    name: 'origin',
    url: 'git@github.com:jiaweiwu/git-panel-plugin.git',
    host: 'github.com',
    provider: 'github',
    compareUrl: 'https://github.com/jiaweiwu/git-panel-plugin/compare/main...feat%2Fgit-panel?expand=1',
    cli: null,
    baseBranch: 'main',
  },
  operation: null,
  conflicts: [],
  staged: [{ path: 'src/panel.tsx', status: 'modified', additions: 12, deletions: 3 }],
  modified: [{ path: 'src/worker.ts', status: 'modified', additions: 40, deletions: 8 }],
  untracked: [{ path: '.scratch/orca-git-panel/spec.md', status: 'untracked', additions: 120, deletions: 0 }],
  submodules: [
    { path: 'vendor/inner', state: 'newCommits', commit: 'de803f4b3464fe69d808a5218619931', describe: 'inner: bump' },
  ],
  lastCommit: { sha: 'abc1234', subject: 'feat: first pass' },
  partial: false,
}

const repos: GitRepos = {
  workspaceId: 'ws-1',
  cwd: '/repo',
  local: true,
  hostId: null,
  repos: [
    { root: '/repo', name: 'git-panel-plugin', kind: 'root', branch: 'feat/git-panel', dirty: true, initialized: true },
    { root: '/repo/packages/inner', name: 'inner', kind: 'nested', branch: 'main', dirty: false, initialized: true },
  ],
}

export default defineCheck({
  fresh: {
    results: {
      'workspace.readContext': { workspaceId: 'ws-1', branch: 'main', displayName: 'repo', terminals: [] },
    },
    settings: { refreshSeconds: 0 },
    requests: {
      'git.repos': () => ({
        workspaceId: 'ws-1',
        cwd: '/repo',
        local: true,
        hostId: null,
        repos: [{ root: '/repo', name: 'git-panel-plugin', kind: 'root', branch: 'main', dirty: false, initialized: true }],
      }),
      'git.snapshot': () => ({ ...snapshot, staged: [], modified: [], untracked: [], operation: null }),
      'git.stashList': () => ({ stashes: [] }),
      'git.branchList': () => ({ branches: [], detached: false }),
      'git.log': () => ({ commits: [], hasMore: false }),
      'git.pullRequestStatus': () => null,
    },
  },
  dirty: {
    results: {
      'workspace.readContext': { workspaceId: 'ws-1', branch: 'feat/git-panel', displayName: 'repo', terminals: [] },
    },
    settings: { refreshSeconds: 0 },
    requests: {
      'git.repos': () => repos,
      'git.snapshot': () => snapshot,
      'git.stashList': () => ({ stashes: [] }),
      'git.branchList': () => ({ branches: [], detached: false }),
      'git.log': () => ({ commits: [], hasMore: false }),
      'git.pullRequestStatus': () => null,
    },
  },
  stashes: {
    results: {
      'workspace.readContext': { workspaceId: 'ws-1', branch: 'feat/git-panel', displayName: 'repo', terminals: [] },
    },
    settings: { refreshSeconds: 0 },
    persisted: { workspace: { selectedRepo: '/repo' }, plugin: { view: 'stashes' } },
    requests: {
      'git.repos': () => repos,
      'git.snapshot': () => snapshot,
      'git.branchList': () => ({ branches: [], detached: false }),
      'git.log': () => ({ commits: [], hasMore: false }),
      'git.pullRequestStatus': () => null,
      'git.stashList': () => ({
        stashes: [
          {
            index: 0,
            ref: 'stash@{0}',
            message: 'WIP on feat/git-panel: try the two-column layout',
            branch: 'feat/git-panel',
            at: 1_764_000_000_000,
          },
        ],
      }),
    },
  },
  remoteActions: {
    results: {
      'workspace.readContext': { workspaceId: 'ws-1', branch: 'feat/git-panel', displayName: 'repo', terminals: [] },
    },
    settings: { refreshSeconds: 0 },
    persisted: { plugin: { view: 'actions' } },
    requests: {
      'git.repos': () => repos,
      'git.snapshot': () => snapshot,
      'git.stashList': () => ({ stashes: [] }),
      'git.branchList': () => ({ branches: [], detached: false }),
      'git.log': () => ({ commits: [], hasMore: false }),
      'git.pullRequestStatus': () => null,
    },
  },
  conflict: {
    results: {
      'workspace.readContext': { workspaceId: 'ws-1', branch: 'feat/git-panel', displayName: 'repo', terminals: [] },
    },
    settings: { refreshSeconds: 0 },
    requests: {
      'git.repos': () => repos,
      'git.snapshot': () => ({
        ...snapshot,
        operation: 'merge' as const,
        conflicts: ['src/worker.ts', 'src/panel.tsx'],
      }),
      'git.stashList': () => ({ stashes: [] }),
      'git.branchList': () => ({ branches: [], detached: false }),
      'git.log': () => ({ commits: [], hasMore: false }),
      'git.pullRequestStatus': () => null,
    },
  },
  history: {
    results: {
      'workspace.readContext': { workspaceId: 'ws-1', branch: 'feat/git-panel', displayName: 'repo', terminals: [] },
    },
    settings: { refreshSeconds: 0 },
    persisted: { workspace: { selectedRepo: '/repo' }, plugin: { view: 'history' } },
    requests: {
      'git.repos': () => repos,
      'git.snapshot': () => snapshot,
      'git.stashList': () => ({ stashes: [] }),
      'git.branchList': () => ({
        branches: [
          { name: 'feat/git-panel', remote: false, current: true },
          { name: 'main', remote: false, current: false },
        ],
        detached: false,
      }),
      'git.log': () => ({
        commits: [
          { sha: 'a1b2c3d4e5f6', subject: 'feat: clone the built-in panel', author: 'Echo', at: 1_764_100_000_000, refs: 'HEAD -> feat/git-panel' },
          { sha: 'b2c3d4e5f6a1', subject: 'chore: split the panel into modules', author: 'Echo', at: 1_764_000_000_000, refs: '' },
        ],
        hasMore: true,
      }),
      'git.pullRequestStatus': () => ({ state: 'OPEN', number: 42, url: 'https://github.com/jiaweiwu/git-panel-plugin/pull/42' }),
    },
  },
  remote: {
    results: {
      'workspace.readContext': { workspaceId: 'ws-remote', branch: 'main', displayName: 'remote', terminals: [] },
    },
    settings: { refreshSeconds: 0 },
    requests: {
      'git.repos': () => ({
        workspaceId: 'ws-remote',
        cwd: null,
        local: false,
        hostId: 'ssh:build',
        repos: [],
      }),
      'git.snapshot': () => snapshot,
      'git.stashList': () => ({ stashes: [] }),
      'git.branchList': () => ({ branches: [], detached: false }),
      'git.log': () => ({ commits: [], hasMore: false }),
      'git.pullRequestStatus': () => null,
    },
  },
})
